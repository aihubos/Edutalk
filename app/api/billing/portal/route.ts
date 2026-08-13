import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer, getStripeBillingConfig, stripeFormRequest } from "@/lib/stripe-billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getStripeBillingConfig();
  if (!config) return NextResponse.json({ error: "결제 환경 설정 후 사용할 수 있어요." }, { status: 503 });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "계정 연결 설정 후 사용할 수 있어요." }, { status: 503 });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  try {
    const customer = await getOrCreateStripeCustomer(config, data.user.id, data.user.email);
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    const session = await stripeFormRequest<{ url?: string }>(config, "/billing_portal/sessions", { customer: customer.id, return_url: `${origin}/subscription` });
    if (!session.url) throw new Error("구독 관리 주소를 준비하지 못했어요.");
    return NextResponse.json({ url: session.url });
  } catch (requestError) {
    return NextResponse.json({ error: requestError instanceof Error ? requestError.message : "구독 관리를 준비하지 못했어요." }, { status: 502 });
  }
}
