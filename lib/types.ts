export type UserRole = "PARENT" | "STUDENT" | "TEACHER";
export type AccountAuthStatus = "disabled" | "checking" | "anonymous" | "authenticated";
export type AgeBand = "UNDER_14" | "FOURTEEN_PLUS" | "ADULT";
export type ServiceZone = "ALL" | "DONGTAN_1" | "DONGTAN_2";
export type InstitutionType = "CHILDCARE" | "KINDERGARTEN" | "ACADEMY" | "TUTORING";
export type SortOption = "RECOMMENDED" | "DISTANCE" | "RATING" | "REVIEWS" | "PRICE";
export type InstitutionNewsType = "BRIEFING" | "LEVEL_TEST" | "SPECIAL_CLASS";
export type InstitutionNewsStatus = "OPEN" | "CLOSED";
export type AssessmentKind = "SCHOOL" | "MOCK" | "CSAT";
export type GrowthCategory = "LEARNING" | "PARTICIPATION" | "SOCIAL" | "SELF_MANAGEMENT" | "CAREER";
export type SubscriptionPlan = "FREE" | "UNLIMITED";
export type VerificationEvidenceType =
  | "ENROLLMENT"
  | "EMPLOYMENT"
  | "IDENTITY"
  | "TEACHING_CERT"
  | "LANGUAGE_SCORE"
  | "DEGREE";

export interface RoleRating {
  role: UserRole;
  score: number | null;
  count: number;
  isPublic: boolean;
}

export interface InstitutionNews {
  type: InstitutionNewsType;
  title: string;
  date: string;
  status: InstitutionNewsStatus;
}

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  zone: Exclude<ServiceZone, "ALL">;
  neighborhood: string;
  address: string;
  distanceM: number;
  status: "OPEN" | "PAUSED";
  verified: boolean;
  tags: string[];
  subjects: string[];
  ageGroups: string[];
  monthlyFee: number | null;
  feeSource: "PUBLIC" | "INSTITUTION" | "VERIFIED_USE" | "UNCONFIRMED";
  operatingHours: string;
  phone: string;
  pickupAvailable: boolean;
  trialClassAvailable: boolean;
  appInquiryAvailable: boolean;
  news: InstitutionNews[];
  website?: string;
  sourceName: string;
  sourceDate: string;
  ratings: RoleRating[];
  reviewHighlights: string[];
  isSynthetic: boolean;
  coordinates: { lat: number; lng: number };
}

export interface ReviewDraft {
  institutionId: string;
  relation: UserRole;
  scores: Record<string, number>;
  strength: string;
  improvement: string;
  recommendTo: string;
  verificationAcknowledged: boolean;
  savedAt: string | null;
}

export interface VerificationEvidenceDraft {
  type: VerificationEvidenceType;
  label: string;
  confirmed: boolean;
}

export interface InstitutionExperienceReview {
  id: string;
  institutionId: string;
  relation: UserRole;
  scores: Record<string, number>;
  strength: string;
  improvement: string;
  recommendTo: string;
  evidence: VerificationEvidenceDraft[];
  verificationStatus: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  anonymousPublicAuthor: boolean;
  isSynthetic: boolean;
  createdAt: string;
}

export interface AppState {
  role: UserRole;
  roles: UserRole[];
  zone: ServiceZone;
  favorites: string[];
  comparison: string[];
  reviewDraft: ReviewDraft;
  institutionReviews: InstitutionExperienceReview[];
  onboardingComplete: boolean;
  ageBand: AgeBand | null;
  consentVersion: string | null;
  consentedAt: string | null;
  roleProfile: RoleProfile | null;
  /** 선생님이 체험 화면에서 직접 등록한 학생과 평가입니다. */
  customStudents: Student[];
  customAssessments: Assessment[];
  customScores: SubjectScore[];
  customGrowthRecords: GrowthRecord[];
  studentJournals: StudentJournal[];
  schoolRecordDrafts: SchoolRecordDraft[];
  tutorProfiles: TutorProfile[];
  tutorJobs: TutorJob[];
  tutorReviews: TutorReview[];
  aiUsage: AiUsage;
}

