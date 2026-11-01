# BUILD CONTRACT — dbms.pi 12절 기능 트리 1차 구축 (2026-11-01 15:55~19:00 NonStop)

> 용도 : 여러 에이전트가 동시에 dbms.pi·schema.pi 를 구축할 때 지키는 **공통 계약**(폴더 소유·인터페이스·번호 대역·금지 사항). 기능 정의 = `PRD.md` 12절, 경계 = schema.pi `docs/MASTER_ROADMAP.md` §3-10.
> 마스터 지시 2026-11-01 : "10가지 대분류를 subagent 에 분담, 아소카가 모니터링·취합·리뷰·승인, 19시까지 NonStop, 승인 절차 없이 최선의 선택". 결정·근거는 이 문서 '결정 기록'에 남긴다.

## 0. 결정 기록 (마스터 부재 위임 — 권장안 즉시 채택)

| # | 미결 항목(PRD 10절) | 이번 구축의 선택 | 근거 |
|---|---|---|---|
| D1 | #1 분류체계 접근 범위 | **연결 토큰** — schema.pi 에서 DA·SYS 가 분류체계 단위 토큰(`slk_…`)을 발급, dbms 사용자가 등록. 사용자 대조 없음 | PRD_28 §1.1-1(사이트 간 사용자 대조 금지)·5절 |
| D2 | #2 대리 실행 | **schema.pi 이름 붙인 조회(named query)만** 실행 — 임의 SQL 금지(EXPLAIN 은 SELECT 1문장만, ANALYZE 없음), READ ONLY 트랜잭션·statement_timeout 5초·최대 500행, **PostgreSQL SRV 접속만**(Oracle·Tibero·AGT = 다음) | PRD §5·A1·A3 |
| D3 | #3 수익·결제 | 이번 범위 **제외**(무료 표시) | 요금 미결 |
| D4 | #12 역할 | dbms 1차 = **연결 소유자**만 그 연결 기능 사용(관리자 ADMIN 은 전체) | 역할표 확정 전 최소 권한 |
| D5 | #13 대분류 9·10 채택 | **채택**(9 = 진단 읽기 전용, 10 = 학습 콘텐츠·사전) | 차별화·EDU |
| D6 | 1-3 워커 에이전트·실제 이행/CDC 실행 | 이번 범위 **제외** — 6·7 은 계획·점검·설계 화면까지(실행 엔진은 A10 보안 모델 확정 후) | A2·A10 |
| D7 | 4 모니터링 이전 | 이번엔 **읽기 연계**(schema.pi 모니터 요약을 dbms 화면에) — 수집처 이전·타 앱 env 변경은 다음 | R-P0 형제 동시 변경 부담 |
| D8 | 새 환경변수 | **추가 없음** — schema.pi 주소 기본값 `https://schem.vercel.app`(env `SCHEMA_API_URL` 있으면 우선), 토큰 봉인 키는 `PI_SESSION_SECRET` 에서 HKDF 파생 | Vercel env 등록 불필요 |
| D9 | 10절 #14 사례집 | 10-2 는 **자체 작성 예제**만(고객 데이터 사례화는 동의 절차 후) | 동의·A11 |

## 1. 폴더 소유 (다른 에이전트 폴더는 읽기만, 수정 금지)

| 담당 | dbms.pi 소유 경로 | 그 밖 |
|---|---|---|
| **F1a schema-link** | — | schema.pi : `src/app/api/link/**`, `src/lib/link/**`, `src/app/[locale]/areas/[areaId]/settings/link-*`(토큰 발급 UI 1개), `sql/077_*.sql` |
| **F1b dbms-link** | `src/lib/link/**`, `src/app/[locale]/connect/**`, `src/app/api/link/**`, `src/components/link/**`, `sql/004_*~009_*` | — |
| F2 SQL 튜닝 랩 | `src/app/[locale]/sql-lab/**`, `src/app/api/sql-lab/**`, `src/lib/sql-lab/**`, `src/components/sql-lab/**`, `sql/010~019` | |
| F3 성능 관측 | `…/perf/**` (같은 4종 경로), `sql/020~029` | |
| F4 모니터링 센터 | `…/monitor/**`, `sql/030~039` | |
| F5 모델↔DB 정합 | `…/drift/**`, `sql/040~049` | |
| F6 PiMig | `…/migration/**`, `sql/050~059` | |
| F7 CDC·PipeLine | `…/pipeline/**`, `sql/060~069` | |
| F8 분석·레이크 | `…/analytics/**`, `sql/070~079` | |
| F9 DB 운영 안전 | `…/ops/**`, `sql/080~089` | |
| F10 DBA 학습 | `…/learn/**`, `sql/090~099` | |
| **통합(아소카 지정)** | `src/components/site-header.tsx`·하단/상단 메뉴, `src/app/[locale]/page.tsx`, `messages/*.json`, `src/env.ts`, `package.json` | |

- 메시지(문구) : 각 담당은 `messages/_frag/<ns>.ko.json`·`<ns>.en.json` 에만 쓴다(ns = 폴더명, 예 `sqlLab`). 통합 단계가 `messages/ko.json`·`en.json` 에 병합하고 `pnpm i18n:expand` 로 전 locale 에 펼친다. 코드에서는 `useTranslations('<ns>')`.
- **동시 빌드 금지** : 담당 에이전트는 `pnpm build` 를 돌리지 않는다(같은 `.next`). 검증은 `npx tsc --noEmit -p . --incremental false` 와 단위 시험(`node --test`)만.
- 커밋·push·마이그레이션 적용·배포는 **통합 단계(아소카)만**.

## 2. 연결 API 계약 (F1a 가 schema.pi 에 구현, F1b 가 dbms 클라이언트 구현, F2~F10 은 클라이언트만 사용)

