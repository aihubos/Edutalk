import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const operatorRoles = new Set(["DATA_OPERATOR", "ADMIN"]);
const updateInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["OPEN", "RESOLVED"]),
  note: z.string().trim().max(1000),
});
const captureInput = z.object({ action: z.literal("capture-weekly-ranking") });

function currentSeoulWeekStart() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const seoulDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const dayOffset = (seoulDate.getUTCDay() + 6) % 7;
  seoulDate.setUTCDate(seoulDate.getUTCDate() - dayOffset);
  return seoulDate.toISOString().slice(0, 10);
}

async function dataOperatorSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 }) };
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !userId) return { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  const { data: roles, error: rolesError } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (rolesError) return { supabase, userId, response: NextResponse.json({ error: "운영자 권한을 확인하지 못했어요." }, { status: 500 }) };
  if (!(roles ?? []).some((item) => operatorRoles.has(item.role))) return { supabase, userId, response: NextResponse.json({ error: "공공데이터 운영 권한이 없습니다." }, { status: 403 }) };
  return { supabase, userId, response: null };
}

export async function GET() {
  const current = await dataOperatorSession();
  if (current.response) return current.response;
  const [runs, issues, roles] = await Promise.all([
    current.supabase!.from("data_sync_runs").select("id, source_system, status, started_at, finished_at, records_seen, records_created, records_updated, error_summary").order("started_at", { ascending: false }).limit(20),
    current.supabase!.from("data_quality_issues").select("id, sync_run_id, institution_id, issue_type, status, summary, processing_note, created_at, reviewed_at").eq("status", "OPEN").order("created_at", { ascending: false }).limit(100),
    current.supabase!.from("operator_roles").select("role").eq("user_id", current.userId),
  ]);
  if (runs.error || issues.error || roles.error) return NextResponse.json({ error: "공공데이터 운영 현황을 불러오지 못했어요." }, { status: 500 });

  const duplicateCounts = new Map<string, number>();
  (issues.data ?? []).filter((issue) => issue.issue_type === "DUPLICATE_CANDIDATE" && issue.sync_run_id).forEach((issue) => duplicateCounts.set(issue.sync_run_id!, (duplicateCounts.get(issue.sync_run_id!) ?? 0) + 1));
  return NextResponse.json({
    isAdmin: (roles.data ?? []).some((item) => item.role === "ADMIN"),
    runs: (runs.data ?? []).map((run) => ({
      id: run.id,
      source: run.source_system,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      recordsSeen: run.records_seen,
      normalized: run.records_created + run.records_updated,
      duplicates: duplicateCounts.get(run.id) ?? 0,
      errors: run.error_summary ?? "",
    })),
    issues: (issues.data ?? []).map((issue) => ({
      id: issue.id,
      runId: issue.sync_run_id,
      institutionId: issue.institution_id,
      issueType: issue.issue_type,
      status: issue.status,
      summary: issue.summary,
      note: issue.processing_note ?? "",
      createdAt: issue.created_at,
      reviewedAt: issue.reviewed_at,
    })),
  });
}

export async function PATCH(request: Request) {
  const current = await dataOperatorSession();
  if (current.response) return current.response;
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "처리 상태와 메모를 다시 확인해 주세요." }, { status: 400 });
  const { id, status, note } = parsed.data;
  const { error } = await current.supabase!.from("data_quality_issues").update({
    status,
    processing_note: note || null,
    reviewed_by: current.userId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "OPEN");
  if (error) return NextResponse.json({ error: "품질 이슈 처리 상태를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const current = await dataOperatorSession();
  if (current.response) return current.response;
  const parsed = captureInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "주간 순위 확정 요청을 다시 확인해 주세요." }, { status: 400 });
  const { data: roles, error: rolesError } = await current.supabase!.from("operator_roles").select("role").eq("user_id", current.userId);
  if (rolesError || !(roles ?? []).some((item) => item.role === "ADMIN")) return NextResponse.json({ error: "주간 순위 확정은 ADMIN만 할 수 있어요." }, { status: 403 });
  const weekStart = currentSeoulWeekStart();
  const { data, error } = await current.supabase!.rpc("capture_institution_ranking_week", { target_week: weekStart });
  if (error || typeof data !== "number") return NextResponse.json({ error: "이번 주 순위를 확정하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true, weekStart, capturedCount: data });
}
