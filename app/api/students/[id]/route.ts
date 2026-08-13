import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createStudentRecordInput } from "@/lib/student-server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const parsed = createStudentRecordInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "학습 기록 입력을 다시 확인해 주세요." }, { status: 400 });
  const body = parsed.data;
  if (body.action === "assessment") {
    const result = await supabase.from("assessments").insert({ student_id: id, kind: body.kind, title: body.title, assessed_on: body.date, term: body.term, max_total: body.maxTotal, created_by: userId }).select("id").single();
    return result.error ? NextResponse.json({ error: "평가를 등록하지 못했어요." }, { status: 500 }) : NextResponse.json({ ok: true, id: result.data.id });
  }
  if (body.action === "score") {
    const result = await supabase.from("subject_scores").insert({ student_id: id, assessment_id: body.assessmentId, subject: body.subject, score: body.score, max_score: body.maxScore, grade_band: body.gradeBand || null, recorded_by: userId });
    return result.error ? NextResponse.json({ error: "점수를 저장하지 못했어요." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (body.action === "growth") {
    const result = await supabase.from("growth_records").insert({ student_id: id, category: body.category, observed_on: body.observedAt, level: body.level, title: body.title, note: body.note, teacher_user_id: userId });
    return result.error ? NextResponse.json({ error: "성장기록을 저장하지 못했어요." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "요청을 확인하지 못했어요." }, { status: 400 });
}
