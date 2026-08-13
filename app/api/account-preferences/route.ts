import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const preferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ROLE"), role: z.enum(["PARENT", "STUDENT", "TEACHER"]) }),
  z.object({ kind: z.literal("ZONE"), zone: z.enum(["ALL", "DONGTAN_1", "DONGTAN_2"]) }),
  z.object({ kind: z.literal("PROFILE"), fields: z.record(z.string().max(60), z.string().trim().min(1).max(200)).refine((fields) => Object.keys(fields).length > 0, "추천 프로필을 입력해 주세요.") }),
]);

export async function PATCH(request: Request) {
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "계정 설정을 다시 확인해 주세요." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "계정 서버 설정 후 사용할 수 있어요." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  if (parsed.data.kind === "ROLE") {
    if (parsed.data.role === "STUDENT") {
      const { data: consent, error: consentError } = await supabase
        .from("user_consents")
        .select("age_band")
        .eq("user_id", userId)
        .maybeSingle();
      if (consentError) return NextResponse.json({ error: "연령 설정을 확인하지 못했어요." }, { status: 500 });
      if (consent?.age_band === "UNDER_14") return NextResponse.json({ error: "만 14세 미만은 독립 학생 역할로 전환할 수 없어요." }, { status: 403 });
    }
    const { data: ownedRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", parsed.data.role)
      .maybeSingle();
    if (roleError) return NextResponse.json({ error: "보유 역할을 확인하지 못했어요." }, { status: 500 });
    if (!ownedRole) return NextResponse.json({ error: "먼저 역할별 최소 프로필을 등록해 주세요." }, { status: 403 });
    const { data: roleProfile, error: profileError } = await supabase
      .from("user_role_profiles")
      .select("fields")
      .eq("user_id", userId)
      .eq("role", parsed.data.role)
      .maybeSingle();
    if (profileError || !roleProfile) return NextResponse.json({ error: "역할별 최소 프로필을 확인하지 못했어요." }, { status: 409 });
    const { error } = await supabase.from("profiles").update({ active_role: parsed.data.role }).eq("user_id", userId);
    if (error) return NextResponse.json({ error: "현재 역할을 저장하지 못했어요." }, { status: 500 });
    return NextResponse.json({ ok: true, role: parsed.data.role, fields: roleProfile.fields });
  }

  const { data: activeProfile, error: profileError } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "현재 역할을 확인하지 못했어요." }, { status: 500 });
  const role = activeProfile?.active_role;
  if (role !== "PARENT" && role !== "STUDENT" && role !== "TEACHER") {
    return NextResponse.json({ error: "현재 역할을 먼저 선택해 주세요." }, { status: 409 });
  }
  const { data: roleProfile, error: roleProfileError } = await supabase
    .from("user_role_profiles")
    .select("fields")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (roleProfileError || !roleProfile) return NextResponse.json({ error: "역할 프로필을 확인하지 못했어요." }, { status: 500 });
  const currentFields = roleProfile.fields && typeof roleProfile.fields === "object" && !Array.isArray(roleProfile.fields)
    ? roleProfile.fields as Record<string, unknown>
    : {};
  const nextFields = parsed.data.kind === "ZONE"
    ? { ...currentFields, serviceZone: parsed.data.zone }
    : { ...currentFields, ...parsed.data.fields };
  const { error } = await supabase.from("user_role_profiles").update({
    fields: nextFields,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("role", role);
  if (error) return NextResponse.json({ error: parsed.data.kind === "ZONE" ? "관심 지역을 저장하지 못했어요." : "추천 프로필을 저장하지 못했어요." }, { status: 500 });
  return parsed.data.kind === "ZONE"
    ? NextResponse.json({ ok: true, zone: parsed.data.zone })
    : NextResponse.json({ ok: true, fields: nextFields });
}
