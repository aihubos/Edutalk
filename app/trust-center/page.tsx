"use client";

import { FormEvent, Suspense, type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ClipboardCheck, FileWarning, Flag, Info, RefreshCcw, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { institutions } from "@/lib/demo-data";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { trackProductEvent } from "@/lib/product-events";
import {
  correctionIssueLabels,
  emptyOperationsState,
  independentTutorTargetId,
  operationStatusLabels,
  operationsStorageKey,
  reportIssueLabels,
  verificationEvidenceLabels,
  verificationKindLabels,
  type ContentReport,
  type CorrectionRequest,
  type OperationsState,
  type OperationStatus,
  type VerificationRequest,
} from "@/lib/operations-data";
import { roleLabels } from "@/lib/labels";
import type { CorrectionIssue, ReportIssue, VerificationKind } from "@/lib/operations-data";
import type { UserRole, VerificationEvidenceType } from "@/lib/types";
import styles from "./trust-center.module.css";

type QueueKey = "verification" | "correction" | "report";
type InstitutionChoice = { id: string; name: string; address: string };

const queues: Array<{ id: QueueKey; label: string; helper: string; icon: typeof BadgeCheck }> = [
  { id: "verification", label: "인증 요청", helper: "이용·근무 관계와 튜터 인증", icon: BadgeCheck },
  { id: "correction", label: "기관 정보 정정", helper: "공개 정보의 수정 제안", icon: RefreshCcw },
  { id: "report", label: "콘텐츠 신고", helper: "후기·정보의 문제 알림", icon: Flag },
];

const formatDate = (value: string) => new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

const makeHistory = (note: string) => [{ status: "PENDING" as const, note, createdAt: new Date().toISOString() }];

function StatusBadge({ status }: { status: OperationStatus }) {
  return <span className={styles.status} data-status={status}>{operationStatusLabels[status]}</span>;
}

function OperationStatusHelper({ status, demo }: { status: OperationStatus; demo: boolean }) {
  if (demo) return <p className={styles.statusHelper}>체험 요청은 운영자에게 전송되지 않아 다음 확인 일정과 이의제기 절차가 적용되지 않습니다.</p>;
  if (status === "PENDING") return <p className={styles.statusHelper}>다음 확인 목표: 접수 후 3영업일 안에 상태를 다시 안내합니다. 운영 목표이며 영업일 기준이고, 실제 일정은 달라질 수 있습니다.</p>;
  if (status === "NEEDS_INFO") return <p className={styles.statusHelper}>보완이 필요합니다. 요청에 필요한 정보를 보완해 제출하면 3영업일 안에 다시 확인하는 것을 목표로 합니다. 실제 일정은 달라질 수 있습니다.</p>;
  if (status === "APPROVED") return <p className={styles.statusHelper}>현재 요청은 완료 상태입니다. 추가 확인이 필요하면 고객센터에 문의해 주세요. 운영 목표이며 실제 일정은 달라질 수 있습니다.</p>;
  return <p className={styles.statusHelper}>이 결과에 이견이 있으면 <Link href="/support">고객센터</Link>에 요청 내용과 이유를 남겨 이의제기를 접수할 수 있습니다. 운영 목표이며 실제 일정은 달라질 수 있습니다.</p>;
}

function InstitutionSelect({ value, onChange, id, allowIndependentTutor = false, institutions, state }: { value: string; onChange: (value: string) => void; id: string; allowIndependentTutor?: boolean; institutions: InstitutionChoice[]; state: "loading" | "ready" | "error" }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required disabled={state === "loading" || state === "error" || (!allowIndependentTutor && institutions.length === 0)}>
      <option value="">{state === "loading" ? "공개 기관 정보를 불러오는 중" : state === "error" ? "공개 기관 정보를 불러오지 못했어요" : institutions.length === 0 ? "공개 기관 정보가 아직 없어요" : "기관을 선택하세요"}</option>
      {allowIndependentTutor ? <option value={independentTutorTargetId}>개인 튜터 · 기관 소속 없음</option> : null}
      {institutions.map((institution) => (
        <option key={institution.id} value={institution.id}>{institution.name} · {institution.address}</option>
      ))}
    </select>
  );
}

