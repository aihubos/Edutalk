"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCcw } from "lucide-react";
import styles from "./server-observability.module.css";

type Payload = { since: string; counts: Record<string, number>; queues: Record<string, number>; productEvents: Record<string, number>; audit: Array<{ action: string; target_type: string; target_id: string | null; created_at: string }>; error?: string };
const labels: Record<string, string> = { verifications: "인증", reviews: "후기", reports: "신고", supports: "지원", notifications: "알림", syncFailures: "동기화 실패" };
const eventLabels: Record<string, string> = { LOGIN_STARTED: "로그인 시작", ROLE_SELECTED: "대표 역할 선택", LOCATION_SELECTED: "관심 지역 선택", ONBOARDING_COMPLETED: "온보딩 완료", INSTITUTION_VIEWED: "기관 상세 조회", FAVORITE_ADDED: "관심 기관 추가", COMPARISON_CREATED: "비교함 생성", VERIFICATION_SUBMITTED: "인증 요청 제출", REVIEW_SUBMITTED: "후기 제출", ACCOUNT_DELETION_STARTED: "계정 삭제 시작" };

export function ServerObservability() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); setError(""); try { const response = await fetch("/api/admin/observability"); const payload = await response.json() as Payload; if (!response.ok) { setError(payload.error ?? "운영 지표를 불러오지 못했어요."); return; } setData(payload); } catch { setError("운영 지표를 불러오지 못했어요."); } finally { setLoading(false); } };
  useEffect(() => { const frame = window.requestAnimationFrame(() => { void load(); }); return () => window.cancelAnimationFrame(frame); }, []);
  return <section className={styles.panel}>
    <header><div><p>운영 관찰</p><h2>최근 24시간 지표</h2></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} aria-hidden />새로고침</button></header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {loading && !data ? <p className={styles.empty} aria-busy="true">운영 지표를 불러오는 중이에요.</p> : null}
    {data ? <><div className={styles.metrics}>{Object.entries(data.counts).map(([key, value]) => <div key={key}><span>{labels[key]}</span><strong>{value}건</strong></div>)}</div><div className={styles.queue}><h3>미처리 큐</h3>{Object.entries(data.queues).map(([key, value]) => <p key={key}>{labels[key]} <strong>{value}건</strong></p>)}</div><div className={styles.events}><h3>핵심 전환 흐름</h3><p>외부 분석 도구가 아닌 내부 최소 집계입니다. 개인 식별자와 원문은 포함하지 않습니다.</p>{Object.values(data.productEvents).some((value) => value > 0) ? Object.entries(data.productEvents).map(([key, value]) => <div key={key}><span>{eventLabels[key]}</span><strong>{value}건</strong></div>) : <p className={styles.empty}>최근 24시간 제품 이벤트가 없어요.</p>}</div><div className={styles.audit}><h3><Activity size={16} aria-hidden />최근 감사 이력</h3>{data.audit.length ? data.audit.map((item, index) => <article key={`${item.created_at}-${index}`}><strong>{item.action}</strong><span>{item.target_type}{item.target_id ? ` · ${item.target_id.slice(0, 8)}` : ""}</span><time>{new Date(item.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></article>) : <p className={styles.empty}>최근 감사 이력이 없어요.</p>}</div></> : null}
  </section>;
}
