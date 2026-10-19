"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bookmark,
  Building2,
  CheckCircle2,
  Columns3,
  GraduationCap,
  MapPin,
  School,
  Star,
  UsersRound,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { formatDistance, formatFee, institutionTypeLabels, roleLabels } from "@/lib/labels";
import type { Institution, InstitutionType, UserRole } from "@/lib/types";
import { getWorkplaceSummary } from "@/lib/workplace-data";
import styles from "./institution-card.module.css";

const institutionIconMap: Record<InstitutionType, LucideIcon> = {
  CHILDCARE: Baby,
  KINDERGARTEN: School,
  ACADEMY: GraduationCap,
  TUTORING: Building2,
};

interface InstitutionCardProps {
  institution: Institution;
  variant?: "default" | "featured";
  className?: string;
  displayRole?: UserRole;
}

export function InstitutionCard({ institution, variant = "default", className, displayRole }: InstitutionCardProps) {
  const { role: accountRole, favorites, comparison, toggleFavorite, toggleComparison } = useApp();
  const role = displayRole ?? accountRole;
  const workplace = getWorkplaceSummary(institution.id);
  const [compareMessage, setCompareMessage] = useState("");
  const Icon = institutionIconMap[institution.type];
  const isFavorite = favorites.includes(institution.id);
  const isCompared = comparison.includes(institution.id);
  const roleRating = role === "TEACHER" ? { score: workplace?.publicScore ?? null, count: workplace?.verifiedReviewCount ?? 0, isPublic: (workplace?.verifiedReviewCount ?? 0) >= 3 } : institution.ratings.find((rating) => rating.role === role);
  const detailHref = "/institutions/" + institution.id;
  const cardClassName = [
    styles.card,
    variant === "featured" ? styles.featured : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const roleRatingLabel =
    roleRating?.isPublic && roleRating.score !== null
      ? roleRating.score.toFixed(1) + "점"
      : "공개 기준 대기";

  const handleCompare = () => {
    const wasCompared = isCompared;
    const result = toggleComparison(institution.id);

    if (!result.ok) {
      setCompareMessage(result.reason ?? "비교함에 담지 못했어요.");
      return;
    }

    setCompareMessage(wasCompared ? "비교함에서 뺐어요." : "비교함에 담았어요.");
  };

  return (
    <article className={cardClassName}>
      <div className={styles.header}>
        <div className={styles.typeIcon} aria-hidden="true">
          <Icon size={22} strokeWidth={2.2} />
        </div>

        <div className={styles.titleBlock}>
          <div className={styles.metaRow}>
            <span>{institutionTypeLabels[institution.type]}</span>
            <span>{institution.neighborhood}</span>
            {institution.verified ? (
              <span className={styles.verified}>
                <CheckCircle2 size={13} aria-hidden="true" />
                출처 확인
              </span>
            ) : (
              <span>추가 확인 필요</span>
            )}
          </div>

          <h3 className={styles.title}>
            <Link href={detailHref}>{institution.name}</Link>
          </h3>

          <p className={styles.address}>
            <MapPin size={14} aria-hidden="true" />
            <span>{institution.address}</span>
          </p>
        </div>
      </div>

      <div className={styles.roleScores} aria-label="역할별 평점 · 체험용">
        {(["PARENT", "STUDENT", "TEACHER"] as const).map((ratingRole) => {
          const rating = institution.ratings.find((item) => item.role === ratingRole);
          const count = ratingRole === "TEACHER" ? workplace?.verifiedReviewCount ?? 0 : rating?.count ?? 0;
          const score = ratingRole === "TEACHER" ? count >= 3 ? workplace?.publicScore : null : rating?.isPublic ? rating.score : null;
          return <div key={ratingRole} data-active={role === ratingRole}><span>{roleLabels[ratingRole]}</span><strong>{score != null ? score.toFixed(1) : ratingRole === "TEACHER" ? "공개 대기" : "—"}</strong><small>{ratingRole === "TEACHER" && count < 3 ? `${count}/3건` : `${count}건`}</small></div>;
        })}
      </div>

      <div className={styles.metrics} aria-label={institution.name + " 핵심 정보"}>
        <div>
          <span className={styles.metricLabel}>{roleLabels[role]} 인증 평점</span>
          <strong>{roleRatingLabel}</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>{roleLabels[role]} 후기</span>
          <strong>{roleRating?.count ?? 0}건</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>거리</span>
          <strong>{formatDistance(institution.distanceM)}</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>비용</span>
          <strong>{formatFee(institution.monthlyFee)}</strong>
        </div>
      </div>

      <div className={styles.tagList} aria-label="기관 태그">
        {institution.tags.slice(0, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <p className={styles.highlight}>
        <UsersRound size={15} aria-hidden="true" />
        <span>{institution.reviewHighlights[0]}</span>
      </p>

      <div className={styles.footer}>
        <div className={styles.source}>
          <span className={styles.demoBadge}>체험용 데이터</span>
          <span>{institution.sourceName}</span>
          <time dateTime={institution.sourceDate}>{institution.sourceDate}</time>
          <span>{roleLabels[role]} 후기 {roleRating?.count ?? 0}건</span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-pressed={isFavorite}
            aria-label={(isFavorite ? "저장됨" : "저장") + ": " + institution.name + " 즐겨찾기"}
            onClick={() => toggleFavorite(institution.id)}
          >
            <Bookmark size={17} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
            <span>{isFavorite ? "저장됨" : "저장"}</span>
          </button>

          <button
            type="button"
            className={styles.iconButton}
            aria-pressed={isCompared}
            aria-label={(isCompared ? "비교중" : "비교") + ": " + institution.name + " 비교함"}
            onClick={handleCompare}
          >
            <Columns3 size={17} aria-hidden="true" />
            <span>{isCompared ? "비교중" : "비교"}</span>
          </button>
        </div>
      </div>

      {compareMessage ? (
        <p className={styles.notice} role="status">
          <Star size={14} aria-hidden="true" />
          <span>{compareMessage}</span>
        </p>
      ) : null}
    </article>
  );
}
