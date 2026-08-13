import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ mode: "demo" });
  const { data, error } = await supabase
    .from("public_information_items")
    .select("id, title, summary, audience_roles, category, organizer, application_period, status, region, source_url, source_label, source_date")
    .eq("is_public", true)
    .order("source_date", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "공개 정책·행사 데이터를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "supabase", items: data ?? [] });
}
