"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, RefreshCcw, Trophy } from "lucide-react";
import styles from "./server-data-operations.module.css";

type SyncRun = { id: string; source: string; status: string; startedAt: string; finishedAt: string | null; recordsSeen: number; normalized: number; duplicates: number; errors: string };
type QualityIssue = { id: string; runId: string | null; institutionId: string | null; issueType: string; status: "OPEN" | "RESOLVED"; summary: string; note: string; createdAt: string; reviewedAt: string | null };
type Operations = { runs: SyncRun[]; issues: QualityIssue[]; isAdmin?: boolean; error?: string };

const statusLabels: Record<string, string> = { RUNNING: "진행 중", SUCCEEDED: "완료", PARTIAL: "일부 완료", FAILED: "실패", OPEN: "미해결", RESOLVED: "해결" };
const issueLabels: Record<string, string> = { DUPLICATE_CANDIDATE: "중복 후보", OUT_OF_SERVICE_ZONE: "서비스 지역 확인", MISSING_REQUIRED_FIELD: "필수값 누락", INVALID_PUBLIC_SLUG: "공개 주소 확인", PUBLIC_SLUG_COLLISION: "공개 주소 충돌" };

export function ServerDataOperations() {
  const [data, setData] = useState<Operations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [capturingRanking, setCapturingRanking] = useState(false);
  const [rankingNotice, setRankingNotice] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/data-operations");
      const payload = await response.json() as Operations;
      if (!response.ok) throw new Error(payload.error ?? "공공데이터 운영 현황을 불러오지 못했어요.");
      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "공공데이터 운영 현황을 불러오지 못했어요.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updateIssue = async (issue: QualityIssue, status: "OPEN" | "RESOLVED", note: string) => {
    setSavingId(issue.id); setError("");
    try {
      const response = await fetch("/api/admin/data-operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: issue.id, status, note }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "품질 이슈를 저장하지 못했어요.");
      await load();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "품질 이슈를 저장하지 못했어요."); }
    finally { setSavingId(""); }
  };

  const captureWeeklyRanking = async () => {
    setCapturingRanking(true); setError(""); setRankingNotice("");
    try {
      const response = await fetch("/api/admin/data-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture-weekly-ranking" }) });
      const payload = await response.json() as { weekStart?: string; capturedCount?: number; error?: string };
      if (!response.ok || !payload.weekStart || typeof payload.capturedCount !== "number") throw new Error(payload.error ?? "이번 주 순위를 확정하지 못했어요.");
      setRankingNotice(`${payload.weekStart} 주차 순위 ${payload.capturedCount}건을 확정했어요.`);
    } catch (captureError) { setError(captureError instanceof Error ? captureError.message : "이번 주 순위를 확정하지 못했어요."); }
    finally { setCapturingRanking(false); }
  };

  if (loading) return <section className={styles.panel} aria-busy="true"><div className={styles.panelHeader}><Database aria-hidden="true" /><div><p>공공데이터 운영</p><h2>적재 현황을 불러오는 중이에요</h2></div></div></section>;
  if (!data) return <section className={styles.panel} role="alert"><div className={styles.panelHeader}><AlertTriangle aria-hidden="true" /><div><p>공공데이터 운영</p><h2>현황을 확인할 수 없어요</h2></div></div><p className={styles.error}>{error}</p><button className={styles.refresh} type="button" onClick={() => void load()}>다시 시도</button></section>;

  return <section className={styles.panel} aria-labelledby="data-operations-title">
    <div className={styles.panelHeader}><Database aria-hidden="true" /><div><p>공공데이터 운영</p><h2 id="data-operations-title">CLI 적재 현황과 품질 큐</h2><span>이 화면에서는 외부 동기화를 실행하지 않고, CLI `--write` 결과만 확인·처리합니다.</span></div><button className={styles.refresh} type="button" onClick={() => void load()}><RefreshCcw size={16} aria-hidden="true" />새로고침</button></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <section className={styles.rankingCapture} aria-labelledby="ranking-capture-title"><div><Trophy aria-hidden="true" /><div><h3 id="ranking-capture-title">이번 주 순위 확정</h3><p>ADMIN만 오늘이 속한 월요일 기준의 공개 승인 후기 순위를 스냅샷으로 저장할 수 있어요. 같은 주에 다시 실행하면 기존 스냅샷을 덮어씁니다.</p></div></div>{data.isAdmin ? <button type="button" onClick={() => void captureWeeklyRanking()} disabled={capturingRanking}>{capturingRanking ? "순위 확정 중" : "이번 주 순위 확정"}</button> : <p>DATA_OPERATOR는 동기화·품질 이슈만 처리할 수 있어요.</p>}{rankingNotice ? <p role="status">{rankingNotice}</p> : null}</section>
    <section className={styles.section}><div className={styles.sectionTitle}><h3>최근 동기화 실행</h3><span>{data.runs.length}건</span></div>{data.runs.length === 0 ? <p className={styles.empty}>아직 CLI 적재 실행 이력이 없어요.</p> : <div className={styles.runList}>{data.runs.map((run) => <article className={styles.runCard} key={run.id}><div><strong>{run.source}</strong><span className={styles.status} data-status={run.status}>{statusLabels[run.status] ?? run.status}</span></div><dl><div><dt>시작</dt><dd>{formatDate(run.startedAt)}</dd></div><div><dt>종료</dt><dd>{run.finishedAt ? formatDate(run.finishedAt) : "진행 중"}</dd></div><div><dt>확인</dt><dd>{run.recordsSeen}건</dd></div><div><dt>정규화·적재</dt><dd>{run.normalized}건</dd></div><div><dt>중복 후보</dt><dd>{run.duplicates}건</dd></div></dl>{run.errors ? <p className={styles.runError}>{run.errors}</p> : null}</article>)}</div>}</section>
    <section className={styles.section}><div className={styles.sectionTitle}><h3>미해결 품질 이슈</h3><span>{data.issues.length}건</span></div>{data.issues.length === 0 ? <p className={styles.empty}><CheckCircle2 size={18} aria-hidden="true" />미해결 품질 이슈가 없어요.</p> : <div className={styles.issueList}>{data.issues.map((issue) => <QualityIssueCard key={issue.id} issue={issue} saving={savingId === issue.id} onSave={updateIssue} />)}</div>}</section>
  </section>;
}

function QualityIssueCard({ issue, saving, onSave }: { issue: QualityIssue; saving: boolean; onSave: (issue: QualityIssue, status: "OPEN" | "RESOLVED", note: string) => Promise<void> }) {
  const [note, setNote] = useState(issue.note);
  return <article className={styles.issueCard}><div className={styles.issueTop}><div><span className={styles.status} data-status="OPEN">미해결</span><strong>{issueLabels[issue.issueType] ?? issue.issueType}</strong></div><time>{formatDate(issue.createdAt)}</time></div><p>{issue.summary}</p><label>처리 메모<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="확인 내용 또는 후속 처리 메모" disabled={saving} /></label><div className={styles.issueActions}><button type="button" onClick={() => void onSave(issue, "OPEN", note)} disabled={saving}>메모 저장</button><button type="button" onClick={() => void onSave(issue, "RESOLVED", note)} disabled={saving}>{saving ? "저장 중" : "해결 처리"}</button></div></article>;
}

function formatDate(value: string) { return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }); }
