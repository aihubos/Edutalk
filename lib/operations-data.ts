import type { UserRole, VerificationEvidenceType } from "@/lib/types";

export const operationsStorageKey = "edutalk-trust-center-v1";
export const independentTutorTargetId = "independent-tutor";

export type OperationStatus = "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED";
export type VerificationKind = "INSTITUTION_RELATION" | "TUTOR_IDENTITY" | "TUTOR_CREDENTIAL";
export type CorrectionIssue = "BASIC_INFO" | "OPERATING_HOURS" | "PROGRAM" | "FEE" | "CLOSED_OR_PAUSED" | "OTHER";
export type ReportIssue = "PERSONAL_INFO" | "IDENTIFICATION_RISK" | "ABUSE" | "MISINFORMATION" | "COPYRIGHT" | "SPAM" | "OTHER";

export interface OperationHistoryEntry {
  status: OperationStatus;
  note: string;
  createdAt: string;
}

interface OperationRequestBase {
  id: string;
  institutionId: string;
  status: OperationStatus;
  submittedAt: string;
  history: OperationHistoryEntry[];
}

export interface VerificationRequest extends OperationRequestBase {
  kind: VerificationKind;
  role: UserRole | "TUTOR";
  evidenceType: VerificationEvidenceType;
  relationshipPeriod: string;
  confirmation: boolean;
  reviewAccessEndsAt?: string;
}

export interface CorrectionRequest extends OperationRequestBase {
  issue: CorrectionIssue;
  currentInfo: string;
  requestedInfo: string;
}

export interface ContentReport extends OperationRequestBase {
  issue: ReportIssue;
  contentLocation: string;
  reason: string;
  targetType?: "institution_review";
  targetId?: string;
  operatorStatus?: string;
}

export interface OperationsState {
  verifications: VerificationRequest[];
  corrections: CorrectionRequest[];
  reports: ContentReport[];
}

export const emptyOperationsState: OperationsState = {
  verifications: [],
  corrections: [],
  reports: [],
};

export const operationStatusLabels: Record<OperationStatus, string> = {
  PENDING: "접수됨",
  NEEDS_INFO: "보완 필요",
  APPROVED: "승인",
  REJECTED: "반려",
};

export const verificationKindLabels: Record<VerificationKind, string> = {
  INSTITUTION_RELATION: "기관 이용·근무 관계",
  TUTOR_IDENTITY: "튜터 본인 확인",
  TUTOR_CREDENTIAL: "튜터 자격 확인",
};

export const verificationEvidenceLabels: Record<VerificationEvidenceType, string> = {
  ENROLLMENT: "수강·등록 안내",
  EMPLOYMENT: "재직·경력 확인",
  IDENTITY: "본인 확인",
  TEACHING_CERT: "교원자격 확인",
  LANGUAGE_SCORE: "어학성적 확인",
  DEGREE: "학력 확인",
};

export const correctionIssueLabels: Record<CorrectionIssue, string> = {
  BASIC_INFO: "기본 정보",
  OPERATING_HOURS: "운영 시간",
  PROGRAM: "과정·대상",
  FEE: "비용 정보",
  CLOSED_OR_PAUSED: "휴원·운영 상태",
  OTHER: "기타 정보",
};

export const reportIssueLabels: Record<ReportIssue, string> = {
  PERSONAL_INFO: "개인정보 노출",
  IDENTIFICATION_RISK: "특정인 식별 우려",
  ABUSE: "욕설·괴롭힘",
  MISINFORMATION: "허위 정보 의심",
  COPYRIGHT: "저작권 침해",
  SPAM: "광고·도배",
  OTHER: "기타",
};
