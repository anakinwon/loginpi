## 5. API 설계

공통 : Route Handler(Node 런타임, Edge 아님), 인증 `const user = await getSessionUser(); if (!isAdmin(user)) 401`(master 전용은 `isMaster(user)`), 클라이언트는 `piFetch`. 목록은 `?page=&size=`(기본 20, 최대 100) + `?q=`(2글자 이상) + 필터. 응답 봉투 `{ items, page, size, total }` / 단건 `{ item }` / 오류 `{ error: 'code', detail? }`(`ApiErrorBody`). 쓰기는 zod 스키마로 검증, 권한은 서버 재검증. 표준 3종·코드 2종 쓰기는 `std_audit_log` 트리거로 기록하고, `mdl_*`·`approval_queue`·`metric_impv_*` 는 승인 이력(`approval_queue`)·수집 시점 이력(`*_hist`)으로 추적한다(트리거 확대는 [확인중 : 마스터]).

### 5-1. 1단계 엔드포인트

| # | 메서드·경로 | 프로그램 | 권한 | 핵심 로직 |
|---|---|---|---|---|
| A1 | `GET/POST /api/meta/std/words`, `GET/PATCH /words/[id]` | P01 | admin | 기존 cafe.pi 로직 이식. POST 는 `apv_status=DRAFT`(승계 컬럼명) + `approval_queue` 행. 등록 전 `similar?q=` 로 `pg_trgm` 유사어 반환 |
| A2 | `…/std/domains`, `/domains/[id]` | P02 | admin | Type·Length 필수, 단어 선등록 검사 |
| A3 | `…/std/terms`, `/terms/[id]`, `POST /terms/compose` | P03 | admin | `compose` : 단어 ID 배열 + 도메인 → 물리명 조립·중복·R8(2토큰) 검사 |
| A4 | `…/std/codes`(그룹), `/codes/[groupId]/values` | P04 | admin | 그룹 저장 시 `term_id` 의 `_cd` 종결 검사, 값 폐기는 PATCH `use_yn=N, vld_end_dt` |
| A5 | `POST /api/meta/std/import?target=words\|domains\|terms\|codes&dryRun=1` / `…&dryRun=0` | P06 | admin | multipart xlsx → 헤더 검증 → 행별 검증(`checkDdl` 토큰 규칙·중복·참조) → dryRun 이면 `{ rows:[{row, status, errors[]}], summary }` 만, 아니면 정상 행 DRAFT 생성 + 승인 요청 1건 |
| A6 | `GET /api/meta/std/export?target=…&filter…` | P07 | admin | xlsx 스트림, 템플릿 모드 `?template=1` |
| A7 | `GET/POST /api/meta/model/tables`, `GET/PATCH/…/[tblId]`, `PUT /[tblId]/columns` | P08 | admin | 컬럼 PUT 은 전체 치환(순번 재부여), 물리명은 `term_id` 필수, `pk_seq`·`rfrnc_*` 쌍 검증 |
| A8 | `POST /api/meta/model/import-ddl` | P09 | admin | body `{ sql }` → `parseDdl` → `{ tables, unparsed[] }` 미리보기, `?commit=1` 이면 DRAFT 모델 생성 |
| A9 | `POST /api/meta/model/ddl` | P10 | master | body `{ tblIds[] }` → `genDdl` + `checkDdl` → `{ sql, violations }` |
| A10 | `GET/POST /api/meta/db/systems`, `/systems/[sysId]/dbs`, `POST /db/[dbId]/test` | P12 | master | `env_key_nm` 형식 검사(`^META_DB_` + env.ts 등재 키 화이트리스트), test 는 `process.env[env_key_nm]` 로 접속, 결과·오류 메시지는 접속 문자열·비밀값 마스킹 후 `mdl_db.cntn_test_*` 기록 → `SELECT 1`·`pg_catalog` 읽기 → 결과만(문자열 미반환) |
| A11 | `POST /api/meta/db/[dbId]/collect`, `POST /api/meta/jobs/collect`(cron) | P13 | master / CRON_SECRET | §6-1 수집 SQL 실행 → `mdl_*_hist` 적재 → `diffSnapshots` → `mdl_chg_hist` → `{ clctDtm, tables, columns, indexes, changes }` |
| A12 | `GET /api/meta/db/[dbId]/changes?from=&to=` | P15 | admin | `mdl_chg_hist` 페이지 조회 |
| A13 | `GET /api/meta/db/[dbId]/drift` | P16 | admin | `compareModel` → `{ onlyModel[], onlyDb[], mismatch[] }` |
| A14 | `POST /api/meta/check/run?dbId=`, `POST /api/meta/jobs/check`(cron), `GET /api/meta/check/results` | P17·P18 | admin / CRON | 최신 스냅샷 `checkCatalog` → `std_chck_rslt` 적재(수집 시점 FK) |
| A15 | `GET /api/meta/check/rate?by=sys\|tbl\|rule` | P19 | admin | 집계 뷰, `Cache-Control: s-maxage=300, stale-while-revalidate` |
| A16 | `GET/POST /api/meta/approvals`, `GET/PATCH /approvals/[apvId]`(action=approve\|reject\|comment) | P20 | admin / approve·reject 는 master | 승인 시 트랜잭션 : 대상 상태 컬럼(`apv_status`/`apv_sts_cd`/`rcmnd_sts_cd`) 갱신 + `approval_queue.apv_status` + `decided_by/decided_at` |
| A17 | `GET /api/meta/audit?tgtTbl=&tgtId=&from=&to=` | P21 | admin | `std_audit_log` 조회 |
| A18 | `GET /api/meta/impact?termId=\|domId=` | P23 | admin | `mdl_col`(설계) + 최신 `mdl_col_hist` 조인, 시스템·DB·테이블·컬럼 목록 |
| A19 | `GET /api/meta/search?q=&type=&sysId=` | P25 | admin | 6개 원천 `ilike '%q%'`(trgm GIN) UNION, 유형별 상위 N, 페이지 |
| A20 | `GET /api/meta/pub/std?type=words\|domains\|terms\|codes&since=` | P29(선택이나 cafe.pi 전환에 필요 → 1단계 포함) | 공개 읽기(인증 없음, APPROVED 만) | `Cache-Control: s-maxage=600`, cafe.pi `/admin/std` GET 3종이 이 응답 모양을 소비 |

