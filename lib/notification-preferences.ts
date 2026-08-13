import { z } from "zod";

export const notificationKinds = [
  "VERIFICATION",
  "REVIEW",
  "SUPPORT",
  "TUTOR",
  "INSTITUTION",
  "ACCOUNT",
] as const;

export type NotificationKind = (typeof notificationKinds)[number];

export interface NotificationPreference {
  kind: NotificationKind;
  enabled: boolean;
}

export const notificationPreferenceLabels: Record<NotificationKind, { title: string; helper: string }> = {
  VERIFICATION: { title: "인증 결과", helper: "관계 인증 승인, 보완 요청, 반려 결과" },
  REVIEW: { title: "기관 후기", helper: "작성한 후기의 심사 결과" },
  SUPPORT: { title: "고객센터", helper: "문의 상태와 운영자 답변" },
  TUTOR: { title: "튜터 활동", helper: "튜터 문의, 지원, 후기 심사 결과" },
  INSTITUTION: { title: "관심 기관", helper: "저장한 기관의 새 후기, 공식 답변, 정보 변경" },
  ACCOUNT: { title: "학생별 알림장", helper: "새 메시지와 선생님이 확인한 학생일지" },
};

export const notificationPreferenceUpdateInput = z.object({
  kind: z.enum(notificationKinds),
  enabled: z.boolean(),
});

export function defaultNotificationPreferences(): NotificationPreference[] {
  return notificationKinds.map((kind) => ({ kind, enabled: true }));
}
