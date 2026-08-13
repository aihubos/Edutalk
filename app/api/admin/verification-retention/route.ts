import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: roles, error: roleError } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (roleError || !(roles ?? []).some((item) => item.role === "ADMIN")) return NextResponse.json({ error: "원본 삭제 권한이 없어요." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "서버 전용 키 설정이 필요해요." }, { status: 503 });
  const { data, error } = await admin.from("verification_documents")
    .select("id, storage_bucket, storage_object_path, retention_until")
    .not("retention_until", "is", null)
    .is("deleted_at", null)
    .lte("retention_until", new Date().toISOString())
    .order("retention_until", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: "삭제 예정 증빙을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ dueCount: data?.length ?? 0, documents: (data ?? []).map((item) => ({ id: item.id, retentionUntil: item.retention_until })) });
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: roles, error: roleError } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (roleError || !(roles ?? []).some((item) => item.role === "ADMIN")) return NextResponse.json({ error: "원본 삭제 권한이 없어요." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "서버 전용 키 설정이 필요해요." }, { status: 503 });
  const { data, error } = await admin.from("verification_documents")
    .select("id, storage_bucket, storage_object_path")
    .not("retention_until", "is", null)
    .is("deleted_at", null)
    .lte("retention_until", new Date().toISOString())
    .limit(200);
  if (error) return NextResponse.json({ error: "삭제할 증빙을 불러오지 못했어요." }, { status: 500 });
  let deleted = 0;
  for (const item of data ?? []) {
    const { error: storageError } = await admin.storage.from(item.storage_bucket).remove([item.storage_object_path]);
    if (storageError) continue;
    const { error: markError } = await admin.from("verification_documents").update({ deleted_at: new Date().toISOString() }).eq("id", item.id).is("deleted_at", null);
    if (!markError) deleted += 1;
  }
  return NextResponse.json({ deleted, attempted: data?.length ?? 0 });
}
