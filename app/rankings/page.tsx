"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  ChevronRight,
  Crown,
  FileCheck2,
  Medal,
  MessageCircleReply,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { institutions } from "@/lib/demo-data";
import { institutionTypeLabels, zoneLabels } from "@/lib/labels";
import { getInstitutionRankings, institutionRankingFormula, mapPublicInstitutionRankings, mapWeeklyRankingMovements, type InstitutionRankingRole, type PublicInstitutionRankingItem, type WeeklyRankingMovement } from "@/lib/ranking-data";
import { demoTutorProfiles, demoTutorReviews, getTutorRankBreakdown, getTutorRating, mapStoredTutorProfile, mapStoredTutorReview } from "@/lib/tutor-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { workplaceCategoryLabels, workplaceSummaries } from "@/lib/workplace-data";
import type { TutorProfile } from "@/lib/types";
import styles from "./rankings.module.css";

type RankingTab = "INSTITUTIONS" | "WORKPLACES" | "TUTORS";
type RankingZone = "ALL" | "DONGTAN_1" | "DONGTAN_2";
type RankingInstitutionType = "ALL" | "CHILDCARE" | "KINDERGARTEN" | "ACADEMY" | "TUTORING";

const tabItems: { id: RankingTab; label: string; icon: typeof Trophy }[] = [
  { id: "INSTITUTIONS", label: "교육기관", icon: Trophy },
  { id: "WORKPLACES", label: "좋은 일터", icon: BriefcaseBusiness },
  { id: "TUTORS", label: "개인 튜터", icon: UsersRound },
];

const rankLabel = (index: number) => `${index + 1}위`;

const mergeById = <T extends { id: string }>(demoItems: T[], localItems: T[]) => {
  const localIds = new Set(localItems.map((item) => item.id));
  return [...localItems, ...demoItems.filter((item) => !localIds.has(item.id))];
};

const canonicalZoneLabels: Record<string, string> = { DONGTAN_1: "동탄1", DONGTAN_2: "동탄2", OTHER: "기타 지역" };
const canonicalTypeLabels: Record<string, string> = { CHILDCARE: "어린이집", KINDERGARTEN: "유치원", ACADEMY: "학원", TUTORING: "교습소" };
const rankingZoneOptions: { id: RankingZone; label: string }[] = [{ id: "ALL", label: "전체" }, { id: "DONGTAN_1", label: "동탄1" }, { id: "DONGTAN_2", label: "동탄2" }];
const rankingTypeOptions: { id: RankingInstitutionType; label: string }[] = [{ id: "ALL", label: "전체" }, { id: "CHILDCARE", label: "어린이집" }, { id: "KINDERGARTEN", label: "유치원" }, { id: "ACADEMY", label: "학원" }, { id: "TUTORING", label: "교습소" }];

const formatScore = (score: number) => score.toFixed(1);

const getTabFromQuery = (selected: string | null, role: "PARENT" | "STUDENT" | "TEACHER"): RankingTab => {
  if (selected === "workplace") return "WORKPLACES";
  if (selected === "tutors") return "TUTORS";
  return role === "TEACHER" ? "WORKPLACES" : "INSTITUTIONS";
};

export default function RankingsPage() {
  return (
    <Suspense fallback={<RankingsFallback />}>
      <RankingsContent />
    </Suspense>
  );
}

