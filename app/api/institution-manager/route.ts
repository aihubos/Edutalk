import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const replyInput = z.object({ reviewId: z.string().uuid(), body: z.string().trim().min(1).max(3000) });

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, response: NextResponse.json({ mode: "demo" }) };
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? { supabase, response: null } : { supabase, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
}

export async function GET() {
  const current = await session(); if (current.response) return current.response;
  const { data, error } = await current.supabase!.rpc("get_institution_manager_queue");
  if (error) return NextResponse.json({ error: "기관 관리 정보를 불러오지 못했어요." }, { status: 403 });
  return NextResponse.json({ mode: "supabase", ...(data as object) });
}

export async function POST(request: Request) {
  const current = await session(); if (current.response) return current.response;
  const parsed = replyInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "공식 답변을 1~3000자로 입력해 주세요." }, { status: 400 });
  const { data, error } = await current.supabase!.rpc("submit_institution_review_reply", { target_review_id: parsed.data.reviewId, reply_body: parsed.data.body });
  if (error) return NextResponse.json({ error: "공식 답변을 저장하지 못했어요." }, { status: 403 });
  return NextResponse.json({ result: data });
}
