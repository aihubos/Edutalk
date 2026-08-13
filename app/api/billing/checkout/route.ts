import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer, getStripeBillingConfig, stripeFormRequest } from "@/lib/stripe-billing";
import { requireFeatureFlag } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const disabled = await requireFeatureFlag("BILLING_CHECKOUT"); if (disabled) return disabled;
  const config = getStripeBillingConfig();
  if (!config) return NextResponse.json({ error: "결제 환경 설정 후 사용할 수 있어요." }, { status: 503 });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "계정 연결 설정 후 사용할 수 있어요." }, { status: 503 });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data: currentSubscription, error: subscriptionError } = await supabase
    .from("billing_subscriptions")
    .select("status")
    .eq("user_id", data.user.id)
    .in("status", ["ACTIVE", "PAST_DUE"])
    .limit(1)
    .maybeSingle();
  if (subscriptionError) return NextResponse.json({ error: "현재 구독 상태를 확인하지 못했어요." }, { status: 500 });
  if (currentSubscription) {
    return NextResponse.json({ error: "이미 구독 정보가 있어요. 구독 관리에서 상태를 확인해 주세요." }, { status: 409 });
  }

  try {
    const customer = await getOrCreateStripeCustomer(config, data.user.id, data.user.email);
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    const session = await stripeFormRequest<{ url?: string }>(config, "/checkout/sessions", {
      mode: "subscription",
      customer: customer.id,
      "line_items[0][price]": config.priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: data.user.id,
      "metadata[edutalk_user_id]": data.user.id,
      "subscription_data[metadata][edutalk_user_id]": data.user.id,
      success_url: `${origin}/subscription?billing=success`,
      cancel_url: `${origin}/subscription?billing=cancel`,
    });
    if (!session.url) throw new Error("결제 이동 주소를 준비하지 못했어요.");
    return NextResponse.json({ url: session.url });
  } catch (requestError) {
    return NextResponse.json({ error: requestError instanceof Error ? requestError.message : "결제 시작을 준비하지 못했어요." }, { status: 502 });
  }
}
