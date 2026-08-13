import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const profileInput = z.object({ alias: z.string().trim().min(1).max(24), gradeLevel: z.string().trim().min(1).max(40) });
const updateInput = profileInput.extend({ id: z.string().uuid() });
const deleteInput = z.object({ id: z.string().uuid() });

async function parentSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ mode: "demo" }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) return { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  const { data: parentRole, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "PARENT").maybeSingle();
  if (roleError) return { supabase, userId, response: NextResponse.json({ error: "학부모 역할을 확인하지 못했어요." }, { status: 500 }) };
  if (!parentRole) return { supabase, userId, response: NextResponse.json({ error: "학부모 역할에서만 자녀 프로필을 관리할 수 있어요." }, { status: 403 }) };
  return { supabase, userId, response: null };
}

function toChild(row: { id: string; alias: string; grade_level: string; created_at: string; updated_at: string }) {
  return { id: row.id, alias: row.alias, gradeLevel: row.grade_level, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function GET() {
  const current = await parentSession();
  if (current.response) return current.response;
  const { data, error } = await current.supabase!.from("child_profiles").select("id, alias, grade_level, created_at, updated_at").eq("guardian_user_id", current.userId).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "자녀 프로필을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", children: (data ?? []).map(toChild) });
}

export async function POST(request: Request) {
  const current = await parentSession();
  if (current.response) return current.response;
  const parsed = profileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "별칭과 학년만 입력해 주세요." }, { status: 400 });
  const { data, error } = await current.supabase!.from("child_profiles").insert({ guardian_user_id: current.userId, alias: parsed.data.alias, grade_level: parsed.data.gradeLevel }).select("id, alias, grade_level, created_at, updated_at").single();
  if (error || !data) return NextResponse.json({ error: "자녀 프로필을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ child: toChild(data) });
}

export async function PATCH(request: Request) {
  const current = await parentSession();
  if (current.response) return current.response;
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "별칭과 학년만 입력해 주세요." }, { status: 400 });
  const { data, error } = await current.supabase!.from("child_profiles").update({ alias: parsed.data.alias, grade_level: parsed.data.gradeLevel, updated_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("guardian_user_id", current.userId).select("id, alias, grade_level, created_at, updated_at").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "자녀 프로필을 수정하지 못했어요." }, { status: 500 });
  return NextResponse.json({ child: toChild(data) });
}

export async function DELETE(request: Request) {
  const current = await parentSession();
  if (current.response) return current.response;
  const parsed = deleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "삭제할 자녀 프로필을 다시 확인해 주세요." }, { status: 400 });
  const { error } = await current.supabase!.from("child_profiles").delete().eq("id", parsed.data.id).eq("guardian_user_id", current.userId);
  if (error) return NextResponse.json({ error: "자녀 프로필을 삭제하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
