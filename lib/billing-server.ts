import { z } from "zod";

export const billingProvider = "STRIPE" as const;

export const billingSubscriptionStatus = z.enum(["ACTIVE", "PAST_DUE", "CANCELED"]);

/**
 * Stripe SDK 또는 검증된 웹훅 처리 서버가 service-role로 DB에 적재할 정규화 계약입니다.
 * 카드번호, 결제수단 상세, 원문 서명은 저장하지 않습니다.
 */
export const billingSubscriptionSyncInput = z.object({
  userId: z.string().uuid(),
  customerId: z.string().trim().min(1).max(255),
  subscriptionId: z.string().trim().min(1).max(255),
  priceId: z.string().trim().min(1).max(255),
  status: billingSubscriptionStatus,
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

export const billingWebhookEventInput = z.object({
  eventId: z.string().trim().min(1).max(255),
  eventType: z.string().trim().min(1).max(160),
  occurredAt: z.string().datetime(),
  subscription: billingSubscriptionSyncInput.optional(),
});

export type BillingSubscriptionSync = z.infer<typeof billingSubscriptionSyncInput>;
export type BillingWebhookEvent = z.infer<typeof billingWebhookEventInput>;
