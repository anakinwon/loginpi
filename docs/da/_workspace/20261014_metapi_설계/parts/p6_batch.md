## 6. 수집·배치·검증 설계

### 6-1. 카탈로그 수집 SQL (P13, `pg_catalog` 기준 — `information_schema` 는 role 권한 범위만 보이므로 미사용)

```sql
-- 테이블·뷰 (mdl_tbl_hist)
-- 별칭 = DDL 컬럼명(§4-5). 스키마명은 mdl_db.schm_nm 과 같아 저장하지 않는다
SELECT c.relname AS tbl_nm,
       CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED' WHEN 'v' THEN 'VIEW'
                      WHEN 'm' THEN 'MVIEW' WHEN 'f' THEN 'FOREIGN' END AS tbl_tp_cd,
       obj_description(c.oid, 'pg_class') AS tbl_desc
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname = $1;

-- 컬럼 (mdl_col_hist)
SELECT c.relname AS tbl_nm, a.attnum AS col_seq, a.attname AS col_nm,
       format_type(a.atttypid, a.atttypmod) AS data_tp_nm,   -- 길이 포함 원문(예 character varying(50)) 그대로 저장, data_len·dcpt_len 은 atttypmod 분해값(원문과 겹치지만 비교·검색용)
       CASE WHEN a.attnotnull THEN 'N' ELSE 'Y' END AS nul_prm_yn,
       pg_get_expr(d.adbin, d.adrelid) AS bsc_val_txt,
       col_description(c.oid, a.attnum) AS col_desc,
       (SELECT array_position(i.indkey, a.attnum) FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary) AS pk_seq,
       k.confrelid::regclass::text AS rfrnc_tbl_nm,
       (SELECT attname FROM pg_attribute WHERE attrelid = k.confrelid AND attnum = k.confkey[array_position(k.conkey, a.attnum)]) AS rfrnc_col_nm
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
LEFT JOIN LATERAL (SELECT confrelid, conkey, confkey FROM pg_constraint WHERE conrelid = c.oid AND contype = 'f' AND a.attnum = ANY(conkey) LIMIT 1) k ON TRUE
WHERE n.nspname = $1 AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f');

-- 인덱스·제약 (mdl_index_hist)
SELECT c.relname AS tbl_nm, ic.relname AS index_nm,
       CASE WHEN i.indisunique THEN 'Y' ELSE 'N' END AS unq_yn, CASE WHEN i.indisprimary THEN 'Y' ELSE 'N' END AS pk_yn,
       pg_get_indexdef(i.indexrelid) AS index_dfn_txt
FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1;
```

- 실행 : 서버 `pg` 클라이언트, `statement_timeout` 30s, 읽기 전용 트랜잭션. 접속 문자열은 `process.env[mdl_db.env_key_nm]`. 결과는 한 수집 시점(`clct_dtm` = 트랜잭션 시작 시각)으로 묶어 `mdl_tbl_hist` → `mdl_col_hist`·`mdl_index_hist`(`tbl_hist_id` FK) 순 적재.
- 행 데이터·`pg_stats` 값 분포는 읽지 않는다(§2-2 수집 범위). 크기·스캔 통계는 1단계 수집 대상이 아니다(2단계 `metric_tbl_hist`·`metric_index_hist`, §7-1). `tbl_tp_cd` 는 `mdl_tbl_hist` 컬럼(검수 반영 2026-10-14 보강).

### 6-2. 스냅샷 diff 알고리즘 (`diffSnapshots`, P13 후처리 → `mdl_chg_hist`)

1. 키 : 같은 `db_id`(= 스키마 1개) 안에서 테이블 `tbl_nm`, 컬럼 `tbl_nm.col_nm`, 인덱스 `tbl_nm.index_nm`.
2. 직전 시점(A)과 현재(B)의 키 집합 비교 → B−A = `ADD`, A−B = `DROP`, 교집합 중 비교 필드(컬럼 : `data_tp_nm`·`data_len`·`dcpt_len`·`nul_prm_yn`·`bsc_val_txt`·`pk_seq`·`rfrnc_tbl_nm`·`rfrnc_col_nm`·`col_seq`·`col_desc` / 인덱스 : `unq_yn`·`pk_yn`·`index_dfn_txt` / 테이블 : `tbl_tp_cd`·`tbl_desc`)가 다르면 `ALTER`.
3. 행 = `mdl_chg_hist`(`db_id`, `old_clct_dtm`, `clct_dtm`, `objt_tp_cd` TBL/COL/INDEX, `objt_nm`, `chg_tp_cd` ADD/DROP/ALTER, `old_val` JSONB, `new_val` JSONB). OpenMetadata `changeDescription.fieldsAdded/Updated/Deleted`(`{name, oldValue, newValue}`) 와 같은 구조.
4. 첫 수집(A 없음)은 전부 `ADD` 로 기록하지 않고 "기준 시점"으로만 표시(이력 폭주 방지).

### 6-3. 현행화 비교 규칙 (`compareModel`, P16)

