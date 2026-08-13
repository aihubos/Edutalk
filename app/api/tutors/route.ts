import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { tutorContactInput, tutorJobApplicationInput, tutorJobInput, tutorProfileInput, tutorRequestResponseInput, tutorReviewInput } from "@/lib/tutor-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFeatureFlag } from "@/lib/feature-flags";

type Client = {
  auth: { getClaims: () => Promise<{ data: { claims: { sub?: string } | null } }> };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  from: (table: string) => {
    select: (columns?: string) => { order: (column: string, options?: unknown) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
    upsert: (value: unknown, options?: unknown) => { select: (columns?: string) => { single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } };
    insert: (value: unknown) => { select: (columns?: string) => { single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } };
    update: (value: unknown) => { eq: (column: string, value: unknown) => { select: (columns?: string) => { single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } } };
  };
};

export const runtime = "nodejs";

function digestLessonCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function newLessonCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

type TutorRequestRow = {
  id: string;
  requester_user_id?: string;
  applicant_user_id?: string;
  [key: string]: unknown;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const client = supabase as unknown as Client;
  const userId = (await client.auth.getClaims()).data.claims?.sub;
  const [profiles, jobs, reviews, credentials] = await Promise.all([
    client.from("tutor_profiles").select("id, display_name, subjects, target_grades, zones, introduction, price_per_hour, response_rate, verified, identity_verified, verification_level").order("created_at", { ascending: false }),
    client.from("tutor_jobs").select("id, title, student_grade, subject, zone, schedule, budget_per_hour, detail, status, created_at").order("created_at", { ascending: false }),
    client.from("tutor_reviews").select("id, tutor_id, rating, content, verified_lesson, created_at").order("created_at", { ascending: false }),
    client.from("tutor_credentials").select("tutor_id, kind, public_label, issuer, public_value, verified, expires_on").order("reviewed_at", { ascending: false }),
  ]);
  const error = profiles.error ?? jobs.error ?? reviews.error ?? credentials.error;
  if (error) return NextResponse.json({ error: "튜터 데이터를 불러오지 못했어요." }, { status: 500 });
  if (!userId) return NextResponse.json({
    mode: "supabase",
    profiles: profiles.data ?? [],
    jobs: jobs.data ?? [],
    reviews: reviews.data ?? [],
    credentials: credentials.data ?? [],
    contacts: [],
    applications: [],
  });
  const [contacts, applications] = await Promise.all([
    client.from("tutor_contact_requests").select("id, tutor_id, requester_user_id, message, response_message, responded_at, status, created_at").order("created_at", { ascending: false }),
    client.from("tutor_job_applications").select("id, tutor_job_id, applicant_user_id, message, response_message, responded_at, status, created_at").order("created_at", { ascending: false }),
  ]);
  const privateError = contacts.error ?? applications.error;
  if (privateError) return NextResponse.json({ error: "개인 요청 목록을 불러오지 못했어요." }, { status: 500 });
  const withDirection = (rows: unknown[] | null, authorColumn: "requester_user_id" | "applicant_user_id") => (rows ?? []).map((row) => {
    const request = row as TutorRequestRow;
    const { requester_user_id: _requesterUserId, applicant_user_id: _applicantUserId, ...publicRequest } = request;
    void _requesterUserId;
    void _applicantUserId;
    return { ...publicRequest, direction: request[authorColumn] === userId ? "SENT" : "RECEIVED" };
  });
  return NextResponse.json({
    mode: "supabase",
    profiles: profiles.data ?? [],
    jobs: jobs.data ?? [],
    reviews: reviews.data ?? [],
    credentials: credentials.data ?? [],
    contacts: withDirection(contacts.data, "requester_user_id"),
    applications: withDirection(applications.data, "applicant_user_id"),
  });
}

export async function POST(request: Request) {
  const disabled = await requireFeatureFlag("TUTOR_WRITE"); if (disabled) return disabled;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const client = supabase as unknown as Client;
  const userId = (await client.auth.getClaims()).data.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { kind?: string; data?: unknown } | null;
  if (!body) return NextResponse.json({ error: "요청 내용을 다시 확인해 주세요." }, { status: 400 });

  if (body.kind === "profile") {
    const parsed = tutorProfileInput.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "튜터 프로필 입력을 다시 확인해 주세요." }, { status: 400 });
    const input = parsed.data;
    const profile = await client.from("tutor_profiles").upsert({ user_id: userId, display_name: input.displayName, subjects: input.subjects, target_grades: input.targetGrades, zones: input.zones, introduction: input.introduction, price_per_hour: input.pricePerHour, response_rate: 0, verified: false, identity_verified: false, verification_level: "PENDING" }, { onConflict: "user_id" }).select("id").single();
    if (profile.error || !profile.data) return NextResponse.json({ error: "튜터 프로필을 저장하지 못했어요." }, { status: 500 });
    for (const credential of input.credentials) {
      const result = await client.from("tutor_credentials").upsert({ tutor_id: profile.data.id, kind: credential.type, public_label: credential.label, issuer: "심사 대기", verified: false }, { onConflict: "tutor_id,kind" }).select("id").single();
      if (result.error) return NextResponse.json({ error: "인증 신청 항목을 저장하지 못했어요." }, { status: 500 });
    }
    return NextResponse.json({ mode: "supabase", profile: { id: profile.data.id } });
  }
  if (body.kind === "job") {
    const parsed = tutorJobInput.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "구인글 입력을 다시 확인해 주세요." }, { status: 400 });
    const job = await client.from("tutor_jobs").insert({ author_user_id: userId, title: parsed.data.title, student_grade: parsed.data.studentGrade, subject: parsed.data.subject, zone: parsed.data.zone, schedule: parsed.data.schedule, budget_per_hour: parsed.data.budgetPerHour, detail: parsed.data.detail }).select("id").single();
    if (job.error) return NextResponse.json({ error: "구인글을 저장하지 못했어요." }, { status: 500 });
    return NextResponse.json({ mode: "supabase", job: { id: job.data?.id } });
  }
  if (body.kind === "review") {
    const parsed = tutorReviewInput.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "후기 입력을 다시 확인해 주세요." }, { status: 400 });
    const { data, error } = await client.rpc("submit_tutor_lesson_review", {
      target_tutor_id: parsed.data.tutorId,
      invitation_digest: digestLessonCode(parsed.data.lessonCode),
      review_rating: parsed.data.rating,
      review_content: parsed.data.content,
    });
    const result = data && typeof data === "object" && !Array.isArray(data) ? data as { id?: string } : null;
    if (error || !result?.id) return NextResponse.json({ error: "수업 확인 코드가 올바르지 않거나 만료됐거나 이미 사용됐어요." }, { status: 400 });
    return NextResponse.json({ mode: "supabase", review: { id: result.id }, photoStorage: "private-storage" });
  }
  if (body.kind === "lesson-code") {
    const code = newLessonCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await client.rpc("create_tutor_lesson_invite", {
      invitation_digest: digestLessonCode(code),
      invitation_expires_at: expiresAt,
    });
    if (error) return NextResponse.json({ error: "본인·자격 인증이 완료된 튜터만 수업 확인 코드를 발급할 수 있어요." }, { status: 403 });
    return NextResponse.json({ mode: "supabase", code, expiresAt });
  }
  if (body.kind === "contact") {
    const parsed = tutorContactInput.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "문의 내용을 다시 확인해 주세요." }, { status: 400 });
    const contact = await client.from("tutor_contact_requests").insert({ tutor_id: parsed.data.tutorId, requester_user_id: userId, message: parsed.data.message, status: "RECEIVED" }).select("id, status").single();
    if (contact.error) return NextResponse.json({ error: "튜터 문의 저장소가 아직 연결되지 않았어요." }, { status: 503 });
    return NextResponse.json({ mode: "supabase", contact: { id: contact.data?.id, status: contact.data?.status } });
  }
  if (body.kind === "job-application") {
    const parsed = tutorJobApplicationInput.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "지원 내용을 다시 확인해 주세요." }, { status: 400 });
    const application = await client.from("tutor_job_applications").insert({ tutor_job_id: parsed.data.tutorJobId, applicant_user_id: userId, message: parsed.data.message, status: "RECEIVED" }).select("id, status").single();
    if (application.error) return NextResponse.json({ error: "구인 지원 저장소가 아직 연결되지 않았어요." }, { status: 503 });
    return NextResponse.json({ mode: "supabase", application: { id: application.data?.id, status: application.data?.status } });
  }
  return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const client = supabase as unknown as Client;
  const userId = (await client.auth.getClaims()).data.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = tutorRequestResponseInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "처리 상태와 답변을 다시 확인해 주세요." }, { status: 400 });

  const table = parsed.data.requestType === "CONTACT" ? "tutor_contact_requests" : "tutor_job_applications";
  const result = await client.from(table).update({
    status: parsed.data.status,
    response_message: parsed.data.responseMessage,
    responded_at: new Date().toISOString(),
    responded_by: userId,
  }).eq("id", parsed.data.id).select("id, status, response_message, responded_at").single();
  if (result.error || !result.data) return NextResponse.json({ error: "수신 요청을 처리하지 못했어요. 수신 권한 연결을 확인해 주세요." }, { status: 403 });
  return NextResponse.json({ mode: "supabase", request: { id: result.data.id, status: result.data.status, response_message: result.data.response_message, responded_at: result.data.responded_at } });
}
