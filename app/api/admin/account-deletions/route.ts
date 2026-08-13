import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const inputSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["COMPLETE", "REJECT"]),
  note: z.string().trim().min(3).max(1000),
});

type StoredObject = { storage_bucket: string; storage_object_path: string };

function addStoragePaths(target: Map<string, Set<string>>, items: StoredObject[]) {
  for (const item of items) {
    if (!item.storage_bucket || !item.storage_object_path) continue;
    const paths = target.get(item.storage_bucket) ?? new Set<string>();
    paths.add(item.storage_object_path);
    target.set(item.storage_bucket, paths);
  }
}

async function adminSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null, response: NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 }) };
  const { data: claims, error } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (error || typeof userId !== "string") return { supabase, userId: null, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data: role } = await supabase.from("operator_roles").select("role").eq("user_id", userId).eq("role", "ADMIN").maybeSingle();
  if (!role) return { supabase, userId, response: NextResponse.json({ error: "계정 삭제 처리 권한이 없습니다." }, { status: 403 }) };
  return { supabase, userId, response: null };
}

export async function GET() {
  const current = await adminSession();
  if (current.response) return current.response;
  const { data, error } = await current.supabase!.from("account_deletion_requests")
    .select("id, status, requested_at, processed_at, note")
    .order("requested_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "탈퇴 요청을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function PATCH(request: Request) {
  const current = await adminSession();
  if (current.response) return current.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "처리 내용과 메모를 다시 확인해 주세요." }, { status: 400 });
  const { data: deletionRequest, error: requestError } = await current.supabase!.from("account_deletion_requests")
    .select("id, user_id, status")
    .eq("id", parsed.data.id)
    .eq("status", "PENDING")
    .maybeSingle();
  if (requestError || !deletionRequest) return NextResponse.json({ error: "처리할 수 있는 대기 요청이 아니에요." }, { status: 409 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "서버 전용 Supabase 키가 설정되지 않았어요." }, { status: 503 });
  const now = new Date().toISOString();
  if (parsed.data.action === "REJECT") {
    const { error } = await admin.from("account_deletion_requests").update({ status: "REJECTED", processed_at: now, note: parsed.data.note }).eq("id", deletionRequest.id).eq("status", "PENDING");
    if (error) return NextResponse.json({ error: "반려 상태를 저장하지 못했어요." }, { status: 500 });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  if (!deletionRequest.user_id) return NextResponse.json({ error: "삭제할 계정 식별자가 남아 있지 않아요." }, { status: 409 });
  const { error: processingError } = await admin.from("account_deletion_requests").update({ status: "PROCESSING", note: parsed.data.note }).eq("id", deletionRequest.id).eq("status", "PENDING");
  if (processingError) return NextResponse.json({ error: "삭제 처리 상태를 저장하지 못했어요." }, { status: 500 });

  const restorePending = async () => {
    await admin.from("account_deletion_requests").update({ status: "PENDING", note: parsed.data.note }).eq("id", deletionRequest.id);
  };

  const { data: verificationRequests, error: verificationError } = await admin.from("verification_requests").select("id").eq("requester_user_id", deletionRequest.user_id);
  if (verificationError) {
    await restorePending();
    return NextResponse.json({ error: "비공개 증빙 정리 대상을 확인하지 못해 삭제를 중단했어요." }, { status: 500 });
  }
  const verificationIds = (verificationRequests ?? []).map((item) => item.id);
  let verificationDocuments: StoredObject[] = [];
  if (verificationIds.length) {
    const { data: documents, error: documentError } = await admin.from("verification_documents")
      .select("storage_bucket, storage_object_path")
      .in("verification_request_id", verificationIds)
      .is("deleted_at", null);
    if (documentError) {
      await restorePending();
      return NextResponse.json({ error: "비공개 증빙 목록을 확인하지 못해 삭제를 중단했어요." }, { status: 500 });
    }
    verificationDocuments = documents ?? [];
  }

  const [{ data: tutorMedia, error: tutorMediaError }, { data: messageMedia, error: messageMediaError }] = await Promise.all([
    admin.from("tutor_review_media")
      .select("storage_bucket, storage_object_path, tutor_reviews!inner(author_user_id)")
      .eq("tutor_reviews.author_user_id", deletionRequest.user_id)
      .is("deleted_at", null),
    admin.from("communication_attachments")
      .select("storage_bucket, storage_object_path, communication_messages!inner(author_user_id)")
      .eq("communication_messages.author_user_id", deletionRequest.user_id),
  ]);
  if (tutorMediaError || messageMediaError) {
    await restorePending();
    return NextResponse.json({ error: "계정 첨부 이미지 목록을 확인하지 못해 삭제를 중단했어요." }, { status: 500 });
  }
  const privatePathsByBucket = new Map<string, Set<string>>();
  addStoragePaths(privatePathsByBucket, verificationDocuments);
  addStoragePaths(privatePathsByBucket, (tutorMedia ?? []) as StoredObject[]);
  addStoragePaths(privatePathsByBucket, (messageMedia ?? []) as StoredObject[]);
  for (const [bucket, pathSet] of privatePathsByBucket) {
    const { error: storageError } = await admin.storage.from(bucket).remove([...pathSet]);
    if (storageError) {
      await restorePending();
      return NextResponse.json({ error: "계정 소유 비공개 파일 정리에 실패해 삭제를 중단했어요." }, { status: 500 });
    }
  }

  const { data: createdStudents, error: studentsError } = await admin.from("students").select("id").eq("created_by", deletionRequest.user_id);
  if (studentsError) {
    await restorePending();
    return NextResponse.json({ error: "학생 연결 상태를 확인하지 못해 삭제를 중단했어요." }, { status: 500 });
  }
  for (const student of createdStudents ?? []) {
    const { data: otherLinks, error: linkError } = await admin.from("student_user_links")
      .select("user_id")
      .eq("student_id", student.id)
      .eq("is_active", true)
      .neq("user_id", deletionRequest.user_id)
      .limit(1);
    if (linkError) {
      await restorePending();
      return NextResponse.json({ error: "학생 공유 상태를 확인하지 못해 삭제를 중단했어요." }, { status: 500 });
    }
    if (!otherLinks?.length) {
      const { error: studentDeleteError } = await admin.from("students").delete().eq("id", student.id);
      if (studentDeleteError) {
        await restorePending();
        return NextResponse.json({ error: "계정 전용 학생 기록 정리에 실패해 삭제를 중단했어요." }, { status: 500 });
      }
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(deletionRequest.user_id, false);
  if (deleteError) {
    await admin.from("account_deletion_requests").update({ status: "PENDING", note: `삭제 실패: ${parsed.data.note}` }).eq("id", deletionRequest.id);
    return NextResponse.json({ error: "계정 삭제에 실패해 요청을 대기 상태로 되돌렸어요." }, { status: 500 });
  }
  const { error: completeError } = await admin.from("account_deletion_requests").update({ status: "COMPLETED", processed_at: now, note: parsed.data.note, user_id: null }).eq("id", deletionRequest.id);
  if (completeError) return NextResponse.json({ error: "계정은 삭제됐지만 완료 이력 저장에 실패했어요. 운영 기록을 확인해 주세요." }, { status: 500 });
  return NextResponse.json({ ok: true, status: "COMPLETED" });
}
