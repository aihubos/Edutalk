import type { SupabaseClient } from "@supabase/supabase-js";

export type InstitutionProvider = "CHILDCARE" | "KINDERGARTEN" | "NEIS";
export type InstitutionZone = "DONGTAN_1" | "DONGTAN_2" | "OTHER";
export type EtlInstitutionType = "CHILDCARE" | "KINDERGARTEN" | "ACADEMY" | "TUTORING";
export type InstitutionOperatingStatus = "ACTIVE" | "SUSPENDED" | "CLOSED" | "UNKNOWN";

export interface RawSourceRecord {
  provider: InstitutionProvider;
  sourceRecordId: string;
  fetchedAt: string;
  payload: Record<string, unknown>;
}

export interface NormalizedInstitutionRecord {
  provider: InstitutionProvider;
  sourceRecordId: string;
  institutionType: EtlInstitutionType;
  name: string;
  address: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  homepageUrl?: string;
  operatingStatus: InstitutionOperatingStatus;
  sourceOperatingStatus?: string;
  zone: InstitutionZone;
  duplicateCandidateKey: string;
}

export interface DongtanZoneRules {
  dongtan1AdministrativeDongs: string[];
  dongtan2AdministrativeDongs: string[];
  ambiguousAdministrativeDongs: string[];
  dongtan1PostalPrefixes: string[];
  dongtan2PostalPrefixes: string[];
  coordinateBounds: Array<{ zone: Exclude<InstitutionZone, "OTHER">; minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }>;
}

export const dongtanZoneRules: DongtanZoneRules = {
  // 법정동 문자열은 좌표 경계가 없는 파일을 위한 보수적인 보조 규칙이다.
  // 반송동·석우동은 동탄(1)·(2) 사업지구에 모두 걸쳐 있어 자동 공개하지 않는다.
  dongtan1AdministrativeDongs: ["능동"],
  dongtan2AdministrativeDongs: ["금곡동", "목동", "방교동", "산척동", "송동", "신동", "영천동", "여울동", "오산동", "장지동", "중동", "청계동"],
  ambiguousAdministrativeDongs: ["반송동", "석우동"],
  dongtan1PostalPrefixes: [],
  dongtan2PostalPrefixes: [],
  coordinateBounds: [],
};

export interface SyncReport {
  source: InstitutionProvider;
  started: string;
  finished: string;
  recordsSeen: number;
  normalized: number;
  duplicates: number;
  outOfZone: number;
  errors: string[];
}

export interface SyncWriteReport extends SyncReport {
  recordsCreated: number;
  recordsUpdated: number;
  qualityIssues: number;
}

type AdminDatabaseClient = Pick<SupabaseClient, "from">;

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .replace(/[()\[\],.·-]/g, "");
}

export function normalizeAddress(value: unknown) {
  const address = String(value ?? "")
    .trim()
    .replace(/화성특례시\s+/g, "화성시 ")
    .replace(/화성시\s+/g, "화성시 ")
    .replace(/\s+/g, " ");
  return /화성시/.test(address) ? replaceLegalDong(address, "오산동", "여울동") : address;
}

export function classifyDongtanZone(record: Pick<NormalizedInstitutionRecord, "address" | "postalCode" | "latitude" | "longitude">, rules = dongtanZoneRules): InstitutionZone {
  if (record.latitude !== undefined && record.longitude !== undefined) {
    const match = rules.coordinateBounds.find((bound) => record.latitude! >= bound.minLatitude && record.latitude! <= bound.maxLatitude && record.longitude! >= bound.minLongitude && record.longitude! <= bound.maxLongitude);
    if (match) return match.zone;
  }
  const address = normalizeAddress(record.address);
  if (!/화성시/.test(address)) return "OTHER";
  if (rules.dongtan1AdministrativeDongs.some((dong) => addressHasLegalDong(address, dong))) return "DONGTAN_1";
  if (rules.dongtan2AdministrativeDongs.some((dong) => addressHasLegalDong(address, dong))) return "DONGTAN_2";
  if (record.postalCode && rules.dongtan1PostalPrefixes.some((prefix) => record.postalCode?.startsWith(prefix))) return "DONGTAN_1";
  if (record.postalCode && rules.dongtan2PostalPrefixes.some((prefix) => record.postalCode?.startsWith(prefix))) return "DONGTAN_2";
  return "OTHER";
}

