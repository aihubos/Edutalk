import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestIdSchema = z.string().uuid();
const deleteInput = z.object({ id: z.string().uuid() });
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const extensions: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const maxBytes = 5 * 1024 * 1024;
const bucket = "verification-documents";

function matchesDeclaredType(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return false;
}

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ error: "Supabase 저장소 연결 뒤 사용할 수 있어요." }, { status: 503 }) };
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  return { supabase, userId, response: null };
}

function toDocument(row: { id: string; document_kind: string; mime_type: string; byte_size: number; uploaded_at: string }) {
  return { id: row.id, documentKind: row.document_kind, mimeType: row.mime_type, byteSize: row.byte_size, uploadedAt: row.uploaded_at };
}

export async function GET(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const parsed = requestIdSchema.safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!parsed.success) return NextResponse.json({ error: "인증 요청을 다시 확인해 주세요." }, { status: 400 });
  const { data, error } = await current.supabase!
    .from("verification_documents")
    .select("id, document_kind, mime_type, byte_size, uploaded_at")
    .eq("verification_request_id", parsed.data)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: "증빙 자료를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ documents: (data ?? []).map(toDocument) });
}

export async function POST(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "업로드 요청을 다시 확인해 주세요." }, { status: 400 });
  const requestId = requestIdSchema.safeParse(form.get("requestId"));
  const file = form.get("file");
  if (!requestId.success || !(file instanceof File)) return NextResponse.json({ error: "인증 요청과 파일을 다시 확인해 주세요." }, { status: 400 });
  if (!allowedMimeTypes.has(file.type)) return NextResponse.json({ error: "PDF, JPG, PNG 파일만 올릴 수 있어요." }, { status: 415 });
  if (file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: "파일은 5MB 이하만 올릴 수 있어요." }, { status: 413 });

  const { data: verification, error: verificationError } = await current.supabase!
    .from("verification_requests")
    .select("id, evidence_type, status")
    .eq("id", requestId.data)
    .eq("requester_user_id", current.userId)
    .in("status", ["PENDING", "NEEDS_INFO"])
    .maybeSingle();
  if (verificationError || !verification) return NextResponse.json({ error: "이 인증 요청에는 새 자료를 올릴 수 없어요." }, { status: 403 });

  const objectPath = `${current.userId}/${requestId.data}/${randomUUID()}.${extensions[file.type]}`;
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!matchesDeclaredType(bytes, file.type)) return NextResponse.json({ error: "파일 내용과 형식이 일치하지 않아요." }, { status: 415 });
  const { error: uploadError } = await current.supabase!.storage.from(bucket).upload(objectPath, buffer, { contentType: file.type, cacheControl: "0", upsert: false });
  if (uploadError) return NextResponse.json({ error: "비공개 증빙 저장소에 파일을 올리지 못했어요." }, { status: 500 });

  const { data, error } = await current.supabase!.from("verification_documents").insert({
    verification_request_id: requestId.data,
    storage_bucket: bucket,
    storage_object_path: objectPath,
    document_kind: verification.evidence_type ?? "OTHER",
    mime_type: file.type,
    byte_size: file.size,
  }).select("id, document_kind, mime_type, byte_size, uploaded_at").single();
  if (error) {
    await current.supabase!.storage.from(bucket).remove([objectPath]);
    return NextResponse.json({ error: "증빙 메타데이터를 저장하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ document: toDocument(data) });
}

export async function DELETE(request: Request) {
  const current = await session();
  if (current.response) return current.response;
  const parsed = deleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "삭제할 자료를 다시 확인해 주세요." }, { status: 400 });
  const { data: document, error } = await current.supabase!.from("verification_documents")
    .select("id, storage_bucket, storage_object_path, verification_requests!inner(requester_user_id, status)")
    .eq("id", parsed.data.id)
    .eq("verification_requests.requester_user_id", current.userId)
    .in("verification_requests.status", ["PENDING", "NEEDS_INFO"])
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !document) return NextResponse.json({ error: "삭제할 수 있는 증빙 자료가 아니에요." }, { status: 403 });
  const { error: removeError } = await current.supabase!.storage.from(document.storage_bucket).remove([document.storage_object_path]);
  if (removeError) return NextResponse.json({ error: "비공개 저장소에서 자료를 삭제하지 못했어요." }, { status: 500 });
  const { error: markError } = await current.supabase!.from("verification_documents").update({ deleted_at: new Date().toISOString() }).eq("id", document.id);
  if (markError) return NextResponse.json({ error: "삭제 상태를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
