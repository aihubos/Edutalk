import { institutions } from "@/lib/demo-data";
import type { Institution, UserRole } from "@/lib/types";

export type InstitutionRankingRole = Extract<UserRole, "PARENT" | "STUDENT">;

export interface InstitutionRankingItem {
  institution: Institution;
  role: InstitutionRankingRole;
  roleScore: number;
  reviewCount: number;
  sourceCompleteness: number;
  freshness: number;
  total: number;
}

export interface PublicInstitutionRankingItem {
  institutionId: string;
  publicSlug: string;
  name: string;
  institutionType: string;
  zone: string;
  role: InstitutionRankingRole | "TEACHER";
  score: number;
  reviewCount: number;
  categoryScores: Record<string, number>;
  formulaDescription: string;
  referenceDate: string;
}

export interface WeeklyRankingMovement {
  institutionId: string;
  role: InstitutionRankingRole | "TEACHER";
  rankPosition: number;
  previousRankPosition: number | null;
  change: "UP" | "DOWN" | "NEW" | "UNCHANGED";
  snapshotWeek: string;
}

type PublicRankingRow = Record<string, unknown>;

export function mapPublicInstitutionRankings(rows: PublicRankingRow[]) {
  return rows
    .map((row): PublicInstitutionRankingItem | null => {
      const role = row.relation;
      if (role !== "PARENT" && role !== "STUDENT" && role !== "TEACHER") return null;
      const score = Number(row.score ?? row.overall_average);
      const reviewCount = Number(row.review_count);
      if (!Number.isFinite(score) || !Number.isFinite(reviewCount)) return null;
      const rawItems = row.items;
      const categoryScores = rawItems && typeof rawItems === "object" && !Array.isArray(rawItems)
        ? Object.fromEntries(Object.entries(rawItems).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => [key, Number(value)]))
        : {};
      return {
        institutionId: String(row.institution_id),
        publicSlug: String(row.public_slug),
        name: String(row.institution_name),
        institutionType: String(row.institution_type),
        zone: String(row.institution_zone),
        role,
        score,
        reviewCount,
        categoryScores,
        formulaDescription: typeof row.formula_description === "string" ? row.formula_description : "승인 후기의 최근성 가중 평균을 역할별로 보정합니다.",
        referenceDate: typeof row.reference_date === "string" ? row.reference_date : "기준일 미확인",
      };
    })
    .filter((item): item is PublicInstitutionRankingItem => item !== null)
    .sort((a, b) => b.score - a.score || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name, "ko-KR"));
}

export function mapWeeklyRankingMovements(rows: PublicRankingRow[]) {
  return rows.flatMap((row): WeeklyRankingMovement[] => {
    const role = row.relation;
    const change = row.change;
    const rankPosition = Number(row.rank_position);
    const previousRankPosition = row.previous_rank_position === null || row.previous_rank_position === undefined ? null : Number(row.previous_rank_position);
    if ((role !== "PARENT" && role !== "STUDENT" && role !== "TEACHER") || (change !== "UP" && change !== "DOWN" && change !== "NEW" && change !== "UNCHANGED") || !Number.isInteger(rankPosition) || rankPosition < 1 || (previousRankPosition !== null && (!Number.isInteger(previousRankPosition) || previousRankPosition < 1)) || typeof row.institution_id !== "string" || typeof row.snapshot_week !== "string") return [];
    return [{ institutionId: row.institution_id, role, rankPosition, previousRankPosition, change, snapshotWeek: row.snapshot_week }];
  });
}

const rankingReferenceDate = "2026-08-13";

function dayDifference(from: string, to: string) {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((toTime - fromTime) / 86_400_000));
}

function getSourceCompleteness(institution: Institution) {
  const fields = [
    institution.sourceName,
    institution.sourceDate,
    institution.address,
    institution.operatingHours,
    institution.monthlyFee === null ? "" : String(institution.monthlyFee),
    institution.phone,
  ];
  return (fields.filter(Boolean).length / fields.length) * 20;
}

function getFreshness(institution: Institution) {
  const daysOld = dayDifference(institution.sourceDate, rankingReferenceDate);
  if (daysOld <= 14) return 10;
  if (daysOld <= 31) return 8;
  if (daysOld <= 62) return 6;
  return 3;
}

export function getInstitutionRankings(role: InstitutionRankingRole): InstitutionRankingItem[] {
  return institutions
    .map((institution) => {
      const rating = institution.ratings.find((item) => item.role === role);
      if (!rating?.isPublic || rating.score === null) return null;

      const roleScore = (rating.score / 5) * 70;
      const sourceCompleteness = getSourceCompleteness(institution);
      const freshness = getFreshness(institution);

      return {
        institution,
        role,
        roleScore,
        reviewCount: rating.count,
        sourceCompleteness,
        freshness,
        total: roleScore + sourceCompleteness + freshness,
      };
    })
    .filter((item): item is InstitutionRankingItem => item !== null)
    .sort((a, b) => b.total - a.total || b.reviewCount - a.reviewCount || a.institution.name.localeCompare(b.institution.name, "ko-KR"));
}

export const institutionRankingFormula = {
  reviewRating: "선택한 역할의 인증 평점 × 70점",
  sourceCompleteness: "출처·기본 정보 완성도 × 20점",
  freshness: "자료 기준일 최신성 × 10점",
  referenceDate: rankingReferenceDate,
};
