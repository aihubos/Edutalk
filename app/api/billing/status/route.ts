import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "계정 연결 설정 후 사용할 수 있어요." }, { status: 503 });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const [usageResult, subscriptionResult] = await Promise.all([
    supabase.from("ai_usage_accounts").select("plan, free_limit, used_count, subscription_active, current_period_end").eq("user_id", authData.user.id).maybeSingle(),
    supabase.from("billing_subscriptions").select("status, current_period_end, cancel_at_period_end, updated_at").eq("user_id", authData.user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (usageResult.error || subscriptionResult.error) return NextResponse.json({ error: "계정 구독 상태를 불러오지 못했어요." }, { status: 500 });

  return NextResponse.json({
    usage: usageResult.data ? {
      plan: usageResult.data.plan,
      freeLimit: usageResult.data.free_limit,
      usedCount: usageResult.data.used_count,
      subscriptionActive: usageResult.data.subscription_active,
      currentPeriodEnd: usageResult.data.current_period_end,
    } : null,
    subscription: subscriptionResult.data ? {
      status: subscriptionResult.data.status,
      currentPeriodEnd: subscriptionResult.data.current_period_end,
      cancelAtPeriodEnd: subscriptionResult.data.cancel_at_period_end,
    } : null,
  });
}
