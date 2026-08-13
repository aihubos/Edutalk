export type WorkplaceCategory =
  | "LEADERSHIP"
  | "WORKLOAD"
  | "WELFARE"
  | "CULTURE"
  | "EDUCATION_PHILOSOPHY"
  | "GROWTH";

export interface WorkplaceReviewSummary {
  institutionId: string;
  verifiedReviewCount: number;
  publicScore: number | null;
  categoryScores: Partial<Record<WorkplaceCategory, number>>;
  highlights: string[];
  lastVerifiedAt: string | null;
  publicationThreshold: 3;
  isSynthetic: true;
}

export interface InstitutionTrustSummary {
  institutionId: string;
  dataCompleteness: number;
  publicSourceFreshness: "RECENT" | "CHECK_NEEDED";
  institutionConfirmed: boolean;
  verifiedParentReviews: number;
  verifiedStudentReviews: number;
  verifiedEducatorReviews: number;
  latestFeeCheck: string;
  latestOfficialReply: string | null;
  correctionStatus: "CLEAR" | "REVIEWING" | "UPDATE_NEEDED";
  isSynthetic: true;
}

export const workplaceCategoryLabels: Record<WorkplaceCategory, string> = {
  LEADERSHIP: "리더십",
  WORKLOAD: "업무량",
  WELFARE: "급여·복지",
  CULTURE: "조직문화",
  EDUCATION_PHILOSOPHY: "교육철학",
  GROWTH: "성장기회",
};

export const workplaceSummaries: WorkplaceReviewSummary[] = [
  {
    institutionId: "future-math-academy",
    verifiedReviewCount: 4,
    publicScore: 4.3,
    categoryScores: {
      LEADERSHIP: 4.2,
      WORKLOAD: 4.0,
      WELFARE: 4.1,
      CULTURE: 4.5,
      EDUCATION_PHILOSOPHY: 4.6,
      GROWTH: 4.4,
    },
    highlights: ["수업 피드백 기준이 명확해요", "교재 준비를 함께 나누는 문화가 있어요"],
    lastVerifiedAt: "2026-07-30",
    publicationThreshold: 3,
    isSynthetic: true,
  },
  {
    institutionId: "central-art-academy",
    verifiedReviewCount: 3,
    publicScore: 4.1,
    categoryScores: {
      LEADERSHIP: 4.0,
      WORKLOAD: 3.8,
      WELFARE: 3.9,
      CULTURE: 4.4,
      EDUCATION_PHILOSOPHY: 4.5,
      GROWTH: 4.2,
    },
    highlights: ["작품 결과보다 수업 과정을 존중해요", "강사 간 수업 자료 공유가 활발해요"],
    lastVerifiedAt: "2026-07-24",
    publicationThreshold: 3,
    isSynthetic: true,
  },
  {
    institutionId: "dongtan-forest-childcare",
    verifiedReviewCount: 3,
    publicScore: 3.9,
    categoryScores: {
      LEADERSHIP: 4.0,
      WORKLOAD: 3.6,
      WELFARE: 3.8,
      CULTURE: 4.1,
      EDUCATION_PHILOSOPHY: 4.2,
      GROWTH: 3.9,
    },
    highlights: ["아동 중심 운영 원칙을 공유해요", "업무 조율이 필요한 시점을 논의할 수 있어요"],
    lastVerifiedAt: "2026-07-18",
    publicationThreshold: 3,
    isSynthetic: true,
  },
  {
    institutionId: "dreamtree-kindergarten",
    verifiedReviewCount: 2,
    publicScore: null,
    categoryScores: {},
    highlights: [],
    lastVerifiedAt: "2026-07-16",
    publicationThreshold: 3,
    isSynthetic: true,
  },
  {
    institutionId: "smart-english-tutoring",
    verifiedReviewCount: 1,
    publicScore: null,
    categoryScores: {},
    highlights: [],
    lastVerifiedAt: "2026-07-11",
    publicationThreshold: 3,
    isSynthetic: true,
  },
  {
    institutionId: "metis-science-academy",
    verifiedReviewCount: 2,
    publicScore: null,
    categoryScores: {},
    highlights: [],
    lastVerifiedAt: "2026-07-08",
    publicationThreshold: 3,
    isSynthetic: true,
  },
];

export const institutionTrustSummaries: InstitutionTrustSummary[] = [
  { institutionId: "dongtan-forest-childcare", dataCompleteness: 92, publicSourceFreshness: "RECENT", institutionConfirmed: true, verifiedParentReviews: 18, verifiedStudentReviews: 0, verifiedEducatorReviews: 3, latestFeeCheck: "2026-07-31", latestOfficialReply: "2026-07-29", correctionStatus: "CLEAR", isSynthetic: true },
  { institutionId: "dreamtree-kindergarten", dataCompleteness: 88, publicSourceFreshness: "RECENT", institutionConfirmed: true, verifiedParentReviews: 14, verifiedStudentReviews: 0, verifiedEducatorReviews: 2, latestFeeCheck: "2026-07-15", latestOfficialReply: null, correctionStatus: "CLEAR", isSynthetic: true },
  { institutionId: "future-math-academy", dataCompleteness: 96, publicSourceFreshness: "RECENT", institutionConfirmed: true, verifiedParentReviews: 21, verifiedStudentReviews: 12, verifiedEducatorReviews: 4, latestFeeCheck: "2026-08-01", latestOfficialReply: "2026-08-02", correctionStatus: "CLEAR", isSynthetic: true },
  { institutionId: "smart-english-tutoring", dataCompleteness: 72, publicSourceFreshness: "RECENT", institutionConfirmed: false, verifiedParentReviews: 9, verifiedStudentReviews: 7, verifiedEducatorReviews: 1, latestFeeCheck: "2026-07-12", latestOfficialReply: null, correctionStatus: "UPDATE_NEEDED", isSynthetic: true },
  { institutionId: "central-art-academy", dataCompleteness: 90, publicSourceFreshness: "RECENT", institutionConfirmed: true, verifiedParentReviews: 11, verifiedStudentReviews: 5, verifiedEducatorReviews: 3, latestFeeCheck: "2026-08-01", latestOfficialReply: "2026-07-28", correctionStatus: "CLEAR", isSynthetic: true },
  { institutionId: "metis-science-academy", dataCompleteness: 78, publicSourceFreshness: "RECENT", institutionConfirmed: false, verifiedParentReviews: 6, verifiedStudentReviews: 8, verifiedEducatorReviews: 2, latestFeeCheck: "2026-08-01", latestOfficialReply: null, correctionStatus: "REVIEWING", isSynthetic: true },
];

export const getWorkplaceSummary = (institutionId: string) =>
  workplaceSummaries.find((item) => item.institutionId === institutionId) ?? null;

export const getInstitutionTrustSummary = (institutionId: string) =>
  institutionTrustSummaries.find((item) => item.institutionId === institutionId) ?? null;
