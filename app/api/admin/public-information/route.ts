import { NextResponse } from "next/server";
import {
  publicInformationDeleteSchema,
  publicInformationInputSchema,
  publicInformationOperatorSession,
  publicInformationUpdateSchema,
  toPublicInformationItem,
  toPublicInformationRow,
} from "@/lib/public-information-server";

const selectColumns = "id, title, summary, audience_roles, category, organizer, application_period, status, region, source_url, source_label, source_date, is_public, updated_at";

export async function GET() {
  const current = await publicInformationOperatorSession();
  if (current.response) return NextResponse.json({ error: current.response.error }, { status: current.response.status });

  const { data, error } = await current.supabase!.from("public_information_items").select(selectColumns).order("source_date", { ascending: false }).order("updated_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "정책·행사 목록을 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ items: (data ?? []).map((row) => toPublicInformationItem(row) ) });
}

export async function POST(request: Request) {
  const current = await publicInformationOperatorSession();
  if (current.response) return NextResponse.json({ error: current.response.error }, { status: current.response.status });
  const parsed = publicInformationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 다시 확인해 주세요." }, { status: 400 });

  const { data, error } = await current.supabase!.from("public_information_items").insert(toPublicInformationRow(parsed.data)).select(selectColumns).single();
  if (error || !data) return NextResponse.json({ error: "정책·행사 항목을 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ item: toPublicInformationItem(data) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const current = await publicInformationOperatorSession();
  if (current.response) return NextResponse.json({ error: current.response.error }, { status: current.response.status });
  const parsed = publicInformationUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 다시 확인해 주세요." }, { status: 400 });

  const { id, ...input } = parsed.data;
  const { data, error } = await current.supabase!.from("public_information_items").update(toPublicInformationRow(input)).eq("id", id).select(selectColumns).maybeSingle();
  if (error) return NextResponse.json({ error: "정책·행사 항목을 수정하지 못했어요." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "수정할 항목을 찾을 수 없어요." }, { status: 404 });
  return NextResponse.json({ item: toPublicInformationItem(data) });
}

export async function DELETE(request: Request) {
  const current = await publicInformationOperatorSession();
  if (current.response) return NextResponse.json({ error: current.response.error }, { status: current.response.status });
  const parsed = publicInformationDeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "삭제할 항목을 다시 확인해 주세요." }, { status: 400 });

  const { data, error } = await current.supabase!.from("public_information_items").delete().eq("id", parsed.data.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "정책·행사 항목을 삭제하지 못했어요." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "삭제할 항목을 찾을 수 없어요." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
