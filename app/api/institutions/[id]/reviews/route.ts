import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const reviewRoles = ["PARENT", "STUDENT", "TEACHER"] as const;
type ReviewRole = (typeof reviewRoles)[number];
type SummaryRow = { relation: ReviewRole; review_count: number; overall_average: number | null; items: Record<string, number> | null; is_public: boolean };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });

  const { id } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return NextResponse.json({ error: "기관 식별자를 확인해 주세요." }, { status: 400 });
  const { data, error } = await supabase.rpc("get_institution_review_summary", { review_target_key: id });
  if (error) return NextResponse.json({ error: "승인된 후기 집계를 불러오지 못했어요." }, { status: 500 });

  const rows = (data ?? []) as SummaryRow[];
  const summaries = reviewRoles.map((role) => {
    const row = rows.find((item) => item.relation === role);
    return {
      role,
      count: Number(row?.review_count ?? 0),
      average: row?.overall_average === null || row?.overall_average === undefined ? null : Number(row.overall_average),
      items: Object.entries(row?.items ?? {}).map(([key, average]) => ({ key, average: Number(average) })),
      isPublic: row?.is_public ?? role !== "TEACHER",
    };
  });

  return NextResponse.json({ mode: "supabase", summaries });
}
