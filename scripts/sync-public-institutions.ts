import { createClient } from "@supabase/supabase-js";
import { buildSyncReport, dryRunFixtures, fetchProviderRecords, writeProviderRecords, type InstitutionProvider } from "../lib/institution-etl";

const providers: InstitutionProvider[] = ["CHILDCARE", "KINDERGARTEN", "NEIS"];
const write = process.argv.includes("--write");
const live = process.argv.includes("--live") || write;
const dryRun = !live;
const writeConfirmation = "WRITE_PUBLIC_INSTITUTIONS";

function getWriteClient() {
  if (process.env.PUBLIC_INSTITUTION_SYNC_CONFIRM !== writeConfirmation) throw new Error(`--write에는 PUBLIC_INSTITUTION_SYNC_CONFIRM=${writeConfirmation} 확인값이 필요합니다.`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error("--write에는 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function run() {
  const writeClient = write ? getWriteClient() : null;
  const reports = await Promise.all(providers.map(async (provider) => {
    const started = new Date().toISOString();
    try {
      const records = dryRun ? dryRunFixtures[provider] : await fetchProviderRecords(provider);
      return writeClient ? await writeProviderRecords(writeClient, provider, records, started) : buildSyncReport(provider, records, started);
    } catch (error) {
      return { source: provider, started, finished: new Date().toISOString(), recordsSeen: 0, normalized: 0, duplicates: 0, outOfZone: 0, errors: [error instanceof Error ? error.message : "동기화 준비 실패"] };
    }
  }));
  process.stdout.write(JSON.stringify({ mode: dryRun ? "dry-run" : write ? "live-write" : "live-read-only", reports }, null, 2) + "\n");
}

void run();