export default function TrustCenterPage() {
  return (
    <Suspense fallback={<main className={styles.page}><section className={styles.loading} aria-busy="true">신뢰 센터를 준비하고 있어요.</section></main>}>
      <TrustCenterContent />
    </Suspense>
  );
}

function TrustCenterContent() {
  const searchParams = useSearchParams();
  const requestedQueue = searchParams.get("tab");
  const requestedInstitutionId = searchParams.get("institution") ?? "";
  const requestedReportTargetType = searchParams.get("targetType") === "institution_review" ? "institution_review" as const : undefined;
  const requestedReportTargetId = searchParams.get("targetId") ?? undefined;
  const initialQueue: QueueKey = requestedQueue === "correction" || requestedQueue === "report" ? requestedQueue : "verification";
  const [activeQueue, setActiveQueue] = useState<QueueKey>(initialQueue);
  const [state, setState] = useState<OperationsState>(emptyOperationsState);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const accountConfigured = isSupabaseConfigured();
  const [serverConnected, setServerConnected] = useState(false);
  const [accountConnectionFailed, setAccountConnectionFailed] = useState(false);
  const [accountInstitutions, setAccountInstitutions] = useState<InstitutionChoice[]>([]);
  const [institutionsState, setInstitutionsState] = useState<"loading" | "ready" | "error">(accountConfigured ? "loading" : "ready");
  const institutionChoices = accountConfigured ? accountInstitutions : institutions.map((institution) => ({ id: institution.id, name: institution.name, address: institution.address }));

  useEffect(() => {
    if (!accountConfigured) return;
    void fetch("/api/institutions").then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { mode?: string; institutions?: Array<{ publicSlug?: string; name?: string; address?: string }> };
      if (!response.ok || payload.mode !== "canonical") { setInstitutionsState("error"); return; }
      setAccountInstitutions((payload.institutions ?? []).flatMap((institution) => institution.publicSlug && institution.name && institution.address ? [{ id: institution.publicSlug, name: institution.name, address: institution.address }] : []));
      setInstitutionsState("ready");
    }).catch(() => setInstitutionsState("error"));
  }, [accountConfigured]);

  const loadServerRequests = async () => {
    const response = await fetch("/api/trust-center");
    const payload = await response.json() as Partial<OperationsState> & { error?: string };
    if (!response.ok) { setNotice(payload.error ?? "요청 내역을 불러오지 못했어요."); return false; }
    setState({ verifications: payload.verifications ?? [], corrections: payload.corrections ?? [], reports: payload.reports ?? [] });
    return true;
  };

  useEffect(() => {
    if (!accountConfigured) return;
    const client = createBrowserSupabaseClient();
    void (async () => {
      try {
        if (!client) {
          setNotice("계정 요청 연결을 준비하지 못했어요. 로그인 상태를 확인한 뒤 다시 시도해 주세요.");
          setAccountConnectionFailed(true);
          return;
        }
        const { data, error } = await client.auth.getClaims();
        if (error || !data?.claims?.sub) {
          setNotice("로그인한 계정의 요청 내역을 확인하지 못했어요.");
          setAccountConnectionFailed(true);
          return;
        }
        const loaded = await loadServerRequests();
        if (!loaded) { setAccountConnectionFailed(true); return; }
        setServerConnected(true);
      } catch {
        setNotice("계정 요청 내역 연결 중 문제가 발생했어요. 데모 저장소로 전환하지 않았습니다.");
        setAccountConnectionFailed(true);
      } finally {
        setHydrated(true);
      }
    })();
  }, [accountConfigured]);

  /* eslint-disable react-hooks/set-state-in-effect -- 서버 첫 화면 뒤 브라우저에 저장된 체험 요청을 한 번 복원한다. */
  useEffect(() => {
    if (accountConfigured) return;
    try {
      const saved = window.localStorage.getItem(operationsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OperationsState>;
        setState({
          verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [],
          corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
          reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        });
      }
    } catch {
      setNotice("저장된 체험 요청을 불러오지 못했어요. 새 요청부터 사용할 수 있어요.");
    } finally {
      setHydrated(true);
    }
  }, [accountConfigured]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated || accountConfigured) return;
    try {
      window.localStorage.setItem(operationsStorageKey, JSON.stringify(state));
    } catch {}
  }, [accountConfigured, hydrated, state]);

  const counts = useMemo(() => ({
    verification: state.verifications.length,
    correction: state.corrections.length,
    report: state.reports.length,
  }), [state]);

  const institutionName = (id: string) => id === independentTutorTargetId ? "개인 튜터" : institutionChoices.find((institution) => institution.id === id)?.name ?? "선택한 기관";

  const addVerification = async (request: VerificationRequest) => {
    if (serverConnected) {
      const response = await fetch("/api/trust-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "verification", ...request }) });
      if (!response.ok) { const payload = await response.json() as { error?: string }; setNotice(payload.error ?? "인증 요청을 저장하지 못했어요."); return; }
      await loadServerRequests(); trackProductEvent({ eventName: "VERIFICATION_SUBMITTED", path: "/trust-center", category: request.kind, role: request.role === "TUTOR" ? undefined : request.role }); setNotice("계정 인증 요청으로 저장했어요. 요청 상태가 허용되면 필요한 비공개 증빙을 업로드할 수 있어요."); return;
    }
    setState((current) => ({ ...current, verifications: [request, ...current.verifications] }));
    trackProductEvent({ eventName: "VERIFICATION_SUBMITTED", path: "/trust-center", category: request.kind, role: request.role === "TUTOR" ? undefined : request.role });
    setNotice("인증 요청을 이 기기에 접수했어요. 실제 문서는 업로드되거나 전송되지 않습니다.");
  };
  const addCorrection = async (request: CorrectionRequest) => {
    if (serverConnected) {
      const response = await fetch("/api/trust-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "correction", ...request }) });
      if (!response.ok) { const payload = await response.json() as { error?: string }; setNotice(payload.error ?? "정정 요청을 저장하지 못했어요."); return; }
      await loadServerRequests(); setNotice("상용 계정 요청으로 저장했어요. 실제 기관 정보는 아직 변경되지 않습니다."); return;
    }
    setState((current) => ({ ...current, corrections: [request, ...current.corrections] }));
    setNotice("정보 정정 요청을 이 기기에 접수했어요. 운영자에게 실제 전달되지는 않습니다.");
  };
  const addReport = async (request: ContentReport) => {
    if (serverConnected) {
      const response = await fetch("/api/trust-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "report", ...request }) });
      if (!response.ok) { const payload = await response.json() as { error?: string }; setNotice(payload.error ?? "신고를 저장하지 못했어요."); return; }
      await loadServerRequests(); setNotice("신고를 계정에 접수했어요. 운영자가 임시 숨김·복원·조치 확정을 처리합니다."); return;
    }
    setState((current) => ({ ...current, reports: [request, ...current.reports] }));
    setNotice("콘텐츠 신고를 이 기기에 접수했어요. 실제 임시조치나 전송은 수행되지 않습니다.");
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>신뢰 센터</p>
          <h1>인증·정정·신고 요청을 확인해요</h1>
          <p>{serverConnected ? "내 계정으로 접수한 요청과 상태 이력을 확인합니다. 비공개 증빙 업로드와 운영 처리 코드는 준비되어 있으며, 실제 프로젝트·운영자 배정 전에는 처리 완료를 보장하지 않습니다." : accountConfigured ? "계정 요청 연결 상태를 확인하고 있어요." : "이 화면은 출시 전 운영 흐름을 확인하는 체험 공간입니다. 입력한 내용은 현재 브라우저에만 저장됩니다."}</p>
        </div>
        <span className={styles.demoBadge}><Info size={16} aria-hidden /> {serverConnected ? "상용 계정 요청" : accountConfigured ? "계정 연결 확인" : "체험 모드"}</span>
      </header>

      <aside className={styles.notice} aria-label="체험 모드 안내">
        <ShieldCheck size={20} aria-hidden />
        <p>{serverConnected ? <><strong>요청에 필요한 증빙만 올려 주세요.</strong> PDF·JPG·PNG 파일은 최대 5MB이며 비공개 Storage에 저장되도록 준비되어 있습니다. 원본 파일명은 표시하지 않고, 실제 프로젝트·Storage 정책이 적용되기 전에는 업로드 완료로 안내하지 않습니다.</> : <><strong>민감한 원본 자료를 올리지 마세요.</strong> demo에서는 실제 신분증, 성적표, 급여명세서, 자녀 정보를 수집·저장·전송하지 않습니다. 여기서는 요청 내용과 처리 상태 화면만 확인합니다.</>}</p>
      </aside>

      {accountConfigured && hydrated && accountConnectionFailed ? <section className={styles.accountError} role="alert"><strong>계정 요청을 불러오지 못했어요.</strong><p>이 상태에서는 브라우저 체험 저장으로 전환하지 않으며, 새 요청도 접수할 수 없습니다.</p><Link href="/login">다시 로그인</Link></section> : <>
      <nav className={styles.queueTabs} aria-label="운영 요청 유형">
        {queues.map((queue) => {
          const Icon = queue.icon;
          return <button key={queue.id} type="button" onClick={() => setActiveQueue(queue.id)} data-active={activeQueue === queue.id}>
            <Icon size={19} aria-hidden />
            <span><strong>{queue.label}</strong><small>{queue.helper}</small></span>
            <b>{counts[queue.id]}</b>
          </button>;
        })}
      </nav>

      {notice ? <p className={styles.feedback} role="status">{notice}</p> : null}

      {!hydrated ? <section className={styles.loading} aria-busy="true">요청 목록을 준비하고 있어요.</section> : null}
      {accountConfigured && institutionsState === "error" ? <section className={styles.accountError} role="alert"><strong>공개 기관 정보를 불러오지 못했어요.</strong><p>계정 모드에서는 체험 기관을 대신 표시하지 않습니다. 잠시 후 다시 확인해 주세요.</p></section> : null}
      {hydrated && activeQueue === "verification" ? <VerificationWorkspace defaultInstitutionId={requestedInstitutionId} items={state.verifications} institutionName={institutionName} onSubmit={addVerification} serverConnected={serverConnected} institutions={institutionChoices} institutionsState={institutionsState} /> : null}
      {hydrated && activeQueue === "correction" ? <CorrectionWorkspace defaultInstitutionId={requestedInstitutionId} items={state.corrections} institutionName={institutionName} onSubmit={addCorrection} institutions={institutionChoices} institutionsState={institutionsState} /> : null}
      {hydrated && activeQueue === "report" ? <ReportWorkspace defaultInstitutionId={requestedInstitutionId} defaultTargetType={requestedReportTargetType} defaultTargetId={requestedReportTargetId} items={state.reports} institutionName={institutionName} onSubmit={addReport} institutions={institutionChoices} institutionsState={institutionsState} /> : null}
      </>}
    </main>
  );
}

function VerificationWorkspace({ defaultInstitutionId, items, institutionName, onSubmit, serverConnected, institutions, institutionsState }: { defaultInstitutionId: string; items: VerificationRequest[]; institutionName: (id: string) => string; onSubmit: (request: VerificationRequest) => void; serverConnected: boolean; institutions: InstitutionChoice[]; institutionsState: "loading" | "ready" | "error" }) {
  const [institutionId, setInstitutionId] = useState(defaultInstitutionId);
  const [kind, setKind] = useState<VerificationKind>("INSTITUTION_RELATION");
  const [role, setRole] = useState<UserRole | "TUTOR">("PARENT");
  const [evidenceType, setEvidenceType] = useState<VerificationEvidenceType>("ENROLLMENT");
  const [period, setPeriod] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const isInstitutionRelation = kind === "INSTITUTION_RELATION";
  const isTutorCredential = kind === "TUTOR_CREDENTIAL";
  const allowedRoles: Array<UserRole | "TUTOR"> = isInstitutionRelation ? ["PARENT", "STUDENT", "TEACHER"] : ["TUTOR"];
  const allowedEvidence: VerificationEvidenceType[] = isInstitutionRelation
    ? [role === "TEACHER" ? "EMPLOYMENT" : "ENROLLMENT"]
    : kind === "TUTOR_IDENTITY"
      ? ["IDENTITY"]
      : ["TEACHING_CERT", "LANGUAGE_SCORE", "DEGREE"];

  const changeKind = (nextKind: VerificationKind) => {
    setKind(nextKind);
    if (nextKind === "INSTITUTION_RELATION") {
      setRole("PARENT");
      setEvidenceType("ENROLLMENT");
      return;
    }
    setRole("TUTOR");
    setEvidenceType(nextKind === "TUTOR_IDENTITY" ? "IDENTITY" : "TEACHING_CERT");
  };

  const changeRole = (nextRole: UserRole | "TUTOR") => {
    setRole(nextRole);
    if (kind === "INSTITUTION_RELATION") setEvidenceType(nextRole === "TEACHER" ? "EMPLOYMENT" : "ENROLLMENT");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validInstitution = institutions.some((institution) => institution.id === institutionId);
    if (!confirmed || (isInstitutionRelation && !validInstitution)) return;
    const now = new Date().toISOString();
    onSubmit({ id: `verification-${Date.now()}`, institutionId, kind, role, evidenceType, relationshipPeriod: period.trim(), confirmation: true, status: "PENDING", submittedAt: now, history: makeHistory("체험용 인증 요청이 접수되었습니다. demo에서는 실제 증빙을 업로드하지 않습니다.") });
    setInstitutionId(""); setPeriod(""); setConfirmed(false);
  };
  return <section className={styles.workspace}>
    <div className={styles.workspaceHeader}><div><p className={styles.kicker}>인증 요청</p><h2>관계 또는 튜터 인증을 신청해요</h2></div><BadgeCheck aria-hidden /></div>
    <form className={styles.form} onSubmit={submit}>
      <label>대상 기관 또는 개인 튜터<InstitutionSelect id="verification-institution" value={institutionId} onChange={setInstitutionId} allowIndependentTutor={kind !== "INSTITUTION_RELATION"} institutions={institutions} state={institutionsState} /></label>
      <div className={styles.twoColumns}>
        <label>인증 유형<select value={kind} onChange={(event) => changeKind(event.target.value as VerificationKind)}><option value="INSTITUTION_RELATION">기관 이용·근무 관계</option><option value="TUTOR_IDENTITY">튜터 본인 확인</option><option value="TUTOR_CREDENTIAL">튜터 자격 확인</option></select></label>
        <label>신청자 구분<select value={role} onChange={(event) => changeRole(event.target.value as UserRole | "TUTOR")}><option value="PARENT" hidden={!allowedRoles.includes("PARENT")}>학부모</option><option value="STUDENT" hidden={!allowedRoles.includes("STUDENT")}>학생</option><option value="TEACHER" hidden={!allowedRoles.includes("TEACHER")}>선생님</option><option value="TUTOR" hidden={!allowedRoles.includes("TUTOR")}>튜터</option></select></label>
      </div>
      <div className={styles.twoColumns}>
        <label>확인 항목<select className={!isTutorCredential ? styles.lockedSelect : undefined} value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as VerificationEvidenceType)} disabled={!isTutorCredential}>{allowedEvidence.map((value) => <option key={value} value={value}>{verificationEvidenceLabels[value]}</option>)}</select>{!isTutorCredential ? <small className={styles.fieldHint}>인증 유형과 신청자 구분에 맞춰 자동 지정됩니다.</small> : null}</label>
        <label>이용·근무 기간<input value={period} onChange={(event) => setPeriod(event.target.value)} maxLength={80} required placeholder="예: 2026년 3월~현재" /></label>
      </div>
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required /><span>{serverConnected ? "요청을 먼저 접수한 뒤, 필요한 실제 비공개 증빙을 이 요청에 업로드하는 절차에 동의합니다." : "실제 자료는 제출하지 않으며, 정식 서비스에서 필요한 최소 확인 절차를 안내받는 데 동의합니다."}</span></label>
      <button className={styles.primaryButton} type="submit" disabled={isInstitutionRelation && (!institutions.some((institution) => institution.id === institutionId) || institutionsState !== "ready")}><ClipboardCheck size={18} aria-hidden /> {serverConnected ? "인증 요청 접수" : "체험 요청 접수"}</button>
    </form>
    <RequestList title="내 인증 요청" empty="아직 접수한 인증 요청이 없어요." items={items} render={(item) => <><strong>{institutionName(item.institutionId)}</strong><p>{verificationKindLabels[item.kind]} · {item.role === "TUTOR" ? "튜터" : roleLabels[item.role]} · {verificationEvidenceLabels[item.evidenceType]}</p><small>기간: {item.relationshipPeriod}</small>{item.kind === "INSTITUTION_RELATION" && item.reviewAccessEndsAt ? <em>{reviewAccessLabel(item.role)} 후기 열람권 {item.reviewAccessEndsAt.slice(0, 10)}까지</em> : null}</>} afterBody={serverConnected ? (item) => <VerificationDocuments requestId={item.id} status={item.status} /> : undefined} demo={!serverConnected} />
  </section>;
}