export function addressHasLegalDong(address: string, legalDong: string) {
  const escaped = legalDong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s(])${escaped}(?=$|[\\s),0-9-])`).test(address);
}

function replaceLegalDong(address: string, before: string, after: string) {
  const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return address.replace(new RegExp(`(^|[\\s(])${escaped}(?=$|[\\s),0-9-])`, "g"), `$1${after}`);
}

export function duplicateCandidateKey(record: Pick<NormalizedInstitutionRecord, "institutionType" | "name" | "address">) {
  return [record.institutionType, normalizeText(record.name), normalizeText(record.address)].join(":");
}

/** 공급자 원본 ID만 사용해 안정적인 공개 주소를 만든다. 이름·주소 변경으로 URL이 바뀌지 않는다. */
export function stablePublicSlug(provider: InstitutionProvider, sourceRecordId: string) {
  const encodedId = Array.from(sourceRecordId.trim().toLocaleLowerCase("en-US"))
    .map((character) => /[a-z0-9]/.test(character) ? character : character.codePointAt(0)?.toString(36) ?? "")
    .filter(Boolean)
    .join("-");
  const slug = `${provider.toLocaleLowerCase("en-US")}-${encodedId}`.replace(/-+/g, "-");
  return slug.length > 0 && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

export function normalizeRawRecord(raw: RawSourceRecord): NormalizedInstitutionRecord {
  const payload = raw.payload;
  const name = String(payload.name ?? payload.institutionName ?? "").trim();
  const address = normalizeAddress(payload.address ?? payload.roadAddress ?? "");
  const institutionType = String(payload.institutionType ?? providerInstitutionType(raw.provider)) as EtlInstitutionType;
  const operatingStatus: InstitutionOperatingStatus = payload.operatingStatus === "ACTIVE" || payload.operatingStatus === "SUSPENDED" || payload.operatingStatus === "CLOSED" || payload.operatingStatus === "UNKNOWN"
    ? payload.operatingStatus
    : raw.provider === "NEIS" ? "UNKNOWN" : "ACTIVE";
  const record = {
    provider: raw.provider,
    sourceRecordId: raw.sourceRecordId,
    institutionType,
    name,
    address,
    postalCode: stringOrUndefined(payload.postalCode),
    latitude: numberOrUndefined(payload.latitude),
    longitude: numberOrUndefined(payload.longitude),
    phone: publicPhoneOrUndefined(payload.phone),
    homepageUrl: publicHomepageOrUndefined(payload.homepageUrl ?? payload.homepage_url),
    operatingStatus,
    sourceOperatingStatus: stringOrUndefined(payload.sourceOperatingStatus),
    zone: "OTHER" as InstitutionZone,
    duplicateCandidateKey: "",
  };
  record.zone = classifyDongtanZone(record);
  record.duplicateCandidateKey = duplicateCandidateKey(record);
  return record;
}

export function buildSyncReport(source: InstitutionProvider, records: RawSourceRecord[], started = new Date().toISOString()): SyncReport {
  const errors: string[] = [];
  const duplicateKeys = new Set<string>();
  let normalized = 0;
  let duplicates = 0;
  let outOfZone = 0;

  records.forEach((raw) => {
    try {
      const record = normalizeRawRecord(raw);
      if (!record.name || !record.address) throw new Error(`${raw.sourceRecordId}: 기관명 또는 주소가 없습니다.`);
      normalized += 1;
      if (record.zone === "OTHER") outOfZone += 1;
      if (duplicateKeys.has(record.duplicateCandidateKey)) duplicates += 1;
      duplicateKeys.add(record.duplicateCandidateKey);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${raw.sourceRecordId}: 정규화 실패`);
    }
  });

  return { source, started, finished: new Date().toISOString(), recordsSeen: records.length, normalized, duplicates, outOfZone, errors };
}