export interface AppContextValue extends AppState {
  hydrated: boolean;
  accountAuthStatus: AccountAuthStatus;
  setRole: (role: UserRole) => void;
  addRole: (role: UserRole) => void;
  setZone: (zone: ServiceZone) => void;
  updateRoleProfile: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
  toggleFavorite: (id: string) => void;
  toggleComparison: (id: string) => { ok: boolean; reason?: string };
  updateReviewDraft: (patch: Partial<ReviewDraft>) => void;
  clearReviewDraft: () => void;
  addInstitutionReview: (review: InstitutionExperienceReview) => void;
  completeOnboarding: (settings: { ageBand: AgeBand; consentVersions: { terms: string; privacy: string; community: string }; consentedAt: string; roleProfile: RoleProfile; role: UserRole; zone: ServiceZone }) => Promise<{ ok: boolean; error?: string }>;
  addStudent: (student: Student) => void;
  addAssessment: (assessment: Assessment) => void;
  addSubjectScore: (score: SubjectScore) => void;
  addGrowthRecord: (record: GrowthRecord) => void;
  addStudentJournal: (journal: StudentJournal) => void;
  addSchoolRecordDraft: (draft: SchoolRecordDraft) => void;
  addTutorProfile: (profile: TutorProfile) => void;
  addTutorJob: (job: TutorJob) => void;
  addTutorReview: (review: TutorReview) => void;
  consumeAiCredit: () => { ok: boolean; remaining: number };
  applyServerAiUsage: (remaining: number | null, plan?: SubscriptionPlan) => void;
  setSubscriptionPlan: (plan: SubscriptionPlan) => void;
}

/** 역할별 추천 기준을 위한 최소 체험 프로필입니다. */
export interface RoleProfile {
  role: UserRole;
  fields: Record<string, string>;
}

export interface Student {
  id: string;
  alias: string;
  gradeLevel: string;
  className: string;
  institutionId: string;
  /** 기관 선택지가 아닌 경우, 교사가 입력한 표시용 기관명입니다. */
  institutionName?: string;
  parentUserIds: string[];
  teacherUserIds: string[];
  isSynthetic: boolean;
}

export interface Assessment {
  id: string;
  studentId: string;
  kind: AssessmentKind;
  title: string;
  date: string;
  term: string;
  maxTotal: number;
  isSynthetic: boolean;
}

export interface SubjectScore {
  id: string;
  studentId: string;
  assessmentId: string;
  subject: string;
  score: number;
  maxScore: number;
  gradeBand?: number;
  percentile?: number;
  recordedAt: string;
  isSynthetic: boolean;
}

export interface GrowthRecord {
  id: string;
  studentId: string;
  category: GrowthCategory;
  observedAt: string;
  level: number;
  title: string;
  note: string;
  authorRole: "TEACHER";
  isSynthetic: boolean;
}

export interface StudentJournal {
  id: string;
  studentId: string;
  teacherUserId: string;
  observedAt: string;
  learningSummary: string;
  participationSummary: string;
  growthSummary: string;
  nextPlan: string;
  teacherConfirmed: boolean;
  generationMode: "openai" | "demo-template";
  createdAt: string;
}

export interface SchoolRecordDraft {
  id: string;
  studentId: string;
  teacherUserId: string;
  section: "SUBJECT_DETAIL" | "AUTONOMY" | "CLUB" | "CAREER" | "BEHAVIOR";
  evidence: string;
  draftText: string;
  teacherConfirmed: boolean;
  generationMode: "openai" | "demo-template";
  createdAt: string;
}

export interface AiUsage {
  plan: SubscriptionPlan;
  freeLimit: 10;
  used: number;
  subscriptionStatus: "INACTIVE" | "ACTIVE";
}

export interface TutorProfile {
  id: string;
  displayName: string;
  userId: string;
  subjects: string[];
  targetGrades: string[];
  zones: string[];
  introduction: string;
  pricePerHour: number;
  responseRate: number;
  verified: boolean;
  /** Public status only. Identity numbers and document originals are never stored here. */
  identityVerified: boolean;
  credentials: TutorCredential[];
  verificationLevel: TutorVerificationLevel;
  photoUrl?: string;
  isSynthetic: boolean;
}

export type TutorCredentialType = "IDENTITY" | "TEACHING_CERT" | "LANGUAGE_SCORE" | "DEGREE";
export type TutorVerificationLevel = "TRIAL" | "IDENTITY" | "CREDENTIALS" | "PENDING";

export interface TutorCredential {
  type: TutorCredentialType;
  label: string;
  issuer?: string;
  /** A public, non-sensitive summary only. Never use ID numbers or source documents. */
  value?: string;
  verified: boolean;
  expiresAt?: string;
}

export interface TutorJob {
  id: string;
  authorUserId: string;
  title: string;
  studentGrade: string;
  subject: string;
  zone: string;
  schedule: string;
  budgetPerHour: number;
  detail: string;
  status: "OPEN" | "CLOSED";
  isSynthetic: boolean;
  createdAt: string;
}

export interface TutorReview {
  id: string;
  tutorId: string;
  authorUserId: string;
  rating: number;
  content: string;
  photoDataUrl?: string;
  verifiedLesson: boolean;
  isSynthetic: boolean;
  createdAt: string;
}
