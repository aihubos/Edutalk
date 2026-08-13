"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Filter,
  KeyRound,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { demoTutorJobs, demoTutorProfiles, demoTutorReviews, getTutorRankBreakdown, getTutorRankScore, getTutorRating, getTutorVerifiedCredentials, mapStoredTutorJob, mapStoredTutorProfile, mapStoredTutorReview } from "@/lib/tutor-data";
import type { TutorCredentialType, TutorJob, TutorProfile } from "@/lib/types";
import styles from "./tutors.module.css";

type TabKey = "TUTORS" | "JOBS";
type SortKey = "RECOMMENDED" | "REVIEWS" | "RESPONSE" | "LOW_PRICE";
type ModalKey = "TUTOR" | "JOB" | null;
type RequestStatus = "RECEIVED" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
type TutorRequest = {
  id: string;
  message: string;
  status: RequestStatus;
  response_message?: string | null;
  responded_at?: string | null;
  created_at?: string;
  tutor_id?: string;
  tutor_job_id?: string;
  direction: "SENT" | "RECEIVED";
  type: "CONTACT" | "APPLICATION";
};

const allZoneLabel = "전체 동네";
const allSubjectLabel = "전체 과목";

const sortLabels: Record<SortKey, string> = {
  RECOMMENDED: "추천순",
  REVIEWS: "후기순",
  RESPONSE: "응답률순",
  LOW_PRICE: "낮은비용순",
};

const formatPrice = (price: number) => `${price.toLocaleString("ko-KR")}원`;

const getInitialTutorForm = () => ({
  displayName: "",
  subjects: "",
  targetGrades: "",
  zones: "",
  introduction: "",
  pricePerHour: "40000",
  identity: false,
  teachingCert: false,
  languageScore: false,
  degree: false,
});

const verificationFormItems: Array<{ key: "identity" | "teachingCert" | "languageScore" | "degree"; type: TutorCredentialType; label: string }> = [
  { key: "identity", type: "IDENTITY", label: "본인인증" },
  { key: "teachingCert", type: "TEACHING_CERT", label: "교원자격 인증" },
  { key: "languageScore", type: "LANGUAGE_SCORE", label: "어학성적 인증" },
  { key: "degree", type: "DEGREE", label: "학력 인증" },
];

const getInitialJobForm = () => ({
  title: "",
  studentGrade: "",
  subject: "",
  zone: "",
  schedule: "",
  budgetPerHour: "40000",
  detail: "",
});

function splitTextList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeById<T extends { id: string }>(demoItems: T[], localItems: T[]) {
  const localIds = new Set(localItems.map((item) => item.id));
  return [...localItems, ...demoItems.filter((item) => !localIds.has(item.id))];
}