export async function fetchProviderRecords(provider: InstitutionProvider): Promise<RawSourceRecord[]> {
  const prefix = provider === "CHILDCARE" ? "CHILDCARE" : provider === "KINDERGARTEN" ? "KINDERGARTEN" : "NEIS";
  const url = process.env[`${prefix}_API_URL`]?.trim();
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim();
  if (!url || !apiKey) throw new Error(`${prefix}_API_URL 및 ${prefix}_API_KEY가 모두 필요합니다.`);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`${provider} 응답 실패: ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error(`${provider} JSON은 RawSourceRecord 배열이어야 합니다.`);
  return payload.map((item) => ({ provider, fetchedAt: new Date().toISOString(), ...(item as Omit<RawSourceRecord, "provider" | "fetchedAt">) }));
}

/**
 * `--write` 전용 적재 경로다. 원본 ID가 같은 공급자 레코드만 기존 canonical 기관에 갱신하고,
 * 이름·주소가 같은 다른 후보는 절대 병합하지 않으며 운영 품질 큐에만 남긴다.
 */
export async function writeProviderRecords(admin: AdminDatabaseClient, provider: InstitutionProvider, records: RawSourceRecord[], started = new Date().toISOString()): Promise<SyncWriteReport> {
  const run = await admin.from("data_sync_runs").insert({ source_system: provider, status: "RUNNING", started_at: started, records_seen: records.length }).select("id").single();
  if (run.error || !run.data?.id) throw new Error(`${provider} 적재 실행 이력을 만들지 못했어요.`);
  const runId = String(run.data.id);
  const report: SyncWriteReport = { ...buildSyncReport(provider, records, started), recordsCreated: 0, recordsUpdated: 0, qualityIssues: 0 };
  const errors = [...report.errors];

  const addQualityIssue = async (issueType: string, summary: string, institutionId?: string) => {
    const existing = await admin.from("data_quality_issues").select("id").eq("issue_type", issueType).eq("summary", summary).eq("status", "OPEN").limit(1).maybeSingle();
    if (existing.data) return;
    const issue = await admin.from("data_quality_issues").insert({ sync_run_id: runId, institution_id: institutionId ?? null, issue_type: issueType, summary: summary.slice(0, 1000), status: "OPEN" });
    if (issue.error) throw new Error("데이터 품질 큐를 저장하지 못했어요.");
    report.qualityIssues += 1;
  };

  try {
    for (const raw of records) {
      try {
        const normalized = normalizeRawRecord(raw);
        if (!normalized.name || !normalized.address) {
          await addQualityIssue("MISSING_REQUIRED_FIELD", `${provider}:${raw.sourceRecordId} 기관명 또는 주소가 없습니다.`);
          continue;
        }
        const rawResult = await admin.from("raw_source_records").upsert({ provider: raw.provider, source_record_id: raw.sourceRecordId, fetched_at: raw.fetchedAt, payload: raw.payload }, { onConflict: "provider,source_record_id,fetched_at" }).select("id").single();
        if (rawResult.error || !rawResult.data?.id) throw new Error(`${raw.sourceRecordId}: 원본 레코드를 저장하지 못했어요.`);

        const existingLink = await admin.from("institution_source_links").select("institution_id").eq("provider", provider).eq("source_record_id", raw.sourceRecordId).maybeSingle();
        if (existingLink.error) throw new Error(`${raw.sourceRecordId}: 기존 기관 연결을 확인하지 못했어요.`);
        const canonicalFields = {
          institution_type: normalized.institutionType,
          name: normalized.name,
          address: normalized.address,
          zone: normalized.zone,
          latitude: normalized.latitude ?? null,
          longitude: normalized.longitude ?? null,
          phone: normalized.phone ?? null,
          homepage_url: normalized.homepageUrl ?? null,
          operating_status: normalized.operatingStatus,
          is_public: normalized.zone !== "OTHER" && normalized.operatingStatus === "ACTIVE",
          is_synthetic: false,
          checked_at: raw.fetchedAt,
          updated_at: new Date().toISOString(),
        };
        let institutionId = existingLink.data?.institution_id ? String(existingLink.data.institution_id) : null;

        if (institutionId) {
          const updated = await admin.from("institutions").update(canonicalFields).eq("id", institutionId);
          if (updated.error) throw new Error(`${raw.sourceRecordId}: canonical 기관을 갱신하지 못했어요.`);
          report.recordsUpdated += 1;
        } else {
          const slug = stablePublicSlug(provider, raw.sourceRecordId);
          if (!slug) {
            await addQualityIssue("INVALID_PUBLIC_SLUG", `${provider}:${raw.sourceRecordId} 공개 주소를 만들 수 없습니다.`);
            continue;
          }
          const slugConflict = await admin.from("institutions").select("id").eq("public_slug", slug).maybeSingle();
          if (slugConflict.error) throw new Error(`${raw.sourceRecordId}: 공개 주소 중복을 확인하지 못했어요.`);
          if (slugConflict.data) {
            await addQualityIssue("PUBLIC_SLUG_COLLISION", `${provider}:${raw.sourceRecordId} 공개 주소 충돌 후보 ${slug}입니다.`, String(slugConflict.data.id));
            continue;
          }
          const candidates = await admin.from("institutions").select("id").eq("institution_type", normalized.institutionType).eq("name", normalized.name).eq("address", normalized.address).limit(2);
          if (candidates.error) throw new Error(`${raw.sourceRecordId}: 중복 후보를 확인하지 못했어요.`);
          const created = await admin.from("institutions").insert({ ...canonicalFields, public_slug: slug }).select("id").single();
          if (created.error || !created.data?.id) throw new Error(`${raw.sourceRecordId}: canonical 기관을 만들지 못했어요.`);
          institutionId = String(created.data.id);
          report.recordsCreated += 1;
          if ((candidates.data ?? []).length > 0) await addQualityIssue("DUPLICATE_CANDIDATE", `${provider}:${raw.sourceRecordId} 기존 기관과 이름·주소이 일치하는 병합 후보입니다. 자동 병합하지 않았습니다.`, institutionId);
        }

        const link = await admin.from("institution_source_links").upsert({ institution_id: institutionId, raw_source_record_id: rawResult.data.id, provider, source_record_id: raw.sourceRecordId, linked_at: new Date().toISOString() }, { onConflict: "provider,source_record_id" });
        if (link.error) throw new Error(`${raw.sourceRecordId}: 원본과 canonical 기관을 연결하지 못했어요.`);
        if (normalized.zone === "OTHER") await addQualityIssue("OUT_OF_SERVICE_ZONE", `${provider}:${raw.sourceRecordId} 서비스 지역 밖이거나 지역 확인이 필요합니다.`, institutionId);
        if (provider === "NEIS") {
          const sourceStatus = normalized.sourceOperatingStatus ?? "상태값 없음";
          const historySource = `${provider}_MANUAL_IMPORT`;
          const existingHistory = await admin.from("institution_operation_status_history").select("id").eq("institution_id", institutionId).eq("source", historySource).eq("checked_at", raw.fetchedAt).limit(1).maybeSingle();
          if (existingHistory.error) throw new Error(`${raw.sourceRecordId}: 기존 운영 상태 이력을 확인하지 못했어요.`);
          if (!existingHistory.data) {
            const statusHistory = await admin.from("institution_operation_status_history").insert({ institution_id: institutionId, operating_status: normalized.operatingStatus, source_status: sourceStatus, source: historySource, checked_at: raw.fetchedAt });
            if (statusHistory.error) throw new Error(`${raw.sourceRecordId}: 운영 상태 이력을 저장하지 못했어요.`);
          }
          if (normalized.operatingStatus !== "ACTIVE") {
            const issueType = normalized.operatingStatus === "UNKNOWN" ? "UNKNOWN_OPERATION_STATUS" : "INACTIVE_OPERATION_STATUS";
            await addQualityIssue(issueType, `${provider}:${raw.sourceRecordId} 운영 상태가 ${sourceStatus}여서 공개하지 않았습니다.`, institutionId);
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${raw.sourceRecordId}: 적재 실패`);
      }
    }
    report.errors = errors;
    report.finished = new Date().toISOString();
    const status = errors.length === 0 ? "SUCCEEDED" : report.recordsCreated + report.recordsUpdated > 0 ? "PARTIAL" : "FAILED";
    const finished = await admin.from("data_sync_runs").update({ status, finished_at: report.finished, records_seen: report.recordsSeen, records_created: report.recordsCreated, records_updated: report.recordsUpdated, error_summary: errors.length ? errors.join("\n").slice(0, 4000) : null }).eq("id", runId);
    if (finished.error) throw new Error(`${provider} 적재 실행 결과를 저장하지 못했어요.`);
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${provider} 적재 실패`;
    await admin.from("data_sync_runs").update({ status: "FAILED", finished_at: new Date().toISOString(), error_summary: message.slice(0, 4000) }).eq("id", runId);
    throw error;
  }
}

export const dryRunFixtures: Record<InstitutionProvider, RawSourceRecord[]> = {
  CHILDCARE: [{ provider: "CHILDCARE", sourceRecordId: "fixture-childcare-1", fetchedAt: "2026-08-13T00:00:00.000Z", payload: { name: "체험 동탄 어린이집", address: "경기도 화성시 산척동 1", institutionType: "CHILDCARE" } }],
  KINDERGARTEN: [{ provider: "KINDERGARTEN", sourceRecordId: "fixture-kindergarten-1", fetchedAt: "2026-08-13T00:00:00.000Z", payload: { name: "체험 목동 유치원", address: "경기도 화성시 목동 2", institutionType: "KINDERGARTEN" } }],
  NEIS: [{ provider: "NEIS", sourceRecordId: "fixture-neis-1", fetchedAt: "2026-08-13T00:00:00.000Z", payload: { name: "체험 청계 학원", address: "경기도 화성시 청계동 3", institutionType: "ACADEMY" } }, { provider: "NEIS", sourceRecordId: "fixture-neis-2", fetchedAt: "2026-08-13T00:00:00.000Z", payload: { name: "체험 청계 학원", address: "경기도 화성시 청계동 3", institutionType: "ACADEMY" } }],
};

function providerInstitutionType(provider: InstitutionProvider): EtlInstitutionType {
  if (provider === "CHILDCARE") return "CHILDCARE";
  if (provider === "KINDERGARTEN") return "KINDERGARTEN";
  return "ACADEMY";
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function publicPhoneOrUndefined(value: unknown) {
  const phone = stringOrUndefined(value);
  return phone && /^[0-9()\s+.-]{6,30}$/.test(phone) ? phone : undefined;
}

function publicHomepageOrUndefined(value: unknown) {
  const url = stringOrUndefined(value);
  try { return url && new URL(url).protocol === "https:" ? url : undefined; } catch { return undefined; }
}
