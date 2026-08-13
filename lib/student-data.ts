import type { Assessment, GrowthRecord, Student, SubjectScore, UserRole } from "@/lib/types";

export const demoUsers = {
  PARENT: "demo-parent-1",
  STUDENT: "demo-student-user-1",
  TEACHER: "demo-teacher-1",
} satisfies Record<UserRole, string>;

export const students: Student[] = [
  { id: "student-haeun", alias: "하은", gradeLevel: "중학교 2학년", className: "수학 A반", institutionId: "future-math-academy", parentUserIds: ["demo-parent-1"], teacherUserIds: ["demo-teacher-1"], isSynthetic: true },
  { id: "student-minjun", alias: "민준", gradeLevel: "고등학교 1학년", className: "통합과학 B반", institutionId: "metis-science-academy", parentUserIds: ["demo-parent-2"], teacherUserIds: ["demo-teacher-1"], isSynthetic: true },
  { id: "student-seoyun", alias: "서윤", gradeLevel: "중학교 3학년", className: "영어 내신반", institutionId: "smart-english-tutoring", parentUserIds: ["demo-parent-1"], teacherUserIds: ["demo-teacher-1"], isSynthetic: true },
];

export const assessments: Assessment[] = [
  { id: "haeun-school-1", studentId: "student-haeun", kind: "SCHOOL", title: "1학기 중간고사", date: "2026-04-24", term: "2026 1학기", maxTotal: 300, isSynthetic: true },
  { id: "haeun-school-2", studentId: "student-haeun", kind: "SCHOOL", title: "1학기 기말고사", date: "2026-07-08", term: "2026 1학기", maxTotal: 300, isSynthetic: true },
  { id: "haeun-mock-1", studentId: "student-haeun", kind: "MOCK", title: "3월 전국연합", date: "2026-03-26", term: "2026", maxTotal: 300, isSynthetic: true },
  { id: "haeun-mock-2", studentId: "student-haeun", kind: "MOCK", title: "6월 전국연합", date: "2026-06-18", term: "2026", maxTotal: 300, isSynthetic: true },
  { id: "minjun-mock-1", studentId: "student-minjun", kind: "MOCK", title: "3월 모의고사", date: "2026-03-26", term: "2026", maxTotal: 400, isSynthetic: true },
  { id: "minjun-mock-2", studentId: "student-minjun", kind: "MOCK", title: "6월 모의고사", date: "2026-06-18", term: "2026", maxTotal: 400, isSynthetic: true },
  { id: "minjun-csat-1", studentId: "student-minjun", kind: "CSAT", title: "수능형 진단 1회", date: "2026-04-10", term: "2026", maxTotal: 400, isSynthetic: true },
  { id: "minjun-csat-2", studentId: "student-minjun", kind: "CSAT", title: "수능형 진단 2회", date: "2026-07-17", term: "2026", maxTotal: 400, isSynthetic: true },
  { id: "seoyun-school-1", studentId: "student-seoyun", kind: "SCHOOL", title: "1학기 중간고사", date: "2026-04-25", term: "2026 1학기", maxTotal: 300, isSynthetic: true },
  { id: "seoyun-school-2", studentId: "student-seoyun", kind: "SCHOOL", title: "1학기 기말고사", date: "2026-07-09", term: "2026 1학기", maxTotal: 300, isSynthetic: true },
];

const score = (id: string, studentId: string, assessmentId: string, subject: string, value: number, gradeBand?: number): SubjectScore => ({
  id, studentId, assessmentId, subject, score: value, maxScore: 100, gradeBand, recordedAt: "2026-08-01", isSynthetic: true,
});

