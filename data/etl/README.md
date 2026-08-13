# 공공 교육기관 ETL 기반

기본 실행은 고정 fixture를 읽고 JSON 보고서만 표준 출력으로 보냅니다. 파일과 DB에는 쓰지 않습니다.

```bash
pnpm data:sync:dry-run
```

출력에는 공급자별 `recordsSeen`, `normalized`, `duplicates`, `outOfZone`, `errors`, `source`, `started`, `finished`가 들어갑니다.

실제 공급자 JSON은 URL을 코드에 추측해 넣지 않습니다. 운영 전 각 공급자의 승인된 URL과 키를 아래처럼 모두 설정하고, 계약된 JSON을 `RawSourceRecord[]` 공통 형식으로 연결해야 합니다.

```text
CHILDCARE_API_URL=
CHILDCARE_API_KEY=
KINDERGARTEN_API_URL=
KINDERGARTEN_API_KEY=
NEIS_API_URL=
NEIS_API_KEY=
```

`--live`는 위 환경 변수가 모두 있을 때만 각 URL에서 GET JSON을 읽고 JSON 보고서만 출력합니다. DB·Storage·출력 파일에는 쓰지 않습니다.

실제 canonical 적재는 별도 운영 명령인 `--write`에서만 수행합니다. `--write`는 공급자 API를 읽은 뒤 `raw_source_records`, `institutions`, `institution_source_links`, `data_sync_runs`, `data_quality_issues`에 적재합니다. 다음 값이 하나라도 없으면 시작 전에 중단됩니다.

```text
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PUBLIC_INSTITUTION_SYNC_CONFIRM=WRITE_PUBLIC_INSTITUTIONS
```

```bash
PUBLIC_INSTITUTION_SYNC_CONFIRM=WRITE_PUBLIC_INSTITUTIONS pnpm tsx scripts/sync-public-institutions.ts --write
```

공개 주소는 `공급자 + 원본 ID`로 안정 생성합니다. 같은 공급자·원본 ID는 기존 canonical 기관을 갱신하지만, 이름·주소가 같은 다른 후보는 자동 병합하지 않습니다. 이 경우 `data_quality_issues`에 `DUPLICATE_CANDIDATE`로 남겨 운영자가 확인합니다. 서비스 지역 밖 레코드, slug 충돌, 필수값 누락도 품질 큐로 분리합니다.

동탄1·2 분류 규칙은 `lib/institution-etl.ts`의 `dongtanZoneRules`에 모아 두었습니다. 현재 법정동 문자열은 좌표 경계가 없는 파일을 위한 보조 규칙입니다. 동탄(1)·(2) 사업지구에 모두 걸친 반송동·석우동은 좌표 경계가 확정되기 전 자동 공개하지 않고 `OTHER` 품질 큐로 보냅니다. 승인된 서비스 구역 경계와 좌표를 확보한 뒤 좌표 규칙을 추가해야 공개 정확도를 확정할 수 있습니다. 2026-03-01부터 바뀐 `오산동 → 여울동`은 과거 원본 호환을 위한 법정동 별칭으로 주소 정규화 단계에서 함께 처리합니다.

## 수동 다운로드 CSV·JSON 가져오기

승인된 공공 데이터 파일을 내려받은 뒤에만 파일 경로를 직접 지정해 가져옵니다. 기본 실행은 **dry-run**으로, 원본 파일·DB·출력 파일을 변경하지 않고 표준 출력에 보고서만 보냅니다. `data:import:dry-run`은 필수 인자가 있어 실행 예시로 사용합니다.

```bash
pnpm data:import:dry-run -- --file /secure/downloads/childcare.csv --provider CHILDCARE --checked-at 2026-08-13
```

`--file`, `--provider CHILDCARE|KINDERGARTEN|NEIS`, `--checked-at YYYY-MM-DD`는 모두 필수입니다. UTF-8과 CP949(EUC-KR) CSV·TSV, UTF-8 JSON을 지원하며, BOM·큰따옴표·구분자·줄바꿈 포함 필드를 처리합니다. 기관명/학원명/교습소명/유치원명/어린이집명, 주소·도로명주소·소재지도로명주소, 전화, 위도·경도, 관리번호·학원등록번호·유치원코드 등의 한글·영문 헤더를 공통 필드로 읽습니다. 도로명 주소 열이 비어 있으면 채워진 지번 주소 열을 이어서 확인합니다.

