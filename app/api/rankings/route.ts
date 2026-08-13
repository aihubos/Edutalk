import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RankingsClient = {
  rpc: (name: string) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });

  const client = supabase as unknown as RankingsClient;
  const [{ data, error }, { data: movements, error: movementError }] = await Promise.all([
    client.rpc("get_public_ranking_summaries"),
    client.rpc("get_public_ranking_weekly_movements"),
  ]);
  if (error || movementError) return NextResponse.json({ error: "공개 순위 데이터를 불러오지 못했어요." }, { status: 500 });
  const rankings = data ?? [];
  const first = rankings[0];
  return NextResponse.json({
    mode: "supabase",
    rankings,
    weeklyMovements: movements ?? [],
    formula: typeof first?.formula_description === "string" ? first.formula_description : "승인 후기만 역할별로 집계합니다.",
    referenceDate: typeof first?.reference_date === "string" ? first.reference_date : new Date().toISOString().slice(0, 10),
  });
}
