import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function getAccount() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null };
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId: error || !userId ? null : userId };
}

export async function GET() {
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ mode: "demo", notifications: [] });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, kind, link_path, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "알림을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({
    mode: "server",
    notifications: (data ?? []).map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      kind: notification.kind,
      linkPath: notification.link_path,
      readAt: notification.read_at,
      createdAt: notification.created_at,
    })),
  });
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const notificationIds = Array.isArray(payload?.notificationIds)
    ? payload.notificationIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (notificationIds.length === 0) return NextResponse.json({ error: "읽음 처리할 알림이 없어요." }, { status: 400 });

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", notificationIds)
    .is("read_at", null);

  if (error) return NextResponse.json({ error: "읽음 상태를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
