import type { TutorJob, TutorProfile, TutorReview } from "@/lib/types";

export function mapStoredTutorProfile(value: Record<string, unknown>, credentials: Record<string, unknown>[] = []): TutorProfile {
  const id = String(value.id);
  return {
    id,
    displayName: String(value.display_name ?? "튜터"),
    userId: String(value.user_id ?? ""),
    subjects: stringList(value.subjects),
    targetGrades: stringList(value.target_grades),
    zones: stringList(value.zones),
    introduction: String(value.introduction ?? ""),
    pricePerHour: Number(value.price_per_hour ?? 0),
    responseRate: Number(value.response_rate ?? 0),
    verified: Boolean(value.verified),
    identityVerified: Boolean(value.identity_verified),
    verificationLevel: value.verification_level === "IDENTITY" || value.verification_level === "CREDENTIALS" ? value.verification_level : "PENDING",
    credentials: credentials.filter((credential) => String(credential.tutor_id) === id).map((credential) => ({ type: String(credential.kind) as TutorProfile["credentials"][number]["type"], label: String(credential.public_label ?? "인증 신청"), issuer: stringValue(credential.issuer), value: stringValue(credential.public_value), verified: Boolean(credential.verified), expiresAt: stringValue(credential.expires_on) })),
    isSynthetic: false,
  };
}

export function mapStoredTutorJob(value: Record<string, unknown>): TutorJob {
  return { id: String(value.id), authorUserId: String(value.author_user_id ?? ""), title: String(value.title ?? ""), studentGrade: String(value.student_grade ?? ""), subject: String(value.subject ?? ""), zone: String(value.zone ?? ""), schedule: String(value.schedule ?? ""), budgetPerHour: Number(value.budget_per_hour ?? 0), detail: String(value.detail ?? ""), status: value.status === "CLOSED" ? "CLOSED" : "OPEN", isSynthetic: false, createdAt: String(value.created_at ?? new Date().toISOString()) };
}

export function mapStoredTutorReview(value: Record<string, unknown>): TutorReview {
  return { id: String(value.id), tutorId: String(value.tutor_id ?? ""), authorUserId: String(value.author_user_id ?? ""), rating: Number(value.rating ?? 0), content: String(value.content ?? ""), verifiedLesson: Boolean(value.verified_lesson), isSynthetic: false, createdAt: String(value.created_at ?? new Date().toISOString()) };
}

