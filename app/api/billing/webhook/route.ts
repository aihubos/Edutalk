import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeBillingConfig, unixSecondsToIso, verifyStripeSignature } from "@/lib/stripe-billing";

export const runtime = "nodejs";

const stripeEventSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(160),
  created: z.number().int().nonnegative(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

type StripeEvent = z.infer<typeof stripeEventSchema>;
type StripeObject = Record<string, unknown>;

function nestedString(value: unknown, key: string) {
  return value && typeof value === "object" && typeof (value as StripeObject)[key] === "string"
    ? String((value as StripeObject)[key])
    : null;
}

function userIdFromObject(object: StripeObject) {
  return nestedString(object.metadata, "edutalk_user_id")
    ?? (typeof object.client_reference_id === "string" ? object.client_reference_id : null)
    ?? nestedString(object.subscription_details && typeof object.subscription_details === "object"
      ? (object.subscription_details as StripeObject).metadata
      : null, "edutalk_user_id");
}

function objectId(value: unknown) {
  if (typeof value === "string") return value;
  return value && typeof value === "object" && typeof (value as StripeObject).id === "string"
    ? String((value as StripeObject).id)
    : null;
}

function normalizeStatus(value: unknown): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  if (value === "active" || value === "trialing") return "ACTIVE";
  if (value === "past_due" || value === "unpaid" || value === "incomplete") return "PAST_DUE";
  return "CANCELED";
}

async function markProcessed(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, eventId: string, error?: string) {
  await admin.from("billing_webhook_events").update({
    processed_at: new Date().toISOString(),
    processing_error: error ?? null,
  }).eq("provider_event_id", eventId);
}

async function resolveUserId(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, object: StripeObject) {
  const direct = userIdFromObject(object);
  if (direct && z.string().uuid().safeParse(direct).success) return direct;
  const customerId = objectId(object.customer);
  if (!customerId) return null;
  const { data } = await admin.from("billing_customers").select("user_id").eq("provider_customer_id", customerId).maybeSingle();
  return typeof data?.user_id === "string" ? data.user_id : null;
}

async function retrieveSubscription(subscriptionId: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
  });
  const payload = await response.json().catch(() => null) as StripeObject | null;
  if (!response.ok || !payload) throw new Error("결제 구독 정보를 확인하지 못했어요.");
  return payload;
}

function priceIdFromSubscription(object: StripeObject) {
  const items = object.items;
  if (!items || typeof items !== "object" || !Array.isArray((items as StripeObject).data)) return null;
  const first = ((items as StripeObject).data as unknown[])[0];
  return first && typeof first === "object" ? objectId((first as StripeObject).price) : null;
}

function periodEndFromSubscription(object: StripeObject) {
  const topLevel = unixSecondsToIso(object.current_period_end);
  if (topLevel) return topLevel;
  const items = object.items;
  if (!items || typeof items !== "object" || !Array.isArray((items as StripeObject).data)) return null;
  const periods = ((items as StripeObject).data as unknown[])
    .map((item) => item && typeof item === "object" ? unixSecondsToIso((item as StripeObject).current_period_end) : null)
    .filter((value): value is string => Boolean(value))
    .sort();
  return periods.at(-1) ?? null;
}

async function syncSubscription(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  object: StripeObject,
  fallbackUserId: string | null,
  fallbackPriceId: string,
) {
  const subscriptionId = objectId(object.id);
  const customerId = objectId(object.customer);
  const userId = (await resolveUserId(admin, object)) ?? fallbackUserId;
  if (!subscriptionId || !customerId || !userId) throw new Error("구독 소유 계정을 확인하지 못했어요.");

  const status = normalizeStatus(object.status);
  const periodEnd = periodEndFromSubscription(object);
  if (status === "ACTIVE" && !periodEnd) throw new Error("구독 사용 기간을 확인하지 못했어요.");
  const { error: customerError } = await admin.from("billing_customers").upsert({
    user_id: userId,
    provider: "STRIPE",
    provider_customer_id: customerId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (customerError) throw new Error("결제 고객 상태를 저장하지 못했어요.");

  const { error: subscriptionError } = await admin.from("billing_subscriptions").upsert({
    user_id: userId,
    provider: "STRIPE",
    provider_subscription_id: subscriptionId,
    provider_price_id: priceIdFromSubscription(object) ?? fallbackPriceId,
    status,
    current_period_end: periodEnd,
    cancel_at_period_end: object.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider_subscription_id" });
  if (subscriptionError) throw new Error("구독 상태를 계정에 반영하지 못했어요.");
}

async function processEvent(event: StripeEvent, config: NonNullable<ReturnType<typeof getStripeBillingConfig>>, admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const object = event.data.object;
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await syncSubscription(admin, object, null, config.priceId);
    return;
  }
  if (event.type === "checkout.session.completed") {
    const subscriptionId = objectId(object.subscription);
    const userId = await resolveUserId(admin, object);
    const customerId = objectId(object.customer);
    if (customerId && userId) {
      const { error } = await admin.from("billing_customers").upsert({ user_id: userId, provider: "STRIPE", provider_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw new Error("결제 고객 상태를 저장하지 못했어요.");
    }
    if (subscriptionId) await syncSubscription(admin, await retrieveSubscription(subscriptionId, config.secretKey), userId, config.priceId);
    return;
  }
  if (event.type === "invoice.payment_failed") {
    const subscriptionId = objectId(object.subscription);
    if (subscriptionId) await syncSubscription(admin, await retrieveSubscription(subscriptionId, config.secretKey), await resolveUserId(admin, object), config.priceId);
  }
}

export async function POST(request: Request) {
  const config = getStripeBillingConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "결제 웹훅 환경 설정 후 사용할 수 있어요." }, { status: 503 });

  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), config.webhookSecret)) {
    return NextResponse.json({ error: "결제 웹훅을 확인하지 못했어요." }, { status: 400 });
  }
  const parsedBody = (() => { try { return JSON.parse(rawBody) as unknown; } catch { return null; } })();
  const event = stripeEventSchema.safeParse(parsedBody);
  if (!event.success) return NextResponse.json({ error: "결제 이벤트를 다시 확인해 주세요." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "결제 계정 저장소 설정 후 사용할 수 있어요." }, { status: 503 });
  const { data: existingEvent, error: existingEventError } = await admin
    .from("billing_webhook_events")
    .select("processed_at, processing_error")
    .eq("provider_event_id", event.data.id)
    .maybeSingle();
  if (existingEventError) return NextResponse.json({ error: "결제 이벤트 상태를 확인하지 못했어요." }, { status: 500 });
  if (existingEvent?.processed_at && !existingEvent.processing_error) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { error: eventError } = await admin.from("billing_webhook_events").upsert({
    provider: "STRIPE",
    provider_event_id: event.data.id,
    event_type: event.data.type,
    occurred_at: new Date(event.data.created * 1000).toISOString(),
    processed_at: null,
    processing_error: null,
  }, { onConflict: "provider_event_id" });
  if (eventError) return NextResponse.json({ error: "결제 이벤트를 기록하지 못했어요." }, { status: 500 });

  try {
    await processEvent(event.data, config, admin);
    await markProcessed(admin, event.data.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "구독 상태를 처리하지 못했어요.";
    await markProcessed(admin, event.data.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
