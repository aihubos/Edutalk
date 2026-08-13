import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo", replies: [] });
  const { id } = await params;
  const { data, error } = await supabase.rpc("get_public_institution_replies", { target_slug: id });
  if (error) return NextResponse.json({ error: "공식 답변을 불러오지 못했어요." }, { status: 500 });
  const replies = ((data ?? []) as unknown[]).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.body !== "string" || typeof row.published_at !== "string") return [];
    return [{
      body: row.body,
      published_at: row.published_at,
      revision_count: typeof row.revision_count === "number" ? row.revision_count : Number(row.revision_count ?? 0) || 0,
      last_revised_at: typeof row.last_revised_at === "string" ? row.last_revised_at : null,
    }];
  });
  return NextResponse.json({ mode: "supabase", replies });
}
