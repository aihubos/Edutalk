import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function integrations() {
  return {
    supabase: isSupabaseConfigured(),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim() && (process.env.STRIPE_UNLIMITED_PRICE_ID?.trim() || process.env.UNLIMITED_PLAN_PRICE_ID?.trim()) && process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    publicData: Boolean(process.env.CHILDCARE_API_URL?.trim() && process.env.CHILDCARE_API_KEY?.trim() && process.env.KINDERGARTEN_API_URL?.trim() && process.env.KINDERGARTEN_API_KEY?.trim() && process.env.NEIS_API_URL?.trim() && process.env.NEIS_API_KEY?.trim()),
  };
}

function publicStatus() {
  return { app: "ok", timestamp: new Date().toISOString(), dataMode: process.env.NEXT_PUBLIC_DATA_MODE?.trim() || "demo", integrations: integrations() };
}

export async function GET(request: Request) {
  const base = publicStatus();
  if (new URL(request.url).searchParams.get("deep") !== "1") return NextResponse.json(base);

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "관리자 상세 상태는 Supabase 설정 뒤 확인할 수 있어요." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: adminRole, error: roleError } = await supabase.from("operator_roles").select("role").eq("user_id", userId).eq("role", "ADMIN").maybeSingle();
  if (roleError) return NextResponse.json({ error: "관리자 권한을 확인하지 못했어요." }, { status: 500 });
  if (!adminRole) return NextResponse.json({ error: "ADMIN 권한이 필요해요." }, { status: 403 });

  const [flags, failedSync] = await Promise.all([
    supabase.from("feature_flags").select("key", { count: "exact", head: true }),
    supabase.from("data_sync_runs").select("id").eq("status", "FAILED").gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1),
  ]);
  if (flags.error || failedSync.error) return NextResponse.json({ ...base, app: "degraded", deep: { status: "degraded" } }, { status: 503 });
  const hasSyncFailure = (failedSync.data ?? []).length > 0;
  return NextResponse.json({
    ...base,
    app: hasSyncFailure ? "degraded" : "ok",
    deep: { status: hasSyncFailure ? "degraded" : "ok", featureFlagCount: flags.count ?? 0, recentSyncFailure: hasSyncFailure },
  });
}
