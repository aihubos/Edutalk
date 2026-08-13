"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCcw, ServerCog } from "lucide-react";
import styles from "./server-runtime-status.module.css";

type RuntimeStatus = { app: "ok" | "degraded"; timestamp: string; dataMode: string; integrations: Record<string, boolean>; deep?: { status: "ok" | "degraded"; featureFlagCount: number; recentSyncFailure: boolean }; error?: string };
const labels: Record<string, string> = { supabase: "Supabase", openai: "OpenAI", stripe: "Stripe", publicData: "공공데이터" };

export function ServerRuntimeStatus() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/health?deep=1");
      const payload = await response.json() as RuntimeStatus;
      if (!response.ok) throw new Error(payload.error ?? "운영 상태를 불러오지 못했어요.");
      setStatus(payload);
    } catch (loadError) { setStatus(null); setError(loadError instanceof Error ? loadError.message : "운영 상태를 불러오지 못했어요."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return <section className={styles.panel} aria-labelledby="runtime-status-title">
    <div className={styles.header}><ServerCog aria-hidden="true" /><div><p>운영 상태</p><h2 id="runtime-status-title">서비스 연결 상태</h2><span>외부 결제나 AI 호출 없이 설정과 최소 DB 상태만 확인합니다.</span></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} aria-hidden="true" />새로고침</button></div>
    {loading ? <p className={styles.state} aria-busy="true">운영 상태를 불러오는 중이에요.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {status ? <><div className={styles.overview} data-status={status.app}><span>{status.app === "ok" ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}{status.app === "ok" ? "정상" : "확인 필요"}</span><small>{status.dataMode} · {formatDate(status.timestamp)}</small></div><div className={styles.integrationList}>{Object.entries(status.integrations).map(([key, configured]) => <div key={key}><span>{labels[key] ?? key}</span><strong data-configured={configured}>{configured ? "설정됨" : "미설정"}</strong></div>)}</div>{status.deep ? <p className={styles.deepNote}>기능 플래그 {status.deep.featureFlagCount}개 · 최근 동기화 실패 {status.deep.recentSyncFailure ? "있음" : "없음"}</p> : null}</> : null}
  </section>;
}

function formatDate(value: string) { return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }); }
