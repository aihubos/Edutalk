"use client";

import { BarChart3, Building2, CalendarDays, CirclePlus, MapPin, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { institutions, getInstitution } from "@/lib/demo-data";
import { useApp } from "@/lib/app-context";
import { formatDistance, formatFee, institutionTypeLabels, roleLabels } from "@/lib/labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Institution, InstitutionType, UserRole } from "@/lib/types";
import styles from "./compare.module.css";

const roleOrder: UserRole[] = ["PARENT", "STUDENT", "TEACHER"];
const canonicalZoneLabels: Record<string, string> = { DONGTAN_1: "동탄1", DONGTAN_2: "동탄2", OTHER: "기타 지역" };

const feeSourceLabels: Record<Institution["feeSource"], string> = {
  PUBLIC: "공개자료", INSTITUTION: "기관 제공", VERIFIED_USE: "인증 이용자", UNCONFIRMED: "확인 필요",
};

type AccountRating = { count: number; average: number | null; isPublic: boolean; items: Array<{ key: string; average: number }> };
type AccountInstitution = {
  id: string;
  publicSlug: string;
  name: string;
  address: string;
  zone: string;
  type: InstitutionType;
  checkedAt: string | null;
  ratings: Record<UserRole, AccountRating>;
};
type AccountDetail = {
  costs: Array<{ item: string; amountDisplay: string; source: string; checkedAt: string }>;
  shuttle: { available: boolean | null; zones: string[]; source: string; checkedAt: string } | null;
  recruitment: { status: string | null; waitlist: string | null; source: string; checkedAt: string } | null;
  programs: Array<{ name: string; audience: string | null; source: string; checkedAt: string }>;
  localContext: { livingArea: string; legalDong: string | null; administrativeDong: string | null; residentialArea: string | null; source: string; checkedAt: string } | null;
  travelReferences: Array<{ originType: "SCHOOL" | "KINDERGARTEN" | "RESIDENTIAL_COMPLEX"; originLabel: string; distanceMeters: number | null; travelMinutes: number | null; distanceNote: string | null; travelNote: string | null; source: string; checkedAt: string }>;
};

const emptyRatings = (): Record<UserRole, AccountRating> => ({
  PARENT: { count: 0, average: null, isPublic: true, items: [] },
  STUDENT: { count: 0, average: null, isPublic: true, items: [] },
  TEACHER: { count: 0, average: null, isPublic: false, items: [] },
});

const scoreLabels: Record<string, string> = {
  communication: "소통", care: "돌봄", growth: "성장", understanding: "이해도", pace: "수업 속도", motivation: "학습 동기",
  commuteConvenience: "이동 편의", scheduleFit: "시간대 적합", schoolCommute: "학교에서 이동", classAtmosphere: "수업 분위기", homeworkLoad: "숙제 부담", classSize: "반 인원 체감", teachingExplanation: "설명 방식", levelTestHelpfulness: "레벨테스트 도움", peerComposition: "또래 구성", studySpace: "자습공간", examPreparation: "시험대비",
  leadership: "리더십", workload: "업무량", welfare: "급여·복지", culture: "조직문화", educationPhilosophy: "교육철학",
};

const isInstitution = (value: Institution | undefined): value is Institution => Boolean(value);
const isAccountInstitution = (value: Institution | AccountInstitution): value is AccountInstitution => "publicSlug" in value;
const comparisonKey = (value: Institution | AccountInstitution) => isAccountInstitution(value) ? value.publicSlug : value.id;
const getReviewCount = (institution: Institution) => institution.ratings.reduce((sum, rating) => sum + rating.count, 0);
const getRoleRatingText = (institution: Institution, role: UserRole) => {
  const rating = institution.ratings.find((item) => item.role === role);
  if (!rating || !rating.isPublic || rating.score === null) return `${roleLabels[role]} 후기 부족`;
  return `${roleLabels[role]} ${rating.score.toFixed(1)} · ${rating.count}건`;
};

function getAccountReviewCount(institution: AccountInstitution) {
  return roleOrder.reduce((sum, role) => sum + institution.ratings[role].count, 0);
}

function getAccountRoleRatingText(institution: AccountInstitution, role: UserRole) {
  const rating = institution.ratings[role];
  if (!rating.isPublic || rating.average === null) return "공개 후기 없음";
  return `${roleLabels[role]} ${rating.average.toFixed(1)} · ${rating.count}건`;
}

function getAccountScoreText(institution: AccountInstitution, role: UserRole, key: string) {
  const rating = institution.ratings[role];
  if (!rating.isPublic || rating.count === 0) return "공개 후기 없음";
  const item = rating.items.find((candidate) => candidate.key === key);
  return item ? `${item.average.toFixed(1)}점` : "항목 없음";
}

function DetailRow({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className={styles.detailRow}><dt>{label}</dt><dd><span>{value}</span>{helper ? <small>{helper}</small> : null}</dd></div>;
}

const required = "기관 확인 필요";
const formatDetailList = (items: Array<{ item?: string; amountDisplay?: string; name?: string; audience?: string | null }>, primary: "cost" | "program") => {
  if (!items.length) return required;
  return items.map((item) => primary === "cost" ? `${item.item} · ${item.amountDisplay}` : `${item.name}${item.audience ? ` · ${item.audience}` : ""}`).join("\n");
};
const formatShuttle = (detail?: AccountDetail | null) => !detail?.shuttle ? required : `${detail.shuttle.available === true ? "제공" : detail.shuttle.available === false ? "미제공" : required}${detail.shuttle.zones.length ? ` · ${detail.shuttle.zones.join(" · ")}` : ""}`;
const formatRecruitment = (detail?: AccountDetail | null) => !detail?.recruitment ? required : `${detail.recruitment.status ?? required}${detail.recruitment.waitlist ? ` · ${detail.recruitment.waitlist}` : ""}`;
const formatLocalContext = (detail?: AccountDetail | null) => !detail?.localContext ? required : [detail.localContext.livingArea, detail.localContext.legalDong, detail.localContext.administrativeDong, detail.localContext.residentialArea].filter(Boolean).join(" · ");
const formatTravel = (detail?: AccountDetail | null) => {
  if (!detail?.travelReferences.length) return required;
  return detail.travelReferences.map((item) => `${item.originType === "SCHOOL" ? "학교" : item.originType === "KINDERGARTEN" ? "유치원" : "주거 단지"} ${item.originLabel} · ${item.distanceMeters ? `${item.distanceMeters.toLocaleString("ko-KR")}m` : item.distanceNote ?? required}${item.travelMinutes ? ` · ${item.travelMinutes}분` : item.travelNote ? ` · ${item.travelNote}` : ""}`).join("\n");
};

function EmptyState({ onAddFirst, accountMode, message }: { onAddFirst: () => void; accountMode: boolean; message?: string }) {
  return (
    <section className={styles.emptyState} aria-labelledby="compare-empty-title">
      <BarChart3 className={styles.emptyIcon} aria-hidden="true" />
      <div><p className={styles.kicker}>비교 기관 0곳</p><h2 id="compare-empty-title">비교함에 담긴 기관이 아직 없어요</h2><p>{message ?? (accountMode ? "공개된 실제 기관만 비교할 수 있어요." : "아래 후보에서 최대 3곳까지 담으면 거리, 비용, 후기 근거를 한 번에 비교할 수 있어요.")}</p></div>
      {!message ? <button type="button" className={styles.primaryButton} onClick={onAddFirst}>첫 기관 담기</button> : null}
    </section>
  );
}

export default function ComparePage() {
  const { comparison, toggleComparison } = useApp();
  const accountMode = isSupabaseConfigured();
  const [notice, setNotice] = useState("");
  const [accountInstitutions, setAccountInstitutions] = useState<AccountInstitution[]>([]);
  const [loading, setLoading] = useState(accountMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountDetails, setAccountDetails] = useState<Record<string, AccountDetail | null>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const loadAccountInstitutions = useCallback(async () => {
    if (!accountMode) return;
    setLoading(true); setLoadError(null);
    try {
      const response = await fetch("/api/institutions");
      if (!response.ok) throw new Error("load");
      const payload = await response.json() as { mode?: string; institutions?: Array<{ id: string; publicSlug: string; name: string; address: string; zone: string; type: InstitutionType; checkedAt: string | null }> };
      if (payload.mode !== "canonical") throw new Error("mode");
      const basics = payload.institutions ?? [];
      const details = await Promise.all(basics.map(async (institution) => {
        const reviewResponse = await fetch(`/api/institutions/${encodeURIComponent(institution.publicSlug)}/reviews`);
        const ratings = emptyRatings();
        if (reviewResponse.ok) {
          const reviewPayload = await reviewResponse.json() as { mode?: string; summaries?: Array<{ role: UserRole; count: number; average: number | null; isPublic: boolean; items?: Array<{ key?: unknown; average?: unknown }> }> };
          if (reviewPayload.mode === "supabase") reviewPayload.summaries?.forEach((summary) => { ratings[summary.role] = { count: Number(summary.count), average: summary.average === null ? null : Number(summary.average), isPublic: Boolean(summary.isPublic), items: Array.isArray(summary.items) ? summary.items.filter((item): item is { key: string; average: number } => Boolean(item) && typeof item.key === "string" && typeof item.average === "number") : [] }; });
        }
        return { ...institution, ratings };
      }));
      setAccountInstitutions(details);
    } catch {
      setLoadError("공개 기관 데이터를 불러오지 못했어요. 체험 기관은 표시하지 않습니다.");
    } finally { setLoading(false); }
  }, [accountMode]);

  useEffect(() => {
    if (!accountMode) return;
    const frame = window.requestAnimationFrame(() => { void loadAccountInstitutions(); });
    return () => window.cancelAnimationFrame(frame);
  }, [accountMode, loadAccountInstitutions]);

  useEffect(() => {
    const handleComparisonError = (event: Event) => setLoadError((event as CustomEvent<string>).detail);
    window.addEventListener("edutalk:comparison-error", handleComparisonError);
    return () => window.removeEventListener("edutalk:comparison-error", handleComparisonError);
  }, []);

  const demoSelected = useMemo(() => comparison.map((id) => getInstitution(id)).filter(isInstitution).slice(0, 3), [comparison]);
  const accountSelected = useMemo(() => accountInstitutions.filter((institution) => comparison.includes(institution.publicSlug)).slice(0, 3), [accountInstitutions, comparison]);
  const selected = accountMode ? accountSelected : demoSelected;
  const availableInstitutions = useMemo(() => accountMode
    ? accountInstitutions.filter((institution) => !accountSelected.some((item) => item.publicSlug === institution.publicSlug))
    : institutions.filter((institution) => !demoSelected.some((item) => item.id === institution.id)), [accountInstitutions, accountMode, accountSelected, demoSelected]);
  const maxReached = selected.length >= 3;
  const accountScoreRows = useMemo(() => roleOrder.map((role) => ({
    role,
    keys: Array.from(new Set(accountSelected.flatMap((institution) => institution.ratings[role].isPublic ? institution.ratings[role].items.map((item) => item.key) : []))),
  })).filter((group) => group.keys.length > 0), [accountSelected]);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      if (!accountMode || accountSelected.length === 0) {
        setAccountDetails({});
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      void Promise.all(accountSelected.map(async (institution) => {
        try {
          const response = await fetch(`/api/institutions/${encodeURIComponent(institution.publicSlug)}`);
          const payload = await response.json() as { mode?: string; institution?: AccountDetail };
          return [institution.publicSlug, response.ok && payload.mode === "canonical" && payload.institution ? payload.institution : null] as const;
        } catch { return [institution.publicSlug, null] as const; }
      })).then((entries) => { if (active) setAccountDetails(Object.fromEntries(entries)); }).finally(() => { if (active) setDetailLoading(false); });
    });
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, [accountMode, accountSelected]);

  const addInstitution = (id: string) => { const result = toggleComparison(id); setNotice(result.ok ? "비교함에 담았어요." : result.reason ?? "지금은 담을 수 없어요."); };
  const removeInstitution = (id: string) => { toggleComparison(id); setNotice("비교함에서 제거했어요."); };
  const addFirstInstitution = () => { const first = availableInstitutions[0]; if (first) addInstitution(comparisonKey(first)); };

  return (
    <main className={styles.page}>
      <header className={styles.header}><p className={styles.kicker}>교육기관 비교</p><div className={styles.headerRow}><div><h1>최대 3곳을 나란히 비교해요</h1><p>{accountMode ? "canonical 공개 기관과 승인 후기 집계만 비교합니다." : "선택한 기관의 거리, 비용, 운영시간, 역할별 후기 근거를 한 화면에서 확인합니다."}</p></div><div className={styles.counter} aria-label={`비교 기관 ${selected.length}곳`}><span>{selected.length}</span><small>/ 3곳</small></div></div></header>
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {selected.length === 0 ? <EmptyState onAddFirst={addFirstInstitution} accountMode={accountMode} message={loadError ?? (accountMode && !loading && !availableInstitutions.length ? "현재 비교할 공개 기관 데이터가 없어요." : undefined)} /> : null}

      {selected.length > 0 ? <>
        <section className={styles.cardGrid} aria-label="선택 기관 카드 비교">
          {accountMode ? accountSelected.map((institution) => { const detail = accountDetails[institution.publicSlug]; return <article className={styles.compareCard} key={institution.publicSlug}><div className={styles.cardHeader}><div><p className={styles.typeLabel}>{institutionTypeLabels[institution.type]}</p><h2>{institution.name}</h2></div><button type="button" className={styles.iconButton} onClick={() => removeInstitution(institution.publicSlug)} aria-label={`${institution.name} 비교에서 제거`}><Trash2 aria-hidden="true" /></button></div><dl className={styles.detailList}><DetailRow label="주소" value={institution.address} /><DetailRow label="유형" value={institutionTypeLabels[institution.type]} helper="공개 canonical 기관" /><DetailRow label="권역" value={canonicalZoneLabels[institution.zone] ?? institution.zone} /><DetailRow label="생활권" value={formatLocalContext(detail)} /><DetailRow label="비용" value={formatDetailList(detail?.costs ?? [], "cost")} /><DetailRow label="셔틀" value={formatShuttle(detail)} /><DetailRow label="모집·대기" value={formatRecruitment(detail)} /><DetailRow label="프로그램" value={formatDetailList(detail?.programs ?? [], "program")} /><DetailRow label="출발지 참고" value={formatTravel(detail)} /><DetailRow label="후기수" value={`${getAccountReviewCount(institution)}건`} helper="승인된 역할별 후기 합계" /><DetailRow label="데이터 기준일" value={institution.checkedAt ? institution.checkedAt.slice(0, 10) : "기준일 미등록"} /></dl>{detailLoading ? <p className={styles.detailLoading}>공개 상세 정보를 불러오는 중이에요.</p> : null}<div className={styles.ratingBox}><h3>역할별 평점</h3><ul>{roleOrder.map((role) => <li key={role}>{getAccountRoleRatingText(institution, role)}</li>)}</ul></div></article>; }) : demoSelected.map((institution) => <article className={styles.compareCard} key={institution.id}><div className={styles.cardHeader}><div><p className={styles.typeLabel}>{institutionTypeLabels[institution.type]}</p><h2>{institution.name}</h2></div><button type="button" className={styles.iconButton} onClick={() => removeInstitution(institution.id)} aria-label={`${institution.name} 비교에서 제거`}><Trash2 aria-hidden="true" /></button></div><dl className={styles.detailList}><DetailRow label="거리" value={formatDistance(institution.distanceM)} helper={institution.neighborhood} /><DetailRow label="유형" value={institutionTypeLabels[institution.type]} helper={institution.verified ? "기관 정보 확인됨" : "추가 확인 필요"} /><DetailRow label="대상" value={institution.ageGroups.join(", ")} helper={institution.subjects.join(", ")} /><DetailRow label="운영시간" value={institution.operatingHours} /><DetailRow label="월비용" value={formatFee(institution.monthlyFee)} helper={feeSourceLabels[institution.feeSource]} /><DetailRow label="후기수" value={`${getReviewCount(institution)}건`} helper="역할별 공개 후기 합산" /><DetailRow label="데이터 기준일" value={institution.sourceDate} helper={institution.sourceName} /></dl><div className={styles.ratingBox}><h3>역할별 평점</h3><ul>{roleOrder.map((role) => <li key={role}>{getRoleRatingText(institution, role)}</li>)}</ul></div></article>)}
        </section>
        <section className={styles.tableSection} aria-labelledby="compare-table-title"><div className={styles.sectionTitle}><BarChart3 aria-hidden="true" /><h2 id="compare-table-title">표로 빠르게 비교</h2></div><div className={styles.tableScroll}><table className={styles.compareTable}><caption>선택 기관별 공개 정보와 역할별 평점 비교</caption><thead><tr><th scope="col">비교 항목</th>{selected.map((institution) => <th scope="col" key={comparisonKey(institution)}><span>{institution.name}</span><button type="button" onClick={() => removeInstitution(comparisonKey(institution))}>제거</button></th>)}</tr></thead><tbody>{accountMode ? <><tr><th scope="row">주소</th>{accountSelected.map((item) => <td key={item.publicSlug}>{item.address}</td>)}</tr><tr><th scope="row">유형</th>{accountSelected.map((item) => <td key={item.publicSlug}>{institutionTypeLabels[item.type]}</td>)}</tr><tr><th scope="row">권역</th>{accountSelected.map((item) => <td key={item.publicSlug}>{canonicalZoneLabels[item.zone] ?? item.zone}</td>)}</tr><CompareDetailRow label="생활권·동 정보" institutions={accountSelected} details={accountDetails} render={formatLocalContext} /><CompareDetailRow label="비용" institutions={accountSelected} details={accountDetails} render={(detail) => formatDetailList(detail?.costs ?? [], "cost")} /><CompareDetailRow label="셔틀" institutions={accountSelected} details={accountDetails} render={formatShuttle} /><CompareDetailRow label="모집·대기" institutions={accountSelected} details={accountDetails} render={formatRecruitment} /><CompareDetailRow label="프로그램" institutions={accountSelected} details={accountDetails} render={(detail) => formatDetailList(detail?.programs ?? [], "program")} /><CompareDetailRow label="출발지 이동 참고" institutions={accountSelected} details={accountDetails} render={formatTravel} />{roleOrder.map((role) => <tr key={role}><th scope="row">{roleLabels[role]} 평점</th>{accountSelected.map((item) => <td key={item.publicSlug}>{getAccountRoleRatingText(item, role)}</td>)}</tr>)}{accountScoreRows.map((group) => group.keys.map((key) => <tr key={`${group.role}-${key}`}><th scope="row">{roleLabels[group.role]} · {scoreLabels[key] ?? key}</th>{accountSelected.map((item) => <td key={item.publicSlug}>{getAccountScoreText(item, group.role, key)}</td>)}</tr>))}<tr><th scope="row">후기수</th>{accountSelected.map((item) => <td key={item.publicSlug}>{getAccountReviewCount(item)}건</td>)}</tr><tr><th scope="row">데이터 기준일</th>{accountSelected.map((item) => <td key={item.publicSlug}>{item.checkedAt ? item.checkedAt.slice(0, 10) : "기준일 미등록"}</td>)}</tr></> : <><tr><th scope="row">거리</th>{demoSelected.map((item) => <td key={item.id}>{formatDistance(item.distanceM)}</td>)}</tr><tr><th scope="row">유형</th>{demoSelected.map((item) => <td key={item.id}>{institutionTypeLabels[item.type]}</td>)}</tr><tr><th scope="row">대상</th>{demoSelected.map((item) => <td key={item.id}>{item.ageGroups.join(", ")}</td>)}</tr><tr><th scope="row">운영시간</th>{demoSelected.map((item) => <td key={item.id}>{item.operatingHours}</td>)}</tr><tr><th scope="row">월비용</th>{demoSelected.map((item) => <td key={item.id}>{formatFee(item.monthlyFee)}<small>{feeSourceLabels[item.feeSource]}</small></td>)}</tr>{roleOrder.map((role) => <tr key={role}><th scope="row">{roleLabels[role]} 평점</th>{demoSelected.map((item) => <td key={item.id}>{getRoleRatingText(item, role)}</td>)}</tr>)}<tr><th scope="row">후기수</th>{demoSelected.map((item) => <td key={item.id}>{getReviewCount(item)}건</td>)}</tr><tr><th scope="row">데이터 기준일</th>{demoSelected.map((item) => <td key={item.id}>{item.sourceDate}<small>{item.sourceName}</small></td>)}</tr></>}</tbody></table></div></section>
      </> : null}

      {!loadError ? <section className={styles.addSection} aria-labelledby="compare-add-title"><div className={styles.sectionTitle}><CirclePlus aria-hidden="true" /><h2 id="compare-add-title">비교 후보 추가</h2></div><p className={styles.sectionHelper}>{accountMode ? "공개 canonical 기관에서 선택합니다. 비교는 최대 3곳까지 가능합니다." : "체험 데이터에서 선택합니다. 비교는 최대 3곳까지 가능합니다."}</p><div className={styles.candidateList}>{availableInstitutions.map((institution) => <button type="button" className={styles.candidateButton} onClick={() => addInstitution(comparisonKey(institution))} disabled={maxReached || loading} key={comparisonKey(institution)}><span className={styles.candidateIcon}><Building2 aria-hidden="true" /></span><span className={styles.candidateText}><strong>{institution.name}</strong><span>{institutionTypeLabels[institution.type]} · {isAccountInstitution(institution) ? (canonicalZoneLabels[institution.zone] ?? institution.zone) : institution.neighborhood}</span></span><span className={styles.candidateMeta}><MapPin aria-hidden="true" />{isAccountInstitution(institution) ? "공개 기관" : formatDistance(institution.distanceM)}</span></button>)}</div>{maxReached ? <p className={styles.limitText} role="status">비교는 3곳까지 가능해요. 다른 기관을 담으려면 먼저 하나를 제거해 주세요.</p> : null}</section> : null}
      <footer className={styles.dataNote}><CalendarDays aria-hidden="true" /><p>{accountMode ? "상용 모드에서는 공개 canonical 기관과 승인 후기 집계만 표시합니다." : "모든 기관 정보는 체험용 데이터이며, 실제 공개 전에는 최신 기준일과 출처 확인이 필요합니다."}</p></footer>
    </main>
  );
}

function CompareDetailRow({ label, institutions, details, render }: { label: string; institutions: AccountInstitution[]; details: Record<string, AccountDetail | null>; render: (detail?: AccountDetail | null) => string }) {
  return <tr><th scope="row">{label}</th>{institutions.map((institution) => <td className={styles.detailCell} key={institution.publicSlug}>{render(details[institution.publicSlug])}</td>)}</tr>;
}
