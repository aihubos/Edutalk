export type CostSource = "PUBLIC" | "INSTITUTION" | "VERIFIED_USE" | "CHECK_NEEDED";

export interface LocalDepthData {
  livingAreas: string[];
  nearbyComplexes: string[];
  commute: { reference: string; walkMinutes: string; transitMinutes: string };
  shuttle: { available: boolean; zones: string[]; stops: string[]; note: string };
  recruiting: { status: "OPEN" | "WAITLIST" | "CLOSED" | "CHECK_NEEDED"; detail: string; lastChecked: string };
  costs: Array<{ label: string; amount: number | null; source: CostSource; verifiedAt: string }>;
  changes: Array<{ date: string; field: string; detail: string; source: CostSource }>;
}

export const costSourceLabels: Record<CostSource, string> = {
  PUBLIC: "공개자료",
  INSTITUTION: "기관 확인",
  VERIFIED_USE: "인증 이용자 확인",
  CHECK_NEEDED: "확인 필요",
};

export const recruitingStatusLabels: Record<LocalDepthData["recruiting"]["status"], string> = {
  OPEN: "모집 표시",
  WAITLIST: "대기 접수 표시",
  CLOSED: "마감 표시",
  CHECK_NEEDED: "기관 확인 필요",
};

export const localDepthByInstitutionId: Record<string, LocalDepthData> = {
  "dongtan-forest-childcare": {
    livingAreas: ["동탄2 산척동", "호수공원 생활권"], nearbyComplexes: ["산척동 주거단지", "동탄호수공원 인근"],
    commute: { reference: "산척동 중심 생활권 기준", walkMinutes: "도보 약 5~10분", transitMinutes: "차량 약 5분" },
    shuttle: { available: false, zones: [], stops: [], note: "통학차량 운영 여부는 표시되지 않았어요. 등·하원 동선을 기관에 확인하세요." },
    recruiting: { status: "WAITLIST", detail: "연령별 대기 접수 가능 표시", lastChecked: "2026-08-01" },
    costs: [
      { label: "보육료", amount: 0, source: "PUBLIC", verifiedAt: "2026-07-31" }, { label: "특별활동비", amount: 78000, source: "PUBLIC", verifiedAt: "2026-07-31" },
      { label: "식비", amount: 64000, source: "PUBLIC", verifiedAt: "2026-07-31" }, { label: "차량비", amount: 0, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" },
    ],
    changes: [{ date: "2026-07-31", field: "비용", detail: "특별활동비·식비 공개 기준일을 갱신했어요.", source: "PUBLIC" }, { date: "2026-07-18", field: "모집", detail: "연령별 대기 접수 표시를 반영했어요.", source: "INSTITUTION" }],
  },
  "dreamtree-kindergarten": {
    livingAreas: ["동탄2 목동", "목동 중심상권 생활권"], nearbyComplexes: ["목동 주거단지", "동탄2 중심 생활권"],
    commute: { reference: "목동 생활권 기준", walkMinutes: "도보 약 8~14분", transitMinutes: "차량 약 6분" },
    shuttle: { available: true, zones: ["목동", "산척동 일부"], stops: ["목동 중심 생활권", "산척동 인근"], note: "정확한 승하차 지점과 추가 차량비는 상담 전 확인하세요." },
    recruiting: { status: "OPEN", detail: "2027학년도 설명회 신청 가능 표시", lastChecked: "2026-08-02" },
    costs: [{ label: "교육비", amount: 265000, source: "PUBLIC", verifiedAt: "2026-07-15" }, { label: "방과후 과정", amount: 120000, source: "PUBLIC", verifiedAt: "2026-07-15" }, { label: "차량비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-02" }],
    changes: [{ date: "2026-08-02", field: "셔틀", detail: "산척동 일부 운행 표시를 추가했어요.", source: "INSTITUTION" }, { date: "2026-07-15", field: "교육비", detail: "유치원알리미 기준일을 반영했어요.", source: "PUBLIC" }],
  },
  "future-math-academy": {
    livingAreas: ["동탄2 청계동", "시범단지 생활권"], nearbyComplexes: ["청계동 시범단지", "동탄역 접근 생활권"],
    commute: { reference: "청계동 시범단지 기준", walkMinutes: "도보 약 10~16분", transitMinutes: "차량 약 7분" },
    shuttle: { available: true, zones: ["청계동", "영천동 일부"], stops: ["청계동 시범단지", "영천동 인근"], note: "학년·시간대별 노선은 달라질 수 있어 상담 전 확인이 필요해요." },
    recruiting: { status: "OPEN", detail: "초등 진단 테스트 신청 가능 표시", lastChecked: "2026-08-01" },
    costs: [{ label: "수강료", amount: 280000, source: "PUBLIC", verifiedAt: "2026-08-01" }, { label: "교재비", amount: 30000, source: "INSTITUTION", verifiedAt: "2026-07-29" }, { label: "차량비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }, { label: "특강비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }],
    changes: [{ date: "2026-08-01", field: "수강료", detail: "공개 수강료 기준일을 갱신했어요.", source: "PUBLIC" }, { date: "2026-07-29", field: "교재비", detail: "교재비 별도 안내 표시를 추가했어요.", source: "INSTITUTION" }],
  },
  "smart-english-tutoring": {
    livingAreas: ["동탄2 영천동", "영천동 주거 생활권"], nearbyComplexes: ["영천동 주거단지", "청계동 인접 생활권"],
    commute: { reference: "영천동 중심 생활권 기준", walkMinutes: "도보 약 12~18분", transitMinutes: "차량 약 8분" },
    shuttle: { available: false, zones: [], stops: [], note: "차량 운행 정보가 확인되지 않았어요. 도보 동선과 보호자 이동을 먼저 확인하세요." },
    recruiting: { status: "CHECK_NEEDED", detail: "상담 가능 표시만 있어 반별 정원은 확인이 필요해요.", lastChecked: "2026-08-01" },
    costs: [{ label: "수강료", amount: 220000, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }, { label: "교재비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }, { label: "특강비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }],
    changes: [{ date: "2026-08-01", field: "비용", detail: "비용 출처가 확인 전 상태로 표시되었어요.", source: "CHECK_NEEDED" }, { date: "2026-07-26", field: "모집", detail: "학습 상담 안내 표시를 반영했어요.", source: "INSTITUTION" }],
  },
  "central-art-academy": {
    livingAreas: ["동탄1 반송동", "중심상가 생활권"], nearbyComplexes: ["반송동 주거단지", "동탄1 중심상권 인근"],
    commute: { reference: "반송동 중심 생활권 기준", walkMinutes: "도보 약 15~22분", transitMinutes: "차량 약 9분" },
    shuttle: { available: false, zones: [], stops: [], note: "통학차량은 운영 표시가 없어요. 수업 종료 시간과 귀가 동선을 확인하세요." },
    recruiting: { status: "OPEN", detail: "여름 특강 신청 가능 표시", lastChecked: "2026-08-01" },
    costs: [{ label: "수강료", amount: 195000, source: "INSTITUTION", verifiedAt: "2026-08-01" }, { label: "재료비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }, { label: "포트폴리오 비용", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }],
    changes: [{ date: "2026-08-01", field: "수강료", detail: "기관 제공 비용 기준일을 갱신했어요.", source: "INSTITUTION" }, { date: "2026-07-28", field: "과정", detail: "포트폴리오 설명회 상태를 반영했어요.", source: "INSTITUTION" }],
  },
  "metis-science-academy": {
    livingAreas: ["동탄1 능동", "지성로 생활권"], nearbyComplexes: ["능동 주거단지", "반송동 인접 생활권"],
    commute: { reference: "능동 생활권 기준", walkMinutes: "도보 약 20~28분", transitMinutes: "차량 약 10분" },
    shuttle: { available: true, zones: ["능동", "반송동 일부"], stops: ["능동 주거단지", "반송동 인근"], note: "중·고등 시간대에 따라 노선이 달라질 수 있어요." },
    recruiting: { status: "WAITLIST", detail: "반별 잔여석은 확인 필요, 대기 상담 표시", lastChecked: "2026-08-01" },
    costs: [{ label: "수강료", amount: 320000, source: "PUBLIC", verifiedAt: "2026-08-01" }, { label: "실험 재료비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }, { label: "보강·특강비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }, { label: "차량비", amount: null, source: "CHECK_NEEDED", verifiedAt: "2026-08-01" }],
    changes: [{ date: "2026-08-01", field: "수강료", detail: "공개 수강료 기준일을 갱신했어요.", source: "PUBLIC" }, { date: "2026-07-22", field: "셔틀", detail: "반송동 일부 운행 표시를 반영했어요.", source: "INSTITUTION" }],
  },
};
