import { z } from "zod";

export const supportRequestSchema = z.object({
  category: z.enum(["ACCOUNT", "VERIFICATION", "REVIEW_REPORT", "INSTITUTION_DATA", "BILLING", "OTHER"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(10).max(3000),
  replyEmail: z.union([z.literal(""), z.string().trim().email().max(254)]),
});

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;
export type SupportStatus = "RECEIVED" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";

export const supportCategoryLabels: Record<SupportRequestInput["category"], string> = {
  ACCOUNT: "계정·로그인",
  VERIFICATION: "인증 요청",
  REVIEW_REPORT: "후기·신고",
  INSTITUTION_DATA: "기관 정보",
  BILLING: "결제·구독",
  OTHER: "기타",
};

export const supportStatusLabels: Record<SupportStatus, string> = {
  RECEIVED: "접수됨",
  IN_PROGRESS: "확인 중",
  ANSWERED: "답변 완료",
  CLOSED: "종료",
};
