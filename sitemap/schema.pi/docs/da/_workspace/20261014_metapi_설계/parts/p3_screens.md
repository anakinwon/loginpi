## 3. 메뉴·화면 설계

### 3-1. 메뉴 체계 (라우트)

| 모듈 | 메뉴 | 라우트 `/admin/meta/…` | 프로그램 | 단계 | 권한 |
|---|---|---|---|---|---|
| M1 | 표준단어 | `std/words` | P01 | 1 | admin |
| M1 | 표준도메인 | `std/domains` | P02 | 1 | admin |
| M1 | 표준용어 | `std/terms` | P03 | 1 | admin |
| M1 | 표준코드(그룹·값) | `std/codes`, `std/codes/[groupId]` | P04 | 1 | admin |
| M1·M8 | 엑셀 업로드·다운로드 | 위 4화면의 도구 막대 버튼 → `std/import` 모달 | P06·P07 | 1 | admin |
| M2 | 테이블 설계 | `model/tables`, `model/tables/[tblId]` | P08·P09 | 1 | admin |
| M2 | DDL 생성 | `model/ddl` | P10 | 1 | master |
| M3·M9 | 대상 시스템·DB | `db/systems`(M9 메뉴도 같은 화면) | P12 | 1 | master |
| M3 | 카탈로그 수집 | `db/collect` | P13 | 1 | master |
| M3 | DB 변경 이력 | `db/changes` | P15 | 1 | admin |
| M3 | 현행화 비교 | `db/drift` | P16 | 1 | admin |
| M4 | 명명 검사 실행·결과 | `check/run` | P17·P18 | 1 | admin |
| M4 | 준수율 | `check/rate` | P19 | 1 | admin |
| M5 | 용어·도메인 영향 | `impact` | P23 | 1 | admin |
| M6 | 카탈로그 검색 | `search` | P25 | 1 | admin |
| M7 | 변경요청·승인 | `approvals`, `approvals/[apvId]` | P20 | 1 | admin(승인은 master) |
| M7 | 변경 이력(Audit) | `audit` | P21 | 1 | admin |
| M9 | 사용자·권한 | (기존 `sys_user` 관리 화면 재사용) | P30 | 1 | master |
| M11 | 느린 쿼리 / 테이블·인덱스 통계 / 용량 추이 / 실행계획 | `perf/{queries,tables,size,plan}` | P36~P39 | 2 | master |
| M12 | AI 분석 요청 / 권고·승인 / 효과 측정 | `tune/{request,recommendations,results}` | P40~P42 | 2 | master |
| 3단계(M10 대시보드 포함) | 동의어·금칙어 / 다중 표준셋 / 모델 버전·ERD·DA# / 수집 스케줄 / 표준 추천 / 프로그램 영향 / 용어집·태그·COMMENT / 조회 API / 설정 / M10 대시보드 / 활동·락 / index_advisor / 알림 | (예약) | P05·P11·P14·P22·P24·P26~P29·P31~P34·P43~P45 | 3 | — |

좌측 내비게이션 : 표준 › 모델 › DB 구조 › 검증 › 영향·검색 › 승인·이력 › (2단계) 성능 › 튜닝. 모바일은 햄버거 + 상단 탭. 화면은 모두 **페이지 단위 조회 + 반응형 페이지네이션**(`Pagination` 컴포넌트 재사용), 상세·통계 패널은 `LazySection`(뷰포트 진입 직전 fetch).

### 3-2. 공통 레이아웃·상태 흐름

