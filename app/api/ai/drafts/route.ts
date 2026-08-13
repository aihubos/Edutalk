import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFeatureFlag } from "@/lib/feature-flags";

const draftInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("JOURNAL"), studentId: z.string().uuid(), evidence: z.string().trim().min(1).max(5000), content: z.object({ learningSummary: z.string(), participationSummary: z.string(), growthSummary: z.string(), nextPlan: z.string() }), generationMode: z.enum(["openai", "demo-template"]), teacherConfirmed: z.literal(true) }),
  z.object({ kind: z.literal("SCHOOL_RECORD"), studentId: z.string().uuid(), section: z.enum(["SUBJECT_DETAIL", "AUTONOMY", "CLUB", "CAREER", "BEHAVIOR"]), evidence: z.string().trim().min(10).max(5000), content: z.object({ draftText: z.string().trim().min(1).max(10000), reviewPoints: z.array(z.string()).max(5) }), generationMode: z.enum(["openai", "demo-template"]), teacherConfirmed: z.literal(true) }),
]);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const links = await supabase
    .from("student_user_links")
    .select("student_id, students(id, alias, grade_level, class_name, institution_id)")
    .eq("user_id", claimsData.claims.sub)
    .eq("relationship", "TEACHER")
    .eq("is_active", true);
  if (links.error) return NextResponse.json({ error: "저장한 AI 기록을 불러오지 못했어요." }, { status: 500 });
  const studentIds = links.data.map((link) => link.student_id);
  if (studentIds.length === 0) {
    return NextResponse.json({ mode: "supabase", drafts: [], students: [], assessments: [], scores: [], growthRecords: [] });
  }

  const [drafts, assessments, scores, growth] = await Promise.all([
    supabase.from("ai_drafts").select("id, student_id, kind, section, evidence, content, generation_mode, teacher_confirmed, created_at").in("student_id", studentIds).order("created_at", { ascending: false }),
    supabase.from("assessments").select("id, student_id, title, assessed_on, term, max_total").in("student_id", studentIds).order("assessed_on", { ascending: true }),
    supabase.from("subject_scores").select("id, student_id, assessment_id, subject, score, max_score, recorded_at").in("student_id", studentIds).order("recorded_at", { ascending: true }),
    supabase.from("growth_records").select("id, student_id, category, observed_on, level, title, note, created_at").in("student_id", studentIds).order("observed_on", { ascending: true }),
  ]);
  if (drafts.error || assessments.error || scores.error || growth.error) return NextResponse.json({ error: "저장한 AI 기록을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", drafts: drafts.data ?? [], students: links.data ?? [], assessments: assessments.data ?? [], scores: scores.data ?? [], growthRecords: growth.data ?? [] });
}

export async function POST(request: Request) {
  const disabled = await requireFeatureFlag("AI_GENERATION"); if (disabled) return disabled;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  const teacherUserId = claimsData?.claims?.sub;
  if (!teacherUserId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const parsed = draftInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "확인한 초안 내용을 다시 확인해 주세요." }, { status: 400 });
  const input = parsed.data;
  const { data, error } = await supabase.from("ai_drafts").insert({ student_id: input.studentId, teacher_user_id: teacherUserId, kind: input.kind, section: input.kind === "SCHOOL_RECORD" ? input.section : null, evidence: input.evidence, content: input.content, generation_mode: input.generationMode, teacher_confirmed: true }).select("id, student_id, kind, section, evidence, content, generation_mode, teacher_confirmed, created_at").single();
  if (error) return NextResponse.json({ error: "교사 연결이 확인된 학생의 초안만 저장할 수 있어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", draft: data });
}