function RankingsContent() {
  const { tutorProfiles, tutorReviews, role } = useApp();
  const configured = isSupabaseConfigured();
  const searchParams = useSearchParams();
  const [selectedTab, setSelectedTab] = useState<RankingTab | null>(null);
  const [institutionRole, setInstitutionRole] = useState<InstitutionRankingRole>("PARENT");
  const [publicRankings, setPublicRankings] = useState<PublicInstitutionRankingItem[]>([]);
  const [storedTutorProfiles, setStoredTutorProfiles] = useState<TutorProfile[]>([]);
  const [storedTutorReviews, setStoredTutorReviews] = useState<ReturnType<typeof mapStoredTutorReview>[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountFormula, setAccountFormula] = useState("");
  const [accountReferenceDate, setAccountReferenceDate] = useState("");
  const [weeklyMovements, setWeeklyMovements] = useState<WeeklyRankingMovement[]>([]);
  const [rankingZone, setRankingZone] = useState<RankingZone>("ALL");
  const [rankingType, setRankingType] = useState<RankingInstitutionType>("ALL");
  const tab = selectedTab ?? getTabFromQuery(searchParams.get("tab"), role);

  const loadAccountRankings = useCallback(async () => {
    if (!configured) return;
    setLoadError(null);
    const [rankingResponse, tutorResponse] = await Promise.all([fetch("/api/rankings"), fetch("/api/tutors")]);
    if (!rankingResponse.ok || !tutorResponse.ok) {
      setLoadError("실제 공개 순위 데이터를 불러오지 못했어요. 체험 데이터로 바꾸어 표시하지 않습니다.");
      return;
    }
    const rankingData = await rankingResponse.json() as { mode?: string; rankings?: Record<string, unknown>[]; weeklyMovements?: Record<string, unknown>[]; formula?: string; referenceDate?: string };
    const tutorData = await tutorResponse.json() as { mode?: string; profiles?: Record<string, unknown>[]; reviews?: Record<string, unknown>[]; credentials?: Record<string, unknown>[] };
    if (rankingData.mode !== "supabase" || tutorData.mode !== "supabase") {
      setLoadError("계정 순위 연결 상태를 확인하지 못했어요.");
      return;
    }
    setPublicRankings(mapPublicInstitutionRankings(rankingData.rankings ?? []));
    setWeeklyMovements(mapWeeklyRankingMovements(rankingData.weeklyMovements ?? []));
    setAccountFormula(rankingData.formula ?? "승인 후기만 역할별로 최근성·표본 보정을 적용합니다.");
    setAccountReferenceDate(rankingData.referenceDate ?? "");
    setStoredTutorProfiles((tutorData.profiles ?? []).map((item) => mapStoredTutorProfile(item, tutorData.credentials ?? [])));
    setStoredTutorReviews((tutorData.reviews ?? []).map(mapStoredTutorReview));
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const frame = window.requestAnimationFrame(() => { void loadAccountRankings(); });
    return () => window.cancelAnimationFrame(frame);
  }, [configured, loadAccountRankings]);

  const rankingMatchesFilter = useCallback((zone: string, institutionType: string) => (
    (rankingZone === "ALL" || zone === rankingZone)
    && (rankingType === "ALL" || institutionType === rankingType)
  ), [rankingType, rankingZone]);
  const institutionRankings = useMemo(
    () => getInstitutionRankings(institutionRole).filter((item) => rankingMatchesFilter(item.institution.zone, item.institution.type)),
    [institutionRole, rankingMatchesFilter],
  );
  const accountInstitutionRankings = useMemo(
    () => publicRankings.filter((item) => item.role === institutionRole && rankingMatchesFilter(item.zone, item.institutionType)),
    [institutionRole, publicRankings, rankingMatchesFilter],
  );
  const accountWorkplaceRankings = useMemo(
    () => publicRankings.filter((item) => item.role === "TEACHER" && item.reviewCount >= 3 && rankingMatchesFilter(item.zone, item.institutionType)),
    [publicRankings, rankingMatchesFilter],
  );
  const movementByRanking = useMemo(() => new Map(weeklyMovements.map((movement) => [`${movement.institutionId}:${movement.role}`, movement])), [weeklyMovements]);
  const tutorRanking = useMemo(() => {
    const profiles = configured ? storedTutorProfiles : mergeById(demoTutorProfiles, tutorProfiles);
    const reviews = configured ? storedTutorReviews : mergeById(demoTutorReviews, tutorReviews);
    return profiles
      .filter((tutor) => tutor.verified)
      .map((tutor) => ({ tutor, rating: getTutorRating(tutor.id, reviews), breakdown: getTutorRankBreakdown(tutor, reviews) }))
      .sort((a, b) => b.breakdown.total - a.breakdown.total || b.rating.count - a.rating.count);
  }, [configured, storedTutorProfiles, storedTutorReviews, tutorProfiles, tutorReviews]);

  const workplaceRanking = useMemo(
    () =>
      workplaceSummaries
        .filter((summary) => {
          const institution = institutions.find((item) => item.id === summary.institutionId);
          return summary.verifiedReviewCount >= 3 && summary.publicScore !== null && Boolean(institution) && rankingMatchesFilter(institution!.zone, institution!.type);
        })
        .sort((a, b) => (b.publicScore ?? 0) - (a.publicScore ?? 0) || b.verifiedReviewCount - a.verifiedReviewCount),
    [rankingMatchesFilter],
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>EDU톡 랭킹</p>
          <h1>광고가 아니라<br />인증된 경험으로 봐요</h1>
          <p>{configured ? "승인된 공개 데이터만 표시합니다. 교육자 만족도는 학생 배움환경을 판단하는 신호이며 결과를 보장하지 않습니다." : "모든 순위와 후기는 체험용 데이터입니다. 교육자 만족도는 학생 배움환경을 판단하는 신호이며 결과를 보장하지 않습니다."}</p>
        </div>
        <div className={styles.heroMark} aria-hidden="true"><Crown /></div>
      </header>

      <section className={styles.trustNote} aria-label="랭킹 원칙">
        <ShieldCheck aria-hidden="true" />
        <span><strong>역할별 평가를 섞지 않습니다.</strong> 학부모·학생·교육자의 점수는 각각의 랭킹에서만 사용합니다.</span>
      </section>

      <nav className={styles.tabs} aria-label="랭킹 종류">
        {tabItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" data-active={tab === item.id} aria-pressed={tab === item.id} onClick={() => setSelectedTab(item.id)}><Icon aria-hidden="true" />{item.label}</button>;
        })}
      </nav>

      {tab === "INSTITUTIONS" ? (
        <section className={styles.section} aria-labelledby="institution-ranking-title">
          <div className={styles.sectionHeader}>
            <div><p className={styles.kicker}>교육기관</p><h2 id="institution-ranking-title">{institutionRole === "PARENT" ? "학부모" : "학생"} 인증평점 랭킹</h2></div>
            <span className={styles.adFree}>광고비 미반영</span>
          </div>
          <div className={styles.segmented} aria-label="교육기관 평가 역할">
            <button type="button" data-active={institutionRole === "PARENT"} aria-pressed={institutionRole === "PARENT"} onClick={() => setInstitutionRole("PARENT")}>학부모 후기</button>
            <button type="button" data-active={institutionRole === "STUDENT"} aria-pressed={institutionRole === "STUDENT"} onClick={() => setInstitutionRole("STUDENT")}>학생 후기</button>
          </div>
          <RankingFilters zone={rankingZone} institutionType={rankingType} onZoneChange={setRankingZone} onInstitutionTypeChange={setRankingType} />
          <Formula items={configured ? [accountFormula || "승인 후기만 역할별로 최근성·표본 보정을 적용합니다.", "학부모·학생 점수는 서로 합산하지 않음", "광고·유료 노출은 반영하지 않음"] : [institutionRankingFormula.reviewRating, institutionRankingFormula.sourceCompleteness, institutionRankingFormula.freshness]} />
          <div className={styles.rankingList}>
            {configured ? accountInstitutionRankings.map((item, index) => (
              <Link href={`/institutions/${item.publicSlug}`} className={styles.rankingCard} data-podium={index < 3} key={item.institutionId}>
                <RankMedal index={index} />
                <div className={styles.cardMain}>
                  <p>{canonicalZoneLabels[item.zone] ?? item.zone} · {canonicalTypeLabels[item.institutionType] ?? item.institutionType}</p>
                  <h3>{item.name}</h3>
                  <span><Star aria-hidden="true" /> {institutionRole === "PARENT" ? "학부모" : "학생"} 승인 후기</span>
                  <span className={styles.evidence}>공개 근거: 승인 후기 {item.reviewCount}건 · 기준일 {accountReferenceDate || item.referenceDate}</span>
                  <WeeklyMovement movement={movementByRanking.get(`${item.institutionId}:${item.role}`)} />
                </div>
                <div className={styles.totalScore}><strong>{formatScore(item.score)}</strong><span>/ 5.0</span></div>
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            )) : institutionRankings.map((item, index) => (
              <Link href={`/institutions/${item.institution.id}`} className={styles.rankingCard} data-podium={index < 3} key={item.institution.id}>
                <RankMedal index={index} />
                <div className={styles.cardMain}>
                  <p>{zoneLabels[item.institution.zone]} · {item.institution.neighborhood} · {institutionTypeLabels[item.institution.type]}</p>
                  <h3>{item.institution.name}</h3>
                  <span><Star aria-hidden="true" /> {institutionRole === "PARENT" ? "학부모" : "학생"} 인증평점 {formatScore(item.roleScore / 14)} · {item.reviewCount}건</span>
                </div>
                <div className={styles.totalScore}><strong>{formatScore(item.total)}</strong><span>/ 100</span></div>
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            ))}
          </div>
          {configured && !accountInstitutionRankings.length ? <EmptyRanking icon={Trophy} title="공개 가능한 기관 순위를 준비 중이에요" description={loadError ?? "승인된 해당 역할 후기가 모인 기관부터 공개 순위에 표시합니다."} /> : null}
          <p className={styles.footnote}>{configured ? `승인된 공개 후기만 집계합니다.${accountReferenceDate ? ` 기준일 ${accountReferenceDate}` : ""}` : `체험용 합성 데이터 · 자료 기준일 ${institutionRankingFormula.referenceDate} · 출처 완성도와 최신성은 기관 공개 정보 기준입니다.`}</p>
        </section>
      ) : null}

      {tab === "WORKPLACES" ? (
        <section className={styles.section} aria-labelledby="workplace-ranking-title">
          <div className={styles.sectionHeader}>
            <div><p className={styles.kicker}>좋은 일터</p><h2 id="workplace-ranking-title">교육자가 남긴 근무 후기</h2></div>
            <span className={styles.adFree}>광고비 미반영</span>
          </div>
          <RankingFilters zone={rankingZone} institutionType={rankingType} onZoneChange={setRankingZone} onInstitutionTypeChange={setRankingType} />
          <Formula items={configured ? [accountFormula || "승인 후기만 역할별로 최근성·표본 보정을 적용합니다.", "교육자 승인 후기 3건 이상만 순위 공개", "학부모·학생 평점과 합산하지 않음"] : ["교육자 인증 근무후기 평균", "인증 후기 3건 이상만 순위 공개", "학부모·학생 평점과 합산하지 않음"]} />
          {configured ? (accountWorkplaceRankings.length ? <div className={styles.rankingList}>{accountWorkplaceRankings.map((summary, index) => {
            const categoryItems = Object.entries(summary.categoryScores);
            return <Link href={`/institutions/${summary.publicSlug}`} className={styles.workplaceCard} data-podium={index < 3} key={summary.institutionId}>
              <RankMedal index={index} />
              <div className={styles.cardMain}><p>{canonicalZoneLabels[summary.zone] ?? summary.zone} · {canonicalTypeLabels[summary.institutionType] ?? summary.institutionType}</p><h3>{summary.name}</h3><span><BadgeCheck aria-hidden="true" /> 교육자 승인 후기</span><span className={styles.evidence}>공개 근거: 승인 후기 {summary.reviewCount}건 · 기준일 {accountReferenceDate || summary.referenceDate}</span><WeeklyMovement movement={movementByRanking.get(`${summary.institutionId}:${summary.role}`)} /></div>
              <div className={styles.totalScore}><strong>{formatScore(summary.score)}</strong><span>/ 5.0</span></div>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
              {categoryItems.length ? <div className={styles.categoryRow}>{categoryItems.slice(0, 3).map(([key, value]) => <span key={key}>{workplaceCategoryLabels[key as keyof typeof workplaceCategoryLabels] ?? key} {formatScore(value)}</span>)}</div> : null}
            </Link>;
          })}</div> : <EmptyRanking icon={BriefcaseBusiness} title="공개 가능한 일터 순위를 준비 중이에요" description={loadError ?? "승인된 교육자 후기 3건이 모인 기관부터 점수와 순위를 공개합니다."} />) : workplaceRanking.length ? <div className={styles.rankingList}>{workplaceRanking.map((summary, index) => {
            const institution = institutions.find((item) => item.id === summary.institutionId);
            if (!institution) return null;
            const categoryItems = Object.entries(summary.categoryScores).filter(([, value]) => typeof value === "number");
            return <Link href={`/institutions/${institution.id}`} className={styles.workplaceCard} data-podium={index < 3} key={institution.id}>
              <RankMedal index={index} />
              <div className={styles.cardMain}><p>{zoneLabels[institution.zone]} · {institutionTypeLabels[institution.type]}</p><h3>{institution.name}</h3><span><BadgeCheck aria-hidden="true" /> 교육자 인증 후기 {summary.verifiedReviewCount}건</span></div>
              <div className={styles.totalScore}><strong>{formatScore(summary.publicScore ?? 0)}</strong><span>/ 5.0</span></div>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
              {categoryItems.length ? <div className={styles.categoryRow}>{categoryItems.slice(0, 3).map(([key, value]) => <span key={key}>{workplaceCategoryLabels[key as keyof typeof workplaceCategoryLabels]} {formatScore(Number(value))}</span>)}</div> : null}
            </Link>;
          })}</div> : <EmptyRanking icon={BriefcaseBusiness} title="공개 가능한 일터 순위를 준비 중이에요" description="교육자 인증 근무후기 3건이 모인 기관부터 점수와 순위를 공개합니다." />}
          <p className={styles.footnote}>교육자 후기는 익명 기준을 지키며 공개합니다. {configured ? `승인 후기 3건 이상만 표시합니다.${accountReferenceDate ? ` 기준일 ${accountReferenceDate}` : ""}` : "모든 내용은 체험용 합성 데이터입니다."}</p>
        </section>
      ) : null}

      {tab === "TUTORS" ? (
        <section className={styles.section} aria-labelledby="tutor-ranking-title">
          <div className={styles.sectionHeader}>
            <div><p className={styles.kicker}>개인 튜터</p><h2 id="tutor-ranking-title">인증 수업 후기 랭킹</h2></div>
            <span className={styles.adFree}>광고비 미반영</span>
          </div>
          <Formula items={["인증 후기 평점 60점 + 후기 수 20점", "응답률 15점 + 인증 상태 5점", "수업료·광고비는 반영하지 않음"]} />
          {tutorRanking.length ? <div className={styles.rankingList}>{tutorRanking.map(({ tutor, rating, breakdown }, index) => <TutorCard key={tutor.id} index={index} tutor={tutor} rating={rating} score={breakdown.total} />)}</div> : <EmptyRanking icon={UsersRound} title="공개 가능한 튜터 순위를 준비 중이에요" description={loadError ?? "승인된 튜터 프로필과 수업 후기가 등록되면 표시합니다."} />}
        </section>
      ) : null}
    </main>
  );
}

