export interface InstitutionOfficialReply {
  institutionId: string;
  topic: string;
  body: string;
  respondedAt: string;
  isSynthetic: true;
}

/** 실제 기관의 답변이 아닌, 공개 답변 흐름을 보여주기 위한 체험 데이터입니다. */
export const institutionOfficialReplies: InstitutionOfficialReply[] = [
  {
    institutionId: "dongtan-forest-childcare",
    topic: "연장보육 안내",
    body: "체험 화면의 예시 답변입니다. 연장보육 운영 시간과 신청 절차는 학기별로 달라질 수 있어, 실제 이용 전 기관에 다시 확인해 주세요.",
    respondedAt: "2026-08-04",
    isSynthetic: true,
  },
  {
    institutionId: "future-math-academy",
    topic: "오답 피드백 방식",
    body: "체험 화면의 예시 답변입니다. 수업 후 오답 확인과 보충 안내 방식은 반별 진도와 학습 상황에 따라 달라질 수 있습니다.",
    respondedAt: "2026-08-06",
    isSynthetic: true,
  },
  {
    institutionId: "central-art-academy",
    topic: "포트폴리오 수업 구성",
    body: "체험 화면의 예시 답변입니다. 작품 활동과 포트폴리오 구성은 학생의 연령과 수업 목표에 따라 조정될 수 있습니다.",
    respondedAt: "2026-08-08",
    isSynthetic: true,
  },
];

export const getInstitutionOfficialReplies = (institutionId: string) =>
  institutionOfficialReplies.filter((reply) => reply.institutionId === institutionId);
