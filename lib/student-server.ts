import type { Assessment, GrowthRecord, Student, SubjectScore } from "@/lib/types";
import { z } from "zod";

export const createStudentInput = z.object({
  alias: z.string().trim().min(1).max(24),
  gradeLevel: z.string().trim().min(1).max(40),
  className: z.string().trim().min(1).max(60),
  institutionName: z.string().trim().min(1).max(120),
  institutionId: z.string().uuid().optional(),
});

export const createStudentRecordInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assessment"), kind: z.enum(["SCHOOL", "MOCK", "CSAT"]), title: z.string().trim().min(1).max(120), date: z.iso.date(), term: z.string().trim().min(1).max(60), maxTotal: z.number().positive().max(10000) }),
  z.object({ action: z.literal("score"), assessmentId: z.string().uuid(), subject: z.string().trim().min(1).max(60), score: z.number().min(0).max(10000), maxScore: z.number().positive().max(10000), gradeBand: z.number().int().min(1).max(9).optional() }).refine((value) => value.score <= value.maxScore, { message: "점수는 만점을 넘을 수 없습니다." }),
  z.object({ action: z.literal("growth"), category: z.enum(["LEARNING", "PARTICIPATION", "SOCIAL", "SELF_MANAGEMENT", "CAREER"]), observedAt: z.iso.date(), level: z.number().int().min(1).max(5), title: z.string().trim().min(1).max(120), note: z.string().trim().min(1).max(3000) }),
]);

type StudentRow = { id: string; alias: string; grade_level: string; class_name: string; institution_id: string | null; institution_name?: string | null };
type AssessmentRow = { id: string; student_id: string; kind: Assessment["kind"]; title: string; assessed_on: string; term: string; max_total: number };
type ScoreRow = { id: string; student_id: string; assessment_id: string; subject: string; score: number; max_score: number; grade_band: number | null; percentile: number | null; recorded_at: string };
type GrowthRow = { id: string; student_id: string; category: GrowthRecord["category"]; observed_on: string; level: number; title: string; note: string };

export function toStudent(row: StudentRow): Student {
  return { id: row.id, alias: row.alias, gradeLevel: row.grade_level, className: row.class_name, institutionId: row.institution_id ?? "", institutionName: row.institution_name ?? undefined, parentUserIds: [], teacherUserIds: [], isSynthetic: false };
}

export function toAssessment(row: AssessmentRow): Assessment {
  return { id: row.id, studentId: row.student_id, kind: row.kind, title: row.title, date: row.assessed_on, term: row.term, maxTotal: Number(row.max_total), isSynthetic: false };
}

export function toScore(row: ScoreRow): SubjectScore {
  return { id: row.id, studentId: row.student_id, assessmentId: row.assessment_id, subject: row.subject, score: Number(row.score), maxScore: Number(row.max_score), gradeBand: row.grade_band ?? undefined, percentile: row.percentile ?? undefined, recordedAt: row.recorded_at.slice(0, 10), isSynthetic: false };
}

export function toGrowth(row: GrowthRow): GrowthRecord {
  return { id: row.id, studentId: row.student_id, category: row.category, observedAt: row.observed_on, level: row.level, title: row.title, note: row.note, authorRole: "TEACHER", isSynthetic: false };
}
