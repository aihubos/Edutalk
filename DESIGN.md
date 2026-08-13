# EDU톡 디자인 시스템

## 1. 분위기와 시그니처

EDU톡은 동탄의 교육기관 정보를 빠르게 판단하게 돕는 모바일 도구다. 토스처럼 한 화면의 핵심 행동이 분명하고, 블라인드처럼 후기와 출처 정보가 촘촘해야 한다. 시그니처는 `큰 질문형 제목 + 즉시 검색 + 근거가 붙은 조밀한 목록`이다. 브랜드의 글래스 효과는 로고에만 사용한다.

- Design Read: 동탄 학부모, 학생, 선생님을 위한 지역 교육 탐색 앱
- 방향: Toss clarity + Blind evidence density
- DESIGN_VARIANCE: 5/10
- MOTION_INTENSITY: 3/10
- VISUAL_DENSITY: 7/10

## 2. 색상

| 토큰 | 값 | 용도 |
|---|---:|---|
| `--color-bg` | `#F7F8FA` | 앱 배경 |
| `--color-surface` | `#FFFFFF` | 카드와 시트 |
| `--color-surface-soft` | `#F2F4F6` | 입력과 보조 영역 |
| `--color-surface-raised` | `#FBFCFD` | 들어올린 카드 배경 |
| `--color-text` | `#191F28` | 기본 글자 |
| `--color-text-secondary` | `#4E5968` | 보조 글자 |
| `--color-text-tertiary` | `#647180` | 메타 정보 |
| `--color-primary` | `#3182F6` | 핵심 CTA와 선택 상태 |
| `--color-primary-strong` | `#1B64DA` | 눌림 상태 |
| `--color-primary-soft` | `#E8F3FF` | 선택 배경 |
| `--color-navy` | `#071A52` | 워드마크와 강조 제목 |
| `--color-border` | `#E5E8EB` | 구분선 |
| `--color-success` | `#087A59` | 확인과 승인 |
| `--color-success-soft` | `#E5F8F2` | 확인 상태 배경 |
| `--color-warning` | `#8A5A00` | 주의와 별점 |
| `--color-warning-soft` | `#FFF8E1` | 주의 상태 배경 |
| `--color-danger` | `#B4232C` | 오류와 삭제 |
| `--color-danger-soft` | `#FFF0F0` | 오류 상태 배경 |
| `--color-on-primary` | `#FFFFFF` | 파란색 위 글자 |
| `--color-ring` | `#3182F6` | 키보드 포커스 |

기본 글자는 흰 배경에서 4.5:1 이상 대비를 유지한다. 핵심 블루는 장식보다 행동과 선택에만 사용한다. 보라색과 글로우는 사용하지 않는다.

## 3. 타이포그래피

글꼴은 `Pretendard Variable`, `SUIT Variable`, `Apple SD Gothic Neo`, 시스템 산세리프 순서다.

| 토큰 | 크기/굵기/행간/자간 | 용도 |
|---|---|---|
| `--font-display` | 32px / 700 / 1.25 / -0.8px | 홈의 핵심 질문 |
| `--font-title-1` | 26px / 700 / 1.3 / -0.5px | 화면 제목 |
| `--font-title-2` | 20px / 700 / 1.35 / -0.3px | 섹션 제목 |
| `--font-title-3` | 17px / 650 / 1.4 / -0.15px | 카드 제목 |
| `--font-body` | 16px / 400 / 1.55 / -0.05px | 본문 |
| `--font-body-small` | 14px / 400 / 1.5 / 0 | 보조 본문 |
| `--font-caption` | 12px / 500 / 1.45 / 0 | 출처와 상태 |

## 4. 간격

4px 단위를 사용한다.

- `--space-1: 4px`
- `--space-2: 8px`
- `--space-3: 12px`
- `--space-4: 16px`
- `--space-5: 20px`
- `--space-6: 24px`
- `--space-8: 32px`
- `--space-10: 40px`
- `--space-12: 48px`
- `--space-28: 112px`
- 모바일 좌우 거터: `--space-5`
- 데스크톱 최대 콘텐츠 폭: `1180px`
- 좁은 폼·상태 화면 최대 폭: `672px`
- 반응형 기준: `540px`, `720px`, `768px`, `1024px`
- 터치 영역: 최소 `44px`
- 폼 체크박스: `18px`
- 비활성 투명도: `45%`, 보조 비활성 투명도: `60%`
- 눌림 배율: `.98`

## 5. 컴포넌트

- 기본 버튼: 높이 52px, 좌우 20px, 반경 16px, 굵기 650. hover는 밝기 변화, active는 `scale(.98)`, focus는 3px 링, disabled는 45% 투명도.
- 보조 버튼: 밝은 블루 배경과 핵심 블루 글자. 동일한 상태 규칙.
- 검색 입력: 높이 56px, 회색 배경, 반경 18px, 테두리 없음. focus에서 흰 배경과 링.
- 카드: 흰 배경, 반경 20px, 구분은 색조와 헤어라인으로 해결한다.
- 기관 행: 76px 이상, 왼쪽 유형 아이콘, 가운데 판단 정보, 오른쪽 거리와 저장 버튼. 기관명, 유형, 평점, 후기 수, 태그, 데이터 기준일을 읽는 순서로 둔다.
- 칩: 높이 32px, 반경 16px. 선택 시 파란 배경과 흰 글자, 미선택은 흰 배경과 경계선.
- 하단 내비게이션: 5개 항목, 모바일 고정, 안전영역 포함. 현재 탭만 파란색.
- 바텀시트: 상단 모서리 28px, dim 45%, 드래그 핸들 제공.
- 상태 화면: 로딩은 스켈레톤, 빈 화면은 다음 행동 1개, 오류는 이유와 재시도 버튼을 제공한다.

## 6. 모션

- 빠른 상태 변화: 140ms
- 화면과 시트: 220ms
- easing: `cubic-bezier(.2,.8,.2,1)`
- 애니메이션 속성: transform, opacity, filter만 사용한다.
- `prefers-reduced-motion`에서는 이동을 없애고 즉시 전환한다.

## 7. 깊이

기본 전략은 색조 차이와 헤어라인이다. 그림자는 떠 있는 요소에만 사용한다.

- `--shadow-1: 0 1px 2px rgba(25,31,40,.04), 0 4px 12px rgba(25,31,40,.04)`
- `--shadow-2: 0 8px 24px rgba(25,31,40,.10), 0 2px 8px rgba(25,31,40,.06)`
- `--shadow-nav: 0 -6px 24px rgba(25,31,40,.07)`

## 금지 규칙

- 보라색 그라데이션과 글로우 금지
- 화면마다 다른 반경 금지
- 장식용 이모지 금지
- 세 개짜리 동일 카드 반복 금지
- 가짜 리뷰와 실제 데이터처럼 보이는 수치 금지
- 한 화면에 경쟁하는 핵심 CTA 두 개 금지
