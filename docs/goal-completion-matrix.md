# 목표 완료 매트릭스

기준: 원본 기획서의 18.1 필수 포함 항목과 19 공개 출시 승인 기준. 분류는 기능 코드·문서가 존재하는지와 외부 연결·운영 실행이 끝났는지를 나눈 것이다. 이 문서는 공개 상용 출시 승인 문서가 아니다.

| 기획 항목 | 분류 | 현재 근거 | 아직 필요한 일 |
| --- | --- | --- | --- |
| 모바일 우선 PWA, 두 홈 경로, 공개 탐색·비교·순위 화면 | 내부 구현 및 로컬 검증 완료 | `app/page.tsx`의 교육자 일터 기본 진입·신중한 만족도 안내와 역할 프로필 기반 demo 추천·추천 이유, `components/institution-coordinate-map.tsx`의 좌표 기반 위치 도식(좌표 없는 기관은 목록 유지), `app/compare/page.tsx`, `app/rankings/page.tsx`의 권역·기관 유형 필터·상세 링크·두 회차 스냅샷 뒤 변동 표시, `components/app-shell.tsx`의 설치 버튼·iOS/기타 브라우저 안내, `public/manifest.webmanifest` | 실제 공개 데이터와 배포 환경에서 다시 확인 |
| 최초 연령·약관별 버전 증적·역할·지역 온보딩, 14세 미만 보호자 전환 | 내부 구현 및 로컬 검증 완료 | `app/onboarding/page.tsx`, `app/api/onboarding/route.ts`, migration의 `user_consents`, `docs/decisions/003-role-age-student-link-and-rls.md` | 정식 동의 문구·법률 검토와 실제 계정 적용 |
| Supabase SSR 계정·세션·OAuth 화면 | 외부 연결 전 | `lib/supabase/*`, `app/auth/callback/route.ts`, `proxy.ts`, `docs/decisions/001-supabase-ssr-oauth-boundary.md` | 실제 Supabase 프로젝트·환경변수·마이그레이션 적용 |
| 네이버·카카오·구글 실제 로그인 | 외부 연결 전 | `app/login/page.tsx`, `app/my/page.tsx`, `README.md` | 각 공급자 설정·검증. 네이버 OIDC도 미연결 |
| 학생·성적·과목 점수·성장 기록, AI 일지·생기부 초안 | 내부 구현 및 로컬 검증 완료 | `app/student-records/page.tsx`, `app/student-records/[id]/page.tsx`, `app/teacher-log/page.tsx`, `app/school-record/page.tsx`, `app/api/students/route.ts`, `app/api/ai/drafts/route.ts` | 실제 계정·학생 연결과 운영 데이터 적용 |
| 교사 직접 등록, 12자리·30분·1회용 보호자/학생 연결, 자녀 별칭 1:1 매핑, 메시지 | 내부 구현 및 로컬 검증 완료 | `app/student-records/page.tsx`, `app/api/student-links/route.ts`, `app/messages/page.tsx`의 확정 JOURNAL 최근 5개 선택·미리보기·보호자 공유 확인과 `sharedAiDraftId` 전송, `app/api/messages/route.ts`, migration의 학생 연결·소통 함수 | Supabase 적용·실계정 권한·Storage 연결 |
| 기관 탐색·상세·canonical 공개 기관 경계, 비용·셔틀·모집·프로그램·변경 이력, 생활권·법정동·행정동·주거권·출발지 거리, 필드별 신뢰등급·외부 원문 링크 | 내부 구현 및 로컬 검증 완료 | `app/api/institutions/route.ts`, `lib/canonical-institutions.ts`, `app/institutions/[id]/page.tsx`의 demo hero 뒤 신뢰 카드, `components/external-review-sources.tsx`, `components/server-institution-detail-manager.tsx`의 HTTPS 원문 링크 관리 | 실제 canonical 기관·상세 원자료·공식 경계 적재와 공개 승인, 외부 계약·원문 확인 운영 |
| 실제 동탄 기관 데이터 95% 이상, 출처·기준일 검증 | 외부 연결 전 | `data/etl/README.md`, `lib/institution-etl.ts`, `pnpm data:sync:dry-run` 안내 | 공공 API 승인·키·실제 동기화·95% 충족 증빙 |
| 광고 없는 기관·일터·튜터 랭킹, 역할 분리, 교사 후기 3건 | 내부 구현 및 로컬 검증 완료 | `app/rankings/page.tsx`의 권역·기관 유형 필터·상세 링크, ADMIN 전용 주간 순위 확정 코드와 `lib/ranking-data.ts`의 서울 기준 월요일 주차·같은 주차 덮어쓰기·두 회차 뒤 변동 계산 | 실제 Supabase 적용, ADMIN 역할 배정, 승인 후기와 canonical 공개 기관·주간 스냅샷 운영 확인 |
| 관계 인증 기관 후기, 익명 교육자 후기, 학생 14개 구조화 항목, 작성자 내리기·열람자 개인 숨김 | 내부 구현 및 로컬 검증 완료 | `app/review/page.tsx`, `lib/review-server.ts`, `app/api/reviews/route.ts`, `app/api/review-preferences/route.ts`, `components/review-access-panel.tsx`의 로그인 학부모 승인 후기 장점 2건·180자 베타 미리보기 | 실제 심사 인력·정책·법률 검토 |
| 튜터 프로필·구인·통합 키워드 검색·12자리·7일·1회 수업 확인 코드, 0.5점 후기·승인 전 비공개 사진·실제 응답률 | 내부 구현 및 로컬 검증 완료 | `app/tutors/page.tsx`의 표시명·과목·소개·활동 동네와 구인글 제목·본문·과목·지역 통합 검색, `app/api/tutors/route.ts`, `lib/tutor-server.ts`, migration의 `tutor_lesson_invites`·후기 승인 함수 | 실제 튜터 심사·Storage 버킷·보관 정책·실계정 문의 응답 운영 |
| 신뢰센터: 인증·정정·신고, 임시숨김·복원·운영자 처리와 공개 안전 처리 타임라인 | 내부 구현 및 로컬 검증 완료 | `app/trust-center/page.tsx`, `app/api/trust-center/route.ts`, `app/api/admin/operations/route.ts`, `components/server-admin-console.tsx`, `components/institution-public-handling-timeline.tsx`, migration의 공개 타임라인 함수 | 실제 운영 역할 배정·처리 SLA 실행 |
| 비공개 증빙 Storage, 5MB 제한, 운영자 5분 링크 | 외부 연결 전 | `app/api/tutors/review-media/route.ts`, `app/api/admin/verification-documents/route.ts`, migration의 Storage 정책 | 실제 Storage 버킷·정책·운영자 계정 연결 |
| 기관 멤버 승인·기관 답변·공개 수정 이력·역할 충돌 별도 검토 | 내부 구현 및 로컬 검증 완료 | `app/institution-manager/page.tsx`, `app/api/institution-manager/route.ts`, `components/canonical-institution-actions.tsx`, migration의 기관 멤버·답변·revision·`CONFLICT_REVIEW` 함수 | 실제 기관 관계자 검증·운영 실행 |
| 알림 읽음·종류별 수신 설정, 관심 기관·저장 검색 알림, 고객센터·튜터 답변, ADMIN 탈퇴 처리 | 내부 구현 및 로컬 검증 완료 | `app/activity/page.tsx`, `app/api/notification-preferences/route.ts`, `app/support/page.tsx`, `app/api/support/admin/route.ts`, `app/api/admin/account-deletions/route.ts` | 실제 운영자·서비스 키·보관 정책·이메일/푸시 발송 연결 |
| 추천 프로필, 저장 검색, 메시지 상대방 알림, 정책·행사 운영 등록 | 내부 구현 및 로컬 검증 완료 | `app/my/page.tsx`, `lib/app-context.tsx`의 계정·체험 추천 프로필 수정, `app/api/saved-searches/route.ts`, `components/saved-search-panel.tsx`의 canonical 이름·지역·유형·이름순/최근 확인일순 저장, `components/server-public-information-manager.tsx`, migration의 메시지 알림 트리거 | 실제 계정·운영 데이터에서 저장·수신 확인 |
| AI 생성 전 담당 학생 확인, 복수 담당교사 대화방 | 내부 구현 및 로컬 검증 완료 | `lib/ai-usage-server.ts`, `app/api/ai/draft/route.ts`, migration의 학생 연결 함수 | 실제 교사·보호자 계정으로 권한 흐름 확인 |
| 증빙 심사 후 30일 보관 만료·정리 API | 내부 구현 및 로컬 검증 완료 | `app/api/admin/verification-retention/route.ts`, migration의 `retention_until`·보관 트리거 | 실제 Storage와 운영 보관정책 적용·정리 일정 실행 |
| Stripe Checkout·Portal·웹훅→AI 무제한 상태 | 외부 연결 전 | `app/subscription/page.tsx`, `app/api/billing/*`, `lib/stripe-billing.ts` | Stripe 계정·상품/가격·키·웹훅 endpoint·Supabase 적용 |
| 관리자 MFA | 운영 실행 전 | `docs/operations-runbook.md`, `docs/release-checklist.md` | 실제 인증 공급자에서 MFA 정책·운영자 계정 적용 및 확인 |
| health/deep health, 오류·지연 관찰, feature flag | 운영 실행 전 | `docs/release-checklist.md`, `docs/rollback-plan.md`, `lib/feature-flags.ts` | 실제 배포 환경·모니터링·중단 기준 값 설정 |
| DB·Storage 백업, 복원 리허설 | 운영 실행 전 | `docs/backup-recovery.md` | 제공자 백업 설정과 staging 복원 리허설 기록 |
| 운영 매뉴얼·SLA·임시숨김/복원·ETL 절차 | 운영 실행 전 | `docs/operations-runbook.md`, `docs/release-checklist.md` | 실제 운영자 배정·교육·처리 기록 |
| 법률 검토, 정식 정책·고객센터 정보 | 운영 실행 전 | `app/legal/terms/page.tsx`, `app/legal/privacy/page.tsx`, `app/legal/community/page.tsx`, `README.md` | 전문 법률 검토·정식 승인 문서·실제 연락처 확정 |
| 2주 비공개 베타 | 운영 실행 전 | `docs/release-checklist.md`, `docs/production-integration.md` | 실제 대상·기간·결과·개선 기록 |

