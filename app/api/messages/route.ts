import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const messageKinds = new Set(["NOTICE", "JOURNAL", "MESSAGE"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getSessionSupabase() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ mode: "demo" }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) return { supabase, userId: null, response: NextResponse.json({ mode: "server", authenticated: false }, { status: 401 }) };
  return { supabase, userId, response: null };
}

export async function GET() {
  const session = await getSessionSupabase();
  if (session.response) return session.response;

  const [threadResult, linkResult] = await Promise.all([
    session.supabase!
      .from("communication_threads")
      .select("id, student_id, teacher_user_id, parent_user_id, students(alias, grade_level, class_name), communication_messages(id, thread_id, author_user_id, kind, body, is_important, shared_ai_draft_id, read_at, created_at)")
      .order("created_at", { referencedTable: "communication_messages", ascending: true }),
    session.supabase!
      .from("student_user_links")
      .select("student_id, relationship, child_profile_id, students(alias, grade_level, class_name)")
      .eq("user_id", session.userId!)
      .eq("is_active", true),
  ]);

  if (threadResult.error || linkResult.error) return NextResponse.json({ error: "메시지를 불러오지 못했어요." }, { status: 500 });

  const data = threadResult.data ?? [];
  const childProfileIds = (linkResult.data ?? []).flatMap((link) => link.relationship === "PARENT" && typeof link.child_profile_id === "string" ? [link.child_profile_id] : []);
  const childResult = childProfileIds.length
    ? await session.supabase!.from("child_profiles").select("id, alias, grade_level").in("id", childProfileIds)
    : { data: [], error: null };
  if (childResult.error) return NextResponse.json({ error: "자녀 별칭을 불러오지 못했어요." }, { status: 500 });
  const childById = new Map((childResult.data ?? []).map((child) => [child.id, child]));
  const parentAliasByStudent = new Map((linkResult.data ?? []).flatMap((link) => {
    if (link.relationship !== "PARENT" || typeof link.child_profile_id !== "string") return [];
    const child = childById.get(link.child_profile_id);
    return child ? [[link.student_id, child] as const] : [];
  }));

  const threads = (data ?? []).map((thread) => {
    const student = Array.isArray(thread.students) ? thread.students[0] : thread.students;
    const child = parentAliasByStudent.get(thread.student_id);
    return {
    id: thread.id,
    studentId: thread.student_id,
    teacherName: thread.teacher_user_id === session.userId ? "나" : "담당 선생님",
    parentName: thread.parent_user_id === session.userId ? "나" : "보호자",
    subjectLabel: student?.class_name || "학생 대화",
    studentAlias: child?.alias || student?.alias || "학생",
    gradeLevel: child?.grade_level || student?.grade_level || "",
  };
  });
  const messages = data.flatMap((thread) => (thread.communication_messages ?? []).map((message) => ({
    id: message.id,
    threadId: message.thread_id,
    studentId: thread.student_id,
    author: message.author_user_id === session.userId ? "SELF" : "OTHER",
    kind: message.kind,
    body: message.body,
    sentAt: message.created_at,
    createdAt: message.created_at,
    isRead: Boolean(message.read_at),
    isImportant: message.is_important,
    journalNotice: message.shared_ai_draft_id ? "선생님이 확인한 AI 학생일지 공유" : undefined,
  })));
  const students = Array.from(new Map((linkResult.data ?? []).map((link) => {
    const student = Array.isArray(link.students) ? link.students[0] : link.students;
    const child = parentAliasByStudent.get(link.student_id);
    return [link.student_id, {
      id: link.student_id,
      alias: child?.alias || student?.alias || "학생",
      gradeLevel: child?.grade_level || student?.grade_level || "",
      className: student?.class_name || "학생 대화",
    }];
  })).values());
  return NextResponse.json({ mode: "server", authenticated: true, students, threads, messages });
}

export async function POST(request: Request) {
  const session = await getSessionSupabase();
  if (session.response) return session.response;
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const threadId = typeof payload?.threadId === "string" ? payload.threadId : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  const kind = typeof payload?.kind === "string" ? payload.kind : "";
  const isImportant = payload?.isImportant === true;
  const sharedAiDraftId = typeof payload?.sharedAiDraftId === "string" && uuidPattern.test(payload.sharedAiDraftId) ? payload.sharedAiDraftId : null;
  if (!threadId || !body || body.length > 5000 || !messageKinds.has(kind)) {
    return NextResponse.json({ error: "메시지 내용을 다시 확인해 주세요." }, { status: 400 });
  }
  if (payload?.sharedAiDraftId !== undefined && payload?.sharedAiDraftId !== null && !sharedAiDraftId) {
    return NextResponse.json({ error: "공유할 학생일지를 다시 확인해 주세요." }, { status: 400 });
  }
  if (sharedAiDraftId && kind !== "JOURNAL") return NextResponse.json({ error: "학생일지는 알림장 형태로만 공유할 수 있어요." }, { status: 400 });

  if (sharedAiDraftId) {
    const { data: thread, error: threadError } = await session.supabase!
      .from("communication_threads")
      .select("student_id, teacher_user_id")
      .eq("id", threadId)
      .maybeSingle();
    if (threadError || !thread || thread.teacher_user_id !== session.userId) return NextResponse.json({ error: "담당 선생님 대화에서만 학생일지를 공유할 수 있어요." }, { status: 403 });
    const { data: sharedDraft, error: draftError } = await session.supabase!
      .from("ai_drafts")
      .select("id")
      .eq("id", sharedAiDraftId)
      .eq("student_id", thread.student_id)
      .eq("teacher_user_id", session.userId)
      .eq("kind", "JOURNAL")
      .eq("teacher_confirmed", true)
      .maybeSingle();
    if (draftError || !sharedDraft) return NextResponse.json({ error: "확인된 현재 학생의 일지만 공유할 수 있어요." }, { status: 400 });
  }
  const { data, error } = await session.supabase!
    .from("communication_messages")
    .insert({ thread_id: threadId, author_user_id: session.userId, kind, body, is_important: isImportant, shared_ai_draft_id: sharedAiDraftId })
    .select("id, thread_id, kind, body, is_important, shared_ai_draft_id, read_at, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "메시지를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ message: { id: data.id, threadId: data.thread_id, author: "SELF", kind: data.kind, body: data.body, sentAt: data.created_at, createdAt: data.created_at, isRead: Boolean(data.read_at), isImportant: data.is_important, journalNotice: data.shared_ai_draft_id ? "선생님이 확인한 AI 학생일지 공유" : undefined } });
}

export async function PATCH(request: Request) {
  const session = await getSessionSupabase();
  if (session.response) return session.response;
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const messageIds = Array.isArray(payload?.messageIds) ? payload.messageIds.filter((value): value is string => typeof value === "string") : [];
  if (payload?.action !== "mark-read" || messageIds.length === 0) return NextResponse.json({ error: "처리할 메시지가 없어요." }, { status: 400 });
  const { error } = await session.supabase!
    .from("communication_messages")
    .update({ read_at: new Date().toISOString() })
    .in("id", messageIds)
    .neq("author_user_id", session.userId);
  if (error) return NextResponse.json({ error: "읽음 상태를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
