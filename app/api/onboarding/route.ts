import { NextResponse } from "next/server";
import { onboardingPayloadSchema, roleProfileFields } from "@/lib/onboarding-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const payloadResult = await request.json().catch(() => null);
  const parsed = onboardingPayloadSchema.safeParse(payloadResult);
  if (!parsed.success) return NextResponse.json({ error: "온보딩 입력을 다시 확인해 주세요." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: true, mode: "demo" });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const payload = parsed.data;
  const { error } = await supabase.rpc("complete_edutalk_onboarding", {
    selected_age_band: payload.ageBand,
    selected_role: payload.role,
    terms_version: payload.consentVersions.terms,
    privacy_version: payload.consentVersions.privacy,
    community_version: payload.consentVersions.community,
    consented_at: payload.consentedAt,
    profile_fields: roleProfileFields(payload),
  });
  if (error) return NextResponse.json({ error: "계정 설정을 저장하지 못했어요." }, { status: 500 });

  return NextResponse.json({ ok: true, mode: "supabase" });
}
