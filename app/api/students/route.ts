import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createStudentInput, toAssessment, toGrowth, toScore, toStudent } from "@/lib/student-server";

async function getUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null };
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null };
}

export async function GET() {
  const { supabase, userId } = await getUser();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const links = await supabase.from("student_user_links").select("student_id, relationship, child_profile_id").eq("user_id", userId).eq("is_active", true);
  if (links.error) return NextResponse.json({ error: "학생 목록을 불러오지 못했어요." }, { status: 500 });
  const ids = links.data.map((link) => link.student_id);
  if (!ids.length) return NextResponse.json({ mode: "supabase", students: [], assessments: [], scores: [], growthRecords: [] });
  const childProfileIds = links.data.flatMap((link) => link.relationship === "PARENT" && typeof link.child_profile_id === "string" ? [link.child_profile_id] : []);
  const [students, assessments, scores, growthRecords, childProfiles] = await Promise.all([
    supabase.from("students").select("id,alias,grade_level,class_name,institution_id,institution_name").in("id", ids),
    supabase.from("assessments").select("id,student_id,kind,title,assessed_on,term,max_total").in("student_id", ids),
    supabase.from("subject_scores").select("id,student_id,assessment_id,subject,score,max_score,grade_band,percentile,recorded_at").in("student_id", ids),
    supabase.from("growth_records").select("id,student_id,category,observed_on,level,title,note").in("student_id", ids),
    childProfileIds.length
      ? supabase.from("child_profiles").select("id, alias, grade_level").in("id", childProfileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (students.error || assessments.error || scores.error || growthRecords.error || childProfiles.error) return NextResponse.json({ error: "학습 기록을 불러오지 못했어요." }, { status: 500 });
  const childById = new Map((childProfiles.data ?? []).map((child) => [child.id, child]));
  const parentAliasByStudent = new Map(links.data.flatMap((link) => {
    if (link.relationship !== "PARENT" || typeof link.child_profile_id !== "string") return [];
    const child = childById.get(link.child_profile_id);
    return child ? [[link.student_id, child] as const] : [];
  }));
  return NextResponse.json({
    mode: "supabase",
    students: students.data.map((student) => {
      const child = parentAliasByStudent.get(student.id);
      return toStudent(child ? { ...student, alias: child.alias, grade_level: child.grade_level || student.grade_level } : student);
    }),
    assessments: assessments.data.map(toAssessment),
    scores: scores.data.map(toScore),
    growthRecords: growthRecords.data.map(toGrowth),
  });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getUser();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const teacherRole = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "TEACHER").maybeSingle();
  if (teacherRole.error || !teacherRole.data) return NextResponse.json({ error: "선생님 역할에서만 학생을 등록할 수 있어요." }, { status: 403 });
  const parsed = createStudentInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "학생 정보를 다시 확인해 주세요." }, { status: 400 });
  const input = parsed.data;
  const created = await supabase.rpc("create_teacher_student", {
    student_alias: input.alias,
    student_grade_level: input.gradeLevel,
    student_class_name: input.className,
    student_institution_id: input.institutionId ?? null,
    student_institution_name: input.institutionName,
  });
  if (created.error || !created.data) return NextResponse.json({ error: "학생을 등록하지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", student: toStudent(created.data) });
}