## 19. 공개 출시 승인 기준

다음은 모두 **미완료**다. 하나라도 빠지면 공개 상용 출시를 승인하지 않는다.

- [ ] 실제 Supabase 프로젝트·마이그레이션·Auth/OAuth·비공개 Storage가 적용됐다.
- [ ] 네이버·카카오·구글 로그인은 실제 공급자 설정과 검증을 마쳤다.
- [ ] 실제 동탄 기관 데이터의 95% 이상 범위와 출처·기준일 검증 근거가 있다.
- [ ] 관리자 MFA, 운영자 역할, 증빙 접근 절차와 처리 담당자가 실제로 설정됐다.
- [ ] health/deep health, 오류·지연 관찰, feature flag, 백업·복원 리허설이 실제 배포 환경에서 기록됐다.
- [ ] Stripe·OpenAI·공공 API 장애 시 사용자 안내와 중단 절차를 실제로 실행할 수 있다.
- [ ] 법률 검토와 정식 정책·고객센터 정보가 확정됐다.
- [ ] 최소 2주 비공개 베타 결과와 개선 조치가 기록됐다.

세부 실행 절차는 [운영 매뉴얼](./operations-runbook.md), [백업·복원 체크리스트](./backup-recovery.md), [단계적 출시 체크리스트](./release-checklist.md), [되돌리기 계획](./rollback-plan.md)을 따른다.
