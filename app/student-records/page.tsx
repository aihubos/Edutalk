"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenCheck, CalendarDays, GraduationCap, LineChart, PlusCircle, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/lib/app-context";
import type { CanonicalInstitution } from "@/lib/canonical-institutions";
import { getInstitution, institutions } from "@/lib/demo-data";
import { assessments, demoUsers, getAccessibleStudents, subjectScores } from "@/lib/student-data";
import { roleLabels } from "@/lib/labels";
import type { Student } from "@/lib/types";
import type { Assessment, SubjectScore } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import styles from "./student-records.module.css";

interface ServerRecords { students: Student[]; assessments: Assessment[]; scores: SubjectScore[]; }
interface InstitutionApiResponse { mode?: string; institutions?: CanonicalInstitution[]; error?: string; }
interface ChildProfile { id: string; alias: string; gradeLevel: string; }

const getLatestAssessmentDate = (studentId: string, allAssessments: Assessment[]) =>
  allAssessments.filter((assessment) => assessment.studentId === studentId).map((assessment) => assessment.date).sort().at(-1) ?? "기록 대기";

function StudentCard({ student, allAssessments, allScores, onCreateLink, link }: { student: Student; allAssessments: Assessment[]; allScores: SubjectScore[]; onCreateLink?: (studentId: string, linkRole: "PARENT" | "STUDENT") => void; link?: { linkRole: "PARENT" | "STUDENT"; code: string; expiresAt: string } | null }) {
  const institution = getInstitution(student.institutionId);
  const scores = allScores.filter((score) => score.studentId === student.id);
  const average = scores.length ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length : null;
  const assessmentCount = allAssessments.filter((assessment) => assessment.studentId === student.id).length;

  return <article className={styles.studentCard}>
    <div className={styles.cardHeader}><span className={styles.studentIcon}><UserRound size={22} /></span><div><p>{student.gradeLevel} · {student.className}</p><h2>{student.alias}</h2></div></div>
    <dl className={styles.metricGrid} aria-label={student.alias + " 성적 요약"}>
      <div><dt>평균</dt><dd>{average === null ? "대기" : average.toFixed(1) + "점"}</dd></div>
      <div><dt>시험</dt><dd>{assessmentCount}회</dd></div>
      <div><dt>과목점수</dt><dd>{scores.length}개</dd></div>
      <div><dt>최근 기록</dt><dd>{getLatestAssessmentDate(student.id, allAssessments)}</dd></div>
    </dl>
    <div className={styles.cardFooter}><span><GraduationCap size={15} />{student.institutionName ?? institution?.name ?? "기관 정보 대기"}</span><Link href={`/student-records/${student.id}`}>상세 보기<ArrowRight size={16} /></Link></div>
    {onCreateLink ? <div className={styles.linkActions}><strong>계정 연결 코드</strong><div><button type="button" onClick={() => onCreateLink(student.id, "PARENT")}>보호자 코드</button><button type="button" onClick={() => onCreateLink(student.id, "STUDENT")}>학생 본인 코드</button></div>{link ? <p><b>{link.linkRole === "PARENT" ? "보호자" : "학생 본인"} 코드</b><span>{link.code} · {new Date(link.expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}까지</span></p> : null}</div> : null}
  </article>;
}

export default function StudentRecordsPage() {
  const { role, hydrated, customStudents, customAssessments, customScores, addStudent, ageBand } = useApp();
  const [notice, setNotice] = useState("");
  const [serverRecords, setServerRecords] = useState<ServerRecords | null>(null);
  const [serverError, setServerError] = useState("");
  const [canonicalInstitutions, setCanonicalInstitutions] = useState<CanonicalInstitution[]>([]);
  const [canonicalLoading, setCanonicalLoading] = useState(false);
  const [canonicalError, setCanonicalError] = useState("");
  const [parentCode, setParentCode] = useState("");
  const [childProfiles, setChildProfiles] = useState<ChildProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState("");
  const [selectedChildProfileId, setSelectedChildProfileId] = useState("");
  const [teacherLink, setTeacherLink] = useState<{ studentId: string; linkRole: "PARENT" | "STUDENT"; code: string; expiresAt: string } | null>(null);
  const serverMode = isSupabaseConfigured();
  const refreshServerRecords = async () => {
    const response = await fetch("/api/students");
    const data = await response.json() as ServerRecords & { error?: string; mode?: string };
    if (!response.ok || data.mode === "demo") { setServerError(data.error ?? "계정 학습 기록을 불러오지 못했어요."); return; }
    setServerRecords({ students: data.students ?? [], assessments: data.assessments ?? [], scores: data.scores ?? [] });
  };

  useEffect(() => {
    if (!hydrated || !serverMode) return;
    const frame = window.requestAnimationFrame(() => {
      void refreshServerRecords().catch(() => setServerError("계정 학습 기록을 불러오지 못했어요."));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, serverMode]);
  useEffect(() => {
    if (!hydrated || !serverMode || role !== "PARENT") return;
    let active = true;
    const loadChildProfiles = async () => {
      setChildrenLoading(true);
      setChildrenError("");
      try {
        const response = await fetch("/api/children");
        const payload = await response.json() as { children?: ChildProfile[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "자녀 별칭을 불러오지 못했어요.");
        if (!active) return;
        const children = Array.isArray(payload.children) ? payload.children : [];
        setChildProfiles(children);
        setSelectedChildProfileId((current) => children.some((child) => child.id === current) ? current : children[0]?.id ?? "");
      } catch (error) {
        if (!active) return;
        setChildProfiles([]);
        setChildrenError(error instanceof Error ? error.message : "자녀 별칭을 불러오지 못했어요.");
      } finally {
        if (active) setChildrenLoading(false);
      }
    };
    void loadChildProfiles();
    return () => { active = false; };
  }, [hydrated, role, serverMode]);
  useEffect(() => {
    if (!hydrated || !serverMode) return;
    const loadCanonicalInstitutions = async () => {
      setCanonicalLoading(true);
      setCanonicalError("");
      try {
        const response = await fetch("/api/institutions");
        const payload = await response.json() as InstitutionApiResponse;
        if (!response.ok || payload.mode !== "canonical") throw new Error(payload.error ?? "공개 기관 목록을 불러오지 못했어요.");
        setCanonicalInstitutions(Array.isArray(payload.institutions) ? payload.institutions : []);
      } catch (error) {
        setCanonicalInstitutions([]);
        setCanonicalError(error instanceof Error ? error.message : "공개 기관 목록을 불러오지 못했어요.");
      } finally {
        setCanonicalLoading(false);
      }
    };
    void loadCanonicalInstitutions();
  }, [hydrated, serverMode]);
  const accessibleStudents = useMemo(() => {
    const demo = getAccessibleStudents(role);
    const userId = demoUsers[role];
    return [...demo, ...customStudents.filter((student) => role === "TEACHER" ? student.teacherUserIds.includes(userId) : role === "PARENT" ? student.parentUserIds.includes(userId) : false)];
  }, [role, customStudents]);
  const allAssessments = useMemo(() => serverMode ? serverRecords?.assessments ?? [] : [...assessments, ...customAssessments], [customAssessments, serverMode, serverRecords]);
  const allScores = useMemo(() => serverMode ? serverRecords?.scores ?? [] : [...subjectScores, ...customScores], [customScores, serverMode, serverRecords]);

  function registerStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const alias = String(data.get("alias") ?? "").trim();
    const gradeLevel = String(data.get("gradeLevel") ?? "").trim();
    const className = String(data.get("className") ?? "").trim();
    const institutionId = String(data.get("institutionId") ?? "");
    const selectedCanonicalInstitution = canonicalInstitutions.find((institution) => institution.id === institutionId);
    const institutionName = serverMode
      ? selectedCanonicalInstitution?.name ?? ""
      : String(data.get("institutionName") ?? "").trim() || getInstitution(institutionId)?.name || "";
    const linkParent = data.get("linkParent") === "on";
    if (!alias || !gradeLevel || !className || !institutionName) { setNotice("별칭, 학년, 반·그룹, 기관을 모두 입력해 주세요."); return; }
    if (serverMode) {
      if (canonicalLoading || canonicalError || !selectedCanonicalInstitution) { setNotice(canonicalError || "공개 기관을 선택한 뒤 학생을 등록해 주세요."); return; }
      void fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alias, gradeLevel, className, institutionId: selectedCanonicalInstitution.id, institutionName: selectedCanonicalInstitution.name }) })
        .then(async (response) => {
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error);
          event.currentTarget.reset();
          await refreshServerRecords();
          setNotice(`${alias} 학생을 계정에 등록했어요.`);
        }).catch((error) => setNotice(error instanceof Error ? error.message : "학생을 등록하지 못했어요."));
      return;
    }
    addStudent({ id: `custom-student-${Date.now()}`, alias, gradeLevel, className, institutionId: institutionId || "custom-institution", institutionName, parentUserIds: linkParent ? [demoUsers.PARENT] : [], teacherUserIds: [demoUsers.TEACHER], isSynthetic: true });
    event.currentTarget.reset(); setNotice(`${alias} 학생을 등록했어요. 성적과 AI 일지에서 바로 선택할 수 있어요.`);
  }

  function connectParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = parentCode.trim().toUpperCase();
    if (!code) { setNotice("선생님에게 받은 연결 코드를 입력해 주세요."); return; }
    const selectedChild = childProfiles.find((child) => child.id === selectedChildProfileId);
    if (role === "PARENT" && childProfiles.length > 0 && !selectedChild) { setNotice("연결할 자녀 별칭을 선택해 주세요."); return; }
    void fetch("/api/student-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", code, ...(role === "PARENT" && selectedChild ? { childProfileId: selectedChild.id } : {}) }),
    }).then(async (response) => {
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setParentCode("");
      await refreshServerRecords();
      setNotice(role === "STUDENT" ? "내 학습기록이 학생 계정에 연결됐어요." : selectedChild ? `${selectedChild.alias} 별칭에 학습기록을 연결했어요.` : "자녀 기록이 학부모 계정에 연결됐어요.");
    }).catch((error) => setNotice(error instanceof Error ? error.message : "자녀 기록을 연결하지 못했어요."));
  }

  function createTeacherLink(studentId: string, linkRole: "PARENT" | "STUDENT") {
    void fetch("/api/student-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", studentId, linkRole }),
    }).then(async (response) => {
      const result = await response.json() as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.code || !result.expiresAt) throw new Error(result.error);
      setTeacherLink({ studentId, linkRole, code: result.code, expiresAt: result.expiresAt });
      setNotice(`${linkRole === "PARENT" ? "보호자" : "학생 본인"} 연결 코드를 만들었어요.`);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "연결 코드를 만들지 못했어요."));
  }

  if (!hydrated) return <main className={styles.page} aria-busy="true"><div className={styles.skeletonHero} /><div className={styles.skeletonCard} /></main>;
  const shownStudents = serverMode ? serverRecords?.students ?? [] : accessibleStudents;
  const totalAssessments = shownStudents.reduce((sum, student) => sum + allAssessments.filter((item) => item.studentId === student.id).length, 0);
  const totalScores = shownStudents.reduce((sum, student) => sum + allScores.filter((item) => item.studentId === student.id).length, 0);
  return <main className={styles.page}>
    <section className={styles.hero} aria-labelledby="student-records-title"><span className={styles.demoBadge}>{serverMode ? "계정 데이터" : "체험용 데이터"}</span><div className={styles.heroText}><p className={styles.kicker}>{roleLabels[role]} 성적관리</p><h1 id="student-records-title">학생별 성적 흐름과 성장기록을 확인해요</h1><p>{role === "TEACHER" ? "현재 역할에서 볼 수 있는 학생만 표시합니다. 선생님은 아래에서 담당 학생을 직접 등록할 수 있어요." : "현재 역할에서 연결된 자녀의 성적과 성장기록만 표시합니다."}</p></div></section>
    {role === "TEACHER" ? <section className={styles.registerSection} aria-labelledby="register-title"><div className={styles.sectionHeader}><div><p className={styles.kicker}>담당 학생 등록</p><h2 id="register-title">별칭으로 학생을 추가해요</h2></div><PlusCircle size={20} /></div><p className={styles.privacyNotice}>실명·생년월일·학교명은 입력하지 마세요. 학생을 구분할 수 있는 별칭과 반·그룹만 사용합니다.</p><form className={styles.registerForm} onSubmit={registerStudent}><label>학생 별칭<input name="alias" maxLength={30} placeholder="예: 민트" /></label><label>학년<input name="gradeLevel" maxLength={30} placeholder="예: 중학교 2학년" /></label><label>반·그룹<input name="className" maxLength={40} placeholder="예: 수학 심화 A반" /></label><label>기관 선택<select name="institutionId" defaultValue="" disabled={serverMode && (canonicalLoading || Boolean(canonicalError) || canonicalInstitutions.length === 0)}><option value="">{serverMode ? canonicalLoading ? "공개 기관 목록을 불러오는 중" : canonicalError ? "공개 기관 목록을 불러오지 못했어요" : canonicalInstitutions.length === 0 ? "공개 기관 정보가 아직 없어요" : "공개 기관을 선택하세요" : "직접 입력"}</option>{(serverMode ? canonicalInstitutions : institutions).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>{serverMode ? <p className={styles.canonicalNotice}>{canonicalError ? canonicalError : canonicalInstitutions.length === 0 && !canonicalLoading ? "계정 모드에서는 공개 canonical 기관이 등록된 뒤 학생을 추가할 수 있어요." : "계정 모드에서는 공개 canonical 기관만 연결해 저장합니다."}</p> : <><label>기관 직접 입력<input name="institutionName" maxLength={60} placeholder="예: 동탄 수학센터" /></label><label className={styles.parentLink}><input name="linkParent" type="checkbox" />학부모 체험계정에도 연결</label></>}<button type="submit" disabled={serverMode && (canonicalLoading || Boolean(canonicalError) || canonicalInstitutions.length === 0)}><PlusCircle size={17} />학생 등록</button></form>{notice ? <p className={styles.registerNotice} role="status">{notice}</p> : null}</section> : null}
    {role === "PARENT" && serverMode ? <section className={styles.registerSection} aria-labelledby="parent-connect-title"><div className={styles.sectionHeader}><div><p className={styles.kicker}>자녀 연결</p><h2 id="parent-connect-title">선생님에게 받은 코드를 입력해요</h2></div><UserRound size={20} /></div><p className={styles.privacyNotice}>연결 코드는 30분 동안 한 번만 사용할 수 있어요. 연결할 자녀는 별칭으로만 선택하며, 실명·학교명·생년월일은 입력하지 않습니다.</p><form className={styles.registerForm} onSubmit={connectParent}>{childrenLoading ? <p className={styles.canonicalNotice}>내 자녀 별칭을 불러오는 중이에요.</p> : childProfiles.length ? <label>연결할 자녀 별칭<select value={selectedChildProfileId} onChange={(event) => setSelectedChildProfileId(event.target.value)}><option value="">자녀 별칭을 선택하세요</option>{childProfiles.map((child) => <option key={child.id} value={child.id}>{child.alias} · {child.gradeLevel}</option>)}</select></label> : <p className={styles.canonicalNotice}>{childrenError ? childrenError : "MY에서 자녀 별칭·학년 프로필을 먼저 추가하면 연결 후에도 같은 별칭으로 구분할 수 있어요."}</p>}<label>12자리 연결 코드<input value={parentCode} onChange={(event) => setParentCode(event.target.value.toUpperCase())} maxLength={14} autoCapitalize="characters" placeholder="ABCD-2345-EFGH" /></label><button type="submit" disabled={childrenLoading}><PlusCircle size={17} />자녀 기록 연결</button></form>{notice ? <p className={styles.registerNotice} role="status">{notice}</p> : null}</section> : null}
    {role === "STUDENT" && ageBand === "FOURTEEN_PLUS" && serverMode ? <section className={styles.registerSection} aria-labelledby="student-connect-title"><div className={styles.sectionHeader}><div><p className={styles.kicker}>내 학습기록 연결</p><h2 id="student-connect-title">선생님에게 받은 본인 코드를 입력해요</h2></div><UserRound size={20} /></div><p className={styles.privacyNotice}>만 14세 이상 학생만 본인 계정으로 연결할 수 있어요. 보호자 연결 코드는 사용할 수 없습니다.</p><form className={styles.registerForm} onSubmit={connectParent}><label>12자리 학생 연결 코드<input value={parentCode} onChange={(event) => setParentCode(event.target.value.toUpperCase())} maxLength={14} autoCapitalize="characters" placeholder="ABCD-2345-EFGH" /></label><button type="submit"><PlusCircle size={17} />내 기록 연결</button></form>{notice ? <p className={styles.registerNotice} role="status">{notice}</p> : null}</section> : null}
    <section className={styles.summaryGrid} aria-label="성적관리 요약"><div className={styles.summaryCard}><UserRound size={20} /><span>접근 학생</span><strong>{shownStudents.length}명</strong></div><div className={styles.summaryCard}><CalendarDays size={20} /><span>시험 기록</span><strong>{totalAssessments}회</strong></div><div className={styles.summaryCard}><BookOpenCheck size={20} /><span>과목 점수</span><strong>{totalScores}개</strong></div><div className={styles.summaryCard}><LineChart size={20} /><span>보기 권한</span><strong>{roleLabels[role]}</strong></div></section>
    <section className={styles.listSection} aria-labelledby="student-list-title"><div className={styles.sectionHeader}><div><p className={styles.kicker}>학생 목록</p><h2 id="student-list-title">접근 가능한 학생</h2></div><BarChart3 size={20} /></div>{serverError ? <div className={styles.emptyState}><p>{serverError}</p></div> : shownStudents.length ? <div className={styles.studentList}>{shownStudents.map((student) => <StudentCard key={student.id} student={student} allAssessments={allAssessments} allScores={allScores} onCreateLink={role === "TEACHER" && serverMode ? createTeacherLink : undefined} link={teacherLink?.studentId === student.id ? teacherLink : null} />)}</div> : <div className={styles.emptyState}><p>현재 역할에서 확인할 수 있는 학생 기록이 없어요.</p></div>}</section>
  </main>;
}
