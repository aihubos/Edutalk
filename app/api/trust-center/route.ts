import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const targetKey = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/);
const requestInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("verification"), institutionId: targetKey, kind: z.enum(["INSTITUTION_RELATION", "TUTOR_IDENTITY", "TUTOR_CREDENTIAL"]), role: z.enum(["PARENT", "STUDENT", "TEACHER", "TUTOR"]), evidenceType: z.enum(["ENROLLMENT", "EMPLOYMENT", "IDENTITY", "TEACHING_CERT", "LANGUAGE_SCORE", "DEGREE"]), relationshipPeriod: z.string().trim().min(1).max(120) }),
  z.object({ type: z.literal("correction"), institutionId: targetKey, issue: z.enum(["BASIC_INFO", "OPERATING_HOURS", "PROGRAM", "FEE", "CLOSED_OR_PAUSED", "OTHER"]), currentInfo: z.string().trim().min(1).max(500), requestedInfo: z.string().trim().min(1).max(500) }),
  z.object({
    type: z.literal("report"),
    institutionId: targetKey,
    issue: z.enum(["PERSONAL_INFO", "IDENTIFICATION_RISK", "ABUSE", "MISINFORMATION", "COPYRIGHT", "SPAM", "OTHER"]),
    contentLocation: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(1000),
    targetType: z.literal("institution_review").optional(),
    targetId: z.string().uuid().optional(),
  }).refine((value) => Boolean(value.targetType) === Boolean(value.targetId), { message: "신고 대상을 다시 확인해 주세요." }),
]);

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ mode: "demo" }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return error || !userId ? { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) } : { supabase, userId, response: null };
}

const history = (status: "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED", createdAt: string, note?: string | null) => [
  { status: "PENDING" as const, note: "계정 인증 요청이 접수되었습니다. 필요한 비공개 증빙은 요청 상태가 허용할 때만 별도 업로드할 수 있습니다.", createdAt },
  ...(status === "PENDING" ? [] : [{ status, note: note || "운영 처리 상태가 변경되었습니다.", createdAt }]),
];

export async function GET() {
  const current = await session(); if (current.response) return current.response;
  const [verifications, corrections, reports] = await Promise.all([
    current.supabase!.from("verification_requests").select("id, target_key, kind, requested_role, evidence_type, status, relationship_period, reviewer_note, created_at").order("created_at", { ascending: false }),
    current.supabase!.from("institution_corrections").select("id, target_key, issue, current_summary, requested_summary, status, reviewer_note, created_at").order("created_at", { ascending: false }),
    current.supabase!.from("content_reports").select("id, target_key, target_type, target_id, issue, location_summary, reason, status, reviewer_note, created_at").order("created_at", { ascending: false }),
  ]);
  if (verifications.error || corrections.error || reports.error) return NextResponse.json({ error: "요청 내역을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({
    mode: "server",
    verifications: (verifications.data ?? []).map((row) => ({ id: row.id, institutionId: row.target_key || "", kind: row.kind as "INSTITUTION_RELATION" | "TUTOR_IDENTITY" | "TUTOR_CREDENTIAL", role: row.kind === "TUTOR_IDENTITY" || row.kind === "TUTOR_CREDENTIAL" ? "TUTOR" : row.requested_role || "PARENT", evidenceType: row.evidence_type || "ENROLLMENT", relationshipPeriod: row.relationship_period || "", confirmation: true, status: row.status as "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED", submittedAt: row.created_at, history: history(row.status as "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED", row.created_at, row.reviewer_note) })),
    corrections: (corrections.data ?? []).map((row) => ({ id: row.id, institutionId: row.target_key || "", issue: row.issue as "BASIC_INFO" | "OPERATING_HOURS" | "PROGRAM" | "FEE" | "CLOSED_OR_PAUSED" | "OTHER", currentInfo: row.current_summary, requestedInfo: row.requested_summary, status: row.status as "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED", submittedAt: row.created_at, history: history(row.status as "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED", row.created_at, row.reviewer_note) })),
    reports: (reports.data ?? []).map((row) => {
      const displayStatus = row.status === "REQUESTED_MORE_INFO"
        ? "NEEDS_INFO"
        : row.status === "REJECTED"
          ? "REJECTED"
          : ["UPHELD", "RESTORED", "CLOSED"].includes(row.status)
            ? "APPROVED"
            : "PENDING";
      return {
        id: row.id,
        institutionId: row.target_key || "",
        issue: row.issue as "PERSONAL_INFO" | "IDENTIFICATION_RISK" | "ABUSE" | "MISINFORMATION" | "COPYRIGHT" | "SPAM" | "OTHER",
        contentLocation: row.location_summary,
        reason: row.reason,
        targetType: row.target_type === "institution_review" ? "institution_review" : undefined,
        targetId: row.target_id ?? undefined,
        operatorStatus: row.status,
        status: displayStatus,
        submittedAt: row.created_at,
        history: history(displayStatus, row.created_at, row.reviewer_note),
      };
    }),
  });
}

