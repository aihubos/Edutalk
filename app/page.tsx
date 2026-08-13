"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Baby,
  BadgeCheck,
  Building2,
  ChevronRight,
  Columns3,
  GraduationCap,
  Handshake,
  Landmark,
  MapPin,
  MessagesSquare,
  NotebookPen,
  School,
  Search,
  SquarePen,
  UserRound,
} from "lucide-react";
import { InstitutionCard } from "@/components/institution-card";
import { SearchBar } from "@/components/search-bar";
import { useApp } from "@/lib/app-context";
import type { CanonicalInstitution } from "@/lib/canonical-institutions";
import { institutions } from "@/lib/demo-data";
import { institutionTypeLabels, roleLabels, zoneLabels } from "@/lib/labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWorkplaceSummary } from "@/lib/workplace-data";
import type { Institution, InstitutionType, RoleProfile, ServiceZone, SortOption, UserRole } from "@/lib/types";
import styles from "./home.module.css";

const roles: UserRole[] = ["PARENT", "STUDENT", "TEACHER"];
const zones: ServiceZone[] = ["ALL", "DONGTAN_1", "DONGTAN_2"];
const institutionTypes: InstitutionType[] = ["CHILDCARE", "KINDERGARTEN", "ACADEMY", "TUTORING"];

const institutionTypeIcons: Record<InstitutionType, LucideIcon> = {
  CHILDCARE: Baby,
  KINDERGARTEN: School,
  ACADEMY: GraduationCap,
  TUTORING: Building2,
};

interface QuickAction {
  href: string;
  label: string;
  helper: string;
  icon: LucideIcon;
  emphasis?: boolean;
}

interface InstitutionApiResponse {
  mode?: string;
  institutions?: CanonicalInstitution[];
  error?: string;
}

const getRoleScore = (institution: Institution, role: UserRole) => {
  if (role === "TEACHER") return getWorkplaceSummary(institution.id)?.publicScore ?? 0;
  const rating = institution.ratings.find((item) => item.role === role);
  if (!rating?.isPublic || rating.score === null) return 0;
  return rating.score;
};

const splitProfileTerms = (value: string | undefined) => (value ?? "").split(",").map((term) => term.trim().toLocaleLowerCase("ko-KR")).filter(Boolean);

const getProfileRecommendation = (institution: Institution, profile: RoleProfile | null, role: UserRole) => {
  if (!profile || profile.role !== role) return { bonus: 0, reasons: [] as string[] };
  const searchable = [...institution.subjects, ...institution.tags, ...institution.ageGroups, institution.type === "ACADEMY" ? "학원" : institution.type === "TUTORING" ? "교습소" : institution.type === "KINDERGARTEN" ? "유치원" : "어린이집"].join(" ").toLocaleLowerCase("ko-KR");
  const reasons: string[] = [];
  const interests = splitProfileTerms(profile.fields.interests);
  if (interests.some((term) => searchable.includes(term))) reasons.push("관심 분야와 맞음");
  const grade = profile.fields.gradeRange ?? profile.fields.childGradeRange;
  if (grade && searchable.includes(grade.replace(/학교|학년|저학년|고학년/g, "").trim().toLocaleLowerCase("ko-KR"))) reasons.push("학년 구간과 맞음");
  if (role === "TEACHER" && profile.fields.institutionType && searchable.includes(profile.fields.institutionType.toLocaleLowerCase("ko-KR"))) reasons.push("관심 기관 유형과 맞음");
  const distance = profile.fields.maxDistance ?? profile.fields.commuteDistance;
  if (distance && /도보\s*(1[0-9]|[1-9])분|1[0-9]분 이내/.test(distance) && institution.distanceM <= 1500) reasons.push("희망 이동거리 안쪽");
  return { bonus: reasons.length * 0.15, reasons: reasons.slice(0, 2) };
};

const buildDiscoverHref = (
  zone: ServiceZone,
  next: Partial<{ type: InstitutionType | "ALL"; sort: SortOption }>,
) => {
  const params = new URLSearchParams();
  if (zone !== "ALL") params.set("zone", zone);
  if (next.type && next.type !== "ALL") params.set("type", next.type);
  if (next.sort && next.sort !== "RECOMMENDED") params.set("sort", next.sort);

  const queryString = params.toString();
  return queryString ? "/discover?" + queryString : "/discover";
};

