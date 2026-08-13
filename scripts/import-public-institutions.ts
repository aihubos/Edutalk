import { createClient } from "@supabase/supabase-js";
import { buildSyncReport, normalizeRawRecord, writeProviderRecords, type InstitutionProvider } from "../lib/institution-etl";
import { importPublicInstitutionFile } from "../lib/public-file-import";

const writeConfirmation = "WRITE_PUBLIC_INSTITUTIONS";
const providerValues: InstitutionProvider[] = ["CHILDCARE", "KINDERGARTEN", "NEIS"];

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value?.startsWith("--") ? undefined : value;
}

function requiredArgument(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`${name} 값이 필요합니다.`);
  return value;
}

function getWriteClient() {
  if (process.env.PUBLIC_INSTITUTION_SYNC_CONFIRM !== writeConfirmation) throw new Error(`--write에는 PUBLIC_INSTITUTION_SYNC_CONFIRM=${writeConfirmation} 확인값이 필요합니다.`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error("--write에는 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function run() {
  const filePath = requiredArgument("--file");
  const provider = requiredArgument("--provider") as InstitutionProvider;
  const checkedAt = requiredArgument("--checked-at");
  if (!providerValues.includes(provider)) throw new Error("--provider는 CHILDCARE, KINDERGARTEN, NEIS 중 하나여야 합니다.");

  const write = process.argv.includes("--write");
  const writeClient = write ? getWriteClient() : null;
  const imported = await importPublicInstitutionFile({ filePath, provider, checkedAt });
  if (write && imported.errors.length > 0) {
    throw new Error(`가져오기 오류 ${imported.errors.length}건이 있어 DB 적재를 중단했습니다. 먼저 dry-run 보고서와 원본 헤더를 확인해 주세요.`);
  }
  if (write && imported.records.length === 0) {
    throw new Error("적재할 동탄권 기관이 0건이라 DB 적재를 중단했습니다.");
  }
  const started = new Date().toISOString();
  const classifications = imported.records.map(normalizeRawRecord);
  const classificationSummary = {
    publicCandidates: classifications.filter((record) => record.operatingStatus === "ACTIVE" && record.zone !== "OTHER").length,
    byType: Object.fromEntries(["CHILDCARE", "KINDERGARTEN", "ACADEMY", "TUTORING"].map((type) => [type, classifications.filter((record) => record.institutionType === type).length])),
    byStatus: Object.fromEntries(["ACTIVE", "SUSPENDED", "CLOSED", "UNKNOWN"].map((status) => [status, classifications.filter((record) => record.operatingStatus === status).length])),
    byZone: Object.fromEntries(["DONGTAN_1", "DONGTAN_2", "OTHER"].map((zone) => [zone, classifications.filter((record) => record.zone === zone).length])),
  };
  const report = writeClient
    ? await writeProviderRecords(writeClient, provider, imported.records, started)
    : buildSyncReport(provider, imported.records, started);
  process.stdout.write(JSON.stringify({
    mode: write ? "file-write" : "file-dry-run",
    file: filePath,
    checkedAt,
    inputEncoding: imported.inputEncoding,
    inputFormat: imported.inputFormat,
    sourceRows: imported.sourceRows,
    skippedOutOfArea: imported.skippedOutOfArea,
    importErrors: imported.errors,
    classificationSummary,
    report,
  }, null, 2) + "\n");
}

void run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "파일 적재 준비 실패"}\n`);
  process.exitCode = 1;
});
