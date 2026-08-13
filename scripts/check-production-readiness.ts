import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  help: string;
};

const value = (name: string) => process.env[name]?.trim() ?? "";
const isHttpsUrl = (name: string) => {
  try {
    return new URL(value(name)).protocol === "https:";
  } catch {
    return false;
  }
};

type EvidenceItem = { approved?: boolean; completed?: boolean; connected?: boolean; approvedAt?: string; completedAt?: string; verifiedAt?: string; checkedAt?: string; approvedBy?: string; owner?: string; evidence?: string };
type ReleaseEvidence = {
  legalReview?: EvidenceItem;
  privateBeta?: EvidenceItem;
  backupRestore?: EvidenceItem;
  monitoring?: EvidenceItem;
  publicData?: { childcare?: EvidenceItem; kindergarten?: EvidenceItem; academy?: EvidenceItem };
};

function readEvidence(): ReleaseEvidence | null {
  const configuredPath = value("RELEASE_EVIDENCE_FILE");
  if (!configuredPath) return null;
  try {
    const path = isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath);
    return JSON.parse(readFileSync(path, "utf8")) as ReleaseEvidence;
  } catch { return null; }
}

const evidence = readEvidence();
const evidenceReady = (item: EvidenceItem | undefined, state: "approved" | "completed" | "connected", date: "approvedAt" | "completedAt" | "verifiedAt" | "checkedAt", owner: "approvedBy" | "owner") =>
  Boolean(item?.[state] === true && item?.[date]?.trim() && item?.[owner]?.trim() && item?.evidence?.trim());

const checks: ReadinessCheck[] = [
  { id: "data-mode", label: "상용 데이터 모드", ok: value("NEXT_PUBLIC_DATA_MODE") === "production", help: "NEXT_PUBLIC_DATA_MODE=production" },
  { id: "app-url", label: "공개 HTTPS 주소", ok: isHttpsUrl("NEXT_PUBLIC_APP_URL"), help: "NEXT_PUBLIC_APP_URL을 실제 https 주소로 설정" },
  { id: "supabase-url", label: "Supabase 프로젝트 주소", ok: isHttpsUrl("NEXT_PUBLIC_SUPABASE_URL"), help: "NEXT_PUBLIC_SUPABASE_URL 설정" },
  { id: "supabase-key", label: "Supabase 공개 키", ok: value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY").startsWith("sb_publishable_"), help: "활성 publishable key 설정" },
  { id: "service-key", label: "Supabase 서버 전용 키", ok: Boolean(value("SUPABASE_SERVICE_ROLE_KEY")), help: "서버 환경에만 SUPABASE_SERVICE_ROLE_KEY 설정" },
  { id: "openai", label: "AI 초안 연결", ok: Boolean(value("OPENAI_API_KEY")), help: "OPENAI_API_KEY 설정" },
  { id: "stripe-secret", label: "Stripe 서버 키", ok: Boolean(value("STRIPE_SECRET_KEY")), help: "STRIPE_SECRET_KEY 설정" },
  { id: "stripe-price", label: "Stripe 무제한 상품", ok: Boolean(value("STRIPE_UNLIMITED_PRICE_ID") || value("UNLIMITED_PLAN_PRICE_ID")), help: "Stripe 무제한 가격 ID 설정" },
  { id: "stripe-webhook", label: "Stripe 웹훅 서명", ok: Boolean(value("STRIPE_WEBHOOK_SECRET")), help: "STRIPE_WEBHOOK_SECRET 설정" },
  { id: "oauth-google", label: "Google 로그인", ok: Boolean(value("GOOGLE_CLIENT_ID") && value("GOOGLE_CLIENT_SECRET")), help: "Google OAuth 앱 ID와 비밀값 설정" },
  { id: "oauth-kakao", label: "Kakao 로그인", ok: Boolean(value("KAKAO_CLIENT_ID") && value("KAKAO_CLIENT_SECRET")), help: "Kakao OAuth 앱 ID와 비밀값 설정" },
  { id: "oauth-naver", label: "Naver 로그인", ok: Boolean(value("NAVER_CLIENT_ID") && value("NAVER_CLIENT_SECRET")), help: "Naver OIDC 앱 ID와 비밀값 설정" },
  { id: "public-childcare", label: "어린이집 공식 데이터", ok: (Boolean(value("CHILDCARE_API_URL") && value("CHILDCARE_API_KEY")) || value("PUBLIC_INSTITUTION_CHILDCARE_IMPORTED") === "true") && evidenceReady(evidence?.publicData?.childcare, "approved", "checkedAt", "owner"), help: "공식 연결·적재와 release evidence 기록 확인" },
  { id: "public-kindergarten", label: "유치원 공식 데이터", ok: (Boolean(value("KINDERGARTEN_API_URL") && value("KINDERGARTEN_API_KEY")) || value("PUBLIC_INSTITUTION_KINDERGARTEN_IMPORTED") === "true") && evidenceReady(evidence?.publicData?.kindergarten, "approved", "checkedAt", "owner"), help: "공식 연결·적재와 release evidence 기록 확인" },
  { id: "public-academy", label: "학원·교습소 공식 데이터", ok: (Boolean(value("NEIS_API_URL") && value("NEIS_API_KEY")) || value("PUBLIC_INSTITUTION_ACADEMY_IMPORTED") === "true") && evidenceReady(evidence?.publicData?.academy, "approved", "checkedAt", "owner"), help: "공식 연결·적재와 release evidence 기록 확인" },
  { id: "support", label: "공개 고객센터 연락처", ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value("NEXT_PUBLIC_SUPPORT_EMAIL")), help: "NEXT_PUBLIC_SUPPORT_EMAIL 설정" },
  { id: "legal", label: "법률 검토 승인", ok: value("LEGAL_REVIEW_APPROVED") === "true" && evidenceReady(evidence?.legalReview, "approved", "approvedAt", "approvedBy"), help: "환경값과 담당자·날짜·증빙 기록 모두 필요" },
  { id: "beta", label: "2주 비공개 베타", ok: value("PRIVATE_BETA_COMPLETED") === "true" && evidenceReady(evidence?.privateBeta, "completed", "completedAt", "owner"), help: "환경값과 담당자·날짜·결과 기록 모두 필요" },
  { id: "backup", label: "백업·복원 리허설", ok: value("BACKUP_RESTORE_DRILL_COMPLETED") === "true" && evidenceReady(evidence?.backupRestore, "completed", "completedAt", "owner"), help: "환경값과 담당자·날짜·복원 기록 모두 필요" },
  { id: "monitoring", label: "오류·성능 모니터링", ok: value("MONITORING_CONNECTED") === "true" && evidenceReady(evidence?.monitoring, "connected", "verifiedAt", "owner"), help: "환경값과 담당자·날짜·관찰 근거 모두 필요" },
];

const failed = checks.filter((check) => !check.ok);
const report = {
  ready: failed.length === 0,
  checkedAt: new Date().toISOString(),
  passed: checks.length - failed.length,
  total: checks.length,
  evidenceFile: value("RELEASE_EVIDENCE_FILE") || null,
  checks,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
