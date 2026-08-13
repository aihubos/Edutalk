import { NextResponse } from "next/server";
import { supportRequestSchema } from "@/lib/support-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo", requests: [] });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { data, error } = await supabase.from("support_requests").select("id, category, title, body, reply_email, status, response_body, responded_at, created_at, updated_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "고객센터 저장소가 아직 연결되지 않았어요." }, { status: 503 });
  return NextResponse.json({ mode: "supabase", requests: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const parsed = supportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "문의 내용을 다시 확인해 주세요." }, { status: 400 });
  const input = parsed.data;
  const { data, error } = await supabase.from("support_requests").insert({ user_id: userId, category: input.category, title: input.title, body: input.body, reply_email: input.replyEmail || null, status: "RECEIVED" }).select("id, category, title, body, reply_email, status, response_body, responded_at, created_at, updated_at").single();
  if (error) return NextResponse.json({ error: "고객센터 저장소가 아직 연결되지 않았어요." }, { status: 503 });
  return NextResponse.json({ mode: "supabase", request: data });
}
