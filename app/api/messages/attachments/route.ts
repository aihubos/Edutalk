import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const maxBytes = 5 * 1024 * 1024;
const bucket = "message-attachments";

function matchesDeclaredType(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (mimeType === "image/webp") return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function getAccount() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId: error || !userId ? null : userId };
}

function toAttachment(row: { id: string; message_id: string; mime_type: string; byte_size: number; created_at: string }, signedUrl: string) {
  return { id: row.id, messageId: row.message_id, mimeType: row.mime_type, byteSize: row.byte_size, uploadedAt: row.created_at, signedUrl };
}

export async function GET(request: Request) {
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ mode: "demo", attachment: null });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const messageId = new URL(request.url).searchParams.get("messageId")?.trim() ?? "";
  if (!messageId) return NextResponse.json({ error: "메시지를 다시 확인해 주세요." }, { status: 400 });

  const { data, error } = await supabase
    .from("communication_attachments")
    .select("id, message_id, storage_bucket, storage_object_path, mime_type, byte_size, created_at")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "첨부 이미지를 불러오지 못했어요." }, { status: 500 });
  if (!data) return NextResponse.json({ attachment: null });

  const { data: signed, error: signedError } = await supabase.storage.from(data.storage_bucket).createSignedUrl(data.storage_object_path, 300);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "첨부 이미지 미리보기를 준비하지 못했어요." }, { status: 500 });
  return NextResponse.json({ attachment: toAttachment(data, signed.signedUrl) });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ error: "계정 저장소 연결 뒤 사용할 수 있어요." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const rawMessageId = form?.get("messageId");
  const messageId = typeof rawMessageId === "string" ? rawMessageId.trim() : "";
  const file = form?.get("file");
  if (!messageId || !(file instanceof File)) return NextResponse.json({ error: "메시지와 이미지를 다시 확인해 주세요." }, { status: 400 });
  if (!allowedMimeTypes.has(file.type)) return NextResponse.json({ error: "JPG, PNG, WebP 이미지만 첨부할 수 있어요." }, { status: 415 });
  if (file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: "이미지는 5MB 이하만 첨부할 수 있어요." }, { status: 413 });

  const { data: message, error: messageError } = await supabase
    .from("communication_messages")
    .select("id")
    .eq("id", messageId)
    .eq("author_user_id", userId)
    .maybeSingle();
  if (messageError || !message) return NextResponse.json({ error: "내가 보낸 메시지에만 이미지를 첨부할 수 있어요." }, { status: 403 });

  const objectPath = `${userId}/${message.id}/${randomUUID()}.${extensions[file.type]}`;
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!matchesDeclaredType(bytes, file.type)) return NextResponse.json({ error: "이미지 내용과 파일 형식이 일치하지 않아요." }, { status: 415 });
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, buffer, { contentType: file.type, cacheControl: "0", upsert: false });
  if (uploadError) return NextResponse.json({ error: "이미지 저장소에 업로드하지 못했어요." }, { status: 500 });

  const { data, error } = await supabase
    .from("communication_attachments")
    .insert({ message_id: message.id, storage_bucket: bucket, storage_object_path: objectPath, mime_type: file.type, byte_size: file.size })
    .select("id, message_id, mime_type, byte_size, created_at")
    .single();
  if (error || !data) {
    await supabase.storage.from(bucket).remove([objectPath]);
    return NextResponse.json({ error: "첨부 이미지 정보를 저장하지 못했어요." }, { status: 500 });
  }

  const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 300);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "첨부 이미지 미리보기를 준비하지 못했어요." }, { status: 500 });
  return NextResponse.json({ attachment: toAttachment(data, signed.signedUrl) });
}