function RankingsFallback() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>EDU톡 랭킹</p>
          <h1>인증된 경험을<br />정리하고 있어요</h1>
          <p>교육기관·좋은 일터·개인 튜터 순위를 불러오는 중입니다.</p>
        </div>
        <div className={styles.heroMark} aria-hidden="true"><Crown /></div>
      </header>
    </main>
  );
}

function WeeklyMovement({ movement }: { movement?: WeeklyRankingMovement }) {
  if (!movement || movement.change === "UNCHANGED") return null;
  const label = movement.change === "NEW"
    ? "주간 신규 진입"
    : movement.change === "UP"
      ? `${movement.previousRankPosition! - movement.rankPosition}계단 상승`
      : `${movement.rankPosition - movement.previousRankPosition!}계단 하락`;
  return <span className={styles.weeklyMovement} data-change={movement.change}>{label}</span>;
}

function Formula({ items }: { items: string[] }) {
  return <div className={styles.formula}><FileCheck2 aria-hidden="true" /><div><strong>순위 산식 공개</strong><p>{items.join(" · ")}</p></div></div>;
}

function RankingFilters({
  zone,
  institutionType,
  onZoneChange,
  onInstitutionTypeChange,
}: {
  zone: RankingZone;
  institutionType: RankingInstitutionType;
  onZoneChange: (value: RankingZone) => void;
  onInstitutionTypeChange: (value: RankingInstitutionType) => void;
}) {
  return <section className={styles.filterPanel} aria-label="랭킹 범위 필터">
    <div><strong>지역</strong><div className={styles.filterChips}>{rankingZoneOptions.map((option) => <button type="button" key={option.id} data-active={zone === option.id} aria-pressed={zone === option.id} onClick={() => onZoneChange(option.id)}>{option.label}</button>)}</div></div>
    <div><strong>기관 유형</strong><div className={styles.filterChips}>{rankingTypeOptions.map((option) => <button type="button" key={option.id} data-active={institutionType === option.id} aria-pressed={institutionType === option.id} onClick={() => onInstitutionTypeChange(option.id)}>{option.label}</button>)}</div></div>
  </section>;
}

