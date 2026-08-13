import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("get_institution_membership_status", { target_slug: id });
  if (error) return NextResponse.json({ error: "기관 관계 상태를 확인하지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", status: data });
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("request_institution_membership", { target_slug: id });
  if (error) return NextResponse.json({ error: "기관 관계 신청을 저장하지 못했어요." }, { status: 409 });
  return NextResponse.json({ mode: "supabase", status: data }, { status: 201 });
}
