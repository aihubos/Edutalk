import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InstitutionType } from "@/lib/types";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { CanonicalExternalReviewSource } from "@/lib/external-review-data";

export type CanonicalInstitutionZone = "DONGTAN_1" | "DONGTAN_2" | "OTHER";

export interface CanonicalInstitution {
  id: string;
  publicSlug: string;
  name: string;
  address: string;
  zone: CanonicalInstitutionZone;
  type: InstitutionType;
  checkedAt: string | null;
  phone: string | null;
  homepageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  costs: CanonicalInstitutionCost[];
  shuttle: CanonicalInstitutionShuttle | null;
  recruitment: CanonicalInstitutionRecruitment | null;
  programs: CanonicalInstitutionProgram[];
  localContext: CanonicalInstitutionLocalContext | null;
  travelReferences: CanonicalInstitutionTravelReference[];
  changeHistory: CanonicalInstitutionChange[];
  provenance: CanonicalInstitutionProvenance[];
  publicHandlingTimeline: CanonicalInstitutionHandlingEvent[];
  externalReviewSources: CanonicalExternalReviewSource[];
}

export type CanonicalInstitutionCost = { item: string; amountDisplay: string; source: string; checkedAt: string };
export type CanonicalInstitutionShuttle = { available: boolean | null; zones: string[]; source: string; checkedAt: string };
export type CanonicalInstitutionRecruitment = { status: string | null; waitlist: string | null; source: string; checkedAt: string };
export type CanonicalInstitutionProgram = { name: string; audience: string | null; source: string; checkedAt: string };
export type CanonicalInstitutionLocalContext = { livingArea: string; legalDong: string | null; administrativeDong: string | null; residentialArea: string | null; source: string; checkedAt: string };
export type CanonicalInstitutionTravelReference = { originType: "SCHOOL" | "KINDERGARTEN" | "RESIDENTIAL_COMPLEX"; originLabel: string; distanceMeters: number | null; travelMinutes: number | null; distanceNote: string | null; travelNote: string | null; source: string; checkedAt: string };
export type CanonicalInstitutionChange = { field: string; summary: string; changedAt: string; source: string };
export type CanonicalInstitutionProvenance = { field: string; source: string; checkedAt: string; confirmedBy: string | null; trustLevel: "PUBLIC_DATA" | "INSTITUTION_CONFIRMED" | "PAYMENT_ENROLLMENT_VERIFIED" | "STAFF_VERIFIED" | "PARENT_REPORTED" | "UNVERIFIED" };
export type CanonicalInstitutionHandlingEvent = { kind: "CORRECTION" | "REPORT"; outcome: "APPROVED" | "REJECTED" | "CANCELLED" | "TEMPORARILY_HIDDEN" | "UPHELD" | "RESTORED" | "CLOSED"; handledAt: string };

