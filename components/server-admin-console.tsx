"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AlertTriangle, FileWarning, FolderOpen, MessageSquareText, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import styles from "./server-admin-console.module.css";

type VerificationStatus = "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED";
type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "TEMPORARILY_HIDDEN";
type CorrectionStatus = "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED" | "CANCELLED";
type ReportStatus = "RECEIVED" | "TRIAGED" | "TEMPORARILY_HIDDEN" | "REQUESTED_MORE_INFO" | "UPHELD" | "REJECTED" | "RESTORED" | "CLOSED";
type VerificationDocument = { id: string; documentKind: string; mimeType: string; byteSize: number; uploadedAt: string };
type QueueItem = { id: string; status: string; conflictDetected?: boolean; institutionName?: string; targetKey?: string; targetType?: string; targetId?: string; institutionId?: string; tutorId?: string; rating?: number; content?: string; lessonVerifiedAt?: string; kind?: string; issue?: string; requestedRole?: string; relation?: string; relationshipPeriod?: string; strength?: string; improvement?: string; recommendTo?: string; currentSummary?: string; requestedSummary?: string; locationSummary?: string; reason?: string; createdAt?: string; created_at?: string; reviewerNote?: string; reviewer_note?: string; documents?: VerificationDocument[] };
type OperationsResponse = { operatorRoles?: string[]; verifications?: QueueItem[]; reviews?: QueueItem[]; reviewAddenda?: QueueItem[]; tutorReviews?: QueueItem[]; corrections?: QueueItem[]; reports?: QueueItem[]; institutionMembers?: QueueItem[]; error?: string };
type SupportItem = { id: string; status: "RECEIVED" | "IN_PROGRESS" | "ANSWERED" | "CLOSED"; category?: string; title: string; body: string; responseBody?: string; createdAt?: string; created_at?: string };
type DeletionRequest = { id: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED"; requestedAt?: string; requested_at?: string; note?: string; processingNote?: string; processedNote?: string };

const verificationLabels: Record<VerificationStatus, string> = { PENDING: "접수됨", NEEDS_INFO: "보완 필요", APPROVED: "승인", REJECTED: "반려" };
const reviewLabels: Record<ReviewStatus, string> = { PENDING: "심사 대기", APPROVED: "공개 승인", REJECTED: "반려", TEMPORARILY_HIDDEN: "임시 숨김" };
const reviewAddendumLabels = { PENDING: "심사 대기", APPROVED: "공개 승인", REJECTED: "반려" } as const;
const tutorReviewLabels = { PENDING: "심사 대기", APPROVED: "공개 승인", REJECTED: "반려" } as const;
const correctionLabels: Record<CorrectionStatus, string> = { PENDING: "접수됨", NEEDS_INFO: "보완 필요", APPROVED: "반영 승인", REJECTED: "반려", CANCELLED: "취소" };
const reportLabels: Record<ReportStatus, string> = { RECEIVED: "접수됨", TRIAGED: "검토 중", TEMPORARILY_HIDDEN: "임시 숨김", REQUESTED_MORE_INFO: "보완 요청", UPHELD: "조치 확정", REJECTED: "반려", RESTORED: "복원", CLOSED: "종료" };
const institutionMemberLabels = { APPROVED: "승인", REJECTED: "반려" } as const;

export function ServerAdminConsole() {
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [supports, setSupports] = useState<SupportItem[]>([]);
  const [supportsLoaded, setSupportsLoaded] = useState(false);
  const [deletions, setDeletions] = useState<DeletionRequest[]>([]);
  const [deletionsLoaded, setDeletionsLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/operations");
      const payload = await response.json() as OperationsResponse;
      if (!response.ok) { setError(payload.error ?? (response.status === 403 ? "운영자 권한이 없습니다." : "로그인이 필요합니다.")); return; }
      setData(payload);
    } catch { setError("운영 큐를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!data?.operatorRoles?.some((role) => role === "SUPPORT_AGENT" || role === "ADMIN")) return;
    fetch("/api/support/admin").then(async (response) => {
      const payload = await response.json() as { supports?: Array<SupportItem & { response_body?: string; created_at?: string }>; requests?: Array<SupportItem & { response_body?: string; created_at?: string }> };
      if (response.ok) setSupports((payload.supports ?? payload.requests ?? []).map((item) => ({ ...item, responseBody: item.responseBody ?? item.response_body, createdAt: item.createdAt ?? item.created_at })));
    }).catch(() => undefined).finally(() => setSupportsLoaded(true));
  }, [data?.operatorRoles]);

  useEffect(() => {
    if (!data?.operatorRoles?.includes("ADMIN")) return;
    fetch("/api/admin/account-deletions").then(async (response) => {
      const payload = await response.json() as { requests?: DeletionRequest[]; error?: string };
      if (!response.ok) { setError(payload.error ?? "탈퇴 요청 큐를 불러오지 못했어요. 서버 전용 키 설정을 확인해 주세요."); return; }
      setDeletions(payload.requests ?? []);
    }).catch(() => setError("탈퇴 요청 큐를 불러오지 못했어요. 서버 전용 키 설정을 확인해 주세요.")).finally(() => setDeletionsLoaded(true));
  }, [data?.operatorRoles]);

  const update = async (queue: "verification" | "review" | "review-addendum" | "tutor-review" | "correction" | "report" | "institution-member", item: QueueItem, status: string, note: string) => {
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch("/api/admin/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queue, id: item.id, status, note }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) { setError(payload.error ?? "처리 상태를 저장하지 못했어요."); return; }
      await load();
    } catch { setError("처리 상태를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { setSavingId(""); }
  };

  if (loading) return <main className={styles.page}><section className={styles.stateCard} aria-busy="true"><RefreshCcw aria-hidden="true" /><h1>운영 큐를 불러오는 중이에요</h1><p>권한과 최신 요청을 확인하고 있습니다.</p></section></main>;
  if (error && !data) return <main className={styles.page}><section className={styles.stateCard}><AlertTriangle aria-hidden="true" /><h1>운영자 콘솔에 접근할 수 없어요</h1><p>{error}</p><button type="button" onClick={() => void load()}>다시 시도</button></section></main>;
  if (!data?.operatorRoles?.length) return <main className={styles.page}><section className={styles.stateCard}><ShieldCheck aria-hidden="true" /><h1>운영자 권한이 필요해요</h1><p>이 계정에는 인증 요청과 후기 처리 권한이 부여되지 않았습니다.</p></section></main>;

  const verifications = data.verifications ?? [];
  const reviews = data.reviews ?? [];
  const reviewAddenda = data.reviewAddenda ?? [];
  const tutorReviews = data.tutorReviews ?? [];
  const corrections = data.corrections ?? [];
  const reports = data.reports ?? [];
  const institutionMembers = data.institutionMembers ?? [];
  return <main className={styles.page}>
    <header className={styles.header}><div><p>실제 계정 운영</p><h1>운영자 콘솔</h1><span>권한: {data.operatorRoles.join(", ")}</span></div><button type="button" onClick={() => void load()}><RefreshCcw size={17} aria-hidden="true" /> 새로고침</button></header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <section className={styles.grid}>
      <Queue title="인증 요청" icon={<ShieldCheck aria-hidden="true" />} items={verifications} queue="verification" labels={verificationLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>{item.targetKey ?? item.institutionId ?? "대상 확인 필요"}</strong><p>{item.kind ?? "인증 요청"} · {item.requestedRole ?? "역할 확인 필요"}</p><small>{item.relationshipPeriod ?? "관계 기간 미입력"}</small><VerificationDocuments documents={item.documents ?? []} /></>} />
      <Queue title="기관 후기" icon={<FileWarning aria-hidden="true" />} items={reviews} queue="review" labels={reviewLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>{item.targetKey ?? item.institutionId ?? "기관 확인 필요"}</strong><p>{item.relation ?? "후기 역할 확인 필요"}</p><small>{item.strength ?? item.recommendTo ?? "후기 내용 확인"}</small></>} />
      <Queue title="후기 보완 설명" icon={<MessageSquareText aria-hidden="true" />} items={reviewAddenda} queue="review-addendum" labels={reviewAddendumLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>{item.targetKey ?? "기관 확인 필요"} · {item.relation ?? "역할 확인 필요"}</strong><p>작성자 후속 설명</p><small>{item.content ?? "보완 설명 확인 필요"}</small></>} />
      <Queue title="튜터 후기" icon={<FileWarning aria-hidden="true" />} items={tutorReviews} queue="tutor-review" labels={tutorReviewLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>튜터 ID: {item.tutorId ?? "확인 필요"}</strong><p>{item.rating ?? "-"}점 · {item.lessonVerifiedAt ? "1회용 수업 코드 확인" : "수업 확인 미완료"}</p><small>{item.content ?? "후기 내용 확인"}</small></>} />
      {data.operatorRoles.some((role) => role === "DATA_OPERATOR" || role === "ADMIN") ? <Queue title="기관 정보 정정" icon={<MessageSquareText aria-hidden="true" />} items={corrections} queue="correction" labels={correctionLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>{item.targetKey ?? "기관 확인 필요"}</strong><p>{item.issue ?? "정정 항목 확인 필요"}</p><small>현재: {item.currentSummary ?? "-"}<br />요청: {item.requestedSummary ?? "-"}</small></>} /> : null}
      {data.operatorRoles.some((role) => role === "CONTENT_MODERATOR" || role === "ADMIN") ? <Queue title="콘텐츠 신고" icon={<AlertTriangle aria-hidden="true" />} items={reports} queue="report" labels={reportLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>{item.targetKey ?? item.targetType ?? "신고 대상 확인 필요"}</strong><p>{item.issue ?? "신고 사유 확인 필요"} · {item.locationSummary ?? "위치 미입력"}</p><small>{item.reason ?? "신고 내용 확인"}</small></>} /> : null}
      {data.operatorRoles.some((role) => role === "ADMIN" || role === "INSTITUTION_SUPPORT") ? <Queue title="기관 관계 신청" icon={<ShieldCheck aria-hidden="true" />} items={institutionMembers} queue="institution-member" labels={institutionMemberLabels} savingId={savingId} onUpdate={update} render={(item) => <><strong>{item.institutionName ?? "기관 확인 필요"}</strong><p>{item.conflictDetected ? "이해관계 충돌 검토 필요 · 작성자 정보 비공개" : "기관 관계자 승인 대기"}</p></>} /> : null}
    </section>
    {data.operatorRoles.some((role) => role === "SUPPORT_AGENT" || role === "ADMIN") ? <SupportQueue items={supports} loaded={supportsLoaded} /> : null}
    {data.operatorRoles.includes("ADMIN") ? <DeletionQueue items={deletions} loaded={deletionsLoaded} /> : null}
  </main>;
}

function Queue({ title, icon, items, queue, labels, savingId, onUpdate, render }: { title: string; icon: ReactNode; items: QueueItem[]; queue: "verification" | "review" | "review-addendum" | "tutor-review" | "correction" | "report" | "institution-member"; labels: Record<string, string>; savingId: string; onUpdate: (queue: "verification" | "review" | "review-addendum" | "tutor-review" | "correction" | "report" | "institution-member", item: QueueItem, status: string, note: string) => Promise<void>; render: (item: QueueItem) => ReactNode }) {
  return <section className={styles.queue}><header><div>{icon}<h2>{title}</h2></div><span>{items.length}건</span></header>{items.length === 0 ? <p className={styles.empty}>처리할 요청이 없어요.</p> : <div className={styles.list}>{items.map((item) => <OperationCard key={item.id} item={item} queue={queue} labels={labels} saving={savingId === item.id} onUpdate={onUpdate} render={render} />)}</div>}</section>;
}

function OperationCard({ item, queue, labels, saving, onUpdate, render }: { item: QueueItem; queue: "verification" | "review" | "review-addendum" | "tutor-review" | "correction" | "report" | "institution-member"; labels: Record<string, string>; saving: boolean; onUpdate: (queue: "verification" | "review" | "review-addendum" | "tutor-review" | "correction" | "report" | "institution-member", item: QueueItem, status: string, note: string) => Promise<void>; render: (item: QueueItem) => ReactNode }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.reviewerNote ?? item.reviewer_note ?? "");
  return <article className={styles.card}><div className={styles.cardTop}><span className={styles.status} data-status={status}>{labels[status] ?? status}</span><time>{formatDate(item.createdAt ?? item.created_at)}</time></div><div className={styles.body}>{render(item)}</div><label>처리 메모<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="이용자에게 남길 처리 사유를 입력하세요." /></label><div className={styles.actions}>{Object.entries(labels).map(([value, label]) => <button type="button" key={value} data-selected={status === value} onClick={() => setStatus(value)} disabled={saving}>{label}</button>)}</div><button className={styles.save} type="button" onClick={() => void onUpdate(queue, item, status, note)} disabled={saving}>{saving ? "저장 중" : "처리 상태 저장"}</button></article>;
}

function VerificationDocuments({ documents }: { documents: VerificationDocument[] }) {
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");
  const openOriginal = async (id: string) => {
    setOpeningId(id);
    setError("");
    try {
      const response = await fetch("/api/admin/verification-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json() as { signedUrl?: string; error?: string };
      if (!response.ok || !payload.signedUrl) { setError(payload.error ?? "원본 확인 링크를 만들지 못했어요."); return; }
      const tab = window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
      if (!tab) setError("새 탭을 열지 못했어요. 브라우저 팝업 차단을 확인해 주세요.");
    } catch { setError("원본 확인 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { setOpeningId(""); }
  };
  return <section className={styles.documents} aria-label="제출 증빙 메타데이터"><div className={styles.documentsTitle}><FolderOpen size={16} aria-hidden="true" /><strong>제출 증빙</strong><span>원본 확인 링크는 5분 후 만료됩니다.</span></div>{documents.length === 0 ? <p className={styles.documentsEmpty}>제출된 문서 메타데이터가 없어요.</p> : <div className={styles.documentsList}>{documents.map((document) => <div className={styles.documentRow} key={document.id}><div><strong>{document.documentKind}</strong><span>{document.mimeType} · {formatBytes(document.byteSize)} · {formatDate(document.uploadedAt)}</span></div><button type="button" onClick={() => void openOriginal(document.id)} disabled={openingId === document.id}>{openingId === document.id ? "링크 준비 중" : "원본 확인"}</button></div>)}</div>}{error ? <p className={styles.documentError} role="alert">{error}</p> : null}</section>;
}

function SupportQueue({ items, loaded }: { items: SupportItem[]; loaded: boolean }) {
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const update = async (item: SupportItem, status: SupportItem["status"], responseBody: string) => {
    if (responseBody.trim().length < 1 || responseBody.trim().length > 3000) { setError("답변은 1자 이상 3000자 이하로 입력해 주세요."); return; }
    setSavingId(item.id); setError("");
    try {
      const response = await fetch("/api/support/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status, responseBody }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) setError(payload.error ?? "답변을 저장하지 못했어요.");
      else window.location.reload();
    } catch { setError("답변을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { setSavingId(""); }
  };
  return <section className={styles.supportQueue}><header><div><MessageSquareText aria-hidden="true" /><h2>고객센터 문의</h2></div><span>{loaded ? `${items.length}건` : "불러오는 중"}</span></header>{error ? <p className={styles.error} role="alert">{error}</p> : null}{!loaded ? <p className={styles.empty}>문의 목록을 불러오는 중이에요.</p> : items.length === 0 ? <p className={styles.empty}>처리할 문의가 없어요.</p> : <div className={styles.list}>{items.map((item) => <SupportCard key={item.id} item={item} saving={savingId === item.id} onUpdate={update} />)}</div>}</section>;
}

function SupportCard({ item, saving, onUpdate }: { item: SupportItem; saving: boolean; onUpdate: (item: SupportItem, status: SupportItem["status"], responseBody: string) => Promise<void> }) {
  const [status, setStatus] = useState<SupportItem["status"]>(item.status);
  const [responseBody, setResponseBody] = useState(item.responseBody ?? "");
  return <article className={styles.card}><div className={styles.cardTop}><span className={styles.status} data-status={status}>{supportStatusLabels[status]}</span><time>{formatDate(item.createdAt ?? item.created_at)}</time></div><div className={styles.body}><strong>{item.title}</strong><p>{item.category ?? "문의"} · {item.body}</p></div><label>운영자 답변<textarea value={responseBody} onChange={(event) => setResponseBody(event.target.value)} minLength={1} maxLength={3000} placeholder="이 화면에서 확인할 답변을 입력하세요." /></label><div className={styles.actions}>{Object.entries(supportStatusLabels).map(([value, label]) => <button type="button" key={value} data-selected={status === value} onClick={() => setStatus(value as SupportItem["status"])} disabled={saving}>{label}</button>)}</div><button className={styles.save} type="button" disabled={saving} onClick={() => void onUpdate(item, status, responseBody)}>{saving ? "저장 중" : "답변과 상태 저장"}</button></article>;
}

function DeletionQueue({ items, loaded }: { items: DeletionRequest[]; loaded: boolean }) {
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const update = async (id: string, action: "COMPLETE" | "REJECT", note: string) => {
    setSavingId(id); setError("");
    try {
      const response = await fetch("/api/admin/account-deletions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, note }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) { setError(payload.error ?? "탈퇴 요청을 처리하지 못했어요. 서버 전용 키 설정을 확인해 주세요."); return; }
      window.location.reload();
    } catch { setError("탈퇴 요청을 처리하지 못했어요. 서버 전용 키 설정을 확인해 주세요."); }
    finally { setSavingId(""); }
  };
  return <section className={styles.deletionQueue}><header><div><Trash2 aria-hidden="true" /><h2>계정 탈퇴 요청</h2></div><span>{loaded ? `${items.length}건` : "불러오는 중"}</span></header><p className={styles.deletionNotice}>요청 시각과 처리 메모만 표시합니다. 이메일과 개인정보는 이 화면에 표시하지 않습니다.</p>{error ? <p className={styles.error} role="alert">{error}</p> : null}{!loaded ? <p className={styles.empty}>탈퇴 요청을 불러오는 중이에요.</p> : items.length === 0 ? <p className={styles.empty}>처리할 탈퇴 요청이 없어요.</p> : <div className={styles.list}>{items.map((item) => <DeletionCard key={item.id} item={item} saving={savingId === item.id} onUpdate={update} />)}</div>}</section>;
}

function DeletionCard({ item, saving, onUpdate }: { item: DeletionRequest; saving: boolean; onUpdate: (id: string, action: "COMPLETE" | "REJECT", note: string) => Promise<void> }) {
  const [note, setNote] = useState(item.processedNote ?? item.processingNote ?? item.note ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const pending = item.status === "PENDING";
  return <article className={styles.deletionCard}><div className={styles.cardTop}><span className={styles.status} data-status={item.status}>{deletionStatusLabels[item.status]}</span><time>{formatDate(item.requestedAt ?? item.requested_at)}</time></div><p>요청 ID: {item.id}</p><label>처리 메모<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="처리 사유를 입력하세요." disabled={!pending || saving} /></label>{pending ? <><label className={styles.confirmDelete}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={saving} /><span>최종 삭제는 되돌릴 수 없음을 확인했습니다.</span></label><div className={styles.deletionActions}><button type="button" onClick={() => void onUpdate(item.id, "REJECT", note)} disabled={saving}>반려</button><button type="button" onClick={() => void onUpdate(item.id, "COMPLETE", note)} disabled={!confirmed || saving}>{saving ? "처리 중" : "최종 삭제"}</button></div></> : <p className={styles.deletionReadonly}>이 요청은 현재 상태에서는 추가 처리할 수 없습니다.</p>}</article>;
}

function formatDate(value?: string) { return value ? new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }) : "접수 시각 확인 필요"; }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }
const supportStatusLabels = { RECEIVED: "접수됨", IN_PROGRESS: "처리 중", ANSWERED: "답변 완료", CLOSED: "종료" } as const;
const deletionStatusLabels = { PENDING: "접수됨", PROCESSING: "처리 중", COMPLETED: "완료", REJECTED: "반려" } as const;