export default function TutorsPage() {
  const { tutorProfiles, tutorJobs, tutorReviews, addTutorProfile, addTutorJob, accountAuthStatus } = useApp();
  const configured = isSupabaseConfigured();
  const [storedProfiles, setStoredProfiles] = useState<TutorProfile[]>([]);
  const [storedJobs, setStoredJobs] = useState<TutorJob[]>([]);
  const [storedReviews, setStoredReviews] = useState<ReturnType<typeof mapStoredTutorReview>[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("TUTORS");
  const [zone, setZone] = useState(allZoneLabel);
  const [subject, setSubject] = useState(allSubjectLabel);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortKey>("RECOMMENDED");
  const [modal, setModal] = useState<ModalKey>(null);
  const [notice, setNotice] = useState("튜터 활동 프로필은 학부모·학생·선생님 역할과 별도로 관리됩니다.");
  const [tutorForm, setTutorForm] = useState(getInitialTutorForm);
  const [jobForm, setJobForm] = useState(getInitialJobForm);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [contacts, setContacts] = useState<TutorRequest[]>([]);
  const [applications, setApplications] = useState<TutorRequest[]>([]);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [responseStatuses, setResponseStatuses] = useState<Record<string, Exclude<RequestStatus, "RECEIVED">>>({});
  const [serverLoading, setServerLoading] = useState(configured);
  const [serverError, setServerError] = useState("");
  const [serverReady, setServerReady] = useState(!configured);
  const [lessonCode, setLessonCode] = useState("");
  const [lessonCodeExpiresAt, setLessonCodeExpiresAt] = useState("");
  const [issuingLessonCode, setIssuingLessonCode] = useState(false);

  const profiles = useMemo(() => configured ? storedProfiles : mergeById(demoTutorProfiles, tutorProfiles), [configured, storedProfiles, tutorProfiles]);
  const jobs = useMemo(() => configured ? storedJobs : mergeById(demoTutorJobs, tutorJobs), [configured, storedJobs, tutorJobs]);
  const reviews = useMemo(() => configured ? storedReviews : mergeById(demoTutorReviews, tutorReviews), [configured, storedReviews, tutorReviews]);

  const loadStoredData = useCallback(async () => {
    if (!configured) return;
    setServerLoading(true);
    setServerError("");
    try {
      const response = await fetch("/api/tutors");
      const data = await response.json().catch(() => null) as { mode?: string; error?: string; profiles?: Record<string, unknown>[]; jobs?: Record<string, unknown>[]; reviews?: Record<string, unknown>[]; credentials?: Record<string, unknown>[]; contacts?: Omit<TutorRequest, "type">[]; applications?: Omit<TutorRequest, "type">[] } | null;
      if (!response.ok || data?.mode !== "supabase") throw new Error(data?.error ?? "계정 튜터 데이터를 불러오지 못했어요.");
      setStoredProfiles((data.profiles ?? []).map((item) => mapStoredTutorProfile(item, data.credentials ?? [])));
      setStoredJobs((data.jobs ?? []).map(mapStoredTutorJob));
      setStoredReviews((data.reviews ?? []).map(mapStoredTutorReview));
      setContacts((data.contacts ?? []).map((item) => ({ ...item, type: "CONTACT" as const })));
      setApplications((data.applications ?? []).map((item) => ({ ...item, type: "APPLICATION" as const })));
      setServerReady(true);
    } catch (error) {
      setServerReady(false);
      setServerError(error instanceof Error ? error.message : "계정 튜터 데이터를 불러오지 못했어요.");
    } finally {
      setServerLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const frame = window.requestAnimationFrame(() => { void loadStoredData(); });
    return () => window.cancelAnimationFrame(frame);
  }, [configured, loadStoredData]);

  const zoneOptions = useMemo(() => {
    const values = new Set<string>();
    profiles.forEach((profile) => profile.zones.forEach((item) => values.add(item)));
    jobs.forEach((job) => values.add(job.zone));
    return [allZoneLabel, ...Array.from(values).sort((a, b) => a.localeCompare(b, "ko-KR"))];
  }, [jobs, profiles]);

  const subjectOptions = useMemo(() => {
    const values = new Set<string>();
    profiles.forEach((profile) => profile.subjects.forEach((item) => values.add(item)));
    jobs.forEach((job) => values.add(job.subject));
    return [allSubjectLabel, ...Array.from(values).sort((a, b) => a.localeCompare(b, "ko-KR"))];
  }, [jobs, profiles]);

  const filteredProfiles = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase("ko-KR");
    const result = profiles.filter((profile) => {
      const zoneMatched = zone === allZoneLabel || profile.zones.includes(zone);
      const subjectMatched = subject === allSubjectLabel || profile.subjects.includes(subject);
      const keywordMatched = !normalizedKeyword || [
        profile.displayName,
        ...profile.subjects,
        profile.introduction,
        ...profile.zones,
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedKeyword));
      return zoneMatched && subjectMatched && keywordMatched;
    });

    return [...result].sort((a, b) => {
      if (sort === "REVIEWS") return getTutorRating(b.id, reviews).count - getTutorRating(a.id, reviews).count;
      if (sort === "RESPONSE") return b.responseRate - a.responseRate;
      if (sort === "LOW_PRICE") return a.pricePerHour - b.pricePerHour;
      return getTutorRankScore(b, reviews) - getTutorRankScore(a, reviews);
    });
  }, [keyword, profiles, reviews, sort, subject, zone]);

  const filteredJobs = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase("ko-KR");
    return jobs.filter((job) => {
        const zoneMatched = zone === allZoneLabel || job.zone === zone;
        const subjectMatched = subject === allSubjectLabel || job.subject === subject;
        const keywordMatched = !normalizedKeyword || [job.title, job.detail, job.subject, job.zone]
          .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedKeyword));
        return zoneMatched && subjectMatched && keywordMatched;
      });
  }, [jobs, keyword, subject, zone]);

  const openTutorForm = () => {
    if (configured && !serverReady) {
      setNotice("계정 튜터 데이터를 확인한 뒤 등록할 수 있어요. 다시 시도해 주세요.");
      return;
    }
    if (configured && accountAuthStatus !== "authenticated") {
      setNotice("로그인한 계정에서 튜터 활동 프로필을 등록할 수 있어요.");
      return;
    }
    setNotice(configured ? "현재 역할을 바꾸지 않고 계정의 튜터 활동 프로필을 작성합니다." : "현재 역할을 바꾸지 않고 이 기기의 튜터 활동 프로필을 작성합니다.");
    setModal("TUTOR");
  };

  const issueLessonCode = async () => {
    if (!configured) {
      setNotice("수업 확인 코드는 실제 계정과 인증이 연결된 뒤 발급할 수 있어요.");
      return;
    }
    if (accountAuthStatus !== "authenticated") {
      setNotice("로그인 후 수업 확인 코드를 발급할 수 있어요.");
      return;
    }
    setIssuingLessonCode(true);
    setNotice("수업 확인 코드를 발급하고 있어요.");
    try {
      const response = await fetch("/api/tutors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "lesson-code", data: {} }) });
      const payload = await response.json().catch(() => null) as { code?: string; expiresAt?: string; error?: string } | null;
      if (!response.ok || !payload?.code || !payload.expiresAt) throw new Error(payload?.error ?? "수업 확인 코드를 발급하지 못했어요.");
      setLessonCode(payload.code);
      setLessonCodeExpiresAt(payload.expiresAt);
      setNotice("학습자에게 한 번만 전달하세요. 사용되거나 만료되면 다시 사용할 수 없어요.");
    } catch (error) {
      setLessonCode("");
      setLessonCodeExpiresAt("");
      setNotice(error instanceof Error ? error.message : "수업 확인 코드를 발급하지 못했어요.");
    } finally {
      setIssuingLessonCode(false);
    }
  };

  const submitTutorProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const subjects = splitTextList(tutorForm.subjects);
    const targetGrades = splitTextList(tutorForm.targetGrades);
    const zones = splitTextList(tutorForm.zones);
    const requestedCredentials = verificationFormItems
      .filter((item) => tutorForm[item.key])
      .map((item) => ({ type: item.type, label: item.label, issuer: "EDU톡 비공개 심사", verified: false }));

    if (!tutorForm.displayName.trim() || subjects.length === 0 || targetGrades.length === 0 || zones.length === 0) {
      setNotice("이름, 과목, 학년, 활동 동네를 입력해 주세요.");
      return;
    }

    const nextProfile: TutorProfile = {
      id: `local-tutor-${Date.now()}`,
      displayName: tutorForm.displayName.trim(),
      userId: "local-teacher-profile",
      subjects,
      targetGrades,
      zones,
      introduction: tutorForm.introduction.trim() || "동네 학생에게 맞춘 개인 수업을 준비 중입니다.",
      pricePerHour: Number(tutorForm.pricePerHour) || 0,
      responseRate: 0,
      verified: false,
      identityVerified: false,
      verificationLevel: "PENDING",
      credentials: requestedCredentials,
      isSynthetic: false,
    };

    if (configured) {
      const response = await fetch("/api/tutors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "profile", data: { displayName: nextProfile.displayName, subjects, targetGrades, zones, introduction: nextProfile.introduction, pricePerHour: nextProfile.pricePerHour, credentials: requestedCredentials.map(({ type, label }) => ({ type, label })) } }) });
      if (!response.ok) { setNotice("로그인 후 서버에 튜터 프로필을 저장할 수 있어요."); return; }
      await loadStoredData();
    } else addTutorProfile(nextProfile);
    setTutorForm(getInitialTutorForm());
    setModal(null);
    setNotice(configured ? "튜터 프로필을 계정에 저장했어요. 인증 요청은 신뢰센터에서 비공개 증빙을 제출한 뒤 심사받을 수 있어요." : "튜터 프로필과 인증 신청 항목을 이 기기에 체험용으로 저장했어요. 실제 심사는 서버 연결 후 진행됩니다.");
  };

  const submitTutorJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!jobForm.title.trim() || !jobForm.studentGrade.trim() || !jobForm.subject.trim() || !jobForm.zone.trim()) {
      setNotice("구인글 제목, 학년, 과목, 동네를 입력해 주세요.");
      return;
    }

    const nextJob: TutorJob = {
      id: `local-job-${Date.now()}`,
      authorUserId: "local-parent-user",
      title: jobForm.title.trim(),
      studentGrade: jobForm.studentGrade.trim(),
      subject: jobForm.subject.trim(),
      zone: jobForm.zone.trim(),
      schedule: jobForm.schedule.trim() || "협의 가능",
      budgetPerHour: Number(jobForm.budgetPerHour) || 0,
      detail: jobForm.detail.trim() || "상담 후 자세한 수업 조건을 정하고 싶어요.",
      status: "OPEN",
      isSynthetic: false,
      createdAt: new Date().toISOString(),
    };

    if (configured) {
      const response = await fetch("/api/tutors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "job", data: { title: nextJob.title, studentGrade: nextJob.studentGrade, subject: nextJob.subject, zone: nextJob.zone, schedule: nextJob.schedule, budgetPerHour: nextJob.budgetPerHour, detail: nextJob.detail } }) });
      if (!response.ok) { setNotice("로그인 후 서버에 구인글을 저장할 수 있어요."); return; }
      await loadStoredData();
    } else addTutorJob(nextJob);
    setJobForm(getInitialJobForm());
    setModal(null);
    setActiveTab("JOBS");
    setNotice(configured ? "구인글을 계정에 저장했어요." : "구인글을 이 기기에 체험용으로 저장했어요. 서버 등록은 아닙니다.");
  };

  const applyToJob = async (jobId: string) => {
    if (!configured) { setNotice("체험 모드에서는 구인 지원을 전송하지 않습니다."); return; }
    const response = await fetch("/api/tutors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "job-application", data: { tutorJobId: jobId, message: applicationMessage } }) });
    if (!response.ok) { setNotice("구인 지원을 접수하지 못했어요. 로그인과 저장소 연결을 확인해 주세요."); return; }
    setApplyingJobId(null); setApplicationMessage(""); await loadStoredData(); setNotice("구인 지원 요청을 계정에 접수했어요. 답변은 아래 내 요청에서 확인할 수 있어요.");
  };

  const requests = useMemo(() => [...contacts, ...applications].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")), [applications, contacts]);
  const requestTarget = (item: TutorRequest) => {
    if (item.type === "CONTACT") return profiles.find((profile) => profile.id === item.tutor_id)?.displayName ?? "튜터 문의";
    return jobs.find((job) => job.id === item.tutor_job_id)?.title ?? "구인글 지원";
  };
  const updateReceivedRequest = async (item: TutorRequest) => {
    const responseMessage = (responseDrafts[item.id] ?? item.response_message ?? "").trim();
    if (!responseMessage) { setNotice("처리 답변을 1자 이상 입력해 주세요."); return; }
    const response = await fetch("/api/tutors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: item.type, id: item.id, status: responseStatuses[item.id] ?? "ANSWERED", responseMessage }),
    });
    if (!response.ok) { setNotice("요청을 처리하지 못했어요. 수신 권한 연결을 확인해 주세요."); return; }
    await loadStoredData();
    setNotice("수신 요청의 상태와 답변을 계정에 저장했어요.");
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.kicker}>동네 튜터</p>
        <h1>우리 동네에서 바로 물어볼 선생님을 찾아요</h1>
        <p>추천 순위에는 광고비를 반영하지 않습니다. 인증 후기, 응답률, 검증된 인증 항목만 반영합니다.</p>
      </header>

      <section className={styles.actionPanel} aria-label="튜터 주요 작업">
        <button type="button" className={styles.primaryAction} onClick={openTutorForm} disabled={configured && !serverReady}>
          <UserRoundPlus aria-hidden="true" />
          튜터 등록
        </button>
        <button type="button" className={styles.secondaryAction} onClick={() => setModal("JOB")} disabled={configured && !serverReady}>
          <BriefcaseBusiness aria-hidden="true" />
          구인글 등록
        </button>
        <button type="button" className={styles.secondaryAction} onClick={() => void issueLessonCode()} disabled={configured && (!serverReady || issuingLessonCode)}>
          <KeyRound aria-hidden="true" />
          {issuingLessonCode ? "코드 발급 중" : "수업 확인 코드"}
        </button>
      </section>

      <p className={styles.notice} role="status">
        <ShieldCheck aria-hidden="true" />
        {notice}
      </p>

      {lessonCode ? <section className={styles.lessonCodePanel} aria-label="발급된 수업 확인 코드"><div><p className={styles.kicker}>1회용 수업 확인</p><strong>{lessonCode}</strong><span>{new Date(lessonCodeExpiresAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })}까지</span></div><button type="button" onClick={() => void navigator.clipboard.writeText(lessonCode)}><Copy aria-hidden="true" />코드 복사</button><p>수업을 받은 학부모·학생이 후기 접수 때 입력합니다. 코드 원문은 서버에 저장되지 않으며 한 번 사용하면 만료됩니다.</p></section> : null}

      {configured && (serverLoading || serverError) ? (
        <section className={styles.serverState} role={serverError ? "alert" : "status"} aria-live="polite">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>{serverError ? "계정 튜터 데이터를 불러오지 못했어요" : "계정 튜터 데이터를 불러오는 중이에요"}</strong>
            <p>{serverError ?? "등록된 튜터, 구인글, 후기와 요청을 확인하고 있어요. 이 동안 체험 데이터로 바꾸어 표시하지 않습니다."}</p>
            {serverError ? <button type="button" onClick={() => void loadStoredData()}>다시 시도</button> : null}
          </div>
        </section>
      ) : null}

      <section className={styles.tabs} aria-label="튜터 목록 유형">
        <button type="button" className={activeTab === "TUTORS" ? styles.activeTab : ""} onClick={() => setActiveTab("TUTORS")}>
          튜터찾기
        </button>
        <button type="button" className={activeTab === "JOBS" ? styles.activeTab : ""} onClick={() => setActiveTab("JOBS")}>
          구인글
        </button>
      </section>

      <section className={styles.filterPanel} aria-label="튜터 검색 필터">
        <div className={styles.filterTitle}>
          <Filter aria-hidden="true" />
          <strong>키워드, 지역, 과목</strong>
        </div>
        <label className={styles.keywordField}>
          <span>통합 검색</span>
          <div>
            <Search aria-hidden="true" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="이름, 과목, 소개, 동네 또는 구인 내용" type="search" />
            {keyword ? <button type="button" onClick={() => setKeyword("")} aria-label="검색어 지우기"><X aria-hidden="true" /></button> : null}
          </div>
        </label>
        <label>
          <span>지역</span>
          <select value={zone} onChange={(event) => setZone(event.target.value)}>
            {zoneOptions.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>과목</span>
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            {subjectOptions.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>정렬</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} disabled={activeTab === "JOBS"}>
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <option value={key} key={key}>
                {sortLabels[key]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {activeTab === "TUTORS" ? (
        <section className={styles.listSection} aria-labelledby="tutor-list-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>튜터찾기</p>
              <h2 id="tutor-list-title">{filteredProfiles.length}명의 동네 튜터</h2>
            </div>
            <span>광고비 미반영</span>
          </div>

          {configured && !serverReady ? null : filteredProfiles.length === 0 ? (
            <div className={styles.emptyState}>
              <Search aria-hidden="true" />
              <p>{keyword.trim() ? `“${keyword.trim()}”에 맞는 튜터가 없어요. 다른 검색어 또는 조건을 선택해 주세요.` : "조건에 맞는 튜터가 아직 없어요. 다른 동네나 과목을 선택해 주세요."}</p>
            </div>
          ) : (
            <div className={styles.cardList}>
              {filteredProfiles.map((profile, index) => {
                const rating = getTutorRating(profile.id, reviews);
                const verifiedCredentials = getTutorVerifiedCredentials(profile);
                const rank = getTutorRankBreakdown(profile, reviews);
                return (
                  <Link className={styles.tutorCard} href={`/tutors/${profile.id}`} key={profile.id}>
                    <span className={styles.rankBadge}>{index + 1}</span>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTop}>
                        <div>
                          <h3>{profile.displayName}</h3>
                          <p>{profile.zones.join(" · ")}</p>
                        </div>
                        {profile.verificationLevel === "TRIAL" ? (
                          <span className={styles.verified}>
                            <BadgeCheck aria-hidden="true" />
                            체험 인증 튜터
                          </span>
                        ) : profile.verified ? (
                          <span className={styles.verified}>
                            <BadgeCheck aria-hidden="true" />
                            EDU톡 인증
                          </span>
                        ) : (
                          <span className={styles.pending}>{(profile.credentials ?? []).length > 0 ? "인증 심사 대기" : "인증 미신청"}</span>
                        )}
                      </div>
                      <p className={styles.dataSource}>{profile.isSynthetic ? "체험용 합성 데이터" : "계정 등록 데이터"}</p>
                      <div className={styles.tagRow}>
                        {profile.subjects.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                        {profile.targetGrades.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                      <div className={styles.credentialRow} aria-label="검증된 인증 항목">
                        {verifiedCredentials.length > 0 ? verifiedCredentials.map((credential) => (
                          <span key={`${credential.type}-${credential.label}`}><BadgeCheck aria-hidden="true" />{credential.label}</span>
                        )) : <span className={styles.pendingCredential}>검증된 인증 항목 없음</span>}
                      </div>
                      <dl className={styles.metricRow}>
                        <div>
                          <dt>시간당</dt>
                          <dd>{formatPrice(profile.pricePerHour)}</dd>
                        </div>
                        <div>
                          <dt>응답률</dt>
                          <dd>{profile.responseRate}%</dd>
                        </div>
                        <div>
                          <dt>EDU톡 인증 후기</dt>
                          <dd>{rating.score ? `${rating.score.toFixed(1)}점 · ${rating.count}건` : "대기 중"}</dd>
                        </div>
                        <div>
                          <dt>인증 기여</dt>
                          <dd>+{rank.verification.toFixed(1)}점 / 5점</dd>
                        </div>
                      </dl>
                    </div>
                    <ChevronRight className={styles.cardArrow} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className={styles.listSection} aria-labelledby="job-list-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>구인글</p>
              <h2 id="job-list-title">{filteredJobs.length}개의 수업 요청</h2>
            </div>
            <span>{configured ? "계정 등록 데이터" : "체험 로컬 저장"}</span>
          </div>

          {configured && !serverReady ? null : filteredJobs.length === 0 ? (
            <div className={styles.emptyState}>
              <BriefcaseBusiness aria-hidden="true" />
              <p>{keyword.trim() ? `“${keyword.trim()}”에 맞는 구인글이 없어요. 다른 검색어 또는 조건을 선택해 주세요.` : "조건에 맞는 구인글이 아직 없어요. 첫 구인글을 등록해 보세요."}</p>
            </div>
          ) : (
            <div className={styles.jobList}>
              {filteredJobs.map((job) => (
                <article className={styles.jobCard} key={job.id}>
                  <div className={styles.jobTop}>
                    <span>{job.status === "OPEN" ? "모집중" : "마감"}</span>
                    <small>{new Date(job.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</small>
                  </div>
                  <h3>{job.title}</h3>
                  <dl>
                    <div>
                      <MapPin aria-hidden="true" />
                      <dt>동네</dt>
                      <dd>{job.zone}</dd>
                    </div>
                    <div>
                      <UsersRound aria-hidden="true" />
                      <dt>대상</dt>
                      <dd>
                        {job.studentGrade} · {job.subject}
                      </dd>
                    </div>
                    <div>
                      <Clock3 aria-hidden="true" />
                      <dt>일정</dt>
                      <dd>{job.schedule}</dd>
                    </div>
                  </dl>
                  <p>{job.detail}</p>
                  <strong>희망 {formatPrice(job.budgetPerHour)} / 시간</strong>
                  {configured && job.status === "OPEN" ? <div className={styles.applicationBox}>{applyingJobId === job.id ? <><label>지원 메시지<textarea value={applicationMessage} onChange={(event) => setApplicationMessage(event.target.value)} minLength={10} maxLength={1000} /></label><button type="button" onClick={() => applyToJob(job.id)}>지원 요청 접수</button><button type="button" onClick={() => setApplyingJobId(null)}>취소</button></> : <button type="button" onClick={() => setApplyingJobId(job.id)}>이 구인글에 지원</button>}</div> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {configured && serverReady ? (
        <section className={styles.requestInbox} aria-labelledby="request-inbox-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>계정 요청함</p>
              <h2 id="request-inbox-title">내 문의와 받은 요청</h2>
            </div>
            <span>계정 모드</span>
          </div>
          <p className={styles.inboxNote}>요청과 답변은 계정에 저장됩니다. 연락처 전달과 결제는 연결되지 않았습니다.</p>
          <div className={styles.requestGroups}>
            {(["SENT", "RECEIVED"] as const).map((direction) => {
              const group = requests.filter((item) => item.direction === direction);
              return (
                <section className={styles.requestGroup} key={direction} aria-label={direction === "SENT" ? "내 요청" : "받은 요청"}>
                  <h3>{direction === "SENT" ? "내 요청" : "받은 요청"}</h3>
                  {group.length === 0 ? <p className={styles.requestEmpty}>{direction === "SENT" ? "보낸 문의 또는 지원 요청이 없어요." : "처리할 문의 또는 지원 요청이 없어요."}</p> : (
                    <div className={styles.requestList}>
                      {group.map((item) => (
                        <article className={styles.requestCard} key={`${item.type}-${item.id}`}>
                          <div className={styles.requestMeta}><span>{item.type === "CONTACT" ? "튜터 문의" : "구인 지원"}</span><small>{requestTarget(item)}</small></div>
                          <p>{item.message}</p>
                          <dl><div><dt>상태</dt><dd>{item.status === "RECEIVED" ? "접수됨" : item.status === "IN_PROGRESS" ? "처리 중" : item.status === "ANSWERED" ? "답변 완료" : "종료"}</dd></div>{item.responded_at ? <div><dt>처리일</dt><dd>{new Date(item.responded_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</dd></div> : null}</dl>
                          {item.response_message ? <div className={styles.responseMessage}><strong>답변</strong><p>{item.response_message}</p></div> : null}
                          {direction === "RECEIVED" ? <div className={styles.responseForm}>
                            <label>처리 상태<select value={responseStatuses[item.id] ?? "ANSWERED"} onChange={(event) => setResponseStatuses((current) => ({ ...current, [item.id]: event.target.value as Exclude<RequestStatus, "RECEIVED"> }))}><option value="IN_PROGRESS">처리 중</option><option value="ANSWERED">답변 완료</option><option value="CLOSED">종료</option></select></label>
                            <label>처리 답변<textarea value={responseDrafts[item.id] ?? item.response_message ?? ""} onChange={(event) => setResponseDrafts((current) => ({ ...current, [item.id]: event.target.value }))} minLength={1} maxLength={1000} /></label>
                            <button type="button" onClick={() => updateReceivedRequest(item)}>상태와 답변 저장</button>
                          </div> : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      {modal ? (
        <section className={styles.modalBackdrop} aria-label={modal === "TUTOR" ? "튜터 등록 폼" : "구인글 등록 폼"}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.kicker}>{modal === "TUTOR" ? "튜터 등록" : "구인글 등록"}</p>
                <h2>{modal === "TUTOR" ? "튜터 활동 프로필" : "동네 수업 요청"}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setModal(null)} aria-label="등록 폼 닫기">
                <X aria-hidden="true" />
              </button>
            </div>

            {modal === "TUTOR" ? (
              <form className={styles.formGrid} onSubmit={submitTutorProfile}>
                <label>
                  <span>표시 이름</span>
                  <input value={tutorForm.displayName} onChange={(event) => setTutorForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="예: 민서 선생님" />
                </label>
                <label>
                  <span>과목</span>
                  <input value={tutorForm.subjects} onChange={(event) => setTutorForm((current) => ({ ...current, subjects: event.target.value }))} placeholder="수학, 과학" />
                </label>
                <label>
                  <span>학년</span>
                  <input value={tutorForm.targetGrades} onChange={(event) => setTutorForm((current) => ({ ...current, targetGrades: event.target.value }))} placeholder="중등, 고등" />
                </label>
                <label>
                  <span>활동 동네</span>
                  <input value={tutorForm.zones} onChange={(event) => setTutorForm((current) => ({ ...current, zones: event.target.value }))} placeholder="동탄2 청계동, 동탄2 영천동" />
                </label>
                <label>
                  <span>시간당 비용</span>
                  <input type="number" min="0" value={tutorForm.pricePerHour} onChange={(event) => setTutorForm((current) => ({ ...current, pricePerHour: event.target.value }))} />
                </label>
                <p className={styles.formNote}>응답률은 튜터가 직접 입력하지 않습니다. 계정 문의에 답변한 비율을 EDU톡이 자동 계산해 공개합니다.</p>
                <label className={styles.fullLabel}>
                  <span>소개</span>
                  <textarea value={tutorForm.introduction} onChange={(event) => setTutorForm((current) => ({ ...current, introduction: event.target.value }))} placeholder="수업 방식과 강점을 적어주세요." />
                </label>
                <fieldset className={styles.verificationFieldset}>
                  <legend>인증 신청 항목</legend>
                  <p>선택한 항목은 공개되지 않으며, 심사 완료 전까지 인증 배지가 표시되지 않습니다.</p>
                  <div className={styles.verificationChoices}>
                    {verificationFormItems.map((item) => (
                      <label className={styles.checkLabel} key={item.type}>
                        <input type="checkbox" checked={tutorForm[item.key]} onChange={(event) => setTutorForm((current) => ({ ...current, [item.key]: event.target.checked }))} />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className={styles.formNote}>{configured ? "튜터 활동 프로필은 학부모·학생·선생님 역할과 별도입니다. 프로필 저장 뒤 신뢰센터에서 비공개 증빙을 제출합니다." : "튜터 활동 프로필은 현재 역할을 바꾸지 않습니다. 실제 문서는 서버 연결 후 비공개 심사하며, 이 화면에서는 문서 원본을 받거나 저장하지 않습니다."}</p>
                <button type="submit" className={styles.submitButton}>
                  <Plus aria-hidden="true" />
                  튜터 프로필 저장
                </button>
              </form>
            ) : (
              <form className={styles.formGrid} onSubmit={submitTutorJob}>
                <label className={styles.fullLabel}>
                  <span>제목</span>
                  <input value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} placeholder="예: 중2 수학 개념 수업 구해요" />
                </label>
                <label>
                  <span>학생 학년</span>
                  <input value={jobForm.studentGrade} onChange={(event) => setJobForm((current) => ({ ...current, studentGrade: event.target.value }))} placeholder="중학교 2학년" />
                </label>
                <label>
                  <span>과목</span>
                  <input value={jobForm.subject} onChange={(event) => setJobForm((current) => ({ ...current, subject: event.target.value }))} placeholder="수학" />
                </label>
                <label>
                  <span>동네</span>
                  <input value={jobForm.zone} onChange={(event) => setJobForm((current) => ({ ...current, zone: event.target.value }))} placeholder="동탄2 산척동" />
                </label>
                <label>
                  <span>희망 비용</span>
                  <input type="number" min="0" value={jobForm.budgetPerHour} onChange={(event) => setJobForm((current) => ({ ...current, budgetPerHour: event.target.value }))} />
                </label>
                <label className={styles.fullLabel}>
                  <span>일정</span>
                  <input value={jobForm.schedule} onChange={(event) => setJobForm((current) => ({ ...current, schedule: event.target.value }))} placeholder="화·목 저녁 7시 이후" />
                </label>
                <label className={styles.fullLabel}>
                  <span>상세 요청</span>
                  <textarea value={jobForm.detail} onChange={(event) => setJobForm((current) => ({ ...current, detail: event.target.value }))} placeholder="원하는 수업 방식과 아이 상황을 적어주세요." />
                </label>
                <p className={styles.formNote}>{configured ? "구인글은 로그인 계정에 저장되고 공개 목록에 표시됩니다." : "구인글은 서버에 올라가지 않고 이 기기에 체험용으로 저장됩니다."}</p>
                <button type="submit" className={styles.submitButton}>
                  <MessageCircle aria-hidden="true" />
                  구인글 저장
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}

      <aside className={styles.localNote}>
        <CheckCircle2 aria-hidden="true" />
        <p>{configured ? "계정 데이터만 표시합니다. 결제와 연락처 전달은 아직 연결되지 않았습니다." : "목록의 로컬 등록 항목은 브라우저 저장소에만 남습니다. 결제, 광고, 서버 매칭은 아직 연결되지 않았습니다."}</p>
      </aside>
    </main>
  );
}