### 2.1 schema.pi 쪽 `/api/link/v1/*` (서버 간 전용)
- 인증 : `Authorization: Bearer slk_<랜덤>` — schema.pi `sys_lnk_tkn`(sql/077) 에 SHA-256 해시·`area_id`·`exp_dtm`·`del_yn`·`lst_use_dtm`. 발급 = 분류체계 설정 화면(SYS·DA 권한), 원문은 발급 때 1번만 표시. 토큰당 분당 호출 상한(60).
- 모든 응답 `{ ok: true, data }` 또는 `{ ok: false, code, message }`, 오류 원문(접속 정보) 노출 금지(`maskErr`).

| 메서드·경로 | 응답 data |
|---|---|
| GET `/area` | `{ areaId, areaNm }` |
| GET `/dbms-profiles` | `{ dbms: [{ dbmsCd, dbmsNm }], typeMap: [{ dbmsCd, lgcTpCd, phyTpNm, lenUseYn }] }` |
| GET `/conns` | `[{ connId, connNm, dbmsCd, execMthdCd, dbNm, hostMasked, lstTestDtm, agtLstSeenDtm }]` — 비밀번호·전체 호스트·사용자명 없음 |
| POST `/query` body `{ connId, q, params? }` | `{ cols: string[], rows: unknown[][], ms }` — `q` 는 2.2 의 이름만 |
| GET `/projects` | `[{ prjId, prjNm, trgtDbmsCd }]` |
| GET `/model?prjId=` | `{ entities:[{entId,entNm,tblNm}], relations:[{relId,parentEntId,childEntId,idnYn,cardCd}], tables:[{tblId,tblNm,phyStsCd}], columns:[{tblId,colNm,phyTpNm,dataLen,nullYn,pkYn,colSeq}], indexes:[{tblId,idxNm,unqYn,colNms}] }` |
| GET `/ddl-history?prjId=` | `[{ reqId, stsCd, connId, reqDtm, stmts:[{ seq, stmtTxt, rsltCd, endDtm }] }]` |
| GET `/domains` | `[{ domNm, lgcTpCd, dataLen, scale }]` (승인완료 표준도메인) |
| GET `/mon/summary?min=` | `{ app: {...}, db: [{connId, sessCnt, lockWaitCnt, cacheHitPct, dbSz}], url: [...] }` (schema.pi 기존 집계 재사용) |

### 2.2 이름 붙인 조회(`q`) — PostgreSQL 전용, schema.pi `src/lib/link/queries.ts` 정본
`explain`(params.sql: SELECT/WITH 1문장, `EXPLAIN (FORMAT JSON, COSTS true)`), `db_stats`, `top_sql`(pg_stat_statements 없으면 `PGSS_MISSING`), `tbl_stats`, `idx_stats`, `sizes`, `activity`, `locks`, `settings`, `roles`, `table_privs`, `catalog_tables`, `catalog_columns`, `catalog_indexes`, `replication`, `archiver`, `version`.
오류 코드 : `LINK_AUTH`(401), `LINK_SCOPE`(403 — 다른 분류체계 접속), `CONN_UNSUPPORTED`(Oracle·AGT), `Q_UNKNOWN`, `SQL_NOT_SELECT`, `PGSS_MISSING`, `TIMEOUT`, `RATE`.

### 2.3 dbms 쪽 클라이언트 `src/lib/link/client.ts` (F1b 구현, 서버 전용)
```ts
export type LinkCtx = { linkId: string; areaId: string; areaNm: string; usrId: string } // usrId = 세션 사용자 ID(regr_id·modr_id 기록용, 2026-11-01 추가)
export async function requireLink(req: Request, linkId: string): Promise<LinkCtx | Response> // 로그인 + 소유자(또는 ADMIN) 확인, 실패 시 Response
export async function linkGet<T>(linkId: string, path: string): Promise<T>            // throws LinkError{code,status}
export async function linkQuery(linkId: string, connId: string, q: QueryName, params?: Record<string, unknown>): Promise<{ cols: string[]; rows: unknown[][]; ms: number }>
export class LinkError extends Error { code: string; status: number }
```
- 타임아웃 4초(R-P4 예외 — BUILD_DEFECTS 2.7 등재), 같은 요청 안 중복 호출 금지(R-P2).
- dbms DB `dbm_lnk`(sql/004) : `lnk_id`·`usr_id`·`area_id`·`area_nm`·`tkn_enc_txt`(AES-256-GCM, 키 = HKDF(PI_SESSION_SECRET, 'dbms-link'))·`del_yn`·시스템 칼럼 4.
- 화면 공통 : 기능 페이지는 상단에 `<LinkPicker />`(F1b 제공, `src/components/link/link-picker.tsx` — 내 연결·접속 선택, 선택값은 URL `?link=&conn=`) 를 둔다. 연결이 없으면 `/connect` 안내.

## 3. 공통 규칙
- 루트 CLAUDE.md : Pi Browser 이중 경로(`piFetch`)·`redirect` 금지(클라이언트 게이트)·R-P0~P6·DA 표준(시스템 칼럼 4·`del_yn`·`pk_`/`x_NN`·`DA-APPROVED` 헤더)·물리 DELETE 금지.
- 목록은 페이지 단위, 섹션 지연 조회. 행 데이터 저장 금지(A3) — dbms DB 에는 스냅샷 통계·계획 JSON·설정만.
- 코드 스타일 : 2칸·세미콜론 없음·작은따옴표·파일 상단 한국어 용도 주석.
- 화면은 데스크톱 우선, 360px 가로 스크롤 없음.
- 각 담당 완료 보고 : 만든 파일·API·SQL·문구 fragment·tsc 결과·남은 일.
