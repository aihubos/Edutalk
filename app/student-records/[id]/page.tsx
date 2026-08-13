"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  FilePlus2,
  GraduationCap,
  LockKeyhole,
  NotebookPen,
  PlusCircle,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { ScoreChart, type ScoreChartPoint } from "@/components/score-chart";
import { useApp } from "@/lib/app-context";
import { getInstitution } from "@/lib/demo-data";
import {
  assessments,
  canAccessStudent,
  growthRecords,
  students,
  subjectScores,
} from "@/lib/student-data";
import { roleLabels } from "@/lib/labels";
import type { Assessment, AssessmentKind, GrowthCategory, GrowthRecord, SubjectScore } from "@/lib/types";
import type { Student } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import styles from "./student-detail.module.css";

const assessmentKinds: AssessmentKind[] = ["SCHOOL", "MOCK", "CSAT"];
const growthCategories: GrowthCategory[] = [
  "LEARNING",
  "PARTICIPATION",
  "SOCIAL",
  "SELF_MANAGEMENT",
  "CAREER",
];

const assessmentKindLabels: Record<AssessmentKind, string> = {
  SCHOOL: "내신",
  MOCK: "모의고사",
  CSAT: "수능형",
};

const growthCategoryLabels: Record<GrowthCategory, string> = {
  LEARNING: "학습",
  PARTICIPATION: "참여",
  SOCIAL: "관계",
  SELF_MANAGEMENT: "자기관리",
  CAREER: "진로",
};

interface ExamSummary {
  assessment: Assessment;
  scores: SubjectScore[];
  total: number;
  maxTotal: number;
  average: number;
  gradeBand: number;
}

interface ServerStudentRecords {
  students: Student[];
  assessments: Assessment[];
  scores: SubjectScore[];
  growthRecords: GrowthRecord[];
}

const toDateInputValue = () => new Date().toISOString().slice(0, 10);

const getSingleParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const getGradeFromAverage = (average: number) => {
  if (average >= 90) return 1;
  if (average >= 80) return 2;
  if (average >= 70) return 3;
  if (average >= 60) return 4;
  return 5;
};

const getSummary = (assessment: Assessment, scores: SubjectScore[]): ExamSummary => {
  const total = scores.reduce((sum, score) => sum + score.score, 0);
  const maxTotal = scores.reduce((sum, score) => sum + score.maxScore, 0) || assessment.maxTotal;
  const average = scores.length === 0 ? 0 : total / scores.length;
  const explicitBands = scores
    .map((score) => score.gradeBand)
    .filter((band): band is number => typeof band === "number");
  const gradeBand =
    explicitBands.length > 0
      ? Math.round(explicitBands.reduce((sum, band) => sum + band, 0) / explicitBands.length)
      : getGradeFromAverage(average);

  return {
    assessment,
    scores,
    total,
    maxTotal,
    average,
    gradeBand,
  };
};

const formatScore = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function AccessState() {
  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/student-records">
        <ArrowLeft size={18} aria-hidden="true" />
        학생 목록으로
      </Link>
      <section className={styles.accessState} aria-labelledby="access-title">
        <LockKeyhole size={30} aria-hidden="true" />
        <div>
          <p className={styles.kicker}>접근 제한</p>
          <h1 id="access-title">이 학생 기록을 볼 수 없어요</h1>
          <p>현재 선택한 역할에서 접근 가능한 학생 목록으로 돌아가 주세요.</p>
        </div>
        <Link href="/student-records">접근 가능한 학생 보기</Link>
      </section>
    </main>
  );
}

