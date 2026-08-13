import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const createInput = z.object({ action: z.literal("create"), studentId: z.string().uuid(), linkRole: z.enum(["PARENT", "STUDENT"]).default("PARENT") });
const redeemInput = z.object({ action: z.literal("redeem"), code: z.string().trim().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/), childProfileId: z.string().uuid().optional() });
const inputSchema = z.discriminatedUnion("action", [createInput, redeemInput]);

function digest(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "연결 요청을 다시 확인해 주세요." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "계정 서버 연결 뒤 사용할 수 있어요.", mode: "demo" }, { status: 409 });
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  if (parsed.data.action === "create") {
    const code = newCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error } = await supabase.rpc("create_student_user_link_invite", {
      target_student_id: parsed.data.studentId,
      invitation_digest: digest(code),
      invitation_expires_at: expiresAt,
      link_relationship: parsed.data.linkRole,
    });
    if (error) return NextResponse.json({ error: "담당 선생님만 연결 코드를 만들 수 있어요." }, { status: 403 });
    return NextResponse.json({ code, expiresAt });
  }

  const { data, error } = await supabase.rpc("redeem_student_user_link_invite", {
    invitation_digest: digest(parsed.data.code.toUpperCase()),
    selected_child_profile_id: parsed.data.childProfileId ?? null,
  });
  const linked = Array.isArray(data) ? data[0] : data;
  if (error || !linked?.student_id) return NextResponse.json({ error: "코드가 올바르지 않거나 만료됐거나 현재 역할과 맞지 않아요." }, { status: 400 });
  return NextResponse.json({ ok: true, studentId: linked.student_id, linkedRole: linked.linked_role });
}
