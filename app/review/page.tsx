"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FilePenLine,
  IdCard,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Star,
} from "lucide-react";
import { institutions } from "@/lib/demo-data";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { trackProductEvent } from "@/lib/product-events";
import { institutionTypeLabels, roleLabels } from "@/lib/labels";
import type {
  InstitutionExperienceReview,
  UserRole,
  VerificationEvidenceDraft,
} from "@/lib/types";
import styles from "./review.module.css";

type InstitutionChoice = { id: string; name: string; type: keyof typeof institutionTypeLabels; neighborhood: string; address: string; hint?: string };

const REVIEW_STEPS = [
  { id: 1, label: "기관 선택", icon: Building2 },
  { id: 2, label: "관계 인증", icon: ShieldCheck },
  { id: 3, label: "5점 평가", icon: Star },
  { id: 4, label: "상세 후기", icon: MessageSquareText },
] as const;

const ROLE_SCORE_ITEMS: Record<UserRole, Array<{ key: string; label: string; helper: string }>> = {
  PARENT: [
    { key: "communication", label: "소통", helper: "아이 상황과 수업 피드백을 잘 알려줬나요?" },
    { key: "care", label: "생활 관리", helper: "안전, 적응, 생활 습관을 믿고 맡길 수 있었나요?" },
    { key: "growth", label: "성장 체감", helper: "아이의 변화나 학습 성장을 느꼈나요?" },
  ],
  STUDENT: [
    { key: "scheduleFit", label: "시간대 적합", helper: "수업 시간이 내 학교생활과 일정에 잘 맞았나요?" },
    { key: "schoolCommute", label: "학교에서 이동", helper: "학교에서 기관까지 가는 길과 이동 시간이 부담스럽지 않았나요?" },
    { key: "classAtmosphere", label: "수업 분위기", helper: "질문하고 참여하기 편안한 수업 분위기였나요?" },
    { key: "homeworkLoad", label: "숙제 부담", helper: "숙제 양과 난이도가 내 학습량에 맞았나요?" },
    { key: "classSize", label: "반 인원 체감", helper: "반 인원 때문에 설명이나 질문 기회가 부족하지 않았나요?" },
    { key: "teachingExplanation", label: "설명 방식", helper: "설명 방식이 내게 이해하기 쉽고 따라가기 좋았나요?" },
    { key: "levelTestHelpfulness", label: "레벨테스트 도움", helper: "레벨테스트와 반 배정이 내 수준을 파악하는 데 도움이 됐나요?" },
    { key: "peerComposition", label: "또래 구성", helper: "함께 배우는 또래 구성과 학습 분위기가 내게 잘 맞았나요?" },
    { key: "studySpace", label: "자습공간", helper: "수업 전후에 집중할 수 있는 자습공간이 충분했나요?" },
    { key: "examPreparation", label: "시험대비", helper: "학교 시험에 맞춘 대비와 피드백이 도움이 됐나요?" },
    { key: "understanding", label: "이해도", helper: "설명이 이해하기 쉽고 질문하기 편했나요?" },
    { key: "pace", label: "수업 속도", helper: "내 수준에 맞게 진도와 과제를 조절해줬나요?" },
    { key: "motivation", label: "학습 동기", helper: "공부를 계속하고 싶게 도와줬나요?" },
    { key: "commuteConvenience", label: "이동 편의", helper: "집이나 학교를 포함한 전체 이동이 부담스럽지 않았나요?" },
  ],
  TEACHER: [
    { key: "leadership", label: "리더십", helper: "원장·관리자가 기준을 명확히 안내하고 존중했나요?" },
    { key: "workload", label: "업무량", helper: "수업 외 행정·자료 준비가 감당 가능한 수준이었나요?" },
    { key: "welfare", label: "급여·복지", helper: "급여 지급, 휴게시간, 복지 안내가 일관됐나요?" },
    { key: "culture", label: "조직문화", helper: "동료와 운영진의 소통 방식이 건강했나요?" },
    { key: "educationPhilosophy", label: "교육철학", helper: "표방한 교육 철학이 실제 수업·운영과 일치했나요?" },
    { key: "growth", label: "성장 기회", helper: "커리어와 수업 역량을 키울 기회가 있었나요?" },
  ],
};

