import type { UserRole } from "@/lib/types";

export type PolicyAudienceRole = UserRole;
export type PolicyCategory = "POLICY" | "EVENT" | "PROGRAM";
export type PolicyStatus = "OPEN" | "ONGOING" | "CLOSED";

export interface PolicyItem {
  id: string;
  title: string;
  summary: string;
  audienceRoles: PolicyAudienceRole[];
  category: PolicyCategory;
  organizer: string;
  applicationPeriod: string;
  status: PolicyStatus;
  region: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceDate: string;
  isSynthetic: true;
}

export const policyItems: PolicyItem[] = [
  {
    id: "moe-free-education-care-2026",
    title: "2026년 4~5세 무상교육·보육 확대",
    summary:
      "2026년부터 유아 무상교육·보육 지원 대상을 4~5세까지 넓히는 교육부 정책입니다. 유치원·어린이집 선택 전 비용 부담을 먼저 확인할 수 있게 요약했습니다.",
    audienceRoles: ["PARENT"],
    category: "POLICY",
    organizer: "교육부",
    applicationPeriod: "2026년 3월부터 별도 신청 없이 지원",
    status: "ONGOING",
    region: "전국",
    sourceUrl: "https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=105471&lev=0&m=020",
    sourceLabel: "교육부 보도자료",
    sourceDate: "2026-03-03",
    isSynthetic: true,
  },
  {
    id: "moe-grade3-after-school-voucher-2026",
    title: "초3 방과후 프로그램 이용권",
    summary:
      "2026년 새학기 교육정보 중 초등 3학년 방과후 프로그램 이용권 내용을 학부모 관점으로 정리했습니다. 방과후 선택 전 지원 대상과 활용 가능성을 확인하는 항목입니다.",
    audienceRoles: ["PARENT", "STUDENT"],
    category: "PROGRAM",
    organizer: "교육부",
    applicationPeriod: "2026년 초3 학생 대상 학교별 안내",
    status: "ONGOING",
    region: "전국",
    sourceUrl:
      "https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=340&boardSeq=105596&lev=0&m=0202&opType=N&page=6&s=moe",
    sourceLabel: "교육부 홍보자료",
    sourceDate: "2026-03-12",
    isSynthetic: true,
  },
  {
    id: "goe-parent-policy-monitor-2026",
    title: "2026 학부모정책 모니터단",
    summary:
      "경기교육 정책에 학부모 의견을 전달하는 모니터단 안내입니다. 학부모가 정책 개선 의견을 내고 참여 기록을 관리할 수 있는 항목으로 정리했습니다.",
    audienceRoles: ["PARENT"],
    category: "PROGRAM",
    organizer: "경기도교육청",
    applicationPeriod: "2026-04-01~2026-04-27",
    status: "CLOSED",
    region: "경기",
    sourceUrl: "https://www.goe.go.kr/goe/na/ntt/selectNttInfo.do?bbsId=2638&mi=11110&nttSn=2345341",
    sourceLabel: "경기도교육청 학부모교육참여",
    sourceDate: "2026-04-02",
    isSynthetic: true,
  },
  {
    id: "moe-school-record-support-portal",
    title: "학교생활기록부 종합지원포털",
    summary:
      "학교생활기록부 기재요령, 도움자료, 설명영상, Q&A를 제공하는 공식 지원포털입니다. 학생·학부모는 기록 이해, 선생님은 기재 기준 확인에 활용할 수 있습니다.",
    audienceRoles: ["PARENT", "STUDENT", "TEACHER"],
    category: "POLICY",
    organizer: "교육부",
    applicationPeriod: "상시 이용",
    status: "ONGOING",
    region: "전국",
    sourceUrl: "https://star.moe.go.kr/web/contents/m50100.do",
    sourceLabel: "학교생활기록부 종합지원포털",
    sourceDate: "상시",
    isSynthetic: true,
  },
  {
    id: "goe-parent-support-center-guide",
    title: "경기학부모지원센터 정책·프로그램 안내",
    summary:
      "경기도교육청 공식 누리집에서 학부모 교육참여, 정책 안내, 학부모 대상 프로그램을 확인하도록 연결하는 큐레이션 항목입니다.",
    audienceRoles: ["PARENT", "TEACHER"],
    category: "PROGRAM",
    organizer: "경기도교육청",
    applicationPeriod: "프로그램별 상이",
    status: "ONGOING",
    region: "경기",
    sourceUrl: "https://www.goe.go.kr",
    sourceLabel: "경기도교육청 공식 누리집",
    sourceDate: "상시",
    isSynthetic: true,
  },
  {
    id: "hwaseong-dongtan-education-events-hub",
    title: "화성·동탄 교육 행사 연결대기",
    summary:
      "화성·동탄 지역 학생·학부모 행사 정보를 EDU톡 안에서 모아보기 위한 자리입니다. 현재는 공식 기관 원문 연결 전 샘플 카드로만 노출합니다.",
    audienceRoles: ["PARENT", "STUDENT", "TEACHER"],
    category: "EVENT",
    organizer: "화성·동탄 공식 기관",
    applicationPeriod: "행사별 상이",
    status: "CLOSED",
    region: "화성·동탄",
    sourceUrl: "https://www.hscity.go.kr",
    sourceLabel: "화성시 공식 누리집",
    sourceDate: "연결대기",
    isSynthetic: true,
  },
];