export const subjectScores: SubjectScore[] = [
  score("hs1-k", "student-haeun", "haeun-school-1", "국어", 78), score("hs1-m", "student-haeun", "haeun-school-1", "수학", 81), score("hs1-e", "student-haeun", "haeun-school-1", "영어", 84),
  score("hs2-k", "student-haeun", "haeun-school-2", "국어", 84), score("hs2-m", "student-haeun", "haeun-school-2", "수학", 92), score("hs2-e", "student-haeun", "haeun-school-2", "영어", 88),
  score("hm1-k", "student-haeun", "haeun-mock-1", "국어", 74, 4), score("hm1-m", "student-haeun", "haeun-mock-1", "수학", 77, 4), score("hm1-e", "student-haeun", "haeun-mock-1", "영어", 82, 3),
  score("hm2-k", "student-haeun", "haeun-mock-2", "국어", 81, 3), score("hm2-m", "student-haeun", "haeun-mock-2", "수학", 89, 2), score("hm2-e", "student-haeun", "haeun-mock-2", "영어", 86, 2),
  score("mm1-k", "student-minjun", "minjun-mock-1", "국어", 71, 4), score("mm1-m", "student-minjun", "minjun-mock-1", "수학", 76, 4), score("mm1-e", "student-minjun", "minjun-mock-1", "영어", 83, 3), score("mm1-s", "student-minjun", "minjun-mock-1", "과학", 79, 3),
  score("mm2-k", "student-minjun", "minjun-mock-2", "국어", 79, 3), score("mm2-m", "student-minjun", "minjun-mock-2", "수학", 84, 3), score("mm2-e", "student-minjun", "minjun-mock-2", "영어", 87, 2), score("mm2-s", "student-minjun", "minjun-mock-2", "과학", 91, 2),
  score("mc1-k", "student-minjun", "minjun-csat-1", "국어", 72, 4), score("mc1-m", "student-minjun", "minjun-csat-1", "수학", 78, 4), score("mc1-e", "student-minjun", "minjun-csat-1", "영어", 80, 3), score("mc1-s", "student-minjun", "minjun-csat-1", "과학", 82, 3),
  score("mc2-k", "student-minjun", "minjun-csat-2", "국어", 81, 3), score("mc2-m", "student-minjun", "minjun-csat-2", "수학", 88, 2), score("mc2-e", "student-minjun", "minjun-csat-2", "영어", 90, 2), score("mc2-s", "student-minjun", "minjun-csat-2", "과학", 93, 1),
  score("ss1-k", "student-seoyun", "seoyun-school-1", "국어", 85), score("ss1-m", "student-seoyun", "seoyun-school-1", "수학", 76), score("ss1-e", "student-seoyun", "seoyun-school-1", "영어", 88),
  score("ss2-k", "student-seoyun", "seoyun-school-2", "국어", 89), score("ss2-m", "student-seoyun", "seoyun-school-2", "수학", 82), score("ss2-e", "student-seoyun", "seoyun-school-2", "영어", 94),
];

export const growthRecords: GrowthRecord[] = [
  { id: "g-h-1", studentId: "student-haeun", category: "LEARNING", observedAt: "2026-06-12", level: 4, title: "오답 정리 습관 향상", note: "틀린 이유를 풀이 옆에 직접 적고 다음 수업에서 확인하는 습관이 자리잡고 있어요.", authorRole: "TEACHER", isSynthetic: true },
  { id: "g-h-2", studentId: "student-haeun", category: "SELF_MANAGEMENT", observedAt: "2026-07-22", level: 4, title: "과제 계획을 스스로 조정", note: "주간 과제량을 확인하고 어려운 단원을 먼저 배치하기 시작했어요.", authorRole: "TEACHER", isSynthetic: true },
  { id: "g-m-1", studentId: "student-minjun", category: "PARTICIPATION", observedAt: "2026-06-20", level: 5, title: "실험 수업 참여 증가", note: "가설을 먼저 말하고 결과와 비교하는 과정에 적극적으로 참여했어요.", authorRole: "TEACHER", isSynthetic: true },
  { id: "g-m-2", studentId: "student-minjun", category: "CAREER", observedAt: "2026-07-26", level: 4, title: "과학 분야 진로 탐색", note: "관심 전공을 스스로 조사하고 필요한 과목을 질문했어요.", authorRole: "TEACHER", isSynthetic: true },
  { id: "g-s-1", studentId: "student-seoyun", category: "LEARNING", observedAt: "2026-07-12", level: 5, title: "영어 독해 근거 찾기 향상", note: "정답을 고른 근거 문장을 정확히 표시하는 비율이 높아졌어요.", authorRole: "TEACHER", isSynthetic: true },
];

export function getAccessibleStudents(role: UserRole): Student[] {
  const userId = demoUsers[role];
  if (role === "PARENT") return students.filter((student) => student.parentUserIds.includes(userId));
  if (role === "TEACHER") return students.filter((student) => student.teacherUserIds.includes(userId));
  return students.filter((student) => student.id === "student-haeun");
}

export function canAccessStudent(role: UserRole, studentId: string): boolean {
  return getAccessibleStudents(role).some((student) => student.id === studentId);
}
