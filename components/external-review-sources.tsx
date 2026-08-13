import { ExternalLink } from "lucide-react";
import { getExternalReviewSources, isSafeExternalReviewUrl } from "@/lib/external-review-data";
import type { CanonicalExternalReviewSource, ExternalReviewSource } from "@/lib/external-review-data";
import type { Institution } from "@/lib/types";
import styles from "./external-review-sources.module.css";

interface ExternalReviewSourcesProps {
  institution?: Institution;
  canonicalSources?: CanonicalExternalReviewSource[];
}

const formatRating = (source: ExternalReviewSource) => {
  if (source.rating === null) return "원문에서 확인";

  return source.rating.toFixed(1) + "점 · EDU톡 체험 수치";
};

const formatReviewCount = (source: ExternalReviewSource) => {
  if (source.reviewCount === null) return "원문에서 확인";

  return source.reviewCount.toLocaleString("ko-KR") + "건 · EDU톡 체험 수치";
};

export function ExternalReviewSources({ institution, canonicalSources }: ExternalReviewSourcesProps) {
  const isCanonical = Boolean(canonicalSources);
  const sources = institution ? getExternalReviewSources(institution) : [];

  return (
    <section className={styles.section} aria-labelledby="external-review-sources-title">
      <div className={styles.header}>
        <span className={styles.eyebrow}>후기 출처</span>
        <h2 id="external-review-sources-title">외부 후기 출처별 보기</h2>
        <p>
          {isCanonical ? "운영자가 확인한 외부 원문 링크만 보여줘요. 외부 평점과 후기 수는 수집하거나 표시하지 않아요." : "기관명과 주소로 각 플랫폼의 검색 또는 원문 화면을 열 수 있어요. 외부 평점은 제공되는 공식 연동 경로가 없어 임의로 표시하지 않아요."}
        </p>
      </div>

      <p className={styles.notice}>
        외부 수치는 집계할 수 없고 EDU톡 점수·순위에 반영하지 않아요.
      </p>

      <div className={styles.sourceList}>
        {isCanonical ? canonicalSources!.length ? canonicalSources!.map((source) => (
          <article key={`${source.platform}-${source.checkedAt}`} className={styles.sourceCard}>
            <div className={styles.cardHeader}><div><span className={styles.sourceType}>외부 원문</span><h3>{source.sourceLabel}</h3></div><span className={styles.syntheticBadge}>{source.status === "LINK_ONLY" ? "원문 링크" : "연결 불가"}</span></div>
            <dl className={styles.metrics} aria-label={`${source.sourceLabel} 외부 후기 상태`}><div><dt>플랫폼</dt><dd>{source.platform}</dd></div><div><dt>확인일</dt><dd>{source.checkedAt.slice(0, 10)}</dd></div></dl>
            {source.status === "LINK_ONLY" && source.originalUrl && isSafeExternalReviewUrl(source.originalUrl) ? <a className={styles.sourceLink} href={source.originalUrl} target="_blank" rel="noreferrer"><span>확인된 원문 열기</span><ExternalLink size={16} aria-hidden="true" /></a> : <p className={styles.unavailable}>공개 확인된 원문 링크가 없어요.</p>}
          </article>
        )) : <p className={styles.empty}>공개 확인된 외부 원문 링크가 없어요. 검색 결과를 원문으로 보거나 기관 동일성을 확정하지 않습니다.</p> : sources.map((source) => (
          <article key={source.id} className={styles.sourceCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.sourceType}>
                  {source.isExternal ? "외부 플랫폼" : "EDU톡 내부"}
                </span>
                <h3>{source.name}</h3>
              </div>
              {source.isExternal ? (
                <span className={styles.syntheticBadge}>원문 연결</span>
              ) : source.isSynthetic ? (
                <span className={styles.syntheticBadge}>체험 데이터</span>
              ) : null}
            </div>

            <p className={styles.description}>{source.description}</p>

            <dl className={styles.metrics} aria-label={source.name + " 후기 수치"}>
              <div>
                <dt>평점</dt>
                <dd>{formatRating(source)}</dd>
              </div>
              <div>
                <dt>후기 수</dt>
                <dd>{formatReviewCount(source)}</dd>
              </div>
            </dl>

            <a
              className={styles.sourceLink}
              href={source.href}
              target={source.isExternal ? "_blank" : undefined}
              rel={source.isExternal ? "noreferrer" : undefined}
              aria-label={source.name + " " + source.linkLabel}
            >
              <span>{source.linkLabel}</span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
      {!isCanonical && <p className={styles.searchBoundary}>검색 결과 바로가기는 원문 링크가 아니며, 기관 동일성을 확인하지 않았어요.</p>}
    </section>
  );
}
