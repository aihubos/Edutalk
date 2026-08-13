"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Clock3, MessageSquareText, ReceiptText, ShieldCheck, UsersRound } from "lucide-react";
import type { CanonicalInstitution } from "@/lib/canonical-institutions";
import styles from "./canonical-trust-overview.module.css";

type ReviewSummary = { role: "PARENT" | "STUDENT" | "TEACHER"; count: number; isPublic: boolean };
type OfficialReply = { published_at: string };

export function CanonicalTrustOverview({ institution }: { institution: CanonicalInstitution }) {
  const [reviewSummaries, setReviewSummaries] = useState<ReviewSummary[] | null>(null);
  const [officialReplies, setOfficialReplies] = useState<OfficialReply[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/institutions/${encodeURIComponent(institution.publicSlug)}/reviews`).then(async (response) => {
        const payload = await response.json().catch(() => null) as { mode?: string; summaries?: ReviewSummary[] } | null;
        if (!response.ok || payload?.mode !== "supabase") throw new Error("review summary unavailable");
        return payload.summaries ?? [];
      }),
      fetch(`/api/institutions/${encodeURIComponent(institution.publicSlug)}/official-replies`).then(async (response) => {
        const payload = await response.json().catch(() => null) as { mode?: string; replies?: OfficialReply[] } | null;
        if (!response.ok || payload?.mode !== "supabase") throw new Error("official reply unavailable");
        return payload.replies ?? [];
      }),
    ]).then(([summaries, replies]) => {
      if (!active) return;
      setReviewSummaries(summaries);
      setOfficialReplies(replies);
    }).catch(() => {
      if (!active) return;
      setLoadFailed(true);
    });
    return () => { active = false; };
  }, [institution.publicSlug]);

  const metrics = useMemo(() => {
    const parent = reviewSummaries?.find((item) => item.role === "PARENT");
    const teacher = reviewSummaries?.find((item) => item.role === "TEACHER");
    const officialFieldCount = institution.provenance.filter((item) => item.trustLevel === "INSTITUTION_CONFIRMED").length;
    const publicDataCount = institution.provenance.filter((item) => item.trustLevel === "PUBLIC_DATA").length;
    const latestCost = institution.costs.map((item) => item.checkedAt).sort((a, b) => b.localeCompare(a))[0] ?? null;
    const latestReply = officialReplies?.map((item) => item.published_at).sort((a, b) => b.localeCompare(a))[0] ?? null;
    const latestHandling = institution.publicHandlingTimeline[0] ?? null;
    return { parent, teacher, officialFieldCount, publicDataCount, latestCost, latestReply, latestHandling };
  }, [institution.costs, institution.provenance, institution.publicHandlingTimeline, officialReplies, reviewSummaries]);

  return <section className={styles.card} aria-labelledby="canonical-overview-title">
    <header><div><ShieldCheck aria-hidden="true" /><div><p>기관 신뢰 한눈에 보기</p><h2 id="canonical-overview-title">공개 근거와 인증 경험을 먼저 확인하세요</h2></div></div><span>{loadFailed ? "일부 집계 확인 필요" : "공개 승인 정보"}</span></header>
    <div className={styles.grid}>
      <Metric icon={Clock3} label="공공정보 최신성" value={institution.checkedAt ? institution.checkedAt.slice(0, 10) : "기관 확인 필요"} helper={metrics.publicDataCount ? `공공데이터 근거 ${metrics.publicDataCount}개` : "공개 근거 확인 필요"} />
      <Metric icon={BadgeCheck} label="기관 공식 확인" value={metrics.officialFieldCount ? `${metrics.officialFieldCount}개 필드` : "기관 확인 필요"} helper="기관 확인 등급만 계산" />
      <Metric icon={UsersRound} label="학부모 인증 후기" value={metrics.parent ? `${metrics.parent.count}건` : reviewSummaries ? "0건" : "불러오는 중"} helper="학생·교육자 점수와 분리" />
      <Metric icon={UsersRound} label="교육자 인증 후기" value={metrics.teacher ? `${metrics.teacher.count}건` : reviewSummaries ? "0건" : "불러오는 중"} helper={metrics.teacher?.isPublic ? "3건 공개 기준 충족" : "3건 이상부터 점수 공개"} />
      <Metric icon={ReceiptText} label="최근 비용 확인" value={metrics.latestCost ? metrics.latestCost.slice(0, 10) : "기관 확인 필요"} helper="공개 승인 비용 항목 기준" />
      <Metric icon={MessageSquareText} label="최근 공식 답변" value={metrics.latestReply ? metrics.latestReply.slice(0, 10) : officialReplies ? "공개 답변 없음" : "불러오는 중"} helper={metrics.latestHandling ? `최근 정정·신고 처리 ${metrics.latestHandling.handledAt.slice(0, 10)}` : "공개 처리 이력 없음"} />
    </div>
    <p className={styles.note}>각 숫자는 서로 합산하지 않으며, 확인되지 않은 값은 점수나 수치로 추정하지 않습니다.</p>
  </section>;
}

function Metric({ icon: Icon, label, value, helper }: { icon: typeof Clock3; label: string; value: string; helper: string }) {
  return <article><Icon aria-hidden="true" /><div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></article>;
}
