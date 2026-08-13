import type { InstitutionType, ServiceZone, UserRole } from "@/lib/types";

export const roleLabels: Record<UserRole, string> = {
  PARENT: "학부모",
  STUDENT: "학생",
  TEACHER: "선생님",
};

export const zoneLabels: Record<ServiceZone, string> = {
  ALL: "동탄 전체",
  DONGTAN_1: "동탄1",
  DONGTAN_2: "동탄2",
};

export const institutionTypeLabels: Record<InstitutionType, string> = {
  CHILDCARE: "어린이집",
  KINDERGARTEN: "유치원",
  ACADEMY: "학원",
  TUTORING: "교습소",
};

export const roleHomeCopy: Record<UserRole, { eyebrow: string; title: string; helper: string }> = {
  PARENT: {
    eyebrow: "아이에게 꼭 맞는 교육기관",
    title: "우리 아이에게 맞는 곳을\n찾아보세요",
    helper: "연령, 예산, 통학거리를 기준으로 비교해요",
  },
  STUDENT: {
    eyebrow: "내 공부에 꼭 맞는 수업",
    title: "나에게 맞는 학원을\n쉽게 찾아보세요",
    helper: "학년, 과목, 시간대를 기준으로 비교해요",
  },
  TEACHER: {
    eyebrow: "직접 확인하는 교육 일터",
    title: "오래 일하고 싶은 곳을\n찾아보세요",
    helper: "업무량, 조직문화, 성장 가능성을 확인해요",
  },
};

export const formatDistance = (distanceM: number) =>
  distanceM < 1000 ? `${distanceM}m` : `${(distanceM / 1000).toFixed(1)}km`;

export const formatFee = (fee: number | null) =>
  fee === null ? "비용 확인 필요" : `월 ${Math.round(fee / 10000)}만원`;
