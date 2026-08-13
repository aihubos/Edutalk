import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const operatorRoles = new Set(["DATA_OPERATOR", "ADMIN"]);
const institutionId = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const base = z.object({ institutionId, source: z.string().trim().min(1).max(160), checkedAt: date, isPublic: z.boolean() });
const input = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("cost"), id: z.string().uuid().optional(), item: z.string().trim().min(1).max(160), amountDisplay: z.string().trim().min(1).max(160) }),
  base.extend({ kind: z.literal("shuttle"), available: z.boolean().nullable(), zones: z.array(z.string().trim().min(1).max(80)).max(20) }),
  base.extend({ kind: z.literal("recruitment"), status: z.string().trim().max(120).nullable(), waitlist: z.string().trim().max(500).nullable() }),
  base.extend({ kind: z.literal("program"), id: z.string().uuid().optional(), name: z.string().trim().min(1).max(160), audience: z.string().trim().max(160).nullable() }),
  base.extend({ kind: z.literal("localContext"), livingArea: z.string().trim().min(1).max(120), legalDong: z.string().trim().max(120).nullable(), administrativeDong: z.string().trim().max(120).nullable(), residentialArea: z.string().trim().max(160).nullable() }),
  base.extend({ kind: z.literal("travelReference"), id: z.string().uuid().optional(), originType: z.enum(["SCHOOL", "KINDERGARTEN", "RESIDENTIAL_COMPLEX"]), originLabel: z.string().trim().min(1).max(160), distanceMeters: z.number().int().positive().nullable(), travelMinutes: z.number().int().positive().nullable(), distanceNote: z.string().trim().max(300).nullable(), travelNote: z.string().trim().max(300).nullable() }),
  base.extend({ kind: z.literal("change"), id: z.string().uuid().optional(), field: z.string().trim().min(1).max(80), summary: z.string().trim().min(1).max(1000), changedAt: date }),
  base.extend({ kind: z.literal("provenance"), field: z.string().trim().min(1).max(80), confirmedBy: z.string().trim().max(160).nullable(), trustLevel: z.enum(["PUBLIC_DATA", "INSTITUTION_CONFIRMED", "PAYMENT_ENROLLMENT_VERIFIED", "STAFF_VERIFIED", "PARENT_REPORTED", "UNVERIFIED"]) }),
  base.extend({ kind: z.literal("externalReview"), id: z.string().uuid().optional(), platform: z.string().trim().min(1).max(80), sourceLabel: z.string().trim().min(1).max(160), originalUrl: z.string().trim().url().refine((value) => value.startsWith("https://"), "HTTPS 주소만 사용할 수 있어요.").nullable(), status: z.enum(["LINK_ONLY", "UNAVAILABLE"]) }).refine((value) => value.status !== "LINK_ONLY" || Boolean(value.originalUrl), { message: "원문 링크 상태에는 HTTPS 원문 주소가 필요해요.", path: ["originalUrl"] }),
]);
const deleteInput = z.object({ kind: z.enum(["cost", "shuttle", "recruitment", "program", "localContext", "travelReference", "change", "provenance", "externalReview"]), institutionId, id: z.string().uuid().optional(), publicField: z.string().trim().min(1).max(80).optional() });

async function session() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, response: NextResponse.json({ error: "Supabase 계정 서버가 설정되지 않았어요." }, { status: 503 }) };
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !userId) return { supabase, response: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  const { data: roles, error } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (error) return { supabase, response: NextResponse.json({ error: "운영자 권한을 확인하지 못했어요." }, { status: 500 }) };
  if (!(roles ?? []).some((row) => operatorRoles.has(row.role))) return { supabase, response: NextResponse.json({ error: "기관 상세 정보 운영 권한이 없습니다." }, { status: 403 }) };
  return { supabase, response: null };
}

async function isPublicInstitution(supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>, id: string) {
  const { data, error } = await supabase.from("institutions").select("id").eq("id", id).eq("is_public", true).eq("is_synthetic", false).maybeSingle();
  return !error && Boolean(data);
}

