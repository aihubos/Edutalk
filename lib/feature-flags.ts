import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const featureFlagKeys = ["AI_GENERATION", "REVIEW_SUBMISSION", "TUTOR_WRITE", "BILLING_CHECKOUT", "PUBLIC_DATA_DISCOVERY"] as const;
export type FeatureFlagKey = (typeof featureFlagKeys)[number];

export async function isFeatureEnabled(key: FeatureFlagKey) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("is_feature_enabled", { feature_key: key });
  return !error && data === true;
}

export async function requireFeatureFlag(key: FeatureFlagKey) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("is_feature_enabled", { feature_key: key });
  if (error) return NextResponse.json({ error: "운영 설정을 확인하지 못해 이 기능을 잠시 사용할 수 없어요." }, { status: 503 });
  if (data !== true) return NextResponse.json({ error: "현재 운영 설정으로 이 기능은 잠시 사용할 수 없어요." }, { status: 503 });
  return null;
}