### 5-2. 요청·응답 예시 (대표 3건)

```jsonc
// A5 POST /api/meta/std/import?target=words&dryRun=1  (multipart: file)
// 200
{ "summary": { "total": 120, "ok": 112, "warn": 5, "error": 3 },
  "rows": [ { "row": 7, "status": "error", "errors": ["영문약어 4자 초과(기관 신규)", "동음이의: 주문 ORD"] }, … ] }

// A11 POST /api/meta/db/{dbId}/collect
// 200
{ "clctDtm": "2026-10-14T09:00:00Z", "tables": 41, "columns": 512, "indexes": 97,
  "changes": { "ADD": 3, "DROP": 0, "ALTER": 2 }, "elapsedMs": 1840 }

// A16 PATCH /api/meta/approvals/{apvId}  { "action": "approve", "comment": "..." }
// 200 { "item": { "apvId": "…", "apvStatus": "APPROVED", "decidedBy": "…", "decidedAt": "…" } }
// 403 { "error": "forbidden" }  — master 아님 / 409 { "error": "invalid_transition" }
```

### 5-3. zod 타입(발췌)

```ts
export const WordInput = z.object({
  dicLogNm: z.string().min(1).max(100),            // 한글명
  dicPhyNm: z.string().regex(/^[a-z][a-z0-9]{1,7}$/), // 2~8자 — 기관 신규는 아래 refine 으로 3자 이하
  dicPhyFllNm: z.string().max(100),
  commonStdYn: z.enum(['Y','N']).default('N'),      // 공통표준 채택분은 길이 예외(4-6-1 원칙)
}).refine(w => w.commonStdYn === 'Y' || w.dicPhyNm.length <= 3, { message: '기관 신규 단어는 2~3자' })
export const ColumnInput = z.object({
  colSeq: z.number().int().positive(),
  termId: z.string().uuid(),                        // 물리명은 용어에서
  domId: z.string().min(1).optional(),              // std_dom.dom_id 는 UUID 아닌 TEXT(승계)
  nulPrmYn: z.enum(['Y','N']), bscValTxt: z.string().optional(),
  pkSeq: z.number().int().positive().optional(),
  rfrncTblNm: z.string().optional(), rfrncColNm: z.string().optional(),
}).refine(c => !c.rfrncTblNm === !c.rfrncColNm, { message: '참조 테이블·컬럼은 쌍' })
export const ApprovalAction = z.object({ action: z.enum(['approve','reject','comment']), comment: z.string().max(2000).optional() })
```

### 5-4. 2단계 엔드포인트 개요

| 경로 | 프로그램 | 권한 | 요지 |
|---|---|---|---|
| `POST /api/meta/perf/[dbId]/collect`, `POST /api/meta/jobs/perf`(cron 일 1회) | P35 | master/CRON | §7-1 수집 SQL → `metric_*_hist`, reset 시점 보관, 증분은 조회 시 `pgstatDelta` |
| `GET /api/meta/perf/[dbId]/queries?from=&to=&top=` | P36 | master | 증분 기준 Top-N |
| `GET …/tables`, `…/size` | P37·P38 | master | seq scan 비율·미사용 인덱스·dead tuple·크기 시계열 |
| `POST /api/meta/perf/[dbId]/plan` | P39 | master | 스테이징 role 한정 `EXPLAIN (GENERIC_PLAN, FORMAT JSON)` |
| `POST /api/meta/tune/request` | P40 | master | §7-4 프롬프트 → Anthropic SDK → zod 검증 → `metric_impv_rcmnd`(`rcmnd_sts_cd` DRAFT) |
| `GET/PATCH /api/meta/tune/recommendations/[rcmndId]` | P41 | master | 상태 전이 CHECK(APPROVED·APPLIED 는 `apv_id` 필수) |
| `POST /api/meta/tune/results` | P42 | master | 전후 구간 집계 고정 저장 |