function LevelBar({ level }: { level: number }) {
  const normalizedLevel = Math.max(0, Math.min(5, level));
  const style = {
    "--level-ratio": String((normalizedLevel / 5) * 100) + "%",
  } as CSSProperties;

  return (
    <span className={styles.levelTrack} aria-label={"5단계 중 " + normalizedLevel + "단계"}>
      <span className={styles.levelFill} style={style} />
    </span>
  );
}

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = getSingleParam(params?.id);
  const {
    role,
    hydrated,
  customScores,
  customGrowthRecords,
  customStudents,
  customAssessments,
  addAssessment,
    addSubjectScore,
    addGrowthRecord,
  } = useApp();
  const [selectedKind, setSelectedKind] = useState<AssessmentKind>("SCHOOL");
  const [scoreNotice, setScoreNotice] = useState("");
  const [growthNotice, setGrowthNotice] = useState("");
  const [scoreDateSeed, setScoreDateSeed] = useState(0);
  const [growthDateSeed, setGrowthDateSeed] = useState(0);
  const [serverRecords, setServerRecords] = useState<ServerStudentRecords | null>(null);
  const [serverError, setServerError] = useState("");
  const [linkInvite, setLinkInvite] = useState<{ code: string; expiresAt: string; role: "PARENT" | "STUDENT" } | null>(null);
  const [linkRole, setLinkRole] = useState<"PARENT" | "STUDENT">("PARENT");
  const [inviteNotice, setInviteNotice] = useState("");
  const serverMode = isSupabaseConfigured();
  const refreshServerRecords = async () => {
    const response = await fetch("/api/students");
    const result = await response.json() as ServerStudentRecords & { error?: string; mode?: string };
    if (!response.ok || result.mode === "demo") throw new Error(result.error ?? "계정 학습 기록을 불러오지 못했어요.");
    setServerRecords({ students: result.students ?? [], assessments: result.assessments ?? [], scores: result.scores ?? [], growthRecords: result.growthRecords ?? [] });
  };

  useEffect(() => {
    if (!hydrated || !serverMode) return;
    const frame = window.requestAnimationFrame(() => {
      void refreshServerRecords().catch((error) => setServerError(error instanceof Error ? error.message : "계정 학습 기록을 불러오지 못했어요."));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, serverMode]);

  const student = (serverMode ? serverRecords?.students ?? [] : [...students, ...customStudents]).find((item) => item.id === studentId);
  const hasAccess = serverMode ? Boolean(student) : student
    ? canAccessStudent(role, studentId)
      || (role === "TEACHER" && student.teacherUserIds.includes("demo-teacher-1"))
      || (role === "PARENT" && student.parentUserIds.includes("demo-parent-1"))
    : false;

  const studentAssessments = (serverMode ? serverRecords?.assessments ?? [] : [...assessments, ...customAssessments])
    .filter((assessment) => assessment.studentId === studentId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const selectedAssessments = studentAssessments.filter(
    (assessment) => assessment.kind === selectedKind,
  );
  const allScores = (serverMode ? serverRecords?.scores ?? [] : [...subjectScores, ...customScores])
    .filter((score) => score.studentId === studentId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const allGrowthRecords = (serverMode ? serverRecords?.growthRecords ?? [] : [...growthRecords, ...customGrowthRecords])
    .filter((record) => record.studentId === studentId)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const summaries = selectedAssessments.map((assessment) =>
    getSummary(
      assessment,
      allScores.filter((score) => score.assessmentId === assessment.id),
    ),
  );
  const averageTrendPoints: ScoreChartPoint[] = summaries
    .filter((summary) => summary.scores.length > 0)
    .map((summary) => ({
      id: summary.assessment.id,
      label: summary.assessment.title.replace("1학기 ", ""),
      value: Number(summary.average.toFixed(1)),
      helper: summary.assessment.date,
    }));
  const totalTrendPoints: ScoreChartPoint[] = summaries
    .filter((summary) => summary.scores.length > 0)
    .map((summary) => ({
      id: summary.assessment.id,
      label: summary.assessment.title.replace("1학기 ", ""),
      value: summary.total,
      helper: summary.maxTotal + "점 만점",
    }));
  const latestSummary = summaries.filter((summary) => summary.scores.length > 0).at(-1);
  const institution = student ? getInstitution(student.institutionId) : undefined;
  const isTeacher = role === "TEACHER";
  const defaultAssessmentId = selectedAssessments[0]?.id ?? "";
  const scoreFormKey = "score-" + selectedKind + "-" + scoreDateSeed;
  const assessmentFormKey = "assessment-" + selectedKind + "-" + scoreDateSeed;
  const growthFormKey = "growth-" + growthDateSeed;

  if (!hydrated) {
    return (
      <main className={styles.page} aria-busy="true">
        <div className={styles.skeletonHero} />
        <div className={styles.skeletonCard} />
      </main>
    );
  }

  if (serverError) return <AccessState />;
  if (!student || !hasAccess) return <AccessState />;

  const handleScoreSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const assessmentId = String(formData.get("assessmentId") ?? "");
    const subject = String(formData.get("subject") ?? "").trim();
    const score = Number(formData.get("score"));
    const maxScore = Number(formData.get("maxScore"));
    const gradeBandValue = String(formData.get("gradeBand") ?? "");

    if (!assessmentId || !subject || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
      setScoreNotice("시험, 과목, 점수, 만점을 확인해 주세요.");
      return;
    }

    const newScore: SubjectScore = {
      id: "custom-score-" + student.id + "-" + Date.now(),
      studentId: student.id,
      assessmentId,
      subject,
      score,
      maxScore,
      gradeBand: gradeBandValue ? Number(gradeBandValue) : undefined,
      recordedAt: toDateInputValue(),
      isSynthetic: true,
    };

    if (serverMode) {
      void fetch(`/api/students/${student.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score", assessmentId, subject, score, maxScore, gradeBand: newScore.gradeBand }) })
        .then(async (response) => { const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error); await refreshServerRecords(); setScoreNotice("점수를 계정에 저장했어요."); setScoreDateSeed((value) => value + 1); })
        .catch((error) => setScoreNotice(error instanceof Error ? error.message : "점수를 저장하지 못했어요."));
      return;
    }
    addSubjectScore(newScore); setScoreNotice("점수를 저장했어요."); setScoreDateSeed((value) => value + 1);
  };

  const handleAssessmentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    const term = String(formData.get("term") ?? "").trim();
    const maxTotal = Number(formData.get("maxTotal"));
    if (!title || !date || !term || !Number.isFinite(maxTotal) || maxTotal <= 0) {
      setScoreNotice("평가 종류, 제목, 날짜, 학기, 만점을 확인해 주세요.");
      return;
    }
    if (serverMode) {
      void fetch(`/api/students/${student.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assessment", kind: selectedKind, title, date, term, maxTotal }) })
        .then(async (response) => { const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error); await refreshServerRecords(); setScoreNotice("평가를 계정에 등록했어요. 바로 아래에서 과목 점수를 입력할 수 있어요."); setScoreDateSeed((value) => value + 1); })
        .catch((error) => setScoreNotice(error instanceof Error ? error.message : "평가를 등록하지 못했어요."));
      return;
    }
    addAssessment({ id: `custom-assessment-${student.id}-${Date.now()}`, studentId: student.id, kind: selectedKind, title, date, term, maxTotal, isSynthetic: true }); setScoreNotice("평가를 등록했어요. 바로 아래에서 과목 점수를 입력할 수 있어요."); setScoreDateSeed((value) => value + 1);
  };

  const handleGrowthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const category = String(formData.get("category") ?? "") as GrowthCategory;
    const observedAt = String(formData.get("observedAt") ?? "");
    const level = Number(formData.get("level"));
    const title = String(formData.get("title") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!growthCategories.includes(category) || !observedAt || !level || !title || !note) {
      setGrowthNotice("영역, 날짜, 수준, 관찰 내용을 확인해 주세요.");
      return;
    }

    const newRecord: GrowthRecord = {
      id: "custom-growth-" + student.id + "-" + Date.now(),
      studentId: student.id,
      category,
      observedAt,
      level,
      title,
      note,
      authorRole: "TEACHER",
      isSynthetic: true,
    };

    if (serverMode) {
      void fetch(`/api/students/${student.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "growth", category, observedAt, level, title, note }) })
        .then(async (response) => { const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error); await refreshServerRecords(); setGrowthNotice("성장기록을 계정에 저장했어요."); setGrowthDateSeed((value) => value + 1); })
        .catch((error) => setGrowthNotice(error instanceof Error ? error.message : "성장기록을 저장하지 못했어요."));
      return;
    }
    addGrowthRecord(newRecord); setGrowthNotice("성장기록을 저장했어요."); setGrowthDateSeed((value) => value + 1);
  };

  const createLinkInvite = () => {
    setInviteNotice("");
    void fetch("/api/student-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", studentId: student.id, linkRole }),
    }).then(async (response) => {
      const result = await response.json() as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.code || !result.expiresAt) throw new Error(result.error);
      setLinkInvite({ code: result.code, expiresAt: result.expiresAt, role: linkRole });
      setInviteNotice(`${linkRole === "PARENT" ? "보호자용" : "만 14세 이상 학생 본인용"} 연결 코드를 만들었어요. 같은 대상 역할의 이전 코드는 사용할 수 없습니다.`);
    }).catch((error) => setInviteNotice(error instanceof Error ? error.message : "연결 코드를 만들지 못했어요."));
  };

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/student-records">
        <ArrowLeft size={18} aria-hidden="true" />
        학생 목록으로
      </Link>

      <section className={styles.hero} aria-labelledby="student-title">
        <span className={styles.demoBadge}>{serverMode ? "계정 데이터" : "체험용 데이터"}</span>
        <div className={styles.heroTitle}>
          <p>{student.gradeLevel} · {student.className}</p>
          <h1 id="student-title">{student.alias} 성적관리</h1>
          <span>
            <GraduationCap size={15} aria-hidden="true" />
            {student.institutionName ?? institution?.name ?? "기관 정보 대기"}
          </span>
        </div>
      </section>

      {isTeacher && serverMode ? <section className={styles.section} aria-labelledby="student-link-title"><div className={styles.sectionHeader}><div><p className={styles.kicker}>계정 연결</p><h2 id="student-link-title">대상별 30분·1회용 연결 코드</h2></div></div><p className={styles.emptyText}>코드만 대상에게 전달하세요. 학생 실명이나 개인정보는 코드에 포함되지 않습니다.</p><div className={styles.linkRoleList} role="group" aria-label="연결 코드 대상 선택"><button type="button" data-active={linkRole === "PARENT"} onClick={() => setLinkRole("PARENT")}>보호자용<span>보호자 계정을 연결합니다.</span></button><button type="button" data-active={linkRole === "STUDENT"} onClick={() => setLinkRole("STUDENT")}>만 14세 이상 학생 본인용<span>학생 본인 계정만 연결할 수 있습니다.</span></button></div>{linkInvite ? <div className={styles.inviteCode}><strong>{linkInvite.code}</strong><span>{linkInvite.role === "PARENT" ? "보호자용" : "만 14세 이상 학생 본인용"} · {new Date(linkInvite.expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}까지 · 1회 사용</span><button type="button" onClick={() => void navigator.clipboard.writeText(linkInvite.code).then(() => setInviteNotice("연결 코드를 복사했어요."))}>코드 복사</button></div> : null}<button type="button" className={styles.inviteButton} onClick={createLinkInvite}>{linkInvite?.role === linkRole ? "새 코드 다시 만들기" : `${linkRole === "PARENT" ? "보호자용" : "학생 본인용"} 연결 코드 만들기`}</button>{inviteNotice ? <p className={styles.formNotice} role="status">{inviteNotice}</p> : null}</section> : null}

      <section className={styles.summaryGrid} aria-label={student.alias + " 최신 성적 요약"}>
        <div className={styles.summaryCard}>
          <BarChart3 size={20} aria-hidden="true" />
          <span>선택 평가</span>
          <strong>{assessmentKindLabels[selectedKind]}</strong>
        </div>
        <div className={styles.summaryCard}>
          <BookOpenCheck size={20} aria-hidden="true" />
          <span>최근 평균</span>
          <strong>{latestSummary ? formatScore(latestSummary.average) + "점" : "기록 대기"}</strong>
        </div>
        <div className={styles.summaryCard}>
          <TrendingUp size={20} aria-hidden="true" />
          <span>최근 총점</span>
          <strong>{latestSummary ? latestSummary.total + "/" + latestSummary.maxTotal : "기록 대기"}</strong>
        </div>
        <div className={styles.summaryCard}>
          <UserRound size={20} aria-hidden="true" />
          <span>최근 등급</span>
          <strong>{latestSummary ? latestSummary.gradeBand + "등급" : "기록 대기"}</strong>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="assessment-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>평가 종류</p>
            <h2 id="assessment-title">시험별 성적</h2>
          </div>
        </div>

        <div className={styles.tabList} role="tablist" aria-label="평가 종류 선택">
          {assessmentKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={selectedKind === kind}
              data-active={selectedKind === kind}
              onClick={() => setSelectedKind(kind)}
            >
              {assessmentKindLabels[kind]}
            </button>
          ))}
        </div>

        <div className={styles.chartGrid}>
          <ScoreChart
            title="평균 추이"
            description="선택한 평가 종류의 시험별 평균 점수입니다."
            points={averageTrendPoints}
            valueLabel="평균"
          />
          <ScoreChart
            title="총점 추이"
            description="시험별 과목 점수를 더한 총점입니다."
            points={totalTrendPoints}
            maxValue={Math.max(100, ...totalTrendPoints.map((point) => point.value))}
            valueLabel="총점"
          />
        </div>

        {summaries.length > 0 ? (
          <div className={styles.examList}>
            {summaries.map((summary) => (
              <article className={styles.examCard} key={summary.assessment.id}>
                <div className={styles.examHeader}>
                  <div>
                    <p>{summary.assessment.term}</p>
                    <h3>{summary.assessment.title}</h3>
                    <time dateTime={summary.assessment.date}>{summary.assessment.date}</time>
                  </div>
                  <strong>{summary.scores.length > 0 ? summary.gradeBand + "등급" : "점수 대기"}</strong>
                </div>

                <dl className={styles.examMetrics}>
                  <div>
                    <dt>총점</dt>
                    <dd>{summary.scores.length > 0 ? summary.total + "/" + summary.maxTotal : "대기"}</dd>
                  </div>
                  <div>
                    <dt>평균</dt>
                    <dd>{summary.scores.length > 0 ? formatScore(summary.average) + "점" : "대기"}</dd>
                  </div>
                  <div>
                    <dt>과목</dt>
                    <dd>{summary.scores.length}개</dd>
                  </div>
                </dl>

                {summary.scores.length > 0 ? (
                  <div className={styles.subjectTableWrap}>
                    <table className={styles.subjectTable}>
                      <caption>{summary.assessment.title} 과목별 점수</caption>
                      <thead>
                        <tr>
                          <th scope="col">과목</th>
                          <th scope="col">점수</th>
                          <th scope="col">등급</th>
                          <th scope="col">기록일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.scores.map((score) => (
                          <tr key={score.id}>
                            <th scope="row">{score.subject}</th>
                            <td>{score.score}/{score.maxScore}</td>
                            <td>{score.gradeBand ? score.gradeBand + "등급" : "-"}</td>
                            <td>{score.recordedAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className={styles.emptyText}>아직 입력된 과목 점수가 없어요.</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>선택한 평가 종류의 시험 기록이 아직 없어요.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="growth-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>성장발달</p>
            <h2 id="growth-title">영역별 관찰 기록</h2>
          </div>
        </div>

        <div className={styles.growthGrid}>
          {growthCategories.map((category) => {
            const categoryRecords = allGrowthRecords.filter((record) => record.category === category);
            const latestRecord = categoryRecords[0];
            const level = latestRecord?.level ?? 0;

            return (
              <article className={styles.growthCard} key={category}>
                <div className={styles.growthHeader}>
                  <strong>{growthCategoryLabels[category]}</strong>
                  <span>{level > 0 ? level + "/5" : "기록 대기"}</span>
                </div>
                <LevelBar level={level} />
                {latestRecord ? (
                  <p>
                    <time dateTime={latestRecord.observedAt}>{latestRecord.observedAt}</time>
                    <span>{latestRecord.title}</span>
                  </p>
                ) : (
                  <p>아직 관찰 기록이 없어요.</p>
                )}
              </article>
            );
          })}
        </div>

        {allGrowthRecords.length > 0 ? (
          <div className={styles.recordList}>
            {allGrowthRecords.map((record) => (
              <article className={styles.recordCard} key={record.id}>
                <div>
                  <span>{growthCategoryLabels[record.category]} · {record.level}/5</span>
                  <h3>{record.title}</h3>
                  <time dateTime={record.observedAt}>{record.observedAt}</time>
                </div>
                <p>{record.note}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>성장발달 기록이 아직 없어요.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="write-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>입력 권한</p>
            <h2 id="write-title">점수와 성장기록 추가</h2>
          </div>
        </div>

        {isTeacher ? (
          <div className={styles.formGrid}>
            <form className={styles.formCard} onSubmit={handleAssessmentSubmit} key={assessmentFormKey}>
              <div className={styles.formTitle}>
                <FilePlus2 size={19} aria-hidden="true" />
                <h3>평가 등록</h3>
              </div>
              <label>
                <span>평가 종류</span>
                <select value={selectedKind} onChange={(event) => setSelectedKind(event.target.value as AssessmentKind)}>
                  {assessmentKinds.map((kind) => <option key={kind} value={kind}>{assessmentKindLabels[kind]}</option>)}
                </select>
              </label>
              <label><span>평가 제목</span><input name="title" placeholder="예: 2학기 중간 진단" /></label>
              <div className={styles.inputRow}>
                <label><span>평가 날짜</span><input name="date" type="date" defaultValue={toDateInputValue()} /></label>
                <label><span>학기</span><input name="term" placeholder="예: 2026 2학기" /></label>
              </div>
              <label><span>총 만점</span><input name="maxTotal" type="number" min="1" step="1" defaultValue="100" /></label>
              <button type="submit"><PlusCircle size={17} aria-hidden="true" />평가 등록</button>
            </form>
            <form className={styles.formCard} onSubmit={handleScoreSubmit} key={scoreFormKey}>
              <div className={styles.formTitle}>
                <FilePlus2 size={19} aria-hidden="true" />
                <h3>점수 추가</h3>
              </div>

              <label>
                <span>시험</span>
                <select name="assessmentId" defaultValue={defaultAssessmentId}>
                  {selectedAssessments.map((assessment) => (
                    <option value={assessment.id} key={assessment.id}>
                      {assessment.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>과목</span>
                <input name="subject" type="text" placeholder="예: 수학" />
              </label>

              <div className={styles.inputRow}>
                <label>
                  <span>점수</span>
                  <input name="score" type="number" min="0" max="100" step="1" placeholder="92" />
                </label>
                <label>
                  <span>만점</span>
                  <input name="maxScore" type="number" min="1" max="100" step="1" defaultValue="100" />
                </label>
              </div>

              <label>
                <span>등급</span>
                <select name="gradeBand" defaultValue="">
                  <option value="">등급 없음</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((band) => (
                    <option value={band} key={band}>
                      {band}등급
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" disabled={selectedAssessments.length === 0}>
                <PlusCircle size={17} aria-hidden="true" />
                점수 저장
              </button>
              {scoreNotice ? <p role="status">{scoreNotice}</p> : null}
            </form>

            <form className={styles.formCard} onSubmit={handleGrowthSubmit} key={growthFormKey}>
              <div className={styles.formTitle}>
                <NotebookPen size={19} aria-hidden="true" />
                <h3>성장기록 추가</h3>
              </div>

              <label>
                <span>영역</span>
                <select name="category" defaultValue="LEARNING">
                  {growthCategories.map((category) => (
                    <option value={category} key={category}>
                      {growthCategoryLabels[category]}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.inputRow}>
                <label>
                  <span>날짜</span>
                  <input name="observedAt" type="date" defaultValue={toDateInputValue()} />
                </label>
                <label>
                  <span>수준</span>
                  <select name="level" defaultValue="3">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option value={level} key={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span>제목</span>
                <input name="title" type="text" placeholder="예: 오답 정리 습관 향상" />
              </label>

              <label>
                <span>관찰 기록</span>
                <textarea name="note" rows={4} placeholder="수업 중 확인한 변화와 다음 지도 방향을 적어주세요." />
              </label>

              <button type="submit">
                <PlusCircle size={17} aria-hidden="true" />
                성장기록 저장
              </button>
              {growthNotice ? <p role="status">{growthNotice}</p> : null}
            </form>
          </div>
        ) : (
          <div className={styles.readOnlyNotice}>
            <CalendarDays size={20} aria-hidden="true" />
            <p>
              {roleLabels[role]} 모드에서는 기록을 읽기만 할 수 있어요. 점수와 성장기록 추가는 선생님 역할에서 가능합니다.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