export default function HomePage() {
  const { role, zone, setRole, setZone, onboardingComplete, roleProfile } = useApp();
  const accountMode = isSupabaseConfigured();
  const [canonicalInstitutions, setCanonicalInstitutions] = useState<CanonicalInstitution[]>([]);
  const [canonicalLoading, setCanonicalLoading] = useState(accountMode);
  const [canonicalError, setCanonicalError] = useState("");
  const discoveryRole = onboardingComplete ? role : "PARENT";

  useEffect(() => {
    if (!accountMode) return;
    void (async () => {
      setCanonicalLoading(true);
      setCanonicalError("");
      try {
        const response = await fetch("/api/institutions");
        const payload = await response.json() as InstitutionApiResponse;
        if (!response.ok || payload.mode !== "canonical") throw new Error(payload.error ?? "공개 기관 정보를 불러오지 못했어요.");
        setCanonicalInstitutions(Array.isArray(payload.institutions) ? payload.institutions : []);
      } catch (error) {
        setCanonicalError(error instanceof Error ? error.message : "공개 기관 정보를 불러오지 못했어요.");
      } finally {
        setCanonicalLoading(false);
      }
    })();
  }, [accountMode]);

  const scopedInstitutions = useMemo(
    () => institutions.filter((institution) => zone === "ALL" || institution.zone === zone),
    [zone],
  );

  const recommendedInstitutions = useMemo(
    () =>
      [...scopedInstitutions]
        .sort((a, b) => {
          const scoreGap = getRoleScore(b, discoveryRole) + getProfileRecommendation(b, roleProfile, discoveryRole).bonus - getRoleScore(a, discoveryRole) - getProfileRecommendation(a, roleProfile, discoveryRole).bonus;
          if (scoreGap !== 0) return scoreGap;
          if (a.verified !== b.verified) return a.verified ? -1 : 1;
          return a.distanceM - b.distanceM;
        })
        .slice(0, 3),
    [discoveryRole, roleProfile, scopedInstitutions],
  );

  const nearbyInstitutions = useMemo(
    () => [...scopedInstitutions].sort((a, b) => a.distanceM - b.distanceM).slice(0, 3),
    [scopedInstitutions],
  );

  const scopedCanonicalInstitutions = useMemo(
    () => canonicalInstitutions.filter((institution) => zone === "ALL" || institution.zone === zone),
    [canonicalInstitutions, zone],
  );

  const recentCanonicalInstitutions = useMemo(
    () => [...scopedCanonicalInstitutions].sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "")).slice(0, 3),
    [scopedCanonicalInstitutions],
  );

  const roleTools = useMemo<QuickAction[]>(() => {
    if (role === "PARENT") {
      return [
        {
          href: "/student-records",
          label: "자녀 성적관리",
          helper: "성적 흐름과 상담 준비를 한 곳에서 봅니다",
          icon: UserRound,
          emphasis: true,
        },
        {
          href: "/messages",
          label: "선생님 알림장",
          helper: "자녀별 일지와 메시지를 확인합니다",
          icon: MessagesSquare,
          emphasis: true,
        },
      ];
    }

    if (role === "TEACHER") {
      return [
        {
          href: "/student-records",
          label: "학생 성적관리",
          helper: "반 학생의 성적 흐름을 빠르게 확인합니다",
          icon: UserRound,
          emphasis: true,
        },
        {
          href: "/teacher-log",
          label: "AI 학생일지",
          helper: "수업 관찰과 상담 메모를 구조화합니다",
          icon: BadgeCheck,
          emphasis: true,
        },
        {
          href: "/school-record",
          label: "AI 생기부 초안",
          helper: "학생 정보와 관찰 근거로 검토용 초안을 만듭니다",
          icon: NotebookPen,
          emphasis: true,
        },
        {
          href: "/messages",
          label: "학부모 알림장",
          helper: "학생별 일지·공지·메시지를 나눕니다",
          icon: MessagesSquare,
          emphasis: true,
        },
      ];
    }

    return [];
  }, [role]);

  const quickActions: QuickAction[] = [
    {
      href: buildDiscoverHref(zone, { sort: "RECOMMENDED" }),
      label: "기관 찾기",
      helper: "조건에 맞는 기관을 바로 봅니다",
      icon: Search,
    },
    {
      href: "/rankings",
      label: "기관 랭킹",
      helper: "후기 기준으로 기관을 비교합니다",
      icon: GraduationCap,
    },
    ...(onboardingComplete ? [{
      href: role === "STUDENT" ? "/activity" : "/review",
      label: role === "STUDENT" ? "내 활동" : "후기 쓰기",
      helper: role === "STUDENT" ? "참여 기록을 확인합니다" : "이용 경험을 남깁니다",
      icon: SquarePen,
    }] : []),
    {
      href: "/compare",
      label: "비교함",
      helper: "최대 3곳을 나란히 봅니다",
      icon: Columns3,
    },
    {
      href: "/tutors",
      label: "동네 튜터",
      helper: "가까운 튜터와 수업 구인글을 봅니다",
      icon: Handshake,
    },
    {
      href: "/policies",
      label: "정책·행사",
      helper: "지원정책과 설명회, 특강 소식을 봅니다",
      icon: Landmark,
    },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroText}>
          <span className={accountMode ? styles.accountBadge : styles.demoBadge}>{accountMode ? "공개 기관 정보" : "체험용 데이터"}</span>
          <p className={styles.eyebrow}>아이에게 좋은 배움, 교육자에게 좋은 일터</p>
          <h1 id="home-title">선생님의 좋은 일터가 아이의 좋은 배움으로 이어지도록</h1>
          <p>교육자 만족도는 학생 배움환경을 판단하는 신호이며, 긍정적 결과를 보장하지 않습니다.</p>
        </div>

        <div className={styles.heroPaths} aria-label="홈 주요 기능">
          <Link className={styles.primaryPath} href="/discover">
            <span className={styles.pathIcon} aria-hidden="true">
              <Search size={22} />
            </span>
            <span className={styles.pathCopy}>
              <strong>아이에게 맞는 기관 찾기</strong>
              <small>지역과 유형을 골라 비교해 보세요</small>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>

          <Link className={styles.workplacePath} href="/rankings?tab=workplace">
            <span className={styles.pathIcon} aria-hidden="true">
              <Handshake size={22} />
            </span>
            <span className={styles.pathCopy}>
              <strong>좋은 일터·익명 근무후기</strong>
              <small>인증된 교육자 후기로 근무 환경을 따로 살펴보세요</small>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
          {!onboardingComplete ? <Link className={styles.workplacePath} href="/login">
            <span className={styles.pathCopy}>
              <strong>로그인·체험 시작</strong>
              <small>내 역할과 추천 기준을 설정해 보세요</small>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link> : null}
        </div>

        {onboardingComplete ? <div className={styles.rolePanel} aria-label="이용자 역할 선택">
          {roles.map((item) => (
            <button
              key={item}
              type="button"
              data-active={role === item}
              onClick={() => setRole(item)}
            >
              {roleLabels[item]}
            </button>
          ))}
        </div> : null}

        <SearchBar zone={zone} placeholder="예: 수학, 산척동, 어린이집" submitLabel="찾기" />
      </section>

      <section className={styles.regionSection} aria-labelledby="region-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>
              <MapPin size={14} aria-hidden="true" />
              지역 선택
            </p>
            <h2 id="region-title">어느 지역을 볼까요?</h2>
          </div>
          <Link href={buildDiscoverHref(zone, {})}>지역별 기관 전체 보기</Link>
        </div>

        <div className={styles.zoneGrid}>
          {zones.map((item) => (
            <button
              key={item}
              type="button"
              data-active={zone === item}
              onClick={() => setZone(item)}
            >
              {zoneLabels[item]}
            </button>
          ))}
        </div>
      </section>

      {onboardingComplete && roleTools.length > 0 ? (
        <section className={styles.quickSection} aria-labelledby="role-tools-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionKicker}>빠른 메뉴</p>
              <h2 id="role-tools-title">{roleLabels[role]} 전용 진입</h2>
            </div>
          </div>

          <div className={styles.roleToolGrid}>
            {roleTools.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  className={action.emphasis ? styles.emphasisToolCard : styles.toolCard}
                  href={action.href}
                >
                  <span aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <strong>{action.label}</strong>
                  <small>{action.helper}</small>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={styles.quickSection} aria-labelledby="quick-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>오늘 할 일</p>
            <h2 id="quick-title">자주 쓰는 기능</h2>
          </div>
        </div>

        <div className={styles.quickGrid}>
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href + action.label} className={styles.toolCard} href={action.href}>
                <span aria-hidden="true">
                  <Icon size={21} />
                </span>
                <strong>{action.label}</strong>
                <small>{action.helper}</small>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.typeSection} aria-labelledby="type-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>기관 유형</p>
            <h2 id="type-title">4가지 유형으로 좁혀보기</h2>
          </div>
        </div>

        <div className={styles.typeGrid}>
          {institutionTypes.map((type) => {
            const Icon = institutionTypeIcons[type];
            const count = accountMode
              ? scopedCanonicalInstitutions.filter((institution) => institution.type === type).length
              : scopedInstitutions.filter((institution) => institution.type === type).length;

            return (
              <Link key={type} href={buildDiscoverHref(zone, { type })} className={styles.typeCard}>
                <span aria-hidden="true">
                  <Icon size={22} />
                </span>
                <strong>{institutionTypeLabels[type]}</strong>
                <small>{count}곳 보기</small>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.listSection} aria-labelledby="recommend-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>{accountMode ? "공개 확인 목록" : "추천 목록"}</p>
            <h2 id="recommend-title">{accountMode ? "최근 공개 확인된 기관" : onboardingComplete ? `${roleLabels[role]}에게 먼저 볼 곳` : "먼저 살펴볼 기관"}</h2>
          </div>
          <Link href={buildDiscoverHref(zone, { sort: "RATING" })}>추천 기관 더 보기</Link>
        </div>

        {accountMode ? <CanonicalHomeList institutions={recentCanonicalInstitutions} loading={canonicalLoading} error={canonicalError} empty="공개 기관 정보가 아직 없어요." /> : <div className={styles.cardStack}>{recommendedInstitutions.map((institution) => <div className={styles.recommendationItem} key={institution.id}><InstitutionCard institution={institution} />{onboardingComplete && getProfileRecommendation(institution, roleProfile, discoveryRole).reasons.length ? <p className={styles.recommendationReason}>추천 이유 · {getProfileRecommendation(institution, roleProfile, discoveryRole).reasons.join(" · ")}</p> : null}</div>)}</div>}
      </section>

      <section className={styles.listSection} aria-labelledby="near-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>{accountMode ? "거리 정보" : "가까운 목록"}</p>
            <h2 id="near-title">{accountMode ? "가까운 기관은 위치 기준이 준비되면 표시해요" : "현재 선택 지역에서 가까운 곳"}</h2>
          </div>
          <Link href={buildDiscoverHref(zone, { sort: accountMode ? "RECOMMENDED" : "DISTANCE" })}>{accountMode ? "공개 목록 보기" : "거리순 보기"}</Link>
        </div>

        {accountMode ? <div className={styles.canonicalHint}><MapPin size={18} aria-hidden="true" /><p>현재 공개 canonical 데이터에는 사용자 기준 거리 정보가 없어 임의의 가까운 순서를 만들지 않습니다. 기관 주소는 공개 목록에서 확인할 수 있어요.</p></div> : <div className={styles.cardStack}>{nearbyInstitutions.map((institution) => <InstitutionCard key={institution.id} institution={institution} />)}</div>}
      </section>
    </main>
  );
}

function CanonicalHomeList({ institutions, loading, error, empty }: { institutions: CanonicalInstitution[]; loading: boolean; error: string; empty: string }) {
  if (loading) return <p className={styles.canonicalState} aria-busy="true">공개 기관 정보를 불러오는 중이에요.</p>;
  if (error) return <p className={styles.canonicalState} role="alert">{error}</p>;
  if (institutions.length === 0) return <p className={styles.canonicalState}>{empty} 체험 기관 데이터는 함께 표시하지 않습니다.</p>;
  return <div className={styles.canonicalStack}>{institutions.map((institution) => <Link className={styles.canonicalRow} key={institution.id} href={`/institutions/${institution.publicSlug}`}><span>{institutionTypeLabels[institution.type]}</span><div><strong>{institution.name}</strong><small>{institution.address}</small></div><em>{institution.checkedAt ? `${institution.checkedAt.slice(0, 10)} 확인` : "기관 확인 필요"}</em><ChevronRight size={18} aria-hidden="true" /></Link>)}</div>;
}
