import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const verificationRoles = new Set(["VERIFICATION_REVIEWER", "ADMIN"]);
const reviewRoles = new Set(["CONTENT_MODERATOR", "ADMIN"]);
const correctionRoles = new Set(["DATA_OPERATOR", "ADMIN"]);
const institutionMemberRoles = new Set(["ADMIN", "INSTITUTION_SUPPORT"]);

const updateInput = z.discriminatedUnion("queue", [
  z.object({
    queue: z.literal("verification"),
    id: z.string().uuid(),
    status: z.enum(["PENDING", "NEEDS_INFO", "APPROVED", "REJECTED"]),
    note: z.string().trim().max(1000),
  }),
  z.object({
    queue: z.literal("review"),
    id: z.string().uuid(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "TEMPORARILY_HIDDEN"]),
    note: z.string().trim().max(1000),
  }),
  z.object({
    queue: z.literal("review-addendum"),
    id: z.string().uuid(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    note: z.string().trim().max(1000),
  }),
  z.object({
    queue: z.literal("tutor-review"),
    id: z.string().uuid(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    note: z.string().trim().max(1000),
  }),
  z.object({
    queue: z.literal("correction"),
    id: z.string().uuid(),
    status: z.enum(["PENDING", "NEEDS_INFO", "APPROVED", "REJECTED", "CANCELLED"]),
    note: z.string().trim().max(1000),
  }),
  z.object({
    queue: z.literal("report"),
    id: z.string().uuid(),
    status: z.enum(["RECEIVED", "TRIAGED", "TEMPORARILY_HIDDEN", "REQUESTED_MORE_INFO", "UPHELD", "REJECTED", "RESTORED", "CLOSED"]),
    note: z.string().trim().max(1000),
  }),
  z.object({ queue: z.literal("institution-member"), id: z.string().uuid(), status: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(1000) }),
]);

async function operatorSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { supabase: null, userId: null, roles: [] as string[], response: NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 }) };
  }
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { supabase, userId: null, roles: [] as string[], response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  const [{ data, error }, { data: supportAssignment, error: supportError }] = await Promise.all([
    supabase.from("operator_roles").select("role").eq("user_id", userId),
    supabase.from("institution_support_users").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (error || supportError) {
    return { supabase, userId, roles: [] as string[], response: NextResponse.json({ error: "운영자 권한을 확인하지 못했어요." }, { status: 500 }) };
  }
  const roles = [...(data ?? []).map((row) => row.role), ...(supportAssignment ? ["INSTITUTION_SUPPORT"] : [])];
  if (!roles.length) {
    return { supabase, userId, roles, response: NextResponse.json({ error: "운영자 권한이 없습니다." }, { status: 403 }) };
  }
  return { supabase, userId, roles, response: null };
}

export async function GET() {
  const current = await operatorSession();
  if (current.response) return current.response;
  const canVerify = current.roles.some((role) => verificationRoles.has(role));
  const canReview = current.roles.some((role) => reviewRoles.has(role));
  const canCorrect = current.roles.some((role) => correctionRoles.has(role));

  const [verifications, reviewAddenda, reviews, tutorReviews, corrections, reports, institutionMembers] = await Promise.all([
    canVerify
      ? current.supabase!.from("verification_requests")
          .select("id, target_key, institution_id, kind, requested_role, status, relationship_period, reviewer_note, created_at")
          .in("status", ["PENDING", "NEEDS_INFO", "APPROVED", "REJECTED"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    canReview
      ? current.supabase!.from("institution_review_addenda")
          .select("id, review_id, body, status, moderation_note, created_at, institution_reviews!inner(institution_target_key, relation)")
          .in("status", ["PENDING", "APPROVED", "REJECTED"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    canReview
      ? current.supabase!.from("institution_reviews")
          .select("id, institution_target_key, institution_id, relation, status, strength, improvement, recommend_to, created_at")
          .in("status", ["PENDING", "APPROVED", "REJECTED", "TEMPORARILY_HIDDEN"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    canReview
      ? current.supabase!.from("tutor_reviews")
          .select("id, tutor_id, rating, content, lesson_verified_at, moderation_status, moderation_note, created_at")
          .in("moderation_status", ["PENDING", "APPROVED", "REJECTED"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    canCorrect
      ? current.supabase!.from("institution_corrections")
          .select("id, target_key, issue, current_summary, requested_summary, status, reviewer_note, created_at")
          .in("status", ["PENDING", "NEEDS_INFO", "APPROVED", "REJECTED", "CANCELLED"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    canReview
      ? current.supabase!.from("content_reports")
          .select("id, target_key, target_type, target_id, issue, location_summary, reason, status, reviewer_note, created_at")
          .in("status", ["RECEIVED", "TRIAGED", "TEMPORARILY_HIDDEN", "REQUESTED_MORE_INFO", "UPHELD", "REJECTED", "RESTORED", "CLOSED"])
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    current.roles.some((role) => institutionMemberRoles.has(role))
      ? current.supabase!.from("institution_members").select("id, status, conflict_detected, requested_at, institutions!inner(name)").in("status", ["PENDING", "CONFLICT_REVIEW"]).order("requested_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (verifications.error || reviews.error || reviewAddenda.error || tutorReviews.error || corrections.error || reports.error || institutionMembers.error) {
    return NextResponse.json({ error: "운영 큐를 불러오지 못했어요." }, { status: 500 });
  }

  const verificationIds = (verifications.data ?? []).map((row) => row.id);
  const documentResult = canVerify && verificationIds.length
    ? await current.supabase!.from("verification_documents")
        .select("id, verification_request_id, document_kind, mime_type, byte_size, uploaded_at")
        .in("verification_request_id", verificationIds)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false })
    : { data: [], error: null };
  if (documentResult.error) return NextResponse.json({ error: "증빙 메타데이터를 불러오지 못했어요." }, { status: 500 });

  return NextResponse.json({
    operatorRoles: current.roles,
    verifications: (verifications.data ?? []).map((row) => ({
      id: row.id,
      targetKey: row.target_key,
      institutionId: row.institution_id,
      kind: row.kind,
      requestedRole: row.requested_role,
      status: row.status,
      relationshipPeriod: row.relationship_period,
      reviewerNote: row.reviewer_note,
      createdAt: row.created_at,
      documents: (documentResult.data ?? []).filter((document) => document.verification_request_id === row.id).map((document) => ({
        id: document.id,
        documentKind: document.document_kind,
        mimeType: document.mime_type,
        byteSize: document.byte_size,
        uploadedAt: document.uploaded_at,
      })),
    })),
    reviews: (reviews.data ?? []).map((row) => ({
      id: row.id,
      targetKey: row.institution_target_key,
      institutionId: row.institution_id,
      relation: row.relation,
      status: row.status,
      strength: row.strength,
      improvement: row.improvement,
      recommendTo: row.recommend_to,
      createdAt: row.created_at,
    })),
    reviewAddenda: (reviewAddenda.data ?? []).map((row) => {
      const review = Array.isArray(row.institution_reviews) ? row.institution_reviews[0] : row.institution_reviews;
      return { id: row.id, targetKey: review?.institution_target_key, relation: review?.relation, content: row.body, status: row.status, reviewerNote: row.moderation_note, createdAt: row.created_at };
    }),
    tutorReviews: (tutorReviews.data ?? []).map((row) => ({
      id: row.id,
      tutorId: row.tutor_id,
      rating: row.rating,
      content: row.content,
      lessonVerifiedAt: row.lesson_verified_at,
      status: row.moderation_status,
      reviewerNote: row.moderation_note,
      createdAt: row.created_at,
    })),
    corrections: (corrections.data ?? []).map((row) => ({
      id: row.id,
      targetKey: row.target_key,
      issue: row.issue,
      currentSummary: row.current_summary,
      requestedSummary: row.requested_summary,
      status: row.status,
      reviewerNote: row.reviewer_note,
      createdAt: row.created_at,
    })),
    reports: (reports.data ?? []).map((row) => ({
      id: row.id,
      targetKey: row.target_key,
      targetType: row.target_type,
      targetId: row.target_id,
      issue: row.issue,
      locationSummary: row.location_summary,
      reason: row.reason,
      status: row.status,
      reviewerNote: row.reviewer_note,
      createdAt: row.created_at,
    })),
    institutionMembers: (institutionMembers.data ?? []).map((row) => {
      const relation = Array.isArray(row.institutions) ? row.institutions[0] : row.institutions;
      return { id: row.id, status: row.status, conflictDetected: Boolean(row.conflict_detected), institutionName: relation?.name ?? "기관명 확인 필요", createdAt: row.requested_at };
    }),
  });
}

export async function PATCH(request: Request) {
  const current = await operatorSession();
  if (current.response) return current.response;
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "처리 상태와 메모를 다시 확인해 주세요." }, { status: 400 });
  const input = parsed.data;

  if (input.queue === "verification") {
    if (!current.roles.some((role) => verificationRoles.has(role))) {
      return NextResponse.json({ error: "인증 요청 처리 권한이 없습니다." }, { status: 403 });
    }
    const { data, error } = await current.supabase!.rpc("review_verification_request", {
      target_request_id: input.id,
      target_status: input.status,
      review_note: input.note,
    });
    if (error) return NextResponse.json({ error: "인증 요청 상태를 저장하지 못했어요." }, { status: 400 });
    return NextResponse.json({ result: data });
  }
  if (input.queue === "institution-member") {
    if (!current.roles.some((role) => institutionMemberRoles.has(role))) return NextResponse.json({ error: "기관 관계 승인 권한이 없습니다." }, { status: 403 });
    const { data, error } = await current.supabase!.rpc("review_institution_member", { target_member_id: input.id, target_status: input.status });
    if (error) return NextResponse.json({ error: "기관 관계 상태를 저장하지 못했어요." }, { status: 400 });
    return NextResponse.json({ result: data });
  }

  if (input.queue === "correction") {
    if (!current.roles.some((role) => correctionRoles.has(role))) return NextResponse.json({ error: "기관 정보 정정 처리 권한이 없습니다." }, { status: 403 });
    const { data, error } = await current.supabase!.rpc("moderate_institution_correction", { target_correction_id: input.id, target_status: input.status, review_note: input.note });
    if (error) return NextResponse.json({ error: "정정 요청 상태를 저장하지 못했어요." }, { status: 400 });
    return NextResponse.json({ result: data });
  }

  if (!current.roles.some((role) => reviewRoles.has(role))) {
    return NextResponse.json({ error: "후기 처리 권한이 없습니다." }, { status: 403 });
  }
  if (input.queue === "report") {
    const { data, error } = await current.supabase!.rpc("moderate_content_report", { target_report_id: input.id, target_status: input.status, review_note: input.note });
    if (error) return NextResponse.json({ error: "신고 처리 상태를 저장하지 못했어요." }, { status: 400 });
    return NextResponse.json({ result: data });
  }
  if (input.queue === "tutor-review") {
    const { data, error } = await current.supabase!.rpc("moderate_tutor_review", {
      target_review_id: input.id,
      target_status: input.status,
      review_note: input.note,
    });
    if (error) return NextResponse.json({ error: "튜터 후기 상태를 저장하지 못했어요." }, { status: 400 });
    return NextResponse.json({ result: data });
  }
  if (input.queue === "review-addendum") {
    const { data, error } = await current.supabase!.rpc("moderate_institution_review_addendum", {
      target_addendum_id: input.id,
      target_status: input.status,
      review_note: input.note,
    });
    if (error) return NextResponse.json({ error: "후기 보완 설명 상태를 저장하지 못했어요." }, { status: 400 });
    return NextResponse.json({ result: data });
  }
  const { data, error } = await current.supabase!.rpc("moderate_institution_review", {
    target_review_id: input.id,
    target_status: input.status,
    review_note: input.note,
  });
  if (error) return NextResponse.json({ error: "후기 상태를 저장하지 못했어요." }, { status: 400 });
  return NextResponse.json({ result: data });
}
