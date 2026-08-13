export type BillingSubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface BillingStatusDisplay {
  label: string;
  description: string;
  allowsUnlimitedAi: boolean;
}

/**
 * 결제사 웹훅을 검증한 서버 상태만 이 값으로 변환한다.
 * 브라우저의 체험 플랜 변경은 실제 구독 상태가 아니다.
 */
export function getBillingStatusDisplay(status: BillingSubscriptionStatus): BillingStatusDisplay {
  switch (status) {
    case "ACTIVE":
      return {
        label: "활성",
        description: "확인된 결제 기간에만 AI 무제한 사용을 허용합니다.",
        allowsUnlimitedAi: true,
      };
    case "PAST_DUE":
      return {
        label: "결제 확인 필요",
        description: "결제 확인 전에는 무료 사용 한도를 적용합니다.",
        allowsUnlimitedAi: false,
      };
    case "CANCELED":
      return {
        label: "해지됨",
        description: "다음 결제 기간에는 무료 사용 한도를 적용합니다.",
        allowsUnlimitedAi: false,
      };
  }
}