| 분류 | 조건 | 화면 처리 |
|---|---|---|
| 모델에만 | `mdl_tbl.tbl_phys_nm`(APPROVED)이 최신 스냅샷에 없음 / 컬럼 동일 | "DDL 미적용" — P10 으로 DDL 생성 링크 |
| DB에만 | 스냅샷 객체가 모델에 없음 | "모델 미등록" — P09 경로로 가져오기(DRAFT) |
| 불일치 | 양쪽 존재, `data_tp_nm`(정규화 : `timestamp with time zone`=`TIMESTAMPTZ`, `character(1)`=`CHAR(1)`)·`nul_prm_yn`·`bsc_val_txt`(공백·캐스팅 정규화)·`pk_seq`·`rfrnc_tbl_nm` 중 하나라도 다름 | 필드별 좌우 비교, "모델을 DB 로" / "DB 를 모델로" 선택 → 각각 P10 / 모델 DRAFT 갱신 + 승인 |

### 6-4. 표준 준수 검사 엔진 (`da-rules`, P17·P18)

| 규칙 | 대상 | 판정 | 수준 |
|---|---|---|---|
| R1 시스템 컬럼 4 | 테이블 | `regr_id·reg_dtm·modr_id·mod_dtm` 마지막 4개·NOT NULL·기본값 | P1 |
| R2 접두사 | 테이블명 | `cod_group`='TBL_PREFIX' 값 집합(`mdl_` 포함 시 승인 후) | P1 |
| R3 소문자 | 테이블·컬럼명 | `^[a-z][a-z0-9_]*$` | P1 |
| R4 날짜 타입 | `_dt`·`_dtm` 컬럼 | DATE / TIMESTAMPTZ 외 위반 | P1 |
| R5 물리삭제 | DDL 문자열 | `DROP TABLE·DELETE FROM·TRUNCATE`(DA-APPROVED 주석 시 통과) | P1 |
| R6 논리삭제 | 테이블(`_log`·`_hist` 제외) | `del_yn CHAR(1)`+`del_dtm` 존재 | P1 |
| R7 도메인 종결 | 컬럼명 | 마지막 토큰 ∈ `std_dom` 물리 약어 | P2(경고) |
| R8 단일 단어 | 컬럼명 | 토큰 ≥ 2 | P2 |
| R9(추가) 여부 타입 | `_yn` | `CHAR(1)`+CHECK | P3 |
| R10(추가) 단수·3단어 | 테이블명 | 접두사 뒤 단어 ≤ 3, 복수형 접미 `s` 경고 | P3 |

- 입력 : `checkDdl(sql)`(파일·생성 DDL) / `checkCatalog(snapshot)`(수집 결과). 출력 공통 `{ rule, level, objt_tp_cd, objt_nm, msg, grandfathered }`. grandfathered 판정 = 패키지 상수 목록(원천 = §4-6-5 승계 객체 명명 점검 + §4-9-3-1 grandfathered 5종, 승계 5테이블 포함) — 테이블 컬럼이 아니라 엔진 설정이며 결과는 `std_chck_rslt.excp_yn` 에 기록(P18 배지·P19 분리 산식 근거).
- `std_chck_rslt` 적재 : 수집 시점 FK(`tbl_hist_id`·`col_hist_id`), `rul_cd`(R1~R10)·`chck_grd_cd`(P1~P3)·`chck_rslt_cont`·`excp_yn`·`chck_dtm`. 준수율(P19)은 이 테이블 집계(`excp_yn='N'` 과 전체를 따로).
- Hook `da-ddl-guard.mjs` 는 `checkDdl` 호출로 대체(현 PREFIX_RE·DOMAIN_SUFFIXES 상수는 모듈 사본 + CI 대조 테스트).

### 6-5. DDL 파싱 범위 (`parseDdl`, P09)

Postgres `CREATE TABLE [IF NOT EXISTS] <name> (...)` 의 컬럼 정의(이름·타입·NOT NULL·DEFAULT·PRIMARY KEY·REFERENCES·CHECK 는 무시 기록), 테이블 제약 `PRIMARY KEY(...)`·`FOREIGN KEY(...) REFERENCES`, `COMMENT ON`. 그 밖(파티션·상속·함수·트리거)은 `unparsed[]` 로 돌려준다. 파서는 토큰 기반 수제(의존성 추가 없음) — 복잡 구문은 범위 밖 명시.

### 6-6. 전용 role·배치 운영

- 대상 DB role `metapi_reader` : `NOLOGIN` 아님, 테이블 SELECT 권한 0, `pg_read_all_stats` 멤버(2단계), `pg_catalog` 는 기본 공개. Supabase 에서 생성 가능 여부·service role 과의 관계 [확인중 : Supabase 문서].
- cron : `vercel.json`/`vercel.ts` `crons` — collect 02:00 UTC, check 02:30 UTC(수집 뒤), perf 03:00 UTC(2단계). 핸들러는 `CRON_SECRET` 헤더 검증, 1 DB 당 1 호출(19 사이트 순차, 각 호출 60s 이내).
- 실패 처리 : 수집 실패는 `mdl_chg_hist` 에 남기지 않고 `mdl_db.last_clct_dtm`·`last_clct_rslt_cd`(OK/FAIL)·`last_err_txt`(접속 문자열·비밀값 마스킹 후) 에 마지막 결과만 기록 → P13 화면 "마지막 실패 사유". 성공 이력은 `mdl_tbl_hist.clct_dtm` distinct 로 도출한다(별도 cron 이력 테이블 없음, 검수 반영 2026-10-14).