type CanonicalInstitutionRow = {
  id: string;
  public_slug: string;
  name: string;
  address: string;
  zone: CanonicalInstitutionZone;
  institution_type: InstitutionType;
  checked_at: string | null;
  phone: string | null;
  homepage_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type DetailRows = {
  costs: Array<{ item_label: string; amount_display: string; source: string; checked_at: string }>;
  shuttle: { available: boolean | null; zones: string[] | null; source: string; checked_at: string } | null;
  recruitment: { status: string | null; waitlist_note: string | null; source: string; checked_at: string } | null;
  programs: Array<{ name: string; audience: string | null; source: string; checked_at: string }>;
  localContext: { living_area: string; legal_dong: string | null; administrative_dong: string | null; residential_area: string | null; source: string; checked_at: string } | null;
  travelReferences: Array<{ origin_type: CanonicalInstitutionTravelReference["originType"]; origin_label: string; distance_meters: number | null; travel_minutes: number | null; distance_note: string | null; travel_note: string | null; source: string; checked_at: string }>;
  changes: Array<{ public_field: string; summary: string; changed_at: string; source: string }>;
  provenance: Array<{ public_field: string; source: string; checked_at: string; confirmed_by: string | null; trust_level: CanonicalInstitutionProvenance["trustLevel"] }>;
  timeline: CanonicalInstitutionHandlingEvent[];
  externalReviewSources: CanonicalExternalReviewSource[];
};

function toCanonicalInstitution(row: CanonicalInstitutionRow, details: DetailRows = { costs: [], shuttle: null, recruitment: null, programs: [], localContext: null, travelReferences: [], changes: [], provenance: [], timeline: [], externalReviewSources: [] }): CanonicalInstitution {
  return {
    id: row.id,
    publicSlug: row.public_slug,
    name: row.name,
    address: row.address,
    zone: row.zone,
    type: row.institution_type,
    checkedAt: row.checked_at,
    phone: row.phone,
    homepageUrl: row.homepage_url,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    costs: details.costs.map((item) => ({ item: item.item_label, amountDisplay: item.amount_display, source: item.source, checkedAt: item.checked_at })),
    shuttle: details.shuttle ? { available: details.shuttle.available, zones: details.shuttle.zones ?? [], source: details.shuttle.source, checkedAt: details.shuttle.checked_at } : null,
    recruitment: details.recruitment ? { status: details.recruitment.status, waitlist: details.recruitment.waitlist_note, source: details.recruitment.source, checkedAt: details.recruitment.checked_at } : null,
    programs: details.programs.map((item) => ({ name: item.name, audience: item.audience, source: item.source, checkedAt: item.checked_at })),
    localContext: details.localContext ? { livingArea: details.localContext.living_area, legalDong: details.localContext.legal_dong, administrativeDong: details.localContext.administrative_dong, residentialArea: details.localContext.residential_area, source: details.localContext.source, checkedAt: details.localContext.checked_at } : null,
    travelReferences: details.travelReferences.map((item) => ({ originType: item.origin_type, originLabel: item.origin_label, distanceMeters: item.distance_meters, travelMinutes: item.travel_minutes, distanceNote: item.distance_note, travelNote: item.travel_note, source: item.source, checkedAt: item.checked_at })),
    changeHistory: details.changes.map((item) => ({ field: item.public_field, summary: item.summary, changedAt: item.changed_at, source: item.source })),
    provenance: details.provenance.map((item) => ({ field: item.public_field, source: item.source, checkedAt: item.checked_at, confirmedBy: item.confirmed_by, trustLevel: item.trust_level })),
    publicHandlingTimeline: details.timeline,
    externalReviewSources: details.externalReviewSources,
  };
}

export async function getPublicCanonicalInstitutions() {
  if (!await isFeatureEnabled("PUBLIC_DATA_DISCOVERY")) return { institutions: [] as CanonicalInstitution[], error: "현재 운영 설정으로 기관 탐색을 잠시 중지했어요." };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { institutions: [] as CanonicalInstitution[], error: "공개 기관 데이터 연결을 준비하지 못했어요." };

  const { data, error } = await supabase
    .from("institutions")
    .select("id, public_slug, name, address, zone, institution_type, checked_at, phone, homepage_url, latitude, longitude")
    .eq("is_public", true)
    .eq("is_synthetic", false)
    .not("public_slug", "is", null)
    .order("checked_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return { institutions: [] as CanonicalInstitution[], error: "공개 기관 정보를 불러오지 못했어요." };
  return { institutions: (data as CanonicalInstitutionRow[] ?? []).map((row) => toCanonicalInstitution(row)), error: null };
}

export async function getPublicCanonicalInstitution(publicSlug: string) {
  if (!await isFeatureEnabled("PUBLIC_DATA_DISCOVERY")) return { institution: null, error: "현재 운영 설정으로 기관 탐색을 잠시 중지했어요." };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { institution: null, error: "공개 기관 데이터 연결을 준비하지 못했어요." };

  const { data, error } = await supabase
    .from("institutions")
    .select("id, public_slug, name, address, zone, institution_type, checked_at, phone, homepage_url, latitude, longitude")
    .eq("public_slug", publicSlug)
    .eq("is_public", true)
    .eq("is_synthetic", false)
    .maybeSingle();

  if (error) return { institution: null, error: "공개 기관 정보를 불러오지 못했어요." };
  if (!data) return { institution: null, error: null };

  const institutionId = (data as CanonicalInstitutionRow).id;
  const [costs, shuttle, recruitment, programs, localContext, travelReferences, changes, provenance, timeline, externalReviewSources] = await Promise.all([
    supabase.from("institution_cost_items").select("item_label, amount_display, source, checked_at").eq("institution_id", institutionId).eq("is_public", true).order("checked_at", { ascending: false }),
    supabase.from("institution_shuttle_info").select("available, zones, source, checked_at").eq("institution_id", institutionId).eq("is_public", true).maybeSingle(),
    supabase.from("institution_recruitment_info").select("status, waitlist_note, source, checked_at").eq("institution_id", institutionId).eq("is_public", true).maybeSingle(),
    supabase.from("institution_program_items").select("name, audience, source, checked_at").eq("institution_id", institutionId).eq("is_public", true).order("checked_at", { ascending: false }),
    supabase.from("institution_local_contexts").select("living_area, legal_dong, administrative_dong, residential_area, source, checked_at").eq("institution_id", institutionId).eq("is_public", true).maybeSingle(),
    supabase.from("institution_travel_references").select("origin_type, origin_label, distance_meters, travel_minutes, distance_note, travel_note, source, checked_at").eq("institution_id", institutionId).eq("is_public", true).order("checked_at", { ascending: false }),
    supabase.from("institution_public_change_history").select("public_field, summary, changed_at, source").eq("institution_id", institutionId).eq("is_public", true).order("changed_at", { ascending: false }).limit(30),
    supabase.from("institution_field_provenance").select("public_field, source, checked_at, confirmed_by, trust_level").eq("institution_id", institutionId).eq("is_public", true).order("checked_at", { ascending: false }),
    supabase.rpc("get_public_institution_handling_timeline", { target_slug: publicSlug }),
    supabase.from("institution_external_review_sources").select("platform, source_label, original_url, checked_at, status, is_public").eq("institution_id", institutionId).eq("is_public", true).order("checked_at", { ascending: false }),
  ]);
  if (costs.error || shuttle.error || recruitment.error || programs.error || localContext.error || travelReferences.error || changes.error || provenance.error || timeline.error || externalReviewSources.error) return { institution: null, error: "공개 기관 상세 정보를 불러오지 못했어요." };
  return {
    institution: toCanonicalInstitution(data as CanonicalInstitutionRow, {
      costs: costs.data ?? [], shuttle: shuttle.data, recruitment: recruitment.data, programs: programs.data ?? [], localContext: localContext.data, travelReferences: travelReferences.data ?? [], changes: changes.data ?? [], provenance: provenance.data ?? [], timeline: (timeline.data ?? []) as CanonicalInstitutionHandlingEvent[], externalReviewSources: (externalReviewSources.data ?? []).map((item) => ({ platform: item.platform, sourceLabel: item.source_label, originalUrl: item.original_url, checkedAt: item.checked_at, status: item.status as "LINK_ONLY" | "UNAVAILABLE", isPublic: item.is_public })),
    }),
    error: null,
  };
}
