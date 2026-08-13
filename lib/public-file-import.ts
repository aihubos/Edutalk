import { readFile, stat } from "node:fs/promises";
import {
  classifyDongtanZone,
  dongtanZoneRules,
  addressHasLegalDong,
  type InstitutionProvider,
  type RawSourceRecord,
} from "@/lib/institution-etl";

const maxFileBytes = 50 * 1024 * 1024;

export interface PublicFileImportOptions {
  filePath: string;
  provider: InstitutionProvider;
  checkedAt: string;
}

export interface PublicFileImportResult {
  records: RawSourceRecord[];
  sourceRows: number;
  skippedOutOfArea: number;
  errors: string[];
  inputEncoding: "UTF-8" | "EUC-KR";
  inputFormat: "CSV" | "TSV" | "JSON";
}

type InputRow = Record<string, unknown>;

const headerAliases = {
  sourceRecordId: ["관리번호", "학원등록번호", "유치원코드", "어린이집코드", "기관코드", "시설코드", "고유번호", "mng_no", "mngno", "source record id", "source_record_id", "record id", "record_id", "management number", "academy registration number", "kindergarten code", "childcare code", "institution code"],
  name: ["기관명", "학원명", "교습소명", "유치원명", "어린이집명", "기관명칭", "시설명", "사업장명", "업소명", "name", "bplcnm", "bizplc_nm", "institution name", "institution_name", "institutionname", "facility name", "facility_name", "business place name"],
  address: ["주소", "도로명주소", "도로명전체주소", "소재지도로명주소", "소재지전체주소", "소재지지번주소", "소재지", "address", "rdnwhladdr", "sitewhladdr", "road address", "road_address", "roadaddress", "location address", "location_address"],
  phone: ["전화", "전화번호", "연락처", "소재지전화", "사업장전화번호", "phone", "sitetel", "telephone", "tel", "contact"],
  latitude: ["위도", "좌표정보(y)", "latitude", "lat", "y좌표", "y coordinate", "y"],
  longitude: ["경도", "좌표정보(x)", "longitude", "lng", "lon", "x좌표", "x coordinate", "x"],
  postalCode: ["우편번호", "소재지우편번호", "postal code", "postal_code", "zipcode", "zip code"],
  homepageUrl: ["홈페이지", "홈페이지주소", "website", "homepage", "homepage url", "homepage_url"],
  academyCategory: ["학원교습소구분", "학원교습소구분명", "학원/교습소구분"],
  operatingStatus: ["등록상태", "등록상태명", "운영상태"],
} as const;

export async function importPublicInstitutionFile(options: PublicFileImportOptions): Promise<PublicFileImportResult> {
  validateCheckedAt(options.checkedAt);
  const fileInfo = await stat(options.filePath);
  if (!fileInfo.isFile()) throw new Error("--file에는 CSV 또는 JSON 파일 경로가 필요합니다.");
  if (fileInfo.size > maxFileBytes) throw new Error("원본 파일은 50MB 이하여야 합니다.");

  const decoded = decodeInput(await readFile(options.filePath));
  const parsed = parseRows(decoded.text.replace(/^\uFEFF/, ""), options.filePath);
  const rows = parsed.rows;
  const errors: string[] = [];
  const records: RawSourceRecord[] = [];
  let skippedOutOfArea = 0;

  rows.forEach((row, index) => {
    const sourceRecordId = valueFor(row, headerAliases.sourceRecordId);
    const name = valueFor(row, headerAliases.name);
    const address = valueFor(row, headerAliases.address);
    if (address && !isHwaseongDongtanAddress(address)) {
      skippedOutOfArea += 1;
      return;
    }
    if (!sourceRecordId) {
      const rowNumber = parsed.format === "JSON" ? index + 1 : index + 2;
      errors.push(`${rowNumber}행: 관리번호·등록번호·기관코드 등 원본 ID가 없습니다.`);
      return;
    }
    if (!name || !address) {
      errors.push(`${sourceRecordId}: 기관명 또는 주소가 없습니다.`);
      return;
    }
    const academyCategory = options.provider === "NEIS" ? normalizeAcademyCategory(valueFor(row, headerAliases.academyCategory)) : null;
    if (options.provider === "NEIS" && !academyCategory) {
      errors.push(`${sourceRecordId}: 학원교습소 구분값이 없거나 학원·교습소가 아닙니다.`);
      return;
    }

    const latitude = numberValue(valueFor(row, headerAliases.latitude));
    const longitude = numberValue(valueFor(row, headerAliases.longitude));
    const zone = classifyDongtanZone({ address, postalCode: valueFor(row, headerAliases.postalCode), latitude, longitude });
    const payload: Record<string, unknown> = {
      ...row,
      name,
      address,
      phone: valueFor(row, headerAliases.phone) || undefined,
      latitude,
      longitude,
      postalCode: valueFor(row, headerAliases.postalCode) || undefined,
      homepageUrl: valueFor(row, headerAliases.homepageUrl) || undefined,
      institutionType: academyCategory === "LESSON_CENTER" ? "TUTORING" : providerInstitutionType(options.provider),
      academyCategory: academyCategory ?? undefined,
      operatingStatus: options.provider === "NEIS" ? normalizeOperatingStatus(valueFor(row, headerAliases.operatingStatus)) : "ACTIVE",
      sourceOperatingStatus: options.provider === "NEIS" ? valueFor(row, headerAliases.operatingStatus) || undefined : undefined,
      importedZone: zone,
    };
    records.push({ provider: options.provider, sourceRecordId, fetchedAt: `${options.checkedAt}T00:00:00.000Z`, payload });
  });

  return { records, sourceRows: rows.length, skippedOutOfArea, errors, inputEncoding: decoded.encoding, inputFormat: parsed.format };
}

