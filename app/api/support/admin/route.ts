import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["IN_PROGRESS", "ANSWERED", "CLOSED"]),
  responseBody: z.string().trim().min(1).max(3000),
});
const allowedRoles = new Set(["SUPPORT_AGENT", "ADMIN"]);

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 }) };
  const { data: claims, error } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (error || typeof userId !== "string") return { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data: roles, error: roleError } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (roleError || !(roles ?? []).some((row) => allowedRoles.has(row.role))) return { supabase, userId, response: NextResponse.json({ error: "고객센터 처리 권한이 없습니다." }, { status: 403 }) };
  return { supabase, userId, response: null };
}

export async function GET() {
  const current = await session();
  if (current.response) return current.response;
  const { data, error } = await current.supabase!.from("support_requests")
    .select("id, category, title, body, reply_email, status, response_body, responded_at, created_at, updated_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "고객 문의를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function PATCH(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "상태와 답변 내용을 다시 확인해 주세요." }, { status: 400 });
  const now = new Date().toISOString();
  const { data, error } = await current.supabase!.from("support_requests").update({
    status: parsed.data.status,
    response_body: parsed.data.responseBody,
    responded_by: current.userId,
    responded_at: now,
    updated_at: now,
  }).eq("id", parsed.data.id).select("id, status, response_body, responded_at, updated_at").single();
  if (error) return NextResponse.json({ error: "고객센터 답변을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ request: data });
}
