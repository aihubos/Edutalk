import { NextResponse } from "next/server";
import {
  defaultNotificationPreferences,
  notificationPreferenceUpdateInput,
  type NotificationKind,
} from "@/lib/notification-preferences";
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
  if (!supabase) return NextResponse.json({ mode: "demo", preferences: defaultNotificationPreferences() });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("kind, enabled")
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: "알림 설정을 불러오지 못했어요." }, { status: 500 });
  const saved = new Map((data ?? []).map((item) => [item.kind as NotificationKind, Boolean(item.enabled)]));
  return NextResponse.json({
    mode: "server",
    preferences: defaultNotificationPreferences().map((preference) => ({
      ...preference,
      enabled: saved.get(preference.kind) ?? preference.enabled,
    })),
  });
}

export async function PATCH(request: Request) {
  const parsed = notificationPreferenceUpdateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "알림 설정을 다시 확인해 주세요." }, { status: 400 });

  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ error: "계정 서버 설정 후 사용할 수 있어요." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: userId, kind: parsed.data.kind, enabled: parsed.data.enabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id,kind" },
    )
    .select("kind, enabled")
    .single();

  if (error) return NextResponse.json({ error: "알림 설정을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ preference: { kind: data.kind, enabled: data.enabled } });
}
