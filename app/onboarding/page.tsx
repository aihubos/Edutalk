"use client";

import { ArrowRight, CheckCircle2, MapPinned, ScrollText, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { roleLabels, zoneLabels } from "@/lib/labels";
import type { AgeBand, RoleProfile, ServiceZone, UserRole } from "@/lib/types";
import styles from "./onboarding.module.css";

const CONSENT_VERSIONS = {
  terms: "terms-2026-08-preview",
  privacy: "privacy-2026-08-preview",
  community: "community-2026-08-preview",
} as const;
const roleOptions: Array<{ role: UserRole; title: string; helper: string }> = [
  { role: "PARENT", title: "학부모로 시작", helper: "아이 연령, 거리, 비용 중심으로 비교합니다." },
  { role: "STUDENT", title: "학생으로 시작", helper: "과목, 시간대, 수업 분위기를 중심으로 봅니다." },
  { role: "TEACHER", title: "선생님으로 시작", helper: "근무 환경과 기관 운영 정보를 구분해 봅니다." },
];
const zoneOptions: ServiceZone[] = ["DONGTAN_2", "DONGTAN_1", "ALL"];
const ageOptions: Array<{ value: AgeBand; title: string; helper: string }> = [
  { value: "UNDER_14", title: "만 14세 미만", helper: "보호자 아래 자녀 프로필로 이용" },
  { value: "FOURTEEN_PLUS", title: "만 14세 이상", helper: "학생 역할을 직접 선택 가능" },
  { value: "ADULT", title: "성인", helper: "학부모 또는 선생님 역할 이용" },
];
const profileFields: Record<UserRole, Array<{ key: string; label: string; placeholder: string }>> = {
  STUDENT: [
    { key: "gradeRange", label: "학년 구간", placeholder: "예: 중학교" },
    { key: "interests", label: "관심 과목", placeholder: "예: 수학, 영어" },
    { key: "maxDistance", label: "최대 이동거리", placeholder: "예: 30분 이내" },
    { key: "preferredTime", label: "선호 시간대", placeholder: "예: 평일 저녁" },
  ],
  PARENT: [
    { key: "childGradeRange", label: "자녀 학년 구간", placeholder: "예: 초등학교 저학년" },
    { key: "interests", label: "관심 분야", placeholder: "예: 영어, 돌봄" },
    { key: "budget", label: "예산", placeholder: "예: 월 30만원 이하" },
    { key: "commuteDistance", label: "통학거리", placeholder: "예: 도보 15분 이내" },
  ],
  TEACHER: [
    { key: "occupation", label: "직군 대분류", placeholder: "예: 학원 강사" },
    { key: "institutionType", label: "관심 기관 유형", placeholder: "예: 초중등 학원" },
    { key: "preferredArea", label: "희망 지역", placeholder: "예: 동탄2신도시" },
  ],
};

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewMode = searchParams.get("review") === "policies";
  const { role, zone, setRole, setZone, completeOnboarding, ageBand, roleProfile, hydrated, accountAuthStatus } = useApp();
  const [selectedRole, setSelectedRole] = useState<UserRole>(role);
  const [selectedZone, setSelectedZone] = useState<ServiceZone>(zone);
  const [selectedAgeBand, setSelectedAgeBand] = useState<AgeBand>(ageBand ?? "ADULT");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [communityAgreed, setCommunityAgreed] = useState(false);
  const [profileFieldsValue, setProfileFieldsValue] = useState<Record<string, string>>(
    roleProfile?.role === role ? roleProfile.fields : {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const under14Student = selectedRole === "STUDENT" && selectedAgeBand === "UNDER_14";
  const allAgreed = termsAgreed && privacyAgreed && communityAgreed;
  const effectiveRole: UserRole = under14Student ? "PARENT" : selectedRole;
  const currentProfileFields = profileFields[effectiveRole];
  const profileComplete = currentProfileFields.every((field) => profileFieldsValue[field.key]?.trim());
  const accountConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (hydrated && accountConfigured && accountAuthStatus === "anonymous") {
      router.replace("/login");
    }
  }, [accountAuthStatus, accountConfigured, hydrated, router]);

  if (!hydrated || (accountConfigured && accountAuthStatus === "checking")) {
    return <main className={styles.page}><section className={styles.panel} aria-busy="true" /></main>;
  }

  if (accountConfigured && accountAuthStatus !== "authenticated") {
    return <main className={styles.page}><section className={styles.panel} aria-busy="true" /></main>;
  }

  async function startHome() {
    if (!allAgreed || !profileComplete) return;
    setSubmitting(true);
    setSubmitError("");
    const roleProfile: RoleProfile = { role: effectiveRole, fields: Object.fromEntries(currentProfileFields.map((field) => [field.key, profileFieldsValue[field.key].trim()])) };
    const completed = await completeOnboarding({ ageBand: selectedAgeBand, consentVersions: CONSENT_VERSIONS, consentedAt: new Date().toISOString(), roleProfile, role: effectiveRole, zone: selectedZone });
    if (!completed.ok) { setSubmitError(completed.error ?? "설정을 저장하지 못했어요."); setSubmitting(false); return; }
    setRole(effectiveRole);
    setZone(selectedZone);
    router.push(under14Student || reviewMode ? "/my" : "/");
  }

  return <main className={styles.page}><section className={styles.panel} aria-labelledby="onboarding-title">
    <header className={styles.header}><p className={styles.kicker}>{reviewMode ? "정책 다시보기" : "처음 설정"}</p><h1 id="onboarding-title">{reviewMode ? "이용 전 확인한 정책 요약" : "역할, 연령대, 지역을 선택해 주세요"}</h1><p>아래 내용은 실제 법률 문구가 아닌 출시 전 검토용 요약입니다. 실제 서비스 전에는 정식 약관과 개인정보 처리방침을 확인해야 합니다.</p></header>
    <section className={styles.step} aria-labelledby="role-step-title"><div className={styles.stepTitle}><UsersRound aria-hidden="true" /><div><p className={styles.kicker}>1단계</p><h2 id="role-step-title">내 역할 선택</h2></div></div><div className={styles.optionGrid}>{roleOptions.map((option) => <button type="button" className={`${styles.optionButton} ${selectedRole === option.role ? styles.selected : ""}`} onClick={() => setSelectedRole(option.role)} aria-pressed={selectedRole === option.role} key={option.role}><span><strong>{option.title}</strong><small>{option.helper}</small></span>{selectedRole === option.role ? <CheckCircle2 aria-hidden="true" /> : null}</button>)}</div></section>
    <section className={styles.step} aria-labelledby="age-step-title"><div className={styles.stepTitle}><ShieldCheck aria-hidden="true" /><div><p className={styles.kicker}>2단계</p><h2 id="age-step-title">연령대 선택</h2></div></div><div className={styles.ageGrid}>{ageOptions.map((option) => <button type="button" className={`${styles.zoneButton} ${selectedAgeBand === option.value ? styles.selectedZone : ""}`} onClick={() => setSelectedAgeBand(option.value)} aria-pressed={selectedAgeBand === option.value} key={option.value}><strong>{option.title}</strong><small>{option.helper}</small></button>)}</div>{under14Student ? <p className={styles.guardNotice}>만 14세 미만은 독립 학생 계정을 만들 수 없어요. 보호자 역할로 전환하고, 보호자 아래 자녀 프로필로 학습 기록을 관리합니다.</p> : null}</section>
    <section className={styles.step} aria-labelledby="zone-step-title"><div className={styles.stepTitle}><MapPinned aria-hidden="true" /><div><p className={styles.kicker}>3단계</p><h2 id="zone-step-title">관심 지역 선택</h2></div></div><div className={styles.zoneGrid}>{zoneOptions.map((option) => <button type="button" className={`${styles.zoneButton} ${selectedZone === option ? styles.selectedZone : ""}`} onClick={() => setSelectedZone(option)} aria-pressed={selectedZone === option} key={option}><strong>{zoneLabels[option]}</strong><small>{option === "ALL" ? "동탄 전체를 넓게 확인" : `${roleLabels[effectiveRole]} 추천 기준 적용`}</small></button>)}</div></section>
    <section className={styles.step} aria-labelledby="profile-step-title"><div className={styles.stepTitle}><UsersRound aria-hidden="true" /><div><p className={styles.kicker}>4단계</p><h2 id="profile-step-title">{roleLabels[effectiveRole]} 최소 프로필</h2></div></div><p className={styles.profileHint}>{under14Student ? "보호자 아래 자녀 프로필 기준으로 필요한 추천 정보를 입력해 주세요." : "추천 기준을 만들기 위한 최소 정보입니다."}</p><div className={styles.profileGrid}>{currentProfileFields.map((field) => <label key={field.key}>{field.label}<input value={profileFieldsValue[field.key] ?? ""} onChange={(event) => setProfileFieldsValue((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /></label>)}</div></section>
    <section className={styles.step} aria-labelledby="consent-step-title"><div className={styles.stepTitle}><ScrollText aria-hidden="true" /><div><p className={styles.kicker}>5단계</p><h2 id="consent-step-title">필수 약관 확인</h2></div></div><div className={styles.consentList}><label><input type="checkbox" checked={termsAgreed} onChange={(event) => setTermsAgreed(event.target.checked)} /><span><strong>이용약관 동의</strong><small>서비스 이용 범위와 기본 운영 원칙을 확인했습니다. <Link href="/legal/terms" target="_blank">초안 보기</Link></small></span></label><label><input type="checkbox" checked={privacyAgreed} onChange={(event) => setPrivacyAgreed(event.target.checked)} /><span><strong>개인정보 처리 요약 동의</strong><small>계정과 기능 운영에 필요한 정보 처리 요약을 확인했습니다. <Link href="/legal/privacy" target="_blank">초안 보기</Link></small></span></label><label><input type="checkbox" checked={communityAgreed} onChange={(event) => setCommunityAgreed(event.target.checked)} /><span><strong>커뮤니티 정책 동의</strong><small>후기·문의 작성 시 지켜야 할 기준을 확인했습니다. <Link href="/legal/community" target="_blank">초안 보기</Link></small></span></label></div></section>
    {submitError ? <p className={styles.submitError} role="alert">{submitError}</p> : null}<footer className={styles.footer}><div><strong>선택 요약</strong><span>{roleLabels[effectiveRole]} · {ageOptions.find((item) => item.value === selectedAgeBand)?.title} · {zoneLabels[selectedZone]}</span></div><button type="button" className={styles.startButton} onClick={startHome} disabled={!allAgreed || !profileComplete || submitting}>{submitting ? "저장 중" : under14Student ? "보호자 프로필로 계속" : reviewMode ? "정책 확인 완료" : "홈으로 이동"}<ArrowRight aria-hidden="true" /></button></footer>
  </section></main>;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className={styles.page}><section className={styles.panel} aria-busy="true" /></main>}>
      <OnboardingContent />
    </Suspense>
  );
}