type VerificationDocument = {
  id: string;
  documentKind: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
};

const supportedDocumentTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxDocumentBytes = 5 * 1024 * 1024;

function VerificationDocuments({ requestId, status }: { requestId: string; status: OperationStatus }) {
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const canUpload = status === "PENDING" || status === "NEEDS_INFO";

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/trust-center/documents?requestId=${encodeURIComponent(requestId)}`);
      const payload = await response.json() as { documents?: VerificationDocument[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "증빙 메타데이터를 불러오지 못했어요.");
      setDocuments(Array.isArray(payload.documents) ? payload.documents : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "증빙 메타데이터를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadDocuments(); });
    return () => window.cancelAnimationFrame(frame);
    // requestId가 바뀌면 해당 요청의 증빙 메타데이터를 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    if (!supportedDocumentTypes.includes(file.type)) {
      setMessage("PDF, JPG, PNG 파일만 올릴 수 있어요.");
      return;
    }
    if (file.size > maxDocumentBytes) {
      setMessage("파일은 5MB 이하만 올릴 수 있어요.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("requestId", requestId);
      body.append("file", file, "verification-document");
      const response = await fetch("/api/trust-center/documents", { method: "POST", body });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "증빙 자료를 올리지 못했어요.");
      await loadDocuments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "증빙 자료를 올리지 못했어요.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setMessage("");
    try {
      const response = await fetch("/api/trust-center/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "증빙 자료를 삭제하지 못했어요.");
      await loadDocuments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "증빙 자료를 삭제하지 못했어요.");
    } finally {
      setDeletingId(null);
    }
  };

  return <section className={styles.documentPanel} aria-label="증빙 자료">
    <div className={styles.documentHeader}><div><strong>증빙 자료</strong><span>원본 파일명은 표시하지 않습니다.</span></div>{loading ? <span>불러오는 중</span> : <span>{documents.length}건</span>}</div>
    {canUpload ? <label className={styles.documentUpload}><span>PDF, JPG, PNG · 최대 5MB</span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={upload} disabled={uploading || Boolean(deletingId)} />{uploading ? <small>업로드 중이에요.</small> : null}</label> : <p className={styles.documentLocked}>승인 또는 반려 상태에서는 새 자료를 추가할 수 없어요.</p>}
    {message ? <p className={styles.documentMessage} role="status">{message}</p> : null}
    {!loading && documents.length === 0 ? <p className={styles.documentEmpty}>등록된 증빙 자료가 없어요.</p> : null}
    {documents.length > 0 ? <ul className={styles.documentList}>{documents.map((document) => <li className={styles.documentItem} key={document.id}><div><strong>{document.documentKind}</strong><span>{document.mimeType} · {formatByteSize(document.byteSize)} · {formatDate(document.uploadedAt)}</span></div>{canUpload ? <button type="button" onClick={() => void remove(document.id)} disabled={Boolean(deletingId)}>{deletingId === document.id ? "삭제 중" : "삭제"}</button> : null}</li>)}</ul> : null}
  </section>;
}

function CorrectionWorkspace({ defaultInstitutionId, items, institutionName, onSubmit, institutions, institutionsState }: { defaultInstitutionId: string; items: CorrectionRequest[]; institutionName: (id: string) => string; onSubmit: (request: CorrectionRequest) => void; institutions: InstitutionChoice[]; institutionsState: "loading" | "ready" | "error" }) {
  const [institutionId, setInstitutionId] = useState(defaultInstitutionId); const [issue, setIssue] = useState<CorrectionIssue>("BASIC_INFO"); const [currentInfo, setCurrentInfo] = useState(""); const [requestedInfo, setRequestedInfo] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!institutions.some((institution) => institution.id === institutionId)) return; const now = new Date().toISOString(); onSubmit({ id: `correction-${Date.now()}`, institutionId, issue, currentInfo: currentInfo.trim(), requestedInfo: requestedInfo.trim(), status: "PENDING", submittedAt: now, history: makeHistory("체험용 정정 요청이 접수되었습니다. 실제 기관 데이터는 바뀌지 않습니다.") }); setInstitutionId(""); setCurrentInfo(""); setRequestedInfo(""); };
  return <section className={styles.workspace}>
    <div className={styles.workspaceHeader}><div><p className={styles.kicker}>기관 정보 정정</p><h2>공개 정보의 변경 사항을 알려주세요</h2></div><RefreshCcw aria-hidden /></div>
    <form className={styles.form} onSubmit={submit}>
      <label>대상 기관<InstitutionSelect id="correction-institution" value={institutionId} onChange={setInstitutionId} institutions={institutions} state={institutionsState} /></label>
      <label>정정 항목<select value={issue} onChange={(event) => setIssue(event.target.value as CorrectionIssue)}>{Object.entries(correctionIssueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>현재 보이는 정보<textarea value={currentInfo} onChange={(event) => setCurrentInfo(event.target.value)} required maxLength={500} rows={3} placeholder="예: 화면에 표시된 운영 시간 또는 비용" /></label>
      <label>수정이 필요한 정보<textarea value={requestedInfo} onChange={(event) => setRequestedInfo(event.target.value)} required maxLength={500} rows={3} placeholder="예: 변경된 운영 시간, 확인이 필요한 이유" /></label>
      <button className={styles.primaryButton} type="submit" disabled={!institutions.some((institution) => institution.id === institutionId) || institutionsState !== "ready"}><RefreshCcw size={18} aria-hidden /> 정정 요청 접수</button>
    </form>
    <RequestList title="내 정정 요청" empty="아직 접수한 정보 정정 요청이 없어요." items={items} render={(item) => <><strong>{institutionName(item.institutionId)}</strong><p>{correctionIssueLabels[item.issue]}</p><small>수정 제안: {item.requestedInfo}</small></>} demo={!isSupabaseConfigured()} />
  </section>;
}

function ReportWorkspace({ defaultInstitutionId, defaultTargetType, defaultTargetId, items, institutionName, onSubmit, institutions, institutionsState }: { defaultInstitutionId: string; defaultTargetType?: "institution_review"; defaultTargetId?: string; items: ContentReport[]; institutionName: (id: string) => string; onSubmit: (request: ContentReport) => void; institutions: InstitutionChoice[]; institutionsState: "loading" | "ready" | "error" }) {
  const [institutionId, setInstitutionId] = useState(defaultInstitutionId); const [issue, setIssue] = useState<ReportIssue>("MISINFORMATION"); const [location, setLocation] = useState(""); const [reason, setReason] = useState("");
  const specificReview = defaultTargetType === "institution_review" && Boolean(defaultTargetId);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!institutions.some((institution) => institution.id === institutionId)) return; const now = new Date().toISOString(); onSubmit({ id: `report-${Date.now()}`, institutionId, issue, contentLocation: specificReview ? "선택한 승인 후기" : location.trim(), reason: reason.trim(), targetType: specificReview ? defaultTargetType : undefined, targetId: specificReview ? defaultTargetId : undefined, status: "PENDING", submittedAt: now, history: makeHistory("체험용 신고가 접수되었습니다. 실제 콘텐츠는 숨김 처리되지 않습니다.") }); setInstitutionId(""); setLocation(""); setReason(""); };
  return <section className={styles.workspace}>
    <div className={styles.workspaceHeader}><div><p className={styles.kicker}>콘텐츠 신고</p><h2>문제가 있는 정보나 후기를 알려주세요</h2></div><FileWarning aria-hidden /></div>
    <form className={styles.form} onSubmit={submit}>
      <label>관련 기관<InstitutionSelect id="report-institution" value={institutionId} onChange={setInstitutionId} institutions={institutions} state={institutionsState} /></label>
      {specificReview ? <p className={styles.targetNotice}><ShieldCheck size={18} aria-hidden /><span><strong>선택한 승인 후기를 신고합니다.</strong> 운영자는 이 후기만 임시 숨김·복원할 수 있습니다.</span></p> : null}
      <label>신고 사유<select value={issue} onChange={(event) => setIssue(event.target.value as ReportIssue)}>{Object.entries(reportIssueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!specificReview ? <label>문제 위치<textarea value={location} onChange={(event) => setLocation(event.target.value)} required maxLength={200} rows={2} placeholder="예: 학부모 후기 영역의 최근 게시글" /></label> : null}
      <label>신고 사유 설명<textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={1000} rows={4} placeholder="개인정보나 실명은 쓰지 말고, 어떤 점이 문제인지 적어주세요." /></label>
      <button className={styles.dangerButton} type="submit" disabled={!institutions.some((institution) => institution.id === institutionId) || institutionsState !== "ready"}><Flag size={18} aria-hidden /> 신고 접수</button>
    </form>
    <RequestList title="내 신고 내역" empty="아직 접수한 콘텐츠 신고가 없어요." items={items} render={(item) => <><strong>{institutionName(item.institutionId)}</strong><p>{reportIssueLabels[item.issue]} · {item.contentLocation}</p><small>{item.reason}</small>{item.operatorStatus ? <small>운영 상태: {item.operatorStatus}</small> : null}</>} demo={!isSupabaseConfigured()} />
  </section>;
}

function RequestList<T extends { id: string; status: OperationStatus; submittedAt: string; history: { status: OperationStatus; note: string; createdAt: string }[] }>({ title, empty, items, render, afterBody, demo = false }: { title: string; empty: string; items: T[]; render: (item: T) => ReactNode; afterBody?: (item: T) => ReactNode; demo?: boolean }) {
  return <section className={styles.requestSection} aria-label={title}>
    <div className={styles.sectionHeader}><h3>{title}</h3><span>{items.length}건</span></div>
    {items.length === 0 ? <p className={styles.empty}>{empty}</p> : <div className={styles.requestList}>{items.map((item) => <article className={styles.requestCard} key={item.id}><div className={styles.requestTop}><StatusBadge status={item.status} /><time dateTime={item.submittedAt}>{formatDate(item.submittedAt)}</time></div><div className={styles.requestBody}>{render(item)}</div><OperationStatusHelper status={item.status} demo={demo} />{afterBody ? afterBody(item) : null}<details><summary>처리 이력 보기</summary>{item.history.map((entry) => <div className={styles.history} key={entry.createdAt}><StatusBadge status={entry.status} /><span>{entry.note}</span><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></div>)}</details></article>)}</div>}
  </section>;
}

function formatByteSize(value: number) {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

function reviewAccessLabel(role: UserRole | "TUTOR") {
  if (role === "PARENT") return "학부모";
  if (role === "STUDENT") return "학생";
  if (role === "TEACHER") return "선생님";
  return "튜터";
}
