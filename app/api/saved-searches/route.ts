import { NextResponse } from "next/server";
import { buildSavedSearchPath, savedSearchCreateInput, savedSearchDeleteInput } from "@/lib/saved-search-server";
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
  if (!supabase) return NextResponse.json({ mode: "demo", savedSearches: [] });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data, error } = await supabase
    .from("saved_searches")
    .select("id, label, query, zone, institution_type, sort, pickup, trial, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "저장한 검색을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({
    mode: "server",
    savedSearches: (data ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      query: item.query,
      zone: item.zone,
      institutionType: item.institution_type,
      sort: item.sort,
      pickup: item.pickup,
      trial: item.trial,
      path: buildSavedSearchPath({ label: item.label, query: item.query, zone: item.zone, institutionType: item.institution_type, sort: item.sort, pickup: item.pickup, trial: item.trial }),
      createdAt: item.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const parsed = savedSearchCreateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "저장할 검색 조건을 다시 확인해 주세요." }, { status: 400 });
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ error: "계정 서버 설정 후 사용할 수 있어요." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const input = parsed.data;
  const { count, error: countError } = await supabase.from("saved_searches").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (countError) return NextResponse.json({ error: "저장 검색 개수를 확인하지 못했어요." }, { status: 500 });
  if ((count ?? 0) >= 10) return NextResponse.json({ error: "저장 검색은 최대 10개까지 만들 수 있어요." }, { status: 409 });
  const { data, error } = await supabase.from("saved_searches").insert({
    user_id: userId,
    label: input.label,
    query: input.query,
    zone: input.zone,
    institution_type: input.institutionType,
    sort: input.sort,
    pickup: input.pickup,
    trial: input.trial,
  }).select("id, created_at").single();
  if (error?.code === "23505") return NextResponse.json({ error: "같은 이름의 검색이 이미 저장되어 있어요." }, { status: 409 });
  if (error) return NextResponse.json({ error: "검색 조건을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ mode: "server", savedSearch: { id: data.id, ...input, path: buildSavedSearchPath(input), createdAt: data.created_at } });
}

export async function DELETE(request: Request) {
  const parsed = savedSearchDeleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "삭제할 저장 검색을 다시 확인해 주세요." }, { status: 400 });
  const { supabase, userId } = await getAccount();
  if (!supabase) return NextResponse.json({ error: "계정 서버 설정 후 사용할 수 있어요." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { error } = await supabase.from("saved_searches").delete().eq("id", parsed.data.id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "저장 검색을 삭제하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
