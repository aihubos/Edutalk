import { NextResponse } from "next/server";
import { getPublicCanonicalInstitution } from "@/lib/canonical-institutions";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ mode: "demo", timeline: [] });
  const { id } = await params;
  if (!slugPattern.test(id)) return NextResponse.json({ error: "기관 주소를 다시 확인해 주세요." }, { status: 400 });
  const result = await getPublicCanonicalInstitution(id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  if (!result.institution) return NextResponse.json({ error: "공개 기관 정보를 찾지 못했어요." }, { status: 404 });
  return NextResponse.json({ mode: "canonical", timeline: result.institution.publicHandlingTimeline });
}
