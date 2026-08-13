import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { UserRole } from "@/lib/types";

export const productEventNames = ["LOGIN_STARTED", "ROLE_SELECTED", "LOCATION_SELECTED", "ONBOARDING_COMPLETED", "INSTITUTION_VIEWED", "FAVORITE_ADDED", "COMPARISON_CREATED", "REVIEW_SUBMITTED", "VERIFICATION_SUBMITTED", "ACCOUNT_DELETION_STARTED"] as const;
export type ProductEventName = (typeof productEventNames)[number];

export type ProductEvent = { eventName: ProductEventName; path: string; category: string; role?: UserRole };

export function trackProductEvent(event: ProductEvent) {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), keepalive: true }).catch(() => undefined);
}
