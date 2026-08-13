import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const stripeApiUrl = "https://api.stripe.com/v1";

export interface StripeBillingConfig {
  secretKey: string;
  priceId: string;
  webhookSecret?: string;
}

export function getStripeBillingConfig(): StripeBillingConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const priceId = process.env.STRIPE_UNLIMITED_PRICE_ID?.trim() || process.env.UNLIMITED_PLAN_PRICE_ID?.trim();
  if (!secretKey || !priceId) return null;
  return { secretKey, priceId, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() };
}

export async function stripeRequest<T>(config: StripeBillingConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${stripeApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "결제사 요청을 처리하지 못했어요.");
  return payload;
}

export async function stripeFormRequest<T>(config: StripeBillingConfig, path: string, fields: Record<string, string>) {
  return stripeRequest<T>(config, path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

interface StripeCustomer { id: string }

async function findOrCreateStripeCustomer(config: StripeBillingConfig, userId: string, email?: string | null) {
  const query = `metadata['edutalk_user_id']:'${userId}'`;
  const found = await stripeRequest<{ data?: StripeCustomer[] }>(config, `/customers/search?query=${encodeURIComponent(query)}&limit=1`);
  if (found.data?.[0]) return found.data[0];
  return stripeFormRequest<StripeCustomer>(config, "/customers", {
    "metadata[edutalk_user_id]": userId,
    ...(email ? { email } : {}),
  });
}

export async function getOrCreateStripeCustomer(config: StripeBillingConfig, userId: string, email?: string | null) {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("결제 계정 저장소 설정 후 사용할 수 있어요.");

  const { data: stored, error: lookupError } = await admin
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) throw new Error("결제 고객 정보를 확인하지 못했어요.");
  if (stored?.provider_customer_id) return { id: stored.provider_customer_id };

  const customer = await findOrCreateStripeCustomer(config, userId, email);
  const { error: saveError } = await admin.from("billing_customers").upsert({
    user_id: userId,
    provider: "STRIPE",
    provider_customer_id: customer.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (saveError) throw new Error("결제 고객 정보를 저장하지 못했어요.");
  return customer;
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null, webhookSecret: string | undefined) {
  if (!signatureHeader || !webhookSecret) return false;
  const values = signatureHeader.split(",").reduce<Record<string, string[]>>((result, item) => {
    const [key, value] = item.split("=", 2);
    if (key && value) (result[key] ??= []).push(value);
    return result;
  }, {});
  const timestamp = values.t?.[0];
  if (!timestamp || !values.v1?.length) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  return values.v1.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}

export function unixSecondsToIso(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}
