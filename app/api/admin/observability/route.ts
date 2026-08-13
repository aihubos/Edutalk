import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function adminSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, response: NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 }) };
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data: role } = await supabase.from("operator_roles").select("role").eq("user_id", userId).eq("role", "ADMIN").maybeSingle();
  return role ? { supabase, response: null } : { supabase, response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }) };
}

export async function GET() {
  const current = await adminSession();
  if (current.response) return current.response;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [audit, verifications, reviews, reports, supports, notifications, syncFailures, pendingVerifications, pendingReviews, pendingReports, pendingSupports, productEvents] = await Promise.all([
    current.supabase!.from("audit_logs").select("action, target_type, target_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(30),
    current.supabase!.from("verification_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
    current.supabase!.from("institution_reviews").select("id", { count: "exact", head: true }).gte("created_at", since),
    current.supabase!.from("content_reports").select("id", { count: "exact", head: true }).gte("created_at", since),
    current.supabase!.from("support_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
    current.supabase!.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", since),
    current.supabase!.from("data_sync_runs").select("id", { count: "exact", head: true }).gte("started_at", since).in("status", ["FAILED", "PARTIAL"]),
    current.supabase!.from("verification_requests").select("id", { count: "exact", head: true }).in("status", ["PENDING", "NEEDS_INFO"]),
    current.supabase!.from("institution_reviews").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    current.supabase!.from("content_reports").select("id", { count: "exact", head: true }).in("status", ["RECEIVED", "TRIAGED", "REQUESTED_MORE_INFO"]),
    current.supabase!.from("support_requests").select("id", { count: "exact", head: true }).in("status", ["RECEIVED", "IN_PROGRESS"]),
    current.supabase!.from("product_events").select("event_name").gte("created_at", since),
  ]);
  const results = [audit, verifications, reviews, reports, supports, notifications, syncFailures, pendingVerifications, pendingReviews, pendingReports, pendingSupports, productEvents];
  if (results.some((result) => result.error)) return NextResponse.json({ error: "운영 지표를 불러오지 못했어요." }, { status: 500 });
  const productEventCounts = { LOGIN_STARTED: 0, ROLE_SELECTED: 0, LOCATION_SELECTED: 0, ONBOARDING_COMPLETED: 0, INSTITUTION_VIEWED: 0, FAVORITE_ADDED: 0, COMPARISON_CREATED: 0, VERIFICATION_SUBMITTED: 0, REVIEW_SUBMITTED: 0, ACCOUNT_DELETION_STARTED: 0 };
  (productEvents.data ?? []).forEach((event) => {
    if (event.event_name in productEventCounts) productEventCounts[event.event_name as keyof typeof productEventCounts] += 1;
  });
  return NextResponse.json({
    since,
    counts: { verifications: verifications.count ?? 0, reviews: reviews.count ?? 0, reports: reports.count ?? 0, supports: supports.count ?? 0, notifications: notifications.count ?? 0, syncFailures: syncFailures.count ?? 0 },
    queues: { verifications: pendingVerifications.count ?? 0, reviews: pendingReviews.count ?? 0, reports: pendingReports.count ?? 0, supports: pendingSupports.count ?? 0 },
    productEvents: productEventCounts,
    audit: audit.data ?? [],
  });
}
