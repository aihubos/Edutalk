"use client";

import Link from "next/link";
import { AlertCircle, BookOpenCheck, Check, ChevronRight, FilePenLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { demoUsers, getAccessibleStudents } from "@/lib/student-data";
import type { Student, StudentJournal } from "@/lib/types";
import styles from "./teacher-log.module.css";

interface JournalDraft {
  learningSummary: string;
  participationSummary: string;
  growthSummary: string;
  nextPlan: string;
}

export default function TeacherLogPage() {
  const { role, setRole, aiUsage, consumeAiCredit, applyServerAiUsage, addStudentJournal, studentJournals, customStudents, accountAuthStatus } = useApp();
  const configured = isSupabaseConfigured();
  const [serverJournals, setServerJournals] = useState<StudentJournal[]>([]);
  const [serverStudents, setServerStudents] = useState<Student[]>([]);
  const availableStudents = useMemo(
    () => [...getAccessibleStudents("TEACHER"), ...customStudents.filter((student) => student.teacherUserIds.includes(demoUsers.TEACHER))],
    [customStudents],
  );
  const [studentId, setStudentId] = useState(availableStudents[0]?.id ?? "");
  const [learningTopic, setLearningTopic] = useState("");
  const [observation, setObservation] = useState("");
  const [participationLevel, setParticipationLevel] = useState(3);
  const [nextPlanHint, setNextPlanHint] = useState("");
  const [draft, setDraft] = useState<JournalDraft | null>(null);
  const [generationMode, setGenerationMode] = useState<"openai" | "demo-template">("demo-template");
  const [generationNotice, setGenerationNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(configured);
  const [serverError, setServerError] = useState("");
  const [message, setMessage] = useState("");

  const remaining = Math.max(0, aiUsage.freeLimit - aiUsage.used);
  const visibleStudents = configured ? serverStudents : availableStudents;
  const selectedStudent = visibleStudents.find((student) => student.id === studentId);

  const loadServerDrafts = useCallback(async () => {
    if (!configured) return;
    setServerLoading(true);
    setServerError("");
    try {
      const response = await fetch("/api/ai/drafts");
      const payload = await response.json() as { mode?: string; drafts?: Array<Record<string, unknown>>; students?: Array<{ students?: Record<string, unknown> }>; error?: string };
      if (!response.ok || payload.mode !== "supabase") throw new Error(payload.error ?? "계정 학생 기록을 불러오지 못했어요.");
      setServerJournals((payload.drafts ?? []).filter((draft) => draft.kind === "JOURNAL").map((draft) => {
        const content = draft.content as Partial<JournalDraft>;
        return { id: String(draft.id), studentId: String(draft.student_id), teacherUserId: "server", observedAt: String(draft.created_at).slice(0, 10), learningSummary: String(content.learningSummary ?? ""), participationSummary: String(content.participationSummary ?? ""), growthSummary: String(content.growthSummary ?? ""), nextPlan: String(content.nextPlan ?? ""), teacherConfirmed: Boolean(draft.teacher_confirmed), generationMode: draft.generation_mode === "openai" ? "openai" : "demo-template", createdAt: String(draft.created_at) };
      }));
      const students: Student[] = (payload.students ?? []).map((link) => link.students).filter((student): student is Record<string, unknown> => Boolean(student)).map((student) => ({ id: String(student.id), alias: String(student.alias), gradeLevel: String(student.grade_level), className: String(student.class_name ?? ""), institutionId: String(student.institution_id ?? ""), parentUserIds: [], teacherUserIds: [], isSynthetic: false }));
      setServerStudents(students);
      setStudentId((current) => current && students.some((student) => student.id === current) ? current : (students[0]?.id ?? ""));
    } catch (error) {
      setServerStudents([]);
      setServerJournals([]);
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

  if (role !== "TEACHER") {
    return (
      <div className="page-container">
        <section className={styles.guard}>
          <BookOpenCheck size={32} aria-hidden />
          <h1>선생님 전용 기능이에요</h1>
          <p>담당 학생의 관찰 내용을 바탕으로 일지 초안을 만들 수 있어요.</p>
          {configured && accountAuthStatus === "authenticated" ? <Link href="/onboarding?review=policies">선생님 역할 추가하기</Link> : <button onClick={() => setRole("TEACHER")}>선생님 모드로 전환</button>}
        </section>
      </div>
    );
  }

  async function generateDraft() {
    if (!selectedStudent || learningTopic.trim().length < 2 || observation.trim().length < 5) return;
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
          mode: "journal",
          studentId: selectedStudent.id,
          studentAlias: selectedStudent.alias,
          gradeLevel: selectedStudent.gradeLevel,
          learningTopic,
          observation,
          participationLevel,
          nextPlanHint,
        }),
      });
      const result = (await response.json()) as { data?: JournalDraft; generationMode?: "openai" | "demo-template"; usageMode?: "server" | "demo"; remaining?: number | null; plan?: "FREE" | "UNLIMITED"; notice?: string; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "generation failed");
      if (result.usageMode !== "server") {
        const credit = consumeAiCredit();
        if (!credit.ok) { setMessage("사용 가능한 AI 횟수가 없어요."); return; }
      } else applyServerAiUsage(result.remaining ?? null, result.plan);
      setDraft(result.data);
      setGenerationMode(result.generationMode || "demo-template");
      setGenerationNotice(result.notice ?? "");
      setConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error && error.message !== "generation failed" ? error.message : "초안을 만들지 못했어요. 입력 내용은 그대로 보존되어 있어요.");
    } finally {
      setLoading(false);
    }
  }

  async function saveJournal() {
    if (!draft || !confirmed || !selectedStudent) return;
    const journal: StudentJournal = {
      id: `journal-${Date.now()}`,
      studentId: selectedStudent.id,
      teacherUserId: demoUsers.TEACHER,
      observedAt: new Date().toISOString().slice(0, 10),
      ...draft,
      teacherConfirmed: true,
      generationMode,
      createdAt: new Date().toISOString(),
    };
    if (configured) {
      const response = await fetch("/api/ai/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "JOURNAL", studentId: journal.studentId, evidence: observation, content: draft, generationMode, teacherConfirmed: true }) });
      if (!response.ok) { setMessage("로그인한 선생님의 연결 학생 기록만 서버에 저장할 수 있어요."); return; }
      await loadServerDrafts();
      setMessage("선생님이 확인한 학생일지를 계정에 저장했어요.");
    } else {
      addStudentJournal(journal);
      setMessage("선생님이 확인한 학생일지로 저장했어요.");
    }
    setLearningTopic("");
    setObservation("");
    setNextPlanHint("");
    setDraft(null);
    setGenerationNotice("");
    setConfirmed(false);
  }

  return (
    <div className="page-container">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>선생님 업무 도구</span>
          <h1>AI 학생일지</h1>
          <p>관찰 사실을 입력하면 수정 가능한 초안을 만들어요.</p>
        </div>
        <Link href="/school-record" className={styles.recordLink}>
          <FilePenLine size={19} aria-hidden />
          AI 생기부 초안
        </Link>
      </header>

      <div className={styles.usageCard}>
        <div>
          <span>{aiUsage.plan === "UNLIMITED" ? "무제한 플랜" : "무료 플랜"}</span>
          <strong>{aiUsage.plan === "UNLIMITED" ? "AI 무제한 사용" : `${remaining}회 남음`}</strong>
        </div>
        <Link href="/subscription">플랜 보기 <ChevronRight size={16} /></Link>
      </div>

      <div className="demo-notice">
        <AlertCircle size={17} aria-hidden />
        학생은 별칭으로 구분합니다. API 키가 없으면 규칙 기반 체험 초안을 만들며, 생성 방식은 결과에 표시됩니다.
      </div>

      {configured && (serverLoading || serverError) ? <section className={styles.accountState} role={serverError ? "alert" : "status"}><strong>{serverError ? "계정 학생 기록을 불러오지 못했어요" : "계정 학생 기록을 불러오는 중이에요"}</strong><p>{serverError ?? "체험 학생 데이터로 전환하지 않습니다. 로그인과 담당 학생 연결을 확인한 뒤 다시 시도해 주세요."}</p>{serverError ? <button type="button" onClick={() => void loadServerDrafts()}>다시 시도</button> : null}</section> : null}

      <section className={styles.formCard}>
        <label>
          학생
          <select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={configured && (serverLoading || Boolean(serverError))}>
            {visibleStudents.map((student) => (
              <option key={student.id} value={student.id}>{student.alias} · {student.gradeLevel}</option>
            ))}
          </select>
        </label>
        <label>
          오늘의 학습 내용
          <input value={learningTopic} onChange={(event) => setLearningTopic(event.target.value)} placeholder="예: 일차함수 그래프의 기울기" maxLength={500} />
        </label>
        <label>
          직접 관찰한 내용
          <textarea value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="학생이 보인 행동과 발언을 사실 중심으로 적어주세요." rows={5} maxLength={3000} />
        </label>
        <fieldset>
          <legend>수업 참여도</legend>
          <div className={styles.levels}>
            {[1, 2, 3, 4, 5].map((level) => (
              <button key={level} type="button" className={participationLevel === level ? styles.levelActive : styles.level} onClick={() => setParticipationLevel(level)}>{level}</button>
            ))}
          </div>
        </fieldset>
        <label>
          다음 수업 계획
          <textarea value={nextPlanHint} onChange={(event) => setNextPlanHint(event.target.value)} placeholder="선택 입력" rows={3} maxLength={1000} />
        </label>
        <button className={styles.generateButton} onClick={generateDraft} disabled={loading || (configured && (serverLoading || Boolean(serverError))) || learningTopic.trim().length < 2 || observation.trim().length < 5}>
          <Sparkles size={19} aria-hidden />
          {loading ? "초안 만드는 중" : "AI 초안 만들기"}
        </button>
        {message ? <p className={styles.message} role="status">{message}</p> : null}
      </section>

      {draft ? (
        <section className={styles.draftCard}>
          <div className={styles.draftHeader}>
            <h2>수정할 초안</h2>
            <span>{generationMode === "openai" ? "OpenAI 생성" : "체험 템플릿"}</span>
          </div>
          {generationNotice ? <p className={styles.generationNotice} role="status">{generationNotice}</p> : null}
          {([
            ["learningSummary", "학습 내용"],
            ["participationSummary", "참여 모습"],
            ["growthSummary", "성장 관찰"],
            ["nextPlan", "다음 계획"],
          ] as const).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} rows={4} />
            </label>
          ))}
          <label className={styles.confirm}>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span><Check size={16} aria-hidden /> 관찰 사실과 일치하도록 직접 확인하고 수정했어요.</span>
          </label>
          <button className={styles.saveButton} onClick={saveJournal} disabled={!confirmed}>확인한 일지로 저장</button>
        </section>
      ) : null}

      <section className={styles.savedSection}>
        <h2>저장한 학생일지</h2>
        {(configured ? serverJournals : studentJournals).length === 0 ? (
          <p className={styles.empty}>아직 저장한 일지가 없어요.</p>
        ) : (
          <div className={styles.savedList}>
            {(configured ? serverJournals : studentJournals).slice(0, 5).map((journal) => {
              const student = visibleStudents.find((item) => item.id === journal.studentId);
              return (
                <article key={journal.id}>
                  <div><strong>{student?.alias ?? "학생"}</strong><span>{journal.observedAt}</span></div>
                  <p>{journal.learningSummary}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