function RankMedal({ index }: { index: number }) {
  if (index === 0) return <span className={styles.rank} data-rank="first"><Crown aria-hidden="true" />1</span>;
  if (index === 1) return <span className={styles.rank} data-rank="second"><Medal aria-hidden="true" />2</span>;
  if (index === 2) return <span className={styles.rank} data-rank="third"><Medal aria-hidden="true" />3</span>;
  return <span className={styles.rank}>{rankLabel(index)}</span>;
}

function TutorCard({ index, tutor, rating, score }: { index: number; tutor: TutorProfile; rating: { score: number | null; count: number }; score: number }) {
  return <Link href={`/tutors/${tutor.id}`} className={styles.rankingCard} data-podium={index < 3}>
    <RankMedal index={index} />
    <div className={styles.cardMain}><p>{tutor.subjects.join(" · ")} · {tutor.zones[0]}</p><h3>{tutor.displayName}</h3><span><Star aria-hidden="true" /> 인증후기 {rating.score?.toFixed(1) ?? "대기"} · {rating.count}건 <MessageCircleReply aria-hidden="true" /> 응답률 {tutor.responseRate}%</span></div>
    <div className={styles.totalScore}><strong>{formatScore(score)}</strong><span>/ 100</span></div><ChevronRight aria-hidden="true" className={styles.chevron} />
  </Link>;
}

function EmptyRanking({ icon: Icon, title, description }: { icon: typeof Sparkles; title: string; description: string }) {
  return <div className={styles.empty}><Icon aria-hidden="true" /><h3>{title}</h3><p>{description}</p></div>;
}
