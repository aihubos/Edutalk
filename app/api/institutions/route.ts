import { NextResponse } from "next/server";
import { getPublicCanonicalInstitutions } from "@/lib/canonical-institutions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireFeatureFlag } from "@/lib/feature-flags";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ mode: "demo", institutions: [] });
  const disabled = await requireFeatureFlag("PUBLIC_DATA_DISCOVERY"); if (disabled) return disabled;
  const result = await getPublicCanonicalInstitutions();
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ mode: "canonical", institutions: result.institutions });
}
