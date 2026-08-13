import { NextResponse } from "next/server";
import { institutionReviewInput } from "@/lib/review-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFeatureFlag } from "@/lib/feature-flags";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const target = new URL(request.url).searchParams.get("institution")?.trim();
  const role = new URL(request.url).searchParams.get("role")?.trim();
  const purpose = new URL(request.url).searchParams.get("purpose")?.trim();
  if (purpose === "mine") {
    const { data, error } = await supabase.from("institution_reviews")
      .select("id, institution_target_key, relation, status, created_at, author_hidden_at")
      .eq("author_user_id", claimsData.claims.sub)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "내 후기 목록을 불러오지 못했어요." }, { status: 500 });
    const reviewIds = (data ?? []).map((review) => review.id);
    const { data: addenda, error: addendaError } = reviewIds.length
      ? await supabase.from("institution_review_addenda").select("id, review_id, body, status, created_at").in("review_id", reviewIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (addendaError) return NextResponse.json({ error: "후기 보완 설명을 불러오지 못했어요." }, { status: 500 });
    return NextResponse.json({ mode: "supabase", reviews: data ?? [], addenda: addenda ?? [] });
  }
  if (!target) return NextResponse.json({ error: "기관 대상이 필요합니다." }, { status: 400 });
  if (role !== "PARENT" && role !== "STUDENT" && role !== "TEACHER") return NextResponse.json({ error: "역할을 확인해 주세요." }, { status: 400 });
  const scope = role === "PARENT" ? "PARENT_REVIEWS" : role === "STUDENT" ? "STUDENT_REVIEWS" : "TEACHER_REVIEWS";
  const { data: entitlement, error: entitlementError } = await supabase
    .from("access_entitlements")
    .select("source_verification_request_id, ends_at, verification_requests!inner(id, target_key, requested_role, status)")
    .eq("user_id", claimsData.claims.sub)
    .eq("scope", scope)
    .is("revoked_at", null)
    .gt("ends_at", new Date().toISOString())
    .eq("verification_requests.target_key", target)
    .eq("verification_requests.requested_role", role)
    .eq("verification_requests.status", "APPROVED")
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (entitlementError) return NextResponse.json({ error: "후기 열람권을 확인하지 못했어요." }, { status: 500 });
  if (purpose === "write") {
    if (entitlement) {
      return NextResponse.json({
        mode: "supabase",
        canWrite: true,
        verificationRequestId: entitlement.source_verification_request_id,
        verificationStatus: "APPROVED",
        accessEndsAt: entitlement.ends_at,
      });
    }
    const { data: latest, error: latestError } = await supabase
      .from("verification_requests")
      .select("id, status, created_at")
      .eq("requester_user_id", claimsData.claims.sub)
      .eq("kind", "INSTITUTION_RELATION")
      .eq("target_key", target)
      .eq("requested_role", role)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) return NextResponse.json({ error: "관계 인증 상태를 확인하지 못했어요." }, { status: 500 });
    return NextResponse.json({ mode: "supabase", canWrite: false, verificationStatus: latest?.status ?? "NOT_REQUESTED", accessEndsAt: null });
  }
  if (!entitlement) {
    const { data: previews, error: previewError } = role === "PARENT"
      ? await supabase.rpc("get_parent_review_previews", { review_target_key: target })
      : { data: [], error: null };
    if (previewError) return NextResponse.json({ error: "학부모 후기 미리보기를 불러오지 못했어요." }, { status: 500 });
    return NextResponse.json({ mode: "supabase", accessEndsAt: null, reviews: [], previews: previews ?? [] });
  }
  const [reviewsResult, hiddenResult] = await Promise.all([
    supabase.from("institution_reviews").select("id, relation, scores, strength, improvement, recommend_to, anonymous_public_author, created_at").eq("institution_target_key", target).eq("status", "APPROVED").is("author_hidden_at", null).order("created_at", { ascending: false }),
    supabase.from("user_hidden_institution_reviews").select("review_id").eq("user_id", claimsData.claims.sub),
  ]);
  const { data, error } = reviewsResult;
  if (error) return NextResponse.json({ error: "승인된 후기를 불러오지 못했어요." }, { status: 500 });
  if (hiddenResult.error) return NextResponse.json({ error: "개인 후기 숨김 설정을 불러오지 못했어요." }, { status: 500 });
  const hiddenIds = new Set((hiddenResult.data ?? []).map((item) => item.review_id));
  const visibleReviews = (data ?? []).filter((review) => !hiddenIds.has(review.id));
  const { data: addenda, error: addendaError } = visibleReviews.length
    ? await supabase.from("institution_review_addenda").select("id, review_id, body, created_at").in("review_id", visibleReviews.map((review) => review.id)).eq("status", "APPROVED").order("created_at", { ascending: true })
    : { data: [], error: null };
  if (addendaError) return NextResponse.json({ error: "승인된 보완 설명을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", accessEndsAt: entitlement.ends_at, reviews: visibleReviews, addenda: addenda ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
  if (typeof body?.id !== "string" || body.action !== "AUTHOR_HIDE") return NextResponse.json({ error: "후기 처리 요청을 다시 확인해 주세요." }, { status: 400 });
  const { data, error } = await supabase.rpc("hide_own_institution_review", { target_review_id: body.id });
  if (error) return NextResponse.json({ error: "후기를 내리지 못했어요." }, { status: 400 });
  return NextResponse.json({ mode: "supabase", review: data });
}

export async function POST(request: Request) {
  const disabled = await requireFeatureFlag("REVIEW_SUBMISSION"); if (disabled) return disabled;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const raw = await request.json().catch(() => null) as { action?: unknown; reviewId?: unknown; body?: unknown } | null;
  if (raw?.action === "ADDENDUM") {
    if (typeof raw.reviewId !== "string" || typeof raw.body !== "string") return NextResponse.json({ error: "보완 설명을 다시 확인해 주세요." }, { status: 400 });
    const { data, error } = await supabase.rpc("submit_institution_review_addendum", { target_review_id: raw.reviewId, addendum_body: raw.body.trim() });
    if (error) return NextResponse.json({ error: "보완 설명을 접수하지 못했어요." }, { status: 400 });
    return NextResponse.json({ mode: "supabase", addendum: data });
  }
  const parsed = institutionReviewInput.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "후기 입력을 다시 확인해 주세요." }, { status: 400 });
  const input = parsed.data;
  const { data: ownedRole, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", input.relation).maybeSingle();
  if (roleError || !ownedRole) return NextResponse.json({ error: "현재 계정에 등록된 역할로만 후기를 작성할 수 있어요." }, { status: 403 });
  const scope = input.relation === "PARENT" ? "PARENT_REVIEWS" : input.relation === "STUDENT" ? "STUDENT_REVIEWS" : "TEACHER_REVIEWS";
  const { data: entitlement, error: entitlementError } = await supabase
    .from("access_entitlements")
    .select("source_verification_request_id, verification_requests!inner(id, target_key, requested_role, status)")
    .eq("user_id", userId)
    .eq("scope", scope)
    .is("revoked_at", null)
    .gt("ends_at", new Date().toISOString())
    .eq("verification_requests.target_key", input.institutionTargetKey)
    .eq("verification_requests.requested_role", input.relation)
    .eq("verification_requests.status", "APPROVED")
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (entitlementError) return NextResponse.json({ error: "관계 인증 상태를 확인하지 못했어요." }, { status: 500 });
  if (!entitlement?.source_verification_request_id) {
    return NextResponse.json({ error: "승인된 관계 인증과 유효한 후기 열람권이 필요해요. 신뢰 센터에서 먼저 인증을 신청해 주세요." }, { status: 403 });
  }
  const { data, error } = await supabase.from("institution_reviews").insert({
    institution_id: null,
    institution_target_key: input.institutionTargetKey,
    author_user_id: userId,
    relation: input.relation,
    scores: input.scores,
    strength: input.strength,
    improvement: input.improvement,
    recommend_to: input.recommendTo,
    verification_request_id: entitlement.source_verification_request_id,
    status: "PENDING",
    anonymous_public_author: input.relation === "TEACHER",
  }).select("id, status, created_at").single();
  if (error?.code === "23505") return NextResponse.json({ error: "이 기관에는 이미 심사 중이거나 공개된 후기가 있어요." }, { status: 409 });
  if (error) return NextResponse.json({ error: "후기를 접수하지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", review: data });
}
