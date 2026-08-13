import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { productEventNames } from "@/lib/product-events";

const input = z.object({ eventName: z.enum(productEventNames), path: z.string().trim().max(160).regex(/^\//), category: z.string().trim().min(1).max(60), role: z.enum(["PARENT", "STUDENT", "TEACHER"]).optional() });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "같은 서비스 화면에서만 기록할 수 있어요." }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이벤트 형식을 확인해 주세요." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ mode: "demo" });
  const { error } = await admin.from("product_events").insert({ event_name: parsed.data.eventName, path: parsed.data.path, category: parsed.data.category, role: parsed.data.role ?? null });
  if (error) return NextResponse.json({ error: "제품 이벤트를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