- **목록 화면 공통** : 상단 검색(2글자 이상 → `pg_trgm`)·필터 → 표(정렬 가능) → 페이지네이션. 행 클릭 → 우측 드로어(모바일 전체 화면) 상세. 쓰기 버튼은 `apv_sts_cd` 가 DRAFT·REJECTED 일 때만.
- **상태 머신(표준단어·도메인·용어·모델 공통, OpenMetadata GlossaryTerm 참고)** : `DRAFT` → (검토 요청) `PENDING` → (DA 승인) `APPROVED` / (반려) `REJECTED` → (수정) `DRAFT`. 폐기는 상태가 아니라 `use_yn='N'`(코드값·도메인) 또는 `del_yn`(논리삭제) 으로 처리한다. 표준코드(`cod_group`·`cod_val`)는 상태 컬럼 없이 `use_yn`+유효종료일자만 두고 변경은 `approval_queue` 행으로 승인 경유. OpenMetadata 의 "검토자 없으면 자동 승인"은 **채택하지 않는다**(DA 1인 체계에서 자기 승인 금지 → 항상 승인 단계). 상태값 4종은 승계 `approval_queue.apv_status`·`std_*.apv_status` 와 신규 `mdl_tbl.apv_sts_cd`·`metric_impv_rcmnd.rcmnd_sts_cd` 에 같은 코드(`rcmnd_sts_cd` 는 4값 + 적용 생애주기 APPLIED, 승계 컬럼명 `apv_status`→`apv_sts_cd` 개명은 이관 후속).
- **로딩·오류** : 비동기 조회는 렌더를 막지 않음(aria-busy), 오류는 `readApi`/`ApiErrorBody` 패턴 + 재시도 버튼. Pi Browser 에서 `piFetch` 만 사용.
- **다국어** : 화면 라벨은 next-intl `meta.*` 네임스페이스(ko 정본·en), 코드값명은 `cod_val.cd_val_nm`(한글)·`cd_val_eng_nm`.

### 3-3. 1단계 화면 상세

#### P01~P03 표준단어·도메인·용어 (기존 이식)
- 레이아웃 : 검색(논리명·물리명·전체명 trgm) · 승인 상태 필터 · 표(논리명/물리명/도메인/상태/변경일시) · 드로어(필드 편집, 유사어 경고 : 등록 전 `pg_trgm` 유사 단어 목록 표시 — 데이터표준규칙 §1-1).
- 용어 화면은 "단어 조합기" : 단어 칩을 순서대로 고르고 마지막에 도메인 → 물리명 자동 조립(`단어1_단어n_도메인`), 미등재 단어 입력 시 단어 신청 모달(P20 연결).
- 상태 흐름 : 저장 = DRAFT 생성 + `approval_queue` 행, 승인은 P20.

#### P04 표준코드
- 좌 : 코드그룹 목록(그룹코드·명·연결 용어·값 수) / 우 : 선택 그룹의 값 그리드(코드값·한글명·영문명·정렬순서·사용여부·유효기간). 값 폐기 = 유효종료일자 + 사용여부 N(삭제 금지, 04 §6.1).
- 그룹은 반드시 표준용어(`_cd` 종결)에 연결(`cod_group.term_id`), 미연결 그룹은 경고.

#### P06·P07 엑셀 업로드·다운로드
- 다운로드 : 현재 필터 결과 또는 빈 템플릿(헤더 = 화면 컬럼). 업로드 3단계 모달 : ① 파일 선택·헤더 검증 → ② **행별 검증 미리보기**(오류 행 빨강 + 사유, 경고 노랑, 정상 초록, 상단 집계) → ③ 반영(정상 행만 DRAFT 로 생성 + 승인 요청 1건 묶음). OpenMetadata CSV import(Preview 1단계)보다 행별 사유를 더 둔다.

#### P08·P09 테이블 설계·DDL 파싱
- 테이블 목록(시스템·DB 필터) → 상세 : 메타(논리명·물리명·주제영역·설명·상태) + 컬럼 그리드(순번·논리명·물리명(용어 선택)·도메인·타입·길이·NULL·기본값·PK순번·참조 테이블/컬럼·설명). 물리명은 **표준용어 선택만 가능**(직접 입력 불가), 도메인은 용어에서 자동.
- "DDL 가져오기" 버튼 : `sql/*.sql` 텍스트 붙여넣기 → `parseDdl` → 미리보기(인식 못 한 구문 목록) → 모델 생성(DRAFT).

#### P10 DDL 생성
- 테이블 선택 → `genDdl` 결과(README §6 템플릿) 미리보기 + `checkDdl` 자체 검증 결과 → 복사·다운로드(`NNN_<설명>.sql` 파일명 제안). 앱은 DB 에 실행하지 않는다(적용은 마스터가 마이그레이션 창에서).

#### P12 대상 시스템·DB
- 시스템 표(사이트명 + `sites.json` 에서 읽는 wave·status, DB 에는 저장하지 않음) + DB 표(환경 dev/stg/prod·스키마·env 키 이름·마지막 수집 시점·결과(`mdl_db.last_clct_dtm`·`last_clct_rslt_cd`)·연결 테스트 결과(`cntn_test_dtm`·`cntn_test_rslt_cd`)). 연결 테스트 = 서버가 env 키로 접속해 `SELECT 1` + `pg_catalog` 읽기 권한 확인. 접속 문자열은 화면에 절대 표시하지 않음.

