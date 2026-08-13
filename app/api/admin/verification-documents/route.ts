import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inputSchema = z.object({ id: z.string().uuid() });
const allowedRoles = new Set(["VERIFICATION_REVIEWER", "ADMIN"]);

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase 저장소가 설정되지 않았어요." }, { status: 503 });
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "문서 요청을 다시 확인해 주세요." }, { status: 400 });
  const { data: roles, error: roleError } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (roleError || !(roles ?? []).some((row) => allowedRoles.has(row.role))) return NextResponse.json({ error: "증빙 확인 권한이 없습니다." }, { status: 403 });
  const { data: document, error } = await supabase.from("verification_documents")
    .select("storage_bucket, storage_object_path, retention_until")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !document) return NextResponse.json({ error: "증빙 자료를 찾지 못했어요." }, { status: 404 });
  if (document.retention_until && new Date(document.retention_until).getTime() <= Date.now()) return NextResponse.json({ error: "원본 보관 기한이 지나 열람할 수 없어요." }, { status: 410 });
  const { data, error: signedError } = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_object_path, 300);
  if (signedError || !data?.signedUrl) return NextResponse.json({ error: "임시 열람 링크를 만들지 못했어요." }, { status: 500 });
  return NextResponse.json({ signedUrl: data.signedUrl, expiresIn: 300 });
}
