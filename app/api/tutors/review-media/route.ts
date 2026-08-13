import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const bucket = "tutor-review-media";
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;

function matchesDeclaredType(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (mimeType === "image/webp") return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo", media: [] });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;
  const reviewId = new URL(request.url).searchParams.get("reviewId")?.trim();
  if (!reviewId) return NextResponse.json({ error: "후기 식별자가 필요합니다." }, { status: 400 });

  const { data: review, error: reviewError } = await supabase.from("tutor_reviews").select("id, author_user_id, verified_lesson").eq("id", reviewId).maybeSingle();
  if (reviewError || !review || (review.author_user_id !== userId && !review.verified_lesson)) return NextResponse.json({ error: "승인된 후기 사진만 볼 수 있어요." }, { status: 403 });
  const { data: records, error } = await supabase.from("tutor_review_media").select("id, storage_bucket, storage_object_path").eq("review_id", reviewId).is("deleted_at", null).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "후기 사진을 불러오지 못했어요." }, { status: 500 });

  const media = await Promise.all((records ?? []).map(async (record) => {
    const { data, error: signedError } = await supabase.storage.from(record.storage_bucket).createSignedUrl(record.storage_object_path, 300);
    return signedError || !data?.signedUrl ? null : { id: record.id, url: data.signedUrl };
  }));
  return NextResponse.json({ mode: "supabase", media: media.filter((item): item is { id: string; url: string } => item !== null) });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const reviewId = form?.get("reviewId");
  const file = form?.get("file");
  if (typeof reviewId !== "string" || !(file instanceof File)) return NextResponse.json({ error: "후기와 사진 파일을 확인해 주세요." }, { status: 400 });
  if (!acceptedTypes.has(file.type) || file.size > maxBytes) return NextResponse.json({ error: "JPG, PNG, WebP 사진만 5MB 이하로 올릴 수 있어요." }, { status: 400 });
  if (file.size < 1) return NextResponse.json({ error: "비어 있는 사진 파일은 올릴 수 없어요." }, { status: 400 });

  const { data: review, error: reviewError } = await supabase.from("tutor_reviews").select("id, author_user_id").eq("id", reviewId).eq("author_user_id", userId).maybeSingle();
  if (reviewError || !review) return NextResponse.json({ error: "작성자 본인 후기의 사진만 올릴 수 있어요." }, { status: 403 });
  const { count, error: countError } = await supabase.from("tutor_review_media").select("id", { count: "exact", head: true }).eq("review_id", reviewId);
  if (countError) return NextResponse.json({ error: "사진 저장소 연결을 확인해 주세요." }, { status: 503 });
  if ((count ?? 0) >= 3) return NextResponse.json({ error: "후기 사진은 최대 3장까지 올릴 수 있어요." }, { status: 400 });

  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const storagePath = `${userId}/${reviewId}/${crypto.randomUUID()}.${extension}`;
  const buffer = await file.arrayBuffer();
  if (!matchesDeclaredType(new Uint8Array(buffer), file.type)) return NextResponse.json({ error: "사진 내용과 파일 형식이 일치하지 않아요." }, { status: 415 });
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, { contentType: file.type, cacheControl: "0", upsert: false });
  if (uploadError) return NextResponse.json({ error: "사진 파일을 저장하지 못했어요." }, { status: 503 });
  const { data, error } = await supabase.from("tutor_review_media").insert({ review_id: reviewId, storage_bucket: bucket, storage_object_path: storagePath, mime_type: file.type, byte_size: file.size }).select("id").single();
  if (error || !data) {
    await supabase.storage.from(bucket).remove([storagePath]);
    return NextResponse.json({ error: "사진 메타데이터를 저장하지 못했어요." }, { status: 503 });
  }
  return NextResponse.json({ mode: "supabase", media: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "사진 식별자가 필요합니다." }, { status: 400 });
  const { data: media, error } = await supabase.from("tutor_review_media").select("id, storage_bucket, storage_object_path, tutor_reviews!inner(author_user_id, verified_lesson)").eq("id", body.id).is("deleted_at", null).maybeSingle();
  const review = media?.tutor_reviews as unknown as { author_user_id?: string; verified_lesson?: boolean } | undefined;
  if (error || !media || review?.author_user_id !== userId || review.verified_lesson) return NextResponse.json({ error: "작성자의 심사 대기 사진만 삭제할 수 있어요." }, { status: 403 });
  const { error: removeError } = await supabase.storage.from(media.storage_bucket).remove([media.storage_object_path]);
  if (removeError) return NextResponse.json({ error: "사진 파일을 삭제하지 못했어요." }, { status: 503 });
  const { error: deleteError } = await supabase.from("tutor_review_media").update({ deleted_at: new Date().toISOString() }).eq("id", body.id);
  if (deleteError) return NextResponse.json({ error: "사진 정보를 삭제하지 못했어요." }, { status: 503 });
  return NextResponse.json({ mode: "supabase", deleted: body.id });
}