const relationCopy: Record<UserRole, { title: string; body: string; evidence: string }> = {
  PARENT: {
    title: "실제 이용 경험이 있는 학부모 후기만 모아요.",
    body: "체험판에서는 증빙 파일을 받지 않지만, 정식 운영 전에는 결제 내역, 상담 기록, 재원 확인 등 관계 확인 절차가 붙어요.",
    evidence: "재원 또는 상담 경험 확인",
  },
  STUDENT: {
    title: "직접 수업을 들은 학생 경험을 기준으로 해요.",
    body: "체험판에서는 체크만으로 넘어가며, 정식 운영 전에는 수강 이력이나 보호자 확인 같은 인증 절차가 연결돼요.",
    evidence: "수강 또는 상담 경험 확인",
  },
  TEACHER: {
    title: "근무 경험을 확인한 선생님 후기를 분리해서 봐요.",
    body: "체험판에서는 서버 전송 없이 흐름만 보여주며, 정식 운영 전에는 재직·근무 이력 확인 절차가 필요해요.",
    evidence: "근무 또는 면접 경험 확인",
  },
};

export default function ReviewPage() {
  const {
    role,
    reviewDraft,
    updateReviewDraft,
    clearReviewDraft,
    addInstitutionReview,
    hydrated,
  } = useApp();
  const configured = isSupabaseConfigured();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [employmentEvidence, setEmploymentEvidence] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [writeEligibility, setWriteEligibility] = useState<{ canWrite: boolean; verificationStatus?: string } | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accountInstitutions, setAccountInstitutions] = useState<InstitutionChoice[]>([]);
  const [institutionsState, setInstitutionsState] = useState<"loading" | "ready" | "error">(configured ? "loading" : "ready");
  const institutionChoices = useMemo<InstitutionChoice[]>(() => configured ? accountInstitutions : institutions.map((institution) => ({ id: institution.id, name: institution.name, type: institution.type, neighborhood: institution.neighborhood, address: institution.address, hint: institution.reviewHighlights[0] })), [accountInstitutions, configured]);

  const selectedInstitution = useMemo(
    () => institutionChoices.find((institution) => institution.id === reviewDraft.institutionId) ?? null,
    [institutionChoices, reviewDraft.institutionId],
  );
  const selectedInstitutionIsAvailable = Boolean(selectedInstitution) && (!configured || institutionsState === "ready");
  const scoreItems = ROLE_SCORE_ITEMS[reviewDraft.relation || role];
  const relationGuide = relationCopy[reviewDraft.relation || role];
  const allScoresReady = scoreItems.every((item) => typeof reviewDraft.scores[item.key] === "number");
  const textReady =
    reviewDraft.strength.trim().length >= 10 &&
    reviewDraft.improvement.trim().length >= 10 &&
    reviewDraft.recommendTo.trim().length >= 5;
  const requiresApprovedVerification = configured && step >= 2;
  const hasApprovedVerification = !requiresApprovedVerification || writeEligibility?.canWrite === true;
  const canGoNext =
    (step === 1 && selectedInstitutionIsAvailable) ||
    (step === 2 &&
      reviewDraft.verificationAcknowledged &&
      hasApprovedVerification &&
      (reviewDraft.relation !== "TEACHER" || (employmentEvidence && privacyAcknowledged))) ||
    (step === 3 && allScoresReady) ||
    (step === 4 && textReady && hasApprovedVerification);

  useEffect(() => {
    if (!configured) return;
    void fetch("/api/institutions").then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { mode?: string; institutions?: Array<{ publicSlug?: string; name?: string; type?: keyof typeof institutionTypeLabels; address?: string }> };
      if (!response.ok || payload.mode !== "canonical") { setInstitutionsState("error"); return; }
      setAccountInstitutions((payload.institutions ?? []).flatMap((institution) => institution.publicSlug && institution.name && institution.type && institution.address ? [{ id: institution.publicSlug, name: institution.name, type: institution.type, neighborhood: institution.address, address: institution.address }] : []));
      setInstitutionsState("ready");
    }).catch(() => setInstitutionsState("error"));
  }, [configured]);

  useEffect(() => {
    if (!configured || step < 2 || !reviewDraft.institutionId) return;
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      setEligibilityLoading(true);
      setWriteEligibility(null);
      setSubmitError("");
      void fetch(`/api/reviews?purpose=write&institution=${encodeURIComponent(reviewDraft.institutionId)}&role=${encodeURIComponent(reviewDraft.relation)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { canWrite?: boolean; verificationStatus?: string; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "작성 자격을 확인하지 못했어요.");
          setWriteEligibility({ canWrite: payload.canWrite === true, verificationStatus: payload.verificationStatus });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setWriteEligibility({ canWrite: false });
          setSubmitError(error instanceof Error ? error.message : "작성 자격을 확인하지 못했어요.");
        })
        .finally(() => { if (!controller.signal.aborted) setEligibilityLoading(false); });
    });
    return () => { window.cancelAnimationFrame(frame); controller.abort(); };
  }, [configured, reviewDraft.institutionId, reviewDraft.relation, step]);

  const updateRelation = (nextRole: UserRole) => {
    updateReviewDraft({ relation: nextRole, scores: {} });
    setWriteEligibility(null);
    setSubmitError("");
  };

  const updateScore = (key: string, score: number) => {
    updateReviewDraft({ scores: { ...reviewDraft.scores, [key]: score } });
  };

  const handleNext = async () => {
    if (!canGoNext || submitting || eligibilityLoading) return;
    if (step < REVIEW_STEPS.length) {
      setStep((current) => current + 1);
      return;
    }
    const evidence: VerificationEvidenceDraft[] = [
      {
        type: reviewDraft.relation === "TEACHER" ? "EMPLOYMENT" : "ENROLLMENT",
        label: reviewDraft.relation === "TEACHER" ? "재직·근무 경험 증빙" : "재원·수강 경험 증빙",
        confirmed: reviewDraft.verificationAcknowledged,
      },
    ];
    const review: InstitutionExperienceReview = {
      id: `institution-review-${crypto.randomUUID()}`,
      institutionId: reviewDraft.institutionId,
      relation: reviewDraft.relation,
      scores: reviewDraft.scores,
      strength: reviewDraft.strength.trim(),
      improvement: reviewDraft.improvement.trim(),
      recommendTo: reviewDraft.recommendTo.trim(),
      evidence,
      verificationStatus: "PENDING",
      anonymousPublicAuthor: reviewDraft.relation === "TEACHER",
      isSynthetic: false,
      createdAt: new Date().toISOString(),
    };
    if (configured) {
      setSubmitting(true);
      setSubmitError("");
      const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institutionTargetKey: review.institutionId, relation: review.relation, scores: review.scores, strength: review.strength, improvement: review.improvement, recommendTo: review.recommendTo }) });
      const payload = await response.json() as { error?: string };
      setSubmitting(false);
      if (!response.ok) { setSubmitError(payload.error ?? "후기를 접수하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    } else addInstitutionReview(review);
    trackProductEvent({ eventName: "REVIEW_SUBMITTED", path: "/review", category: "institution", role: review.relation });
    setSubmitted(true);
  };

  const startNewReview = () => {
    clearReviewDraft();
    setSubmitted(false);
    setStep(1);
    setEmploymentEvidence(false);
    setPrivacyAcknowledged(false);
  };

  if (!hydrated) {
    return (
      <main className={styles.page} aria-busy="true">
        <div className={styles.skeletonHero} />
        <div className={styles.skeletonCard} />
      </main>
    );
  }

  if (submitted) {
    return (
      <main className={styles.page}>
        <section className={styles.successCard} aria-labelledby="review-success-title">
          <div className={styles.successIcon} aria-hidden="true">
            <CheckCircle2 size={34} />
          </div>
          <p className={styles.eyebrow}>후기 작성 완료</p>
          <h1 id="review-success-title">초안이 저장됐어요</h1>
          <p>
            {configured ? `${selectedInstitution?.name ?? "선택한 기관"} 후기를 심사 대기 상태로 계정에 접수했어요. 승인 전에는 공개 평점과 본문에 반영되지 않아요.` : `${selectedInstitution?.name ?? "선택한 기관"} 후기가 이 기기에 저장됐습니다. 체험 모드에서는 서버로 전송되지 않아요.`}
          </p>
          <div className={styles.successActions}>
            <Link className={styles.secondaryButton} href="/activity">
              내 활동 보기
            </Link>
            <button className={styles.primaryButton} type="button" onClick={startNewReview}>
              새 후기 쓰기
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="review-title">
        <p className={styles.eyebrow}>인증 기반 후기</p>
        <h1 id="review-title">직접 겪은 경험만 간단히 남겨주세요</h1>
        <p>기관을 고르고, 이용·근무 관계를 확인한 뒤 역할에 맞는 평가와 짧은 후기를 저장합니다.</p>
      </section>

      <nav className={styles.steps} aria-label="후기 작성 단계">
        {REVIEW_STEPS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === step;
          const isDone = item.id < step;

          return (
            <div
              className={isActive ? styles.stepActive : isDone ? styles.stepDone : styles.step}
              key={item.id}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={styles.stepIcon} aria-hidden="true">
                <Icon size={16} />
              </span>
              <span>{item.label}</span>
            </div>
          );
        })}
      </nav>

      <section className={styles.card}>
        {step === 1 ? (
          <InstitutionStep selectedId={reviewDraft.institutionId} onSelect={(id) => updateReviewDraft({ institutionId: id })} institutions={institutionChoices} configured={configured} state={institutionsState} />
        ) : null}

        {step === 2 ? (
          <VerificationStep
            relation={reviewDraft.relation}
            acknowledged={reviewDraft.verificationAcknowledged}
            guide={relationGuide}
            onRelationChange={updateRelation}
            onAcknowledgedChange={(checked) => updateReviewDraft({ verificationAcknowledged: checked })}
            employmentEvidence={employmentEvidence}
            privacyAcknowledged={privacyAcknowledged}
            onEmploymentEvidenceChange={setEmploymentEvidence}
            onPrivacyAcknowledgedChange={setPrivacyAcknowledged}
            configured={configured}
            eligibility={writeEligibility}
            loading={eligibilityLoading}
            institutionId={reviewDraft.institutionId}
          />
        ) : null}

        {step === 3 ? (
          <ScoresStep
            relation={reviewDraft.relation}
            scores={reviewDraft.scores}
            scoreItems={scoreItems}
            onScoreChange={updateScore}
          />
        ) : null}

        {step === 4 ? (
          <TextStep
            strength={reviewDraft.strength}
            improvement={reviewDraft.improvement}
            recommendTo={reviewDraft.recommendTo}
            selectedInstitutionName={selectedInstitution?.name ?? "선택한 기관"}
            onChange={(patch) => updateReviewDraft(patch)}
          />
        ) : null}
      </section>

      {submitError ? <p className={styles.submitError} role="alert">{submitError}</p> : null}

      <section className={styles.footerBar} aria-label="후기 작성 이동">
        <button className={styles.ghostButton} type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}>
          <ChevronLeft size={18} aria-hidden="true" />
          이전
        </button>
        <p className={styles.saveState}>
          <FilePenLine size={15} aria-hidden="true" />
          {reviewDraft.savedAt ? "초안 자동 저장됨" : "입력하면 자동 저장돼요"}
        </p>
        <button className={styles.primaryButton} type="button" onClick={handleNext} disabled={!canGoNext || eligibilityLoading || submitting}>
          {submitting ? "접수 중" : eligibilityLoading ? "인증 확인 중" : step === REVIEW_STEPS.length ? "제출 확인" : "다음"}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>
    </main>
  );
}

function InstitutionStep({ selectedId, onSelect, institutions, configured, state }: { selectedId: string; onSelect: (id: string) => void; institutions: InstitutionChoice[]; configured: boolean; state: "loading" | "ready" | "error" }) {
  return (
    <div className={styles.stepPanel}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <Building2 size={20} />
        </span>
        <div>
          <h2>후기를 남길 기관을 선택하세요</h2>
          <p>{configured ? "공개 canonical 기관 중 하나를 고릅니다. 체험 기관 데이터는 표시하지 않습니다." : "현재 체험 데이터에 있는 동탄 기관 중 하나를 고릅니다."}</p>
        </div>
      </div>

      <ul className={styles.institutionList}>
        {state === "loading" ? <li className={styles.institutionEmpty}>공개 기관 정보를 불러오는 중이에요.</li> : state === "error" ? <li className={styles.institutionEmpty}>공개 기관 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</li> : institutions.length === 0 ? <li className={styles.institutionEmpty}>공개 기관 정보가 아직 없어요. 운영 데이터가 적재되면 선택할 수 있어요.</li> : institutions.map((institution) => {
          const checked = selectedId === institution.id;

          return (
            <li key={institution.id}>
              <button
                className={checked ? styles.institutionSelected : styles.institutionItem}
                type="button"
                onClick={() => onSelect(institution.id)}
                aria-pressed={checked}
              >
                <span className={styles.institutionMark} aria-hidden="true">
                  {checked ? <CheckCircle2 size={20} /> : <Building2 size={20} />}
                </span>
                <span className={styles.institutionBody}>
                  <strong>{institution.name}</strong>
                  <span>
                    {institutionTypeLabels[institution.type]} · {institution.neighborhood}
                  </span>
                  <small>{configured ? "공개 canonical 기관" : institution.hint}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function VerificationStep({
  relation,
  acknowledged,
  guide,
  onRelationChange,
  onAcknowledgedChange,
  employmentEvidence,
  privacyAcknowledged,
  onEmploymentEvidenceChange,
  onPrivacyAcknowledgedChange,
  configured,
  eligibility,
  loading,
  institutionId,
}: {
  relation: UserRole;
  acknowledged: boolean;
  guide: { title: string; body: string; evidence: string };
  onRelationChange: (role: UserRole) => void;
  onAcknowledgedChange: (checked: boolean) => void;
  employmentEvidence: boolean;
  privacyAcknowledged: boolean;
  onEmploymentEvidenceChange: (checked: boolean) => void;
  onPrivacyAcknowledgedChange: (checked: boolean) => void;
  configured: boolean;
  eligibility: { canWrite: boolean; verificationStatus?: string } | null;
  loading: boolean;
  institutionId: string;
}) {
  return (
    <div className={styles.stepPanel}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2>어떤 관계로 경험했나요?</h2>
          <p>역할에 따라 평가 질문과 공개 기준이 달라집니다.</p>
        </div>
      </div>

      <div className={styles.segmented} role="group" aria-label="후기 작성자 역할">
        {(["PARENT", "STUDENT", "TEACHER"] as UserRole[]).map((item) => (
          <button
            className={relation === item ? styles.segmentActive : styles.segment}
            key={item}
            type="button"
            aria-pressed={relation === item}
            onClick={() => onRelationChange(item)}
          >
            {roleLabels[item]}
          </button>
        ))}
      </div>

      <div className={styles.noticeBox}>
        <BadgeCheck size={22} aria-hidden="true" />
        <div>
          <h3>{guide.title}</h3>
          <p>{guide.body}</p>
          <span>{guide.evidence}</span>
        </div>
      </div>

      {relation === "TEACHER" ? (
        <div className={styles.teacherVerification}>
          <div>
            <LockKeyhole size={20} aria-hidden="true" />
            <span>
              <strong>교직원 근무 인증</strong>
              <small>재직·경력 증명, 근로계약 일부, 업무 메일 중 하나를 비공개로 심사해요.</small>
            </span>
          </div>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={employmentEvidence} onChange={(event) => onEmploymentEvidenceChange(event.target.checked)} />
            <span>실제 근무 관계를 확인할 수 있는 증빙을 제출할 수 있어요.</span>
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={privacyAcknowledged} onChange={(event) => onPrivacyAcknowledgedChange(event.target.checked)} />
            <span>실명, 특정 반, 연락처 등 개인을 식별할 수 있는 내용을 작성하지 않아요.</span>
          </label>
          <p>
            <IdCard size={16} aria-hidden="true" />
            체험판은 파일을 받지 않습니다. 운영에서는 기관에 작성자 신원·증빙을 공개하지 않아요.
          </p>
        </div>
      ) : null}

      <label className={styles.checkRow}>
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledgedChange(event.target.checked)} />
        <span>정식 운영 전에는 실제 관계 확인 절차가 필요하다는 점을 확인했어요.</span>
      </label>
      {configured ? <div className={styles.accountEligibility} data-ready={eligibility?.canWrite === true}>
        <strong>{loading ? "관계 인증을 확인하고 있어요." : eligibility?.canWrite ? "승인된 관계 인증을 확인했어요." : "승인된 관계 인증이 필요해요."}</strong>
        <p>{eligibility?.canWrite ? "이 관계와 기관 기준으로 후기 작성 단계를 계속할 수 있어요." : `현재 상태: ${eligibility?.verificationStatus ?? "인증 내역 없음"}. 신뢰센터에서 관계 인증을 요청한 뒤 승인되면 작성할 수 있어요.`}</p>
        {!loading && !eligibility?.canWrite ? <Link href={`/trust-center?tab=verification&institution=${encodeURIComponent(institutionId)}`} className={styles.trustLink}>신뢰센터에서 관계 인증하기</Link> : null}
      </div> : null}
    </div>
  );
}

function ScoresStep({
  relation,
  scores,
  scoreItems,
  onScoreChange,
}: {
  relation: UserRole;
  scores: Record<string, number>;
  scoreItems: Array<{ key: string; label: string; helper: string }>;
  onScoreChange: (key: string, score: number) => void;
}) {
  return (
    <div className={styles.stepPanel}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <Star size={20} />
        </span>
        <div>
          <h2>{roleLabels[relation]} 기준으로 평가해주세요</h2>
          <p>각 항목은 1점부터 5점까지 선택합니다.</p>
        </div>
      </div>

      <div className={styles.scoreList}>
        {scoreItems.map((item) => (
          <fieldset className={styles.scoreCard} key={item.key}>
            <legend>
              <strong>{item.label}</strong>
              <span>{item.helper}</span>
            </legend>
            <div className={styles.scoreButtons}>
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  className={scores[item.key] === score ? styles.scoreActive : styles.scoreButton}
                  key={score}
                  type="button"
                  onClick={() => onScoreChange(item.key, score)}
                  aria-pressed={scores[item.key] === score}
                  aria-label={item.label + " " + score + "점"}
                >
                  {score}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

function TextStep({
  strength,
  improvement,
  recommendTo,
  selectedInstitutionName,
  onChange,
}: {
  strength: string;
  improvement: string;
  recommendTo: string;
  selectedInstitutionName: string;
  onChange: (patch: { strength?: string; improvement?: string; recommendTo?: string }) => void;
}) {
  return (
    <div className={styles.stepPanel}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <ClipboardCheck size={20} />
        </span>
        <div>
          <h2>{selectedInstitutionName} 경험을 정리해주세요</h2>
          <p>개인정보 없이 판단에 도움이 되는 내용만 남깁니다.</p>
        </div>
      </div>

      <div className={styles.textFields}>
        <label className={styles.textField}>
          <span>좋았던 점</span>
          <textarea
            value={strength}
            minLength={10}
            onChange={(event) => onChange({ strength: event.target.value })}
            placeholder="예: 아이 상황을 구체적으로 알려주고 상담 응답이 빨랐어요."
          />
          <small>10자 이상 입력해주세요.</small>
        </label>
        <label className={styles.textField}>
          <span>아쉬운 점</span>
          <textarea
            value={improvement}
            minLength={10}
            onChange={(event) => onChange({ improvement: event.target.value })}
            placeholder="예: 하원 시간대 안내가 조금 더 명확하면 좋겠어요."
          />
          <small>10자 이상 입력해주세요.</small>
        </label>
        <label className={styles.textField}>
          <span>추천 대상</span>
          <textarea
            value={recommendTo}
            minLength={5}
            onChange={(event) => onChange({ recommendTo: event.target.value })}
            placeholder="예: 꼼꼼한 피드백을 원하는 초등 저학년 가정"
          />
          <small>5자 이상 입력해주세요.</small>
        </label>
      </div>
    </div>
  );
}
