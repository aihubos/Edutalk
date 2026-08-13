"use client";

import Link from "next/link";
import { AlertCircle, BookMarked, Check, ExternalLink, FilePenLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { assessments, demoUsers, getAccessibleStudents, growthRecords, subjectScores } from "@/lib/student-data";
import type { SchoolRecordDraft, Student } from "@/lib/types";
import styles from "./school-record.module.css";

const sections = [
  { value: "SUBJECT_DETAIL", label: "교과 세부능력 및 특기사항" },
  { value: "AUTONOMY", label: "자율·자치활동" },
  { value: "CLUB", label: "동아리활동" },
  { value: "CAREER", label: "진로활동" },
  { value: "BEHAVIOR", label: "행동특성 및 종합의견" },
] as const;

type Section = (typeof sections)[number]["value"];

interface DraftResult {
  draftText: string;
  reviewPoints: string[];
}

export default function SchoolRecordPage() {
  const {
    role,
    setRole,
    aiUsage,
    consumeAiCredit,
    applyServerAiUsage,
    addSchoolRecordDraft,
    schoolRecordDrafts,
    customScores,
    customGrowthRecords,
    customStudents,
    customAssessments,
    accountAuthStatus,
  } = useApp();
  const configured = isSupabaseConfigured();
  const [serverDrafts, setServerDrafts] = useState<SchoolRecordDraft[]>([]);
  const [serverStudents, setServerStudents] = useState<Student[]>([]);
  const [serverAssessments, setServerAssessments] = useState<Array<Record<string, unknown>>>([]);
  const [serverScores, setServerScores] = useState<Array<Record<string, unknown>>>([]);
  const [serverGrowthRecords, setServerGrowthRecords] = useState<Array<Record<string, unknown>>>([]);
  const availableStudents = useMemo(
    () => [...getAccessibleStudents("TEACHER"), ...customStudents.filter((student) => student.teacherUserIds.includes(demoUsers.TEACHER))],
    [customStudents],
  );
  const [studentId, setStudentId] = useState(availableStudents[0]?.id ?? "");
  const [section, setSection] = useState<Section>("SUBJECT_DETAIL");
  const [evidence, setEvidence] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [draftText, setDraftText] = useState("");
  const [generationMode, setGenerationMode] = useState<"openai" | "demo-template">("demo-template");
  const [generationNotice, setGenerationNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(configured);
  const [serverError, setServerError] = useState("");
  const [message, setMessage] = useState("");

  const visibleStudents = configured ? serverStudents : availableStudents;
  const student = visibleStudents.find((item) => item.id === studentId);
  const remaining = Math.max(0, aiUsage.freeLimit - aiUsage.used);

  const loadServerDrafts = useCallback(async () => {
    if (!configured) return;
    setServerLoading(true);
    setServerError("");
    try {
    const response = await fetch("/api/ai/drafts");
    const payload = await response.json() as { mode?: string; drafts?: Array<Record<string, unknown>>; students?: Array<{ students?: Record<string, unknown> }>; assessments?: Array<Record<string, unknown>>; scores?: Array<Record<string, unknown>>; growthRecords?: Array<Record<string, unknown>>; error?: string };
    if (!response.ok || payload.mode !== "supabase") throw new Error(payload.error ?? "계정 학생 기록을 불러오지 못했어요.");
    setServerDrafts((payload.drafts ?? []).filter((item) => item.kind === "SCHOOL_RECORD").map((item) => {
      const content = item.content as Partial<DraftResult>;
      return { id: String(item.id), studentId: String(item.student_id), teacherUserId: "server", section: String(item.section) as Section, evidence: String(item.evidence), draftText: String(content.draftText ?? ""), teacherConfirmed: Boolean(item.teacher_confirmed), generationMode: item.generation_mode === "openai" ? "openai" : "demo-template", createdAt: String(item.created_at) };
    }));
    const students: Student[] = (payload.students ?? []).map((link) => link.students).filter((student): student is Record<string, unknown> => Boolean(student)).map((student) => ({ id: String(student.id), alias: String(student.alias), gradeLevel: String(student.grade_level), className: String(student.class_name ?? ""), institutionId: String(student.institution_id ?? ""), parentUserIds: [], teacherUserIds: [], isSynthetic: false }));
    setServerStudents(students);
    setServerAssessments(payload.assessments ?? []);
    setServerScores(payload.scores ?? []);
    setServerGrowthRecords(payload.growthRecords ?? []);
    setStudentId((current) => current && students.some((item) => item.id === current) ? current : (students[0]?.id ?? ""));
    } catch (error) {
      setServerStudents([]);
      setServerDrafts([]);
      setServerAssessments([]);
      setServerScores([]);
      setServerGrowthRecords([]);
      setServerError(error instanceof Error ? error.message : "계정 학생 기록을 불러오지 못했어요.");
    } finally {
      setServerLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const frame = window.requestAnimationFrame(() => { void loadServerDrafts(); });
    return () => window.cancelAnimationFrame(frame);
  }, [configured, loadServerDrafts]);

  const scoreContext = useMemo(() => {
    if (configured) {
      return serverScores.filter((score) => String(score.student_id) === studentId).slice(-12).map((score) => {
        const assessment = serverAssessments.find((item) => String(item.id) === String(score.assessment_id));
        return `${assessment?.title ?? "평가"} ${String(score.subject ?? "")} ${String(score.score ?? "")}/${String(score.max_score ?? "")}`;
      }).join(", ");
    }
    const allScores = [...subjectScores, ...customScores].filter((score) => score.studentId === studentId);
    return allScores
      .slice(-12)
      .map((score) => {
        const assessment = [...assessments, ...customAssessments].find((item) => item.id === score.assessmentId);
        return `${assessment?.title ?? "평가"} ${score.subject} ${score.score}/${score.maxScore}`;
      })
      .join(", ");
  }, [configured, studentId, customScores, customAssessments, serverAssessments, serverScores]);

  const growthContext = useMemo(
    () => {
      if (configured) return serverGrowthRecords.filter((record) => String(record.student_id) === studentId).slice(-6).map((record) => `${String(record.observed_on ?? "")} ${String(record.title ?? "")}: ${String(record.note ?? "")}`).join("\n");
      return [...growthRecords, ...customGrowthRecords]
        .filter((record) => record.studentId === studentId)
        .slice(-6)
        .map((record) => `${record.observedAt} ${record.title}: ${record.note}`)
        .join("\n");
    },
    [configured, studentId, customGrowthRecords, serverGrowthRecords],
  );

  if (role !== "TEACHER") {
    return (
      <div className="page-container">
        <section className={styles.guard}>
          <BookMarked size={34} aria-hidden />
          <h1>선생님 전용 기능이에요</h1>
          <p>담당 학생의 실제 관찰 근거로 생기부 문장 초안을 만들 수 있어요.</p>
          {configured && accountAuthStatus === "authenticated" ? <Link href="/onboarding?review=policies">선생님 역할 추가하기</Link> : <button onClick={() => setRole("TEACHER")}>선생님 모드로 전환</button>}
        </section>
      </div>
    );
  }

  async function generate() {
    if (!student || evidence.trim().length < 10) return;
    if (aiUsage.plan === "FREE" && remaining === 0) {
      setMessage("무료 10회를 모두 사용했어요. 무제한 플랜을 확인해 주세요.");
      return;
    }
    setLoading(true);
    setMessage("");
    setGenerationNotice("");
    try {
      const response = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "school-record",
          studentId: student.id,
          studentAlias: student.alias,
          gradeLevel: student.gradeLevel,
          section,
          evidence,
          scoreContext,
          growthContext,
        }),
      });
      const payload = (await response.json()) as { data?: DraftResult; generationMode?: "openai" | "demo-template"; usageMode?: "server" | "demo"; remaining?: number | null; plan?: "FREE" | "UNLIMITED"; notice?: string; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "generation failed");
      if (payload.usageMode !== "server") {
        const credit = consumeAiCredit();
        if (!credit.ok) { setMessage("사용 가능한 AI 횟수가 없어요."); return; }
      } else applyServerAiUsage(payload.remaining ?? null, payload.plan);
      setResult(payload.data);
      setDraftText(payload.data.draftText);
      setGenerationMode(payload.generationMode || "demo-template");
      setGenerationNotice(payload.notice ?? "");
      setConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error && error.message !== "generation failed" ? error.message : "초안을 만들지 못했어요. 입력 내용은 그대로 보존되어 있어요.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!student || !result || !confirmed || draftText.trim().length === 0) return;
    const draft: SchoolRecordDraft = {
      id: `school-record-${Date.now()}`,
      studentId: student.id,
      teacherUserId: demoUsers.TEACHER,
      section,
      evidence,
      draftText,
      teacherConfirmed: true,
      generationMode,
      createdAt: new Date().toISOString(),
    };
    if (configured) {
      const response = await fetch("/api/ai/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "SCHOOL_RECORD", studentId: draft.studentId, section: draft.section, evidence: draft.evidence, content: { draftText: draft.draftText, reviewPoints: result.reviewPoints }, generationMode, teacherConfirmed: true }) });
      if (!response.ok) { setMessage("로그인한 선생님의 연결 학생 초안만 서버에 저장할 수 있어요."); return; }
      await loadServerDrafts();
      setMessage("교사가 확인한 초안을 계정에 저장했어요. 공식 기록 전 기재요령을 다시 확인해 주세요.");
    } else {
      addSchoolRecordDraft(draft);
      setMessage("교사가 확인한 초안으로 저장했어요. 공식 기록 전 기재요령을 다시 확인해 주세요.");
    }
    setEvidence("");
    setResult(null);
    setDraftText("");
    setGenerationNotice("");
    setConfirmed(false);
  }

  return (
    <div className="page-container">
      <header className={styles.header}>
        <div>
          <span>선생님 업무 도구</span>
          <h1>AI 생기부 초안</h1>
          <p>학생 정보와 관찰 근거를 모아 교사 검토용 문장을 만들어요.</p>
        </div>
        <Link href="/teacher-log">AI 학생일지</Link>
      </header>

      <section className={styles.officialNotice}>
        <FilePenLine size={22} aria-hidden />
        <div>
          <strong>공식 학교생활기록부가 아니에요</strong>
          <p>교육행정정보시스템에 자동 제출되지 않습니다. 2026학년도 기재요령과 학교 기준을 확인한 교사가 최종 작성해야 해요.</p>
        </div>
        <a href="https://star.moe.go.kr/web/contents/m50100.do" target="_blank" rel="noreferrer">
          공식 기재요령 <ExternalLink size={15} />
        </a>
      </section>

      <div className="demo-notice">
        <AlertCircle size={17} aria-hidden />
        AI는 입력된 사실만 정리합니다. API 키가 없으면 체험 템플릿으로 생성하며 결과에 방식을 표시합니다.
      </div>

      {configured && (serverLoading || serverError) ? <section className={styles.accountState} role={serverError ? "alert" : "status"}><strong>{serverError ? "계정 학생 기록을 불러오지 못했어요" : "계정 학생 기록을 불러오는 중이에요"}</strong><p>{serverError ?? "체험 학생 데이터로 전환하지 않습니다. 로그인과 담당 학생 연결을 확인한 뒤 다시 시도해 주세요."}</p>{serverError ? <button type="button" onClick={() => void loadServerDrafts()}>다시 시도</button> : null}</section> : null}

      <section className={styles.form}>
        <div className={styles.grid}>
          <label>
            학생
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={configured && (serverLoading || Boolean(serverError))}>
              {visibleStudents.map((item) => (
                <option key={item.id} value={item.id}>{item.alias} · {item.gradeLevel}</option>
              ))}
            </select>
          </label>
          <label>
            작성 항목
            <select value={section} onChange={(event) => setSection(event.target.value as Section)}>
              {sections.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <div className={styles.context}>
          <article>
            <strong>연결된 성적 근거</strong>
            <p>{scoreContext || "등록된 성적이 없어요."}</p>
          </article>
          <article>
            <strong>연결된 성장 기록</strong>
            <p>{growthContext || "등록된 성장 기록이 없어요."}</p>
          </article>
        </div>

        <label>
          교사가 직접 확인한 관찰 근거
          <textarea
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="활동명, 학생이 실제로 한 말과 행동, 과정 중 변화, 산출물 등 확인 가능한 사실을 적어주세요."
            rows={7}
            maxLength={5000}
          />
          <small>{evidence.length} / 5,000자</small>
        </label>

        <div className={styles.actionRow}>
          <span>{aiUsage.plan === "UNLIMITED" ? "무제한 사용 중" : `무료 ${remaining}회 남음`}</span>
          <button onClick={generate} disabled={loading || (configured && (serverLoading || Boolean(serverError))) || evidence.trim().length < 10}>
            <Sparkles size={19} aria-hidden />
            {loading ? "초안 만드는 중" : "검토용 초안 만들기"}
          </button>
        </div>
        {message ? <p className={styles.message} role="status">{message}</p> : null}
      </section>

      {result ? (
        <section className={styles.result}>
          <div className={styles.resultHeader}>
            <h2>수정할 초안</h2>
            <span>{generationMode === "openai" ? "OpenAI 생성" : "체험 템플릿"}</span>
          </div>
          {generationNotice ? <p className={styles.generationNotice} role="status">{generationNotice}</p> : null}
          <textarea aria-label="수정할 생기부 초안" value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={10} />
          <div className={styles.reviewPoints}>
            <strong>저장 전 확인</strong>
            <ul>{result.reviewPoints.map((point) => <li key={point}>{point}</li>)}</ul>
          </div>
          <label className={styles.confirm}>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span><Check size={16} aria-hidden /> 입력 근거와 문장을 직접 대조하고 수정했어요.</span>
          </label>
          <button className={styles.saveButton} onClick={save} disabled={!confirmed || draftText.trim().length === 0}>확인한 초안으로 저장</button>
        </section>
      ) : null}

      <section className={styles.saved}>
        <h2>저장한 초안</h2>
        {(configured ? serverDrafts : schoolRecordDrafts).length === 0 ? <p>아직 저장한 생기부 초안이 없어요.</p> : (configured ? serverDrafts : schoolRecordDrafts).slice(0, 5).map((draft) => (
          <article key={draft.id}>
            <div><strong>{visibleStudents.find((item) => item.id === draft.studentId)?.alias ?? "학생"}</strong><span>{sections.find((item) => item.value === draft.section)?.label}</span></div>
            <p>{draft.draftText}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
