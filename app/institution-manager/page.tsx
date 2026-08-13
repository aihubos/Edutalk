"use client";

import { useEffect, useState } from "react";
import { Building2, MessageSquareText, RefreshCcw } from "lucide-react";
import styles from "./institution-manager.module.css";

type Correction = { id: string; institutionName: string; issue: string; currentSummary: string; requestedSummary: string; status: string; createdAt: string };
type Review = { id: string; institutionName: string; relation: string; strength: string; improvement: string; recommendTo: string; createdAt: string };
type Payload = { memberships?: Array<{ institutionName: string }>; corrections?: Correction[]; reviews?: Review[]; error?: string };

export default function InstitutionManagerPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const load = async () => { const response = await fetch("/api/institution-manager"); const payload = await response.json() as Payload; if (!response.ok) { setError(payload.error ?? "기관 관리 정보를 불러오지 못했어요."); return; } setData(payload); };
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const submit = async (review: Review) => { const body = (drafts[review.id] ?? "").trim(); if (!body) return; setSaving(review.id); const response = await fetch("/api/institution-manager", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId: review.id, body }) }); if (!response.ok) { const payload = await response.json() as Payload; setError(payload.error ?? "답변을 저장하지 못했어요."); } else { setDrafts((current) => ({ ...current, [review.id]: "" })); await load(); } setSaving(""); };
  if (error && !data) return <main className={styles.page}><section className={styles.empty}><Building2 /><h1>기관 관계 승인 계정이 필요해요</h1><p>{error}</p></section></main>;
  return <main className={styles.page}><header><p>기관 관계자</p><h1>기관 관리</h1><span>승인된 기관: {data?.memberships?.map((item) => item.institutionName).join(", ") || "없음"}</span></header>{error ? <p className={styles.error}>{error}</p> : null}<section className={styles.section}><div className={styles.title}><RefreshCcw /><h2>기관 정보 정정 요청</h2></div>{data ? (data.corrections?.length ? data.corrections.map((item) => <article key={item.id}><strong>{item.institutionName} · {item.issue}</strong><p>현재: {item.currentSummary}</p><p>제안: {item.requestedSummary}</p><small>{item.status}</small></article>) : <p className={styles.none}>확인할 정정 요청이 없어요.</p>) : <p className={styles.none}>불러오는 중이에요.</p>}</section><section className={styles.section}><div className={styles.title}><MessageSquareText /><h2>승인된 후기 공식 답변</h2></div><p className={styles.note}>작성자 식별자와 인증 증빙은 표시되지 않습니다.</p>{data?.reviews?.length ? data.reviews.map((item) => <article key={item.id}><strong>{item.institutionName} · {item.relation} 후기</strong><p>{item.strength}</p><p>{item.improvement}</p><textarea value={drafts[item.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={3000} placeholder="기관의 공식 답변을 입력하세요." /><button type="button" disabled={saving === item.id || !(drafts[item.id] ?? "").trim()} onClick={() => void submit(item)}>{saving === item.id ? "저장 중" : "공식 답변 게시"}</button></article>) : <p className={styles.none}>답변할 승인 후기가 없어요.</p>}</section></main>;
}