export async function POST(request: Request) {
  const current = await session(); if (current.response) return current.response;
  const parsed = requestInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청 내용을 다시 확인해 주세요." }, { status: 400 });
  const body = parsed.data;
  if (body.type === "verification") {
    const isRelation = body.kind === "INSTITUTION_RELATION";
    if ((isRelation && body.role === "TUTOR") || (!isRelation && body.role !== "TUTOR")) {
      return NextResponse.json({ error: "인증 유형과 신청자 구분이 맞지 않아요." }, { status: 400 });
    }
    if (isRelation) {
      const { data: ownedRole, error: roleError } = await current.supabase!.from("user_roles").select("role").eq("user_id", current.userId).eq("role", body.role).maybeSingle();
      if (roleError || !ownedRole) return NextResponse.json({ error: "현재 계정에 등록된 역할로만 관계 인증을 신청할 수 있어요." }, { status: 403 });
      if (body.role === "STUDENT") {
        const { data: consent } = await current.supabase!.from("user_consents").select("age_band").eq("user_id", current.userId).maybeSingle();
        if (consent?.age_band === "UNDER_14") return NextResponse.json({ error: "만 14세 미만은 보호자 계정으로 인증을 신청해 주세요." }, { status: 403 });
      }
      const scope = body.role === "PARENT" ? "PARENT_REVIEWS" : body.role === "STUDENT" ? "STUDENT_REVIEWS" : "TEACHER_REVIEWS";
      const { data: activeAccess } = await current.supabase!.from("access_entitlements")
        .select("id, verification_requests!inner(target_key, requested_role, status)")
        .eq("user_id", current.userId)
        .eq("scope", scope)
        .is("revoked_at", null)
        .gt("ends_at", new Date().toISOString())
        .eq("verification_requests.target_key", body.institutionId)
        .eq("verification_requests.requested_role", body.role)
        .eq("verification_requests.status", "APPROVED")
        .limit(1)
        .maybeSingle();
      if (activeAccess) return NextResponse.json({ error: "이 기관과 역할의 후기 열람권이 아직 유효해요. 만료 후 재인증할 수 있어요." }, { status: 409 });
    } else {
      const { data: tutorProfile } = await current.supabase!.from("tutor_profiles").select("id").eq("user_id", current.userId).maybeSingle();
      if (!tutorProfile) return NextResponse.json({ error: "튜터 프로필을 먼저 등록한 뒤 인증을 신청해 주세요." }, { status: 403 });
    }
    const { error } = await current.supabase!.from("verification_requests").insert({ requester_user_id: current.userId, target_key: body.institutionId, kind: body.kind, requested_role: body.role === "TUTOR" ? null : body.role, evidence_type: body.evidenceType, relationship_period: body.relationshipPeriod });
    if (error?.code === "23505") return NextResponse.json({ error: "같은 기관과 역할의 인증 요청이 이미 처리 중이거나 승인됐어요." }, { status: 409 });
    if (error) return NextResponse.json({ error: "인증 요청을 저장하지 못했어요." }, { status: 500 });
  } else if (body.type === "correction") {
    const { error } = await current.supabase!.from("institution_corrections").insert({ requester_user_id: current.userId, target_key: body.institutionId, issue: body.issue, current_summary: body.currentInfo, requested_summary: body.requestedInfo });
    if (error) return NextResponse.json({ error: "정정 요청을 저장하지 못했어요." }, { status: 500 });
  } else if (body.type === "report") {
    if (body.targetType === "institution_review" && body.targetId) {
      const { data: targetReview, error: targetError } = await current.supabase!
        .from("institution_reviews")
        .select("id")
        .eq("id", body.targetId)
        .eq("institution_target_key", body.institutionId)
        .eq("status", "APPROVED")
        .maybeSingle();
      if (targetError || !targetReview) return NextResponse.json({ error: "신고할 후기를 확인할 수 없어요. 후기 열람 권한과 공개 상태를 확인해 주세요." }, { status: 403 });
    }
    const { error } = await current.supabase!.from("content_reports").insert({
      reporter_user_id: current.userId,
      target_key: body.institutionId,
      target_type: body.targetType ?? "institution",
      target_id: body.targetId ?? null,
      issue: body.issue,
      location_summary: body.contentLocation,
      reason: body.reason,
    });
    if (error) return NextResponse.json({ error: "신고를 저장하지 못했어요." }, { status: 500 });
  }
  return GET();
}