function stringList(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function stringValue(value: unknown) { return typeof value === "string" ? value : undefined; }

export const demoTutorProfiles: TutorProfile[] = [
  {
    id: "tutor-jiwon",
    displayName: "지원 선생님",
    userId: "demo-tutor-1",
    subjects: ["수학", "과학"],
    targetGrades: ["중등", "고등"],
    zones: ["동탄2 청계동", "동탄2 영천동"],
    introduction: "개념을 말로 설명하고 오답 근거를 찾는 수업을 진행해요.",
    pricePerHour: 45000,
    responseRate: 96,
    verified: true,
    identityVerified: true,
    verificationLevel: "TRIAL",
    credentials: [
      { type: "IDENTITY", label: "본인인증", issuer: "EDU톡", verified: true },
      { type: "TEACHING_CERT", label: "교원자격 확인", issuer: "EDU톡 비공개 심사", verified: true },
      { type: "DEGREE", label: "학력 확인", issuer: "EDU톡 비공개 심사", value: "전공 정보 확인", verified: true },
    ],
    isSynthetic: true,
  },
  {
    id: "tutor-yuna",
    displayName: "유나 선생님",
    userId: "demo-tutor-2",
    subjects: ["영어", "영어독서"],
    targetGrades: ["초등", "중등"],
    zones: ["동탄1 반송동", "동탄2 목동"],
    introduction: "읽기 습관부터 내신 서술형까지 학생 속도에 맞춰 지도해요.",
    pricePerHour: 38000,
    responseRate: 91,
    verified: true,
    identityVerified: true,
    verificationLevel: "TRIAL",
    credentials: [
      { type: "IDENTITY", label: "본인인증", issuer: "EDU톡", verified: true },
      { type: "LANGUAGE_SCORE", label: "어학성적 확인", issuer: "EDU톡 비공개 심사", value: "성적 유효 여부 확인", verified: true, expiresAt: "2027-06-30" },
      { type: "DEGREE", label: "학력 확인", issuer: "EDU톡 비공개 심사", value: "전공 정보 확인", verified: true },
    ],
    isSynthetic: true,
  },
  {
    id: "tutor-seungho",
    displayName: "승호 선생님",
    userId: "demo-tutor-3",
    subjects: ["국어", "논술"],
    targetGrades: ["중등", "고등"],
    zones: ["동탄1 능동", "동탄1 반송동"],
    introduction: "지문 구조를 직접 표시하며 독해와 글쓰기의 근거를 잡아줘요.",
    pricePerHour: 42000,
    responseRate: 88,
    verified: true,
    identityVerified: true,
    verificationLevel: "TRIAL",
    credentials: [
      { type: "IDENTITY", label: "본인인증", issuer: "EDU톡", verified: true },
      { type: "TEACHING_CERT", label: "교원자격 확인", issuer: "EDU톡 비공개 심사", verified: true },
      { type: "LANGUAGE_SCORE", label: "어학성적 확인", issuer: "EDU톡 비공개 심사", value: "성적 유효 여부 확인", verified: true, expiresAt: "2027-03-31" },
    ],
    isSynthetic: true,
  },
];

export const demoTutorJobs: TutorJob[] = [
  {
    id: "job-math-middle",
    authorUserId: "demo-parent-1",
    title: "중2 수학, 개념부터 함께 잡아주실 분",
    studentGrade: "중학교 2학년",
    subject: "수학",
    zone: "동탄2 산척동",
    schedule: "화·목 저녁 7시 이후",
    budgetPerHour: 40000,
    detail: "문제 양보다 개념을 말로 설명하도록 지도해 주시면 좋겠어요.",
    status: "OPEN",
    isSynthetic: true,
    createdAt: "2026-08-12T09:00:00.000Z",
  },
  {
    id: "job-english-elementary",
    authorUserId: "demo-parent-2",
    title: "초5 영어 독서 수업을 구해요",
    studentGrade: "초등학교 5학년",
    subject: "영어",
    zone: "동탄1 반송동",
    schedule: "토요일 오전",
    budgetPerHour: 35000,
    detail: "영어책을 즐겁게 읽고 짧게 말하는 수업이면 좋겠어요.",
    status: "OPEN",
    isSynthetic: true,
    createdAt: "2026-08-11T12:30:00.000Z",
  },
];

export const demoTutorReviews: TutorReview[] = [
  { id: "tr-1", tutorId: "tutor-jiwon", authorUserId: "demo-parent-2", rating: 4.9, content: "문제를 바로 풀기보다 아이가 개념을 설명하도록 기다려줘요.", verifiedLesson: true, isSynthetic: true, createdAt: "2026-07-28T10:00:00.000Z" },
  { id: "tr-2", tutorId: "tutor-jiwon", authorUserId: "demo-parent-3", rating: 4.7, content: "매 수업 뒤 학습 내용을 정리해서 알려줘서 안심됐어요.", verifiedLesson: true, isSynthetic: true, createdAt: "2026-07-10T10:00:00.000Z" },
  { id: "tr-3", tutorId: "tutor-yuna", authorUserId: "demo-parent-4", rating: 4.8, content: "아이 수준에 맞는 책을 골라주고 질문을 자연스럽게 이끌어요.", verifiedLesson: true, isSynthetic: true, createdAt: "2026-07-21T10:00:00.000Z" },
  { id: "tr-4", tutorId: "tutor-seungho", authorUserId: "demo-parent-5", rating: 4.5, content: "글을 쓸 때 근거를 찾는 방법이 좋아졌어요.", verifiedLesson: true, isSynthetic: true, createdAt: "2026-06-19T10:00:00.000Z" },
];

export function getTutorRating(tutorId: string, reviews: TutorReview[]) {
  const verified = reviews.filter((review) => review.tutorId === tutorId && review.verifiedLesson);
  if (verified.length === 0) return { score: null, count: 0 };
  return {
    score: verified.reduce((sum, review) => sum + review.rating, 0) / verified.length,
    count: verified.length,
  };
}

export function getTutorRankScore(tutor: TutorProfile, reviews: TutorReview[]) {
  return getTutorRankBreakdown(tutor, reviews).total;
}

export function getTutorVerifiedCredentials(tutor: TutorProfile) {
  return (tutor.credentials ?? []).filter((credential) => credential.verified);
}

export function getTutorRankBreakdown(tutor: TutorProfile, reviews: TutorReview[]) {
  const rating = getTutorRating(tutor.id, reviews);
  const reviewConfidence = Math.min(rating.count / 10, 1);
  const ratingPart = ((rating.score ?? 0) / 5) * 60;
  const reviewPart = reviewConfidence * 20;
  const responsePart = (tutor.responseRate / 100) * 15;
  const verifiedCredentialCount = getTutorVerifiedCredentials(tutor).length;
  const verificationPart = Math.min(5, (tutor.identityVerified ? 1 : 0) + Math.max(0, verifiedCredentialCount - 1) * 2);
  return {
    reviewRating: ratingPart,
    reviewVolume: reviewPart,
    responseRate: responsePart,
    verification: verificationPart,
    total: ratingPart + reviewPart + responsePart + verificationPart,
  };
}
