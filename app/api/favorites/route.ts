import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const targetKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/);

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ mode: "demo" }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return error || !userId ? { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) } : { supabase, userId, response: null };
}

export async function GET() {
  const current = await session();
  if (current.response) return current.response;
  const { data, error } = await current.supabase!.from("institution_favorites").select("target_key").eq("user_id", current.userId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "관심 기관을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", favorites: (data ?? []).map((item) => item.target_key) });
}

export async function POST(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const payload = await request.json().catch(() => null) as { targetKey?: unknown } | null;
  const parsed = targetKeySchema.safeParse(payload?.targetKey);
  if (!parsed.success) return NextResponse.json({ error: "기관을 다시 선택해 주세요." }, { status: 400 });
  const targetKey = parsed.data;
  const { data: institution, error: institutionError } = await current.supabase!
    .from("institutions")
    .select("id")
    .eq("public_slug", targetKey)
    .eq("is_public", true)
    .eq("is_synthetic", false)
    .maybeSingle();
  if (institutionError || !institution) return NextResponse.json({ error: "공개된 기관만 관심 목록에 저장할 수 있어요." }, { status: 400 });
  const { error } = await current.supabase!.from("institution_favorites").upsert({ user_id: current.userId, target_key: targetKey }, { onConflict: "user_id,target_key" });
  if (error) return NextResponse.json({ error: "관심 기관을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const payload = await request.json().catch(() => null) as { targetKey?: unknown } | null;
  const parsed = targetKeySchema.safeParse(payload?.targetKey);
  if (!parsed.success) return NextResponse.json({ error: "기관을 다시 선택해 주세요." }, { status: 400 });
  const targetKey = parsed.data;
  const { error } = await current.supabase!.from("institution_favorites").delete().eq("user_id", current.userId).eq("target_key", targetKey);
  if (error) return NextResponse.json({ error: "관심 기관을 해제하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