function decodeInput(buffer: Buffer): { text: string; encoding: "UTF-8" | "EUC-KR" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "UTF-8" };
  } catch {
    try {
      return { text: new TextDecoder("euc-kr", { fatal: true }).decode(buffer), encoding: "EUC-KR" };
    } catch {
      throw new Error("파일 인코딩을 읽을 수 없습니다. UTF-8 또는 CP949(EUC-KR) CSV·JSON을 사용해 주세요.");
    }
  }
}

function parseRows(text: string, filePath: string): { rows: InputRow[]; format: "CSV" | "TSV" | "JSON" } {
  if (filePath.toLocaleLowerCase("en-US").endsWith(".json")) return { rows: parseJsonRows(text), format: "JSON" };
  if (filePath.toLocaleLowerCase("en-US").endsWith(".tsv")) return { rows: parseDelimitedRows(text, "\t"), format: "TSV" };
  if (filePath.toLocaleLowerCase("en-US").endsWith(".csv")) {
    const delimiter = detectDelimiter(text);
    return { rows: parseDelimitedRows(text, delimiter), format: delimiter === "\t" ? "TSV" : "CSV" };
  }
  const first = text.trimStart().charAt(0);
  if (first === "[" || first === "{") return { rows: parseJsonRows(text), format: "JSON" };
  const delimiter = detectDelimiter(text);
  return { rows: parseDelimitedRows(text, delimiter), format: delimiter === "\t" ? "TSV" : "CSV" };
}

function parseJsonRows(text: string): InputRow[] {
  const parsed: unknown = JSON.parse(text);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? ["records", "data", "items", "results"].map((key) => (parsed as Record<string, unknown>)[key]).find(Array.isArray)
      : null;
  if (!Array.isArray(rows)) throw new Error("JSON은 행 배열 또는 records/data/items/results 배열을 포함해야 합니다.");
  return rows.filter((row): row is InputRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

/** RFC 4180의 큰따옴표·구분자·줄바꿈 필드를 처리하는 작은 파서다. */
function parseDelimitedRows(text: string, delimiter: "," | "\t"): InputRow[] {
  const cells: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.length > 0)) cells.push(row);
      row = [];
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) cells.push(row);
  if (quoted) throw new Error("구분 파일의 큰따옴표가 닫히지 않았습니다.");
  if (cells.length === 0) return [];

  const headers = cells[0].map(normalizeHeader);
  return cells.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

function detectDelimiter(text: string): "," | "\t" {
  let commas = 0;
  let tabs = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) break;
    else if (!quoted && character === ",") commas += 1;
    else if (!quoted && character === "\t") tabs += 1;
  }
  return tabs > commas ? "\t" : ",";
}

function valueFor(row: InputRow, aliases: readonly string[]) {
  const keys = new Map(Object.keys(row).map((key) => [normalizeHeader(key), key]));
  for (const alias of aliases) {
    const key = keys.get(normalizeHeader(alias));
    const value = key ? row[key] : undefined;
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase("ko-KR").replace(/[\s_\-().]/g, "");
}

function numberValue(value: string) {
  if (!value) return undefined;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function isHwaseongDongtanAddress(address: string) {
  const hasHwaseong = /화성(?:특례)?시/.test(address);
  const hasDongtan = /동탄/.test(address) || [
    ...dongtanZoneRules.dongtan1AdministrativeDongs,
    ...dongtanZoneRules.dongtan2AdministrativeDongs,
    ...dongtanZoneRules.ambiguousAdministrativeDongs,
  ].some((dong) => addressHasLegalDong(address, dong));
  return hasHwaseong && hasDongtan;
}

function providerInstitutionType(provider: InstitutionProvider) {
  if (provider === "CHILDCARE") return "CHILDCARE";
  if (provider === "KINDERGARTEN") return "KINDERGARTEN";
  return "ACADEMY";
}

function normalizeAcademyCategory(value: string): "ACADEMY" | "LESSON_CENTER" | null {
  const normalized = value.replace(/\s/g, "");
  if (normalized === "학원") return "ACADEMY";
  if (normalized === "교습소") return "LESSON_CENTER";
  return null;
}

function normalizeOperatingStatus(value: string): "ACTIVE" | "SUSPENDED" | "CLOSED" | "UNKNOWN" {
  const normalized = value.replace(/\s/g, "");
  if (normalized === "정상" || normalized === "개원") return "ACTIVE";
  if (normalized === "휴원") return "SUSPENDED";
  if (normalized === "폐원") return "CLOSED";
  return "UNKNOWN";
}

function validateCheckedAt(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("--checked-at은 YYYY-MM-DD 형식이어야 합니다.");
  }
}
