import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function getAccount() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null };
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null };
}

export async function GET() {
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ mode: "demo", request: null });
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("status,requested_at")
    .eq("user_id", userId)
    .in("status", ["PENDING", "PROCESSING"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "탈퇴 요청 상태를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", request: data ? { status: data.status, requestedAt: data.requested_at } : null });
}

export async function POST() {
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const existing = await supabase
    .from("account_deletion_requests")
    .select("status,requested_at")
    .eq("user_id", userId)
    .in("status", ["PENDING", "PROCESSING"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: "탈퇴 요청 상태를 확인하지 못했어요." }, { status: 500 });
  if (existing.data) return NextResponse.json({ mode: "supabase", request: { status: existing.data.status, requestedAt: existing.data.requested_at } });
  const created = await supabase
    .from("account_deletion_requests")
    .insert({ user_id: userId, status: "PENDING" })
    .select("status,requested_at")
    .single();
  if (created.error) return NextResponse.json({ error: "탈퇴 요청을 접수하지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", request: { status: created.data.status, requestedAt: created.data.requested_at } });
}