export async function GET(request: Request) {
  const current = await session(); if (current.response) return current.response;
  const selected = new URL(request.url).searchParams.get("institutionId");
  const { data: institutions, error } = await current.supabase!.from("institutions").select("id, public_slug, name").eq("is_public", true).eq("is_synthetic", false).not("public_slug", "is", null).order("name").limit(500);
  if (error) return NextResponse.json({ error: "공개 canonical 기관을 불러오지 못했어요." }, { status: 500 });
  if (!selected) return NextResponse.json({ institutions: institutions ?? [], details: null });
  if (!institutionId.safeParse(selected).success || !await isPublicInstitution(current.supabase!, selected)) return NextResponse.json({ error: "공개 canonical 기관을 다시 선택해 주세요." }, { status: 400 });
  const [costs, shuttle, recruitment, programs, localContext, travelReferences, changes, provenance, externalReviews] = await Promise.all([
    current.supabase!.from("institution_cost_items").select("id, item_label, amount_display, source, checked_at, is_public").eq("institution_id", selected).order("checked_at", { ascending: false }),
    current.supabase!.from("institution_shuttle_info").select("institution_id, available, zones, source, checked_at, is_public").eq("institution_id", selected).maybeSingle(),
    current.supabase!.from("institution_recruitment_info").select("institution_id, status, waitlist_note, source, checked_at, is_public").eq("institution_id", selected).maybeSingle(),
    current.supabase!.from("institution_program_items").select("id, name, audience, source, checked_at, is_public").eq("institution_id", selected).order("checked_at", { ascending: false }),
    current.supabase!.from("institution_local_contexts").select("institution_id, living_area, legal_dong, administrative_dong, residential_area, source, checked_at, is_public").eq("institution_id", selected).maybeSingle(),
    current.supabase!.from("institution_travel_references").select("id, origin_type, origin_label, distance_meters, travel_minutes, distance_note, travel_note, source, checked_at, is_public").eq("institution_id", selected).order("checked_at", { ascending: false }),
    current.supabase!.from("institution_public_change_history").select("id, public_field, summary, changed_at, source, is_public").eq("institution_id", selected).order("changed_at", { ascending: false }),
    current.supabase!.from("institution_field_provenance").select("institution_id, public_field, source, checked_at, confirmed_by, trust_level, is_public").eq("institution_id", selected).order("checked_at", { ascending: false }),
    current.supabase!.from("institution_external_review_sources").select("id, platform, source_label, original_url, checked_at, status, is_public").eq("institution_id", selected).order("checked_at", { ascending: false }),
  ]);
  if (costs.error || shuttle.error || recruitment.error || programs.error || localContext.error || travelReferences.error || changes.error || provenance.error || externalReviews.error) return NextResponse.json({ error: "기관 상세 정보를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ institutions: institutions ?? [], details: { costs: costs.data ?? [], shuttle: shuttle.data, recruitment: recruitment.data, programs: programs.data ?? [], localContext: localContext.data, travelReferences: travelReferences.data ?? [], changes: changes.data ?? [], provenance: provenance.data ?? [], externalReviews: externalReviews.data ?? [] } });
}

export async function POST(request: Request) {
  const current = await session(); if (current.response) return current.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "출처, 확인일과 입력값을 다시 확인해 주세요." }, { status: 400 });
  const item = parsed.data;
  if (!await isPublicInstitution(current.supabase!, item.institutionId)) return NextResponse.json({ error: "공개 canonical 기관에만 상세 정보를 저장할 수 있어요." }, { status: 400 });
  let error: { message: string } | null = null;
  if (item.kind === "cost") { const query = current.supabase!.from("institution_cost_items"); const value = { institution_id: item.institutionId, item_label: item.item, amount_display: item.amountDisplay, source: item.source, checked_at: item.checkedAt, is_public: item.isPublic }; ({ error } = item.id ? await query.update(value).eq("id", item.id).eq("institution_id", item.institutionId) : await query.insert(value)); }
  if (item.kind === "shuttle") ({ error } = await current.supabase!.from("institution_shuttle_info").upsert({ institution_id: item.institutionId, available: item.available, zones: item.zones, source: item.source, checked_at: item.checkedAt, is_public: item.isPublic }));
  if (item.kind === "recruitment") ({ error } = await current.supabase!.from("institution_recruitment_info").upsert({ institution_id: item.institutionId, status: item.status, waitlist_note: item.waitlist, source: item.source, checked_at: item.checkedAt, is_public: item.isPublic }));
  if (item.kind === "program") { const query = current.supabase!.from("institution_program_items"); const value = { institution_id: item.institutionId, name: item.name, audience: item.audience, source: item.source, checked_at: item.checkedAt, is_public: item.isPublic }; ({ error } = item.id ? await query.update(value).eq("id", item.id).eq("institution_id", item.institutionId) : await query.insert(value)); }
  if (item.kind === "localContext") ({ error } = await current.supabase!.from("institution_local_contexts").upsert({ institution_id: item.institutionId, living_area: item.livingArea, legal_dong: item.legalDong, administrative_dong: item.administrativeDong, residential_area: item.residentialArea, source: item.source, checked_at: item.checkedAt, is_public: item.isPublic }));
  if (item.kind === "travelReference") { const query = current.supabase!.from("institution_travel_references"); const value = { institution_id: item.institutionId, origin_type: item.originType, origin_label: item.originLabel, distance_meters: item.distanceMeters, travel_minutes: item.travelMinutes, distance_note: item.distanceNote, travel_note: item.travelNote, source: item.source, checked_at: item.checkedAt, is_public: item.isPublic }; ({ error } = item.id ? await query.update(value).eq("id", item.id).eq("institution_id", item.institutionId) : await query.insert(value)); }
  if (item.kind === "change") { const query = current.supabase!.from("institution_public_change_history"); const value = { institution_id: item.institutionId, public_field: item.field, summary: item.summary, changed_at: item.changedAt, source: item.source, is_public: item.isPublic }; ({ error } = item.id ? await query.update(value).eq("id", item.id).eq("institution_id", item.institutionId) : await query.insert(value)); }
  if (item.kind === "provenance") ({ error } = await current.supabase!.from("institution_field_provenance").upsert({ institution_id: item.institutionId, public_field: item.field, source: item.source, checked_at: item.checkedAt, confirmed_by: item.confirmedBy, trust_level: item.trustLevel, is_public: item.isPublic }));
  if (item.kind === "externalReview") { const query = current.supabase!.from("institution_external_review_sources"); const value = { institution_id: item.institutionId, platform: item.platform, source_label: item.sourceLabel, original_url: item.status === "LINK_ONLY" ? item.originalUrl : null, checked_at: item.checkedAt, status: item.status, is_public: item.isPublic }; ({ error } = item.id ? await query.update(value).eq("id", item.id).eq("institution_id", item.institutionId) : await query.insert(value)); }
  if (error) return NextResponse.json({ error: "기관 상세 정보를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const current = await session(); if (current.response) return current.response;
  const parsed = deleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "삭제할 상세 정보를 다시 확인해 주세요." }, { status: 400 });
  const item = parsed.data;
  if ((item.kind === "cost" || item.kind === "program" || item.kind === "travelReference" || item.kind === "change" || item.kind === "externalReview") && !item.id) return NextResponse.json({ error: "삭제할 항목을 다시 확인해 주세요." }, { status: 400 });
  if (item.kind === "provenance" && !item.publicField) return NextResponse.json({ error: "삭제할 공개 필드를 다시 확인해 주세요." }, { status: 400 });
  const result = item.kind === "cost"
    ? await current.supabase!.from("institution_cost_items").delete().eq("institution_id", item.institutionId).eq("id", item.id!)
    : item.kind === "shuttle"
      ? await current.supabase!.from("institution_shuttle_info").delete().eq("institution_id", item.institutionId)
      : item.kind === "recruitment"
        ? await current.supabase!.from("institution_recruitment_info").delete().eq("institution_id", item.institutionId)
        : item.kind === "localContext"
          ? await current.supabase!.from("institution_local_contexts").delete().eq("institution_id", item.institutionId)
        : item.kind === "program"
          ? await current.supabase!.from("institution_program_items").delete().eq("institution_id", item.institutionId).eq("id", item.id!)
          : item.kind === "travelReference"
            ? await current.supabase!.from("institution_travel_references").delete().eq("institution_id", item.institutionId).eq("id", item.id!)
          : item.kind === "change"
            ? await current.supabase!.from("institution_public_change_history").delete().eq("institution_id", item.institutionId).eq("id", item.id!)
            : item.kind === "externalReview"
              ? await current.supabase!.from("institution_external_review_sources").delete().eq("institution_id", item.institutionId).eq("id", item.id!)
              : await current.supabase!.from("institution_field_provenance").delete().eq("institution_id", item.institutionId).eq("public_field", item.publicField!);
  const { error } = result;
  if (error) return NextResponse.json({ error: "기관 상세 정보를 삭제하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
