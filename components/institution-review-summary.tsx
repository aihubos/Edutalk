"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import styles from "./institution-review-summary.module.css";

type ReviewRole = "PARENT" | "STUDENT" | "TEACHER";
type Summary = { role: ReviewRole; count: number; average: number | null; items: Array<{ key: string; average: number }>; isPublic: boolean };

const roleLabels: Record<ReviewRole, string> = { PARENT: "학부모", STUDENT: "학생", TEACHER: "선생님" };
const scoreLabels: Record<string, string> = {
  communication: "소통", care: "돌봄", growth: "성장", understanding: "이해도", pace: "수업 속도", motivation: "동기", commuteConvenience: "이동 편의", scheduleFit: "시간대 적합", schoolCommute: "학교에서 이동", classAtmosphere: "수업 분위기", homeworkLoad: "숙제 부담", classSize: "반 인원 체감", teachingExplanation: "설명 방식", levelTestHelpfulness: "레벨테스트 도움", peerComposition: "또래 구성", studySpace: "자습공간", examPreparation: "시험대비", leadership: "운영", workload: "업무량", welfare: "복지", culture: "문화", educationPhilosophy: "교육철학",
};

export function InstitutionReviewSummary({ institutionId }: { institutionId: string }) {
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [message, setMessage] = useState("계정 후기 집계를 불러오고 있어요.");

  useEffect(() => {
    void fetch(`/api/institutions/${encodeURIComponent(institutionId)}/reviews`).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { mode?: string; summaries?: Summary[]; error?: string };
      if (!response.ok || payload.mode !== "supabase") { setMessage(payload.error ?? "계정 후기 집계를 불러오지 못했어요."); return; }
      setSummaries(payload.summaries ?? []);
    }).catch(() => setMessage("계정 후기 집계를 불러오지 못했어요."));
  }, [institutionId]);

  if (!summaries) return <p className={styles.status} aria-live="polite">{message}</p>;

  return <div className={styles.wrap}>
    <p className={styles.source}><BarChart3 size={16} aria-hidden /> 승인된 계정 후기만 집계합니다.</p>
    <div className={styles.list}>
      {summaries.map((summary) => (
        <article className={styles.card} key={summary.role}>
          <div className={styles.top}><span>{roleLabels[summary.role]}</span><strong>{summary.average === null ? "공개 기준 대기" : `${summary.average.toFixed(1)}점`}</strong></div>
          <p>{summary.count}건 기준{summary.role === "TEACHER" && !summary.isPublic ? " · 3건 이상부터 공개" : ""}</p>
          {summary.items.length ? <dl>{summary.items.map((item) => <div key={item.key}><dt>{scoreLabels[item.key] ?? item.key}</dt><dd>{item.average.toFixed(1)}</dd></div>)}</dl> : null}
        </article>
      ))}
    </div>
  </div>;
}