#### P13 카탈로그 수집
- DB 선택 → "수집 실행" → 진행 표시(테이블 수·컬럼 수·소요) → 결과 요약 + 직전 시점 대비 변경 건수(P15 링크). cron 실행 이력도 같은 표.

#### P15 DB 변경 이력
- DB·기간 필터 → 변경 행(시점 쌍·객체 유형·객체명·변경 유형 ADD/DROP/ALTER·필드·old→new). OpenMetadata Version History 의 fieldsAdded/Updated/Deleted 표현을 따른다(§1).

#### P16 현행화 비교
- DB 선택 → 3분류 탭 : 모델에만(DDL 미적용) / DB에만(모델 미등록 — "모델로 가져오기" 버튼 → P09 경로) / 불일치(타입·NULL·기본값·PK 순번 — 필드별 좌우 비교). GAP 0 이면 녹색 배지.

#### P17·P18 명명 검사 실행·결과
- DB 또는 전체 선택 → "검사 실행"(최신 스냅샷에 `checkCatalog`) → 위반 표(규칙 R1~R10·수준 P1~P3·객체·메시지·grandfathered 표시). 규칙별 설명 패널. grandfathered 객체는 숨기지 않고 "유지" 배지(`데이터표준규칙.md` §10 #22).

#### P19 준수율
- 시스템·테이블·규칙별 % 카드 + 추이 스파크라인(수집 시점별). 산식 : 규칙 일치 객체 ÷ 전체 객체(grandfathered 는 분모 포함·분자 제외, 별도 % 병기).

#### P20 변경요청·승인 (확장)
- 큐 목록(대상 유형 필터 : 단어·도메인·용어·코드·모델·(2단계) 튜닝 권고) → 상세 : 변경 전/후 diff(JSON → 필드 표), 요청자·사유, 코멘트, **승인/반려 버튼은 master 만**. 승인 시 대상 테이블 `apv_sts_cd` 갱신 + `std_audit_log` 기록.

#### P21 변경 이력(Audit)
- 대상 테이블·기간·행위(INSERT/UPDATE/DELETE) 필터, old/new JSONB 비교.

#### P23 용어·도메인 영향
- 용어 또는 도메인 검색 → 사용 컬럼 목록(최신 스냅샷 `mdl_col_hist` + 설계 `mdl_col`) : 시스템/DB/테이블/컬럼/타입. "변경 시 영향 N개 컬럼" 요약. OpenMetadata Lineage 의 컬럼 단위 역조회 UI 참고.

#### P25 카탈로그 검색
- 통합 검색창(2글자 이상) → 결과 카드(유형 배지 : 단어·도메인·용어·코드·테이블·컬럼, 하이라이트, 시스템/DB 경로) + 좌측 유형·시스템 필터. 페이지 20건.

### 3-4. 2단계 화면 개요

| 화면 | 핵심 요소 |
|---|---|
| P36 느린 쿼리 | 기간 선택 · Top-N(총/평균 시간·호출·블록 읽기) · queryid 추이 · "AI 분석 요청"(P40) |
| P37 테이블·인덱스 통계 | seq scan 과다(행수 대비)·미사용 인덱스(idx_scan 0, N일)·dead tuple 비율 |
| P38 용량 추이 | 테이블·인덱스 크기 시계열, 급증 표시 |
| P39 실행계획 | 스테이징 DB 전용 role 로 `EXPLAIN (GENERIC_PLAN, FORMAT JSON)`; 운영 보류 [확인중 : 운영 프로젝트·PostgreSQL 공식 문서] |
| P40 AI 분석 요청 | 대상 쿼리·테이블 선택 → 전송 데이터 미리보기(마스킹 확인) → 요청 |
| P41 권고·승인 | 권고 카드(유형·근거·DDL/SQL 초안·예상 효과·리스크) → P20 승인 → P10 으로 `sql/` 산출 → 적용은 사람 |
| P42 효과 측정 | 적용 전후 N일 같은 queryid 비교, 권고 상태 APPLIED 전이 조건 |
