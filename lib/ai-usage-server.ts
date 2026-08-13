import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AiCreditResult {
  mode: "server" | "demo";
  allowed: boolean;
  remaining: number | null;
  plan?: "FREE" | "UNLIMITED";
  error?: string;
}

export interface LinkedAiStudent {
  id: string;
  alias: string;
  gradeLevel: string;
}

export async function getLinkedTeacherStudent(studentId: string): Promise<{ mode: "server" | "demo"; student?: LinkedAiStudent; error?: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { mode: "demo" };
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsError || !userId) return { mode: "server", error: "AI 기능을 사용하려면 먼저 로그인해 주세요." };
  const { data, error } = await supabase
    .from("student_user_links")
    .select("students!inner(id, alias, grade_level)")
    .eq("student_id", studentId)
    .eq("user_id", userId)
    .eq("relationship", "TEACHER")
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { mode: "server", error: "담당 학생 연결을 확인하지 못했어요." };
  const raw = Array.isArray(data?.students) ? data.students[0] : data?.students;
  if (!raw || typeof raw !== "object") return { mode: "server", error: "현재 계정에 연결된 담당 학생만 AI 초안을 만들 수 있어요." };
  const student = raw as { id?: unknown; alias?: unknown; grade_level?: unknown };
  if (typeof student.id !== "string" || typeof student.alias !== "string" || typeof student.grade_level !== "string") {
    return { mode: "server", error: "담당 학생 정보를 확인하지 못했어요." };
  }
  return { mode: "server", student: { id: student.id, alias: student.alias, gradeLevel: student.grade_level } };
}

export async function consumeServerAiCredit(): Promise<AiCreditResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { mode: "demo", allowed: true, remaining: null };

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return { mode: "server", allowed: false, remaining: 0, error: "AI 기능을 사용하려면 먼저 로그인해 주세요." };
  }

  const userId = claimsData.claims.sub;
  const { data: teacherRole, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "TEACHER")
    .maybeSingle();
  if (roleError || !teacherRole) {
    return { mode: "server", allowed: false, remaining: 0, error: "선생님 계정에서만 AI 기록 도구를 사용할 수 있어요." };
  }

  const { data, error } = await supabase.rpc("consume_ai_credit");
  if (error) {
    return { mode: "server", allowed: false, remaining: 0, error: "AI 사용량을 확인하지 못했어요." };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result.allowed !== "boolean") {
    return { mode: "server", allowed: false, remaining: 0, error: "AI 사용량 응답을 확인하지 못했어요." };
  }

  return {
    mode: "server",
    allowed: result.allowed,
    remaining: typeof result.remaining === "number" ? result.remaining : null,
    plan: result.plan === "UNLIMITED" ? "UNLIMITED" : "FREE",
    error: result.allowed ? undefined : "무료 AI 10회를 모두 사용했어요. 무제한 플랜을 확인해 주세요.",
  };
}
