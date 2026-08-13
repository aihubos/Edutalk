import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const targetKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ error: "계정 연결 설정 후 사용할 수 있어요." }, { status: 503 }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return error || !userId ? { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) } : { supabase, userId, response: null };
}

async function isPublicCanonicalTarget(supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>, targetKey: string) {
  const { data, error } = await supabase.from("institutions").select("id").eq("public_slug", targetKey).eq("is_public", true).eq("is_synthetic", false).maybeSingle();
  return !error && Boolean(data);
}

export async function GET() {
  const current = await session();
  if (current.response) return current.response;
  const { data, error } = await current.supabase!.from("institution_comparisons").select("target_key").eq("user_id", current.userId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "비교 목록을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", comparisons: (data ?? []).map((item) => item.target_key) });
}

export async function POST(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const payload = await request.json().catch(() => null) as { targetKey?: unknown } | null;
  const parsed = targetKeySchema.safeParse(payload?.targetKey);
  if (!parsed.success || !await isPublicCanonicalTarget(current.supabase!, parsed.data)) return NextResponse.json({ error: "공개 canonical 기관만 비교할 수 있어요." }, { status: 400 });
  const { count, error: countError } = await current.supabase!.from("institution_comparisons").select("id", { count: "exact", head: true }).eq("user_id", current.userId);
  if (countError) return NextResponse.json({ error: "비교 목록을 확인하지 못했어요." }, { status: 500 });
  const { data: existing, error: existingError } = await current.supabase!.from("institution_comparisons").select("id").eq("user_id", current.userId).eq("target_key", parsed.data).maybeSingle();
  if (existingError) return NextResponse.json({ error: "비교 목록을 확인하지 못했어요." }, { status: 500 });
  if (!existing && (count ?? 0) >= 3) return NextResponse.json({ error: "비교는 최대 3곳까지 담을 수 있어요." }, { status: 400 });
  const { error } = await current.supabase!.from("institution_comparisons").upsert({ user_id: current.userId, target_key: parsed.data }, { onConflict: "user_id,target_key" });
  if (error) return NextResponse.json({ error: "비교 기관을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const payload = await request.json().catch(() => null) as { targetKey?: unknown } | null;
  const parsed = targetKeySchema.safeParse(payload?.targetKey);
  if (!parsed.success) return NextResponse.json({ error: "비교 기관을 다시 확인해 주세요." }, { status: 400 });
  const { error } = await current.supabase!.from("institution_comparisons").delete().eq("user_id", current.userId).eq("target_key", parsed.data);
  if (error) return NextResponse.json({ error: "비교 기관을 제거하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