NEIS 파일은 `학원교습소구분`이 `학원` 또는 `교습소`인 행만 받아 서로 다른 기관 유형으로 보존합니다. 운영 상태가 `정상` 또는 `개원`인 행만 공개 후보이며, `휴원`·`폐원`·불명 행은 모집 상태와 섞지 않고 별도 운영 상태 이력에 저장한 뒤 공개하지 않고 품질 큐에서 검토합니다. dry-run 보고서는 `classificationSummary`에 실제 공개 후보 수와 유형·상태·생활권별 건수를 함께 보여줍니다. 이 기준은 importer의 내부 준비 규칙일 뿐, 실제 공급자 승인·canonical DB 적재·운영 검토가 끝나기 전에는 공개 운영 데이터가 아닙니다.

화성시 동탄권 주소만 적재 후보로 남깁니다. 동탄1·2가 명확하지 않은 동탄권 행은 `OTHER`로 두고 기존 적재의 품질 큐에 남깁니다. 원본 행 전체와 원본 ID는 보존하며, 중복 후보는 자동 병합하지 않습니다.

실제 DB 적재는 아래 확인값과 Supabase URL·서비스 키가 모두 있을 때 `--write`를 명시해야만 수행합니다. 가져오기 오류가 한 건이라도 있거나 동탄권 후보가 0건이면 일부 데이터만 들어가지 않도록 적재를 시작하지 않습니다.

```bash
PUBLIC_INSTITUTION_SYNC_CONFIRM=WRITE_PUBLIC_INSTITUTIONS pnpm tsx scripts/import-public-institutions.ts --file /secure/downloads/childcare.csv --provider CHILDCARE --checked-at 2026-08-13 --write
```

내려받은 원본 CSV·JSON은 저장소에 넣지 않고, 접근이 제한된 별도 위치에서만 실행합니다.

### 2026-08-13 기준 공식 확보 경로

| 유형 | 공식 경로 | 키 없이 수동 파일 | 운영 메모 |
|---|---|---:|---|
| 유치원 | [유치원알리미 공시자료 다운로드](https://e-childschoolinfo.moe.go.kr/openData.do) | 가능 | 경기도와 최신 공시차수·항목을 선택해 Excel·CSV·JSON으로 내려받고, 화성시·동탄 주소를 후처리합니다. 공시차수와 선택 항목을 원본 메타에 함께 보관합니다. |
| 학원·교습소 | [전국학원및교습소 표준데이터](https://www.data.go.kr/data/15096277/standard.do?recommendDataYn=Y)에서 공식 NEIS 제공 URL로 이동 | 가능 | 경기도교육청 파일을 내려받고 화성시·동탄 주소를 후처리합니다. 포털 수정일이 아닌 실제 내려받은 파일의 기준일을 기록합니다. |
| 어린이집 | [전국어린이집 표준데이터](https://www.data.go.kr/data/15013108/standard.do) | 미확정 | 현재 확정 경로는 서비스키가 필요한 공식 XML OpenAPI입니다. 키 없는 전체 파일 경로를 추측하지 않습니다. |

유치원알리미 파일은 선택한 공시항목에 따라 열이 달라질 수 있습니다. 학원·교습소 파일도 실제 다운로드 시점의 물리 헤더를 먼저 dry-run으로 확인합니다. 다운로드 시 원본 파일명, 다운로드 시각, 기준일, 공식 페이지 URL과 최신 이용조건을 별도 운영 기록으로 남깁니다.

## 오프라인 화면의 범위

PWA의 독립 정적 offline fallback은 네트워크가 끊겼을 때 이미 열어 본 공개 화면을 일부 보여 줍니다. importer와 무관하게 로그인, 파일·DB 적재, 후기, 메시지, 결제는 오프라인 중 서버에 반영되지 않습니다. 연결을 복구한 뒤 다시 실행하거나 제출해야 합니다.
