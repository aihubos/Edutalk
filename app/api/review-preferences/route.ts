import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const reviewId = z.string().uuid();

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ mode: "demo" }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return error || !userId ? { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) } : { supabase, userId, response: null };
}

export async function POST(request: Request) {
  const current = await session(); if (current.response) return current.response;
  const parsed = reviewId.safeParse((await request.json().catch(() => null) as { reviewId?: unknown } | null)?.reviewId);
  if (!parsed.success) return NextResponse.json({ error: "후기를 다시 확인해 주세요." }, { status: 400 });
  const { error } = await current.supabase!.from("user_hidden_institution_reviews").upsert({ user_id: current.userId, review_id: parsed.data }, { onConflict: "user_id,review_id" });
  if (error) return NextResponse.json({ error: "후기 숨김 설정을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
