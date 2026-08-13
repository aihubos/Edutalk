"use client";

import Link from "next/link";
import { BadgeCheck, EyeOff, LockKeyhole, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { emptyOperationsState, operationsStorageKey, type OperationsState } from "@/lib/operations-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { UserRole } from "@/lib/types";
import styles from "./review-access-panel.module.css";

export function ReviewAccessPanel({ institutionId, highlights }: { institutionId: string; highlights: string[] }) {
  const { role, hydrated: appHydrated } = useApp();
  const [operations, setOperations] = useState<OperationsState>(emptyOperationsState);
  const [loadedAt, setLoadedAt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [approvedHighlights, setApprovedHighlights] = useState<Array<{ id: string; strength: string; addenda: Array<{ id: string; body: string }> }>>([]);
  const [serverAccessEndsAt, setServerAccessEndsAt] = useState<string | null>(null);
  const [parentPreviews, setParentPreviews] = useState<Array<{ strength_preview: string; created_at: string }>>([]);
  const [hidingId, setHidingId] = useState("");
  const [hideError, setHideError] = useState("");
  const configured = isSupabaseConfigured();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(operationsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OperationsState>;
        setOperations({ verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [], corrections: [], reports: [] });
      }
    } finally {
      setLoadedAt(new Date().toISOString());
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    void fetch(`/api/reviews?institution=${encodeURIComponent(institutionId)}&role=${role}`).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { mode?: string; accessEndsAt?: string | null; reviews?: Array<{ id?: string; relation?: UserRole; strength?: string }>; addenda?: Array<{ id?: string; review_id?: string; body?: string }>; previews?: Array<{ strength_preview?: string; created_at?: string }> };
      if (payload.mode === "supabase") {
        setServerAccessEndsAt(payload.accessEndsAt ?? null);
        setParentPreviews((payload.previews ?? []).flatMap((preview) => preview.strength_preview && preview.created_at ? [{ strength_preview: preview.strength_preview, created_at: preview.created_at }] : []));
        setApprovedHighlights((payload.reviews ?? []).flatMap((review) => review.id && review.relation === role && review.strength ? [{ id: review.id, strength: review.strength, addenda: (payload.addenda ?? []).flatMap((addendum) => addendum.review_id === review.id && addendum.id && addendum.body ? [{ id: addendum.id, body: addendum.body }] : []) }] : []));
      }
    });
  }, [configured, institutionId, role]);

  const localAccessEndsAt = useMemo(() => {
    const eligible = operations.verifications
      .filter((request) => request.status === "APPROVED" && request.kind === "INSTITUTION_RELATION" && request.institutionId === institutionId && request.role === role && request.reviewAccessEndsAt && request.reviewAccessEndsAt > loadedAt)
      .map((request) => request.reviewAccessEndsAt as string)
      .sort();
    return eligible.at(-1) ?? null;
  }, [institutionId, loadedAt, operations.verifications, role]);
  const accessEndsAt = configured ? serverAccessEndsAt : localAccessEndsAt;

  const hideReview = async (reviewId: string) => {
    setHidingId(reviewId); setHideError("");
    try {
      const response = await fetch("/api/review-preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "후기를 숨기지 못했어요.");
      setApprovedHighlights((current) => current.filter((item) => item.id !== reviewId));
    } catch (error) { setHideError(error instanceof Error ? error.message : "후기를 숨기지 못했어요."); }
    finally { setHidingId(""); }
  };

  if (!appHydrated || !loaded) return <p className={styles.loading} aria-busy="true">후기 열람 상태를 확인하고 있어요.</p>;

  if (accessEndsAt) {
    return <div className={styles.access}>
      <p className={styles.accessNotice}><BadgeCheck size={18} aria-hidden /> {roleLabel(role)} 후기 열람권이 {accessEndsAt.slice(0, 10)}까지 있어요.</p>
      <p className={styles.demo}>{configured ? "계정에 부여된 역할별 열람권입니다." : "브라우저 체험용 권한입니다. 실제 서버 권한이나 이용 관계 확인이 아닙니다."}</p>
      {hideError ? <p className={styles.preferenceError} role="alert">{hideError}</p> : null}
      <ul className={styles.highlights}>{configured
        ? approvedHighlights.map((highlight) => <li key={highlight.id}><UsersRound size={16} aria-hidden /><span>{highlight.strength}</span>{highlight.addenda.length ? <div className={styles.addenda}><strong>작성자 추가 설명</strong>{highlight.addenda.map((addendum) => <p key={addendum.id}>{addendum.body}</p>)}</div> : null}<div className={styles.highlightActions}><Link className={styles.reportLink} href={`/trust-center?tab=report&institution=${encodeURIComponent(institutionId)}&targetType=institution_review&targetId=${encodeURIComponent(highlight.id)}`}>신고</Link><button type="button" className={styles.hideButton} onClick={() => void hideReview(highlight.id)} disabled={hidingId === highlight.id}><EyeOff size={14} aria-hidden />{hidingId === highlight.id ? "숨기는 중" : "이 후기 숨기기"}</button></div></li>)
        : highlights.map((highlight) => <li key={highlight}><UsersRound size={16} aria-hidden /><span>{highlight}</span></li>)}</ul>
    </div>;
  }

  return <div className={styles.locked}>
    <LockKeyhole size={22} aria-hidden />
    <div>
      <strong>후기 하이라이트는 인증 뒤 볼 수 있어요</strong>
      <p>현재 {roleLabel(role)} 역할에는 이 기관의 유효한 후기 열람권이 없어요. 기관 이용·근무 관계 인증이 승인되면 6개월 동안 역할별 상세 후기를 볼 수 있습니다.</p>
      {configured && role === "PARENT" && parentPreviews.length ? <div className={styles.previews}><strong>학부모 후기 장점 미리보기</strong>{parentPreviews.map((preview) => <p key={`${preview.created_at}-${preview.strength_preview}`}><span>{preview.strength_preview}</span><small>{preview.created_at.slice(0, 10)} 승인 후기</small></p>)}<small>개선점·추천 대상·추가 설명은 관계 인증 뒤에 열립니다.</small></div> : null}
      <Link href={`/trust-center?institution=${institutionId}`}>인증 요청하기</Link>
      <small>{configured ? "계정 인증 승인과 유효기간이 확인된 경우에만 열립니다." : "체험 모드에서는 요청과 권한이 이 브라우저에만 저장되며 실제 서버 권한이 아닙니다."}</small>
    </div>
  </div>;
}

function roleLabel(role: UserRole) {
  if (role === "PARENT") return "학부모";
  if (role === "STUDENT") return "학생";
  return "선생님";
}
