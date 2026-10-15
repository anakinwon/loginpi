-- DA 승인 전제 : 접두사 mdl_(신설) · metric_(기존 재사용, 리더 판정 2) · 신규 표준단어 60(공통 54·기관 6, r5 9 포함 — DMND·RSPNS·END·TPC·RLM·CNTN·TEST·ERR·EXCP, 01_standards_dictionary.md §1) · 신규 도메인 ms(밀리초 NUMERIC(18,3))·len(길이 INT) (설계서 초안, sql/ 미적용)
-- METAPI(schema.pi) 자체 Supabase DB 데이터 모델 DDL 초안 — 1단계 11 + 2단계 6 = 신규 17 테이블(승계 5 테이블은 04_migration_ddl.sql 정본).
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only 정의) → 04 M1~M4 적용 완료(M1-9 승계 권한 잠금 포함, M4 apv_id UUID 전환 게이트 통과). M4 미통과로 TEXT 유지(선택 ①)가 되면 C-5 metric_impv_rcmnd.apv_id 를 TEXT 로 바꿔 적용한다 — FK 는 참조 PK 와 같은 타입(정본 §3-3).
-- 투입 규칙 : db-migrate.mjs 가 대기 중인 파일을 한 번에 모두 적용하므로, 02 파일은 M4 파일이 적용된 뒤에 저장소에 넣어야 한다(04_migration_plan.md §11).
-- 용도 : 설계 검토·PGlite 실행 검증 전용. 운영 적용 금지(확정본은 da-leader 승인 후 sql/{순번}_*.sql 로 이동, 적용은 마스터).
-- 승계 객체 근거 : 04_migration_ddl.sql M1(정본). 모델의 승계 점검(02_modeler_model.md §3)은 개발 DB PostgREST OpenAPI(2026-10-14) 기준 — 운영 미확인.
-- 물리명은 01_standards_dictionary.md §4 치환표(r1) 적용. 치환표와 다른 구조 판단은 02_modeler_model.md §6-1 에 근거 기재.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================
-- A. 승계 5 테이블 (std_dic·std_dom·std_term·approval_queue·std_audit_log) — 정본 DDL = 04_migration_ddl.sql M1 (이행담당 소관)
--    이 파일은 04 적용 뒤에 실행한다. 여기서 다시 CREATE 하지 않으며 컬럼 타입도 단정하지 않는다(04 S0 카탈로그 실측이 정본).
--    이 파일이 기대는 04 의 객체 : std_term(term_id) · std_dom(dom_id) · approval_queue(apv_id) · fn_std_audit_log()
--    04 반영 요청(모델 판단, 02_modeler_model.md §4-2) — ①~⑤ 전부 04 반영 완료(이행담당 로컬 리허설 확인, 2026-10-14) :
--      ① fn_std_audit_log PK 추출을 TG_TABLE_NAME 별 매핑으로 — cod_group.term_id 처럼 다른 PK 와 같은 이름의 컬럼이 있으면
--         구 sql/009 COALESCE(dic_id·dom_id·term_id 순)가 오추출. 매핑 : std_dic→dic_id · std_dom→dom_id · std_term→term_id ·
--         cod_group→cd_group_id · cod_val→cd_val_id (미매핑 테이블은 tgt_id NOT NULL 로 실패)
--      ② 표준 3종 검색 trgm 부분 인덱스 8 (API .ilike 대상) : std_dic(dic_log_nm·dic_phy_nm·dic_phy_fll_nm) · std_dom(dom_nm·key_dom_nm·key_dom_phy_nm)
--         · std_term(term_log_nm·term_phy_nm), USING gin (<col> gin_trgm_ops) WHERE del_yn = 'N'
--      ③ 인덱스명 표준화 : idx_std_audit_log_tgt → idx_std_audit_log_tgt_tbl_chg_dtm · idx_std_audit_log_id → idx_std_audit_log_tgt_id
--         · idx_approval_queue_status → idx_approval_queue_apv_status · idx_approval_queue_entity → idx_approval_queue_entity_id
--      ④ std_audit_log 의 del_yn·del_dtm 은 _log 면제(R6)라 불필요 — 넣어도 무해하나 정본 §4-3 과 맞추려면 제외
--      ⑤ 실행 순서 : 04 M4 → 02. M4 전에 02 를 적용하면 FK 가 걸린 apv_id 의 타입을 바꿀 수 없다(42804, 품질담당 PGlite 실측)
-- =====================================================================

-- =====================================================================
-- B. 1단계 신규 11 테이블 (물리명 = 01_standards_dictionary.md §4 치환표 적용, 구조 차이는 모델 §6-1)
-- =====================================================================

-- B-1. 코드그룹 (cod_group) — 04 §6.1. term_id = 이 그룹을 값으로 쓰는 표준용어(예 role_cd) → 컬럼↔코드 자동 매핑
CREATE TABLE cod_group (
  cd_group_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cd_group_cd    VARCHAR(50)  NOT NULL CHECK (cd_group_cd ~ '^[A-Z][A-Z0-9_]*$'),  -- 코드그룹코드(대문자 snake)
  cd_group_nm    VARCHAR(100) NOT NULL,                                           -- 코드그룹명
  cd_group_desc  TEXT,                                                            -- 코드그룹설명
  term_id        UUID         CONSTRAINT cod_group_std_term_id_fkey REFERENCES std_term (term_id),  -- 용어ID
  use_yn         CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX cod_group_cd_group_cd_key ON cod_group (cd_group_cd) WHERE del_yn = 'N';
CREATE INDEX idx_cod_group_cd_group_nm_trgm   ON cod_group USING gin (cd_group_nm gin_trgm_ops) WHERE del_yn = 'N';

-- B-2. 코드값 (cod_val)
CREATE TABLE cod_val (
  cd_val_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cd_group_id    UUID         NOT NULL CONSTRAINT cod_val_cod_group_id_fkey REFERENCES cod_group (cd_group_id),
  cd_val_cd      VARCHAR(50)  NOT NULL,                       -- 코드값코드(실제 저장값)
  cd_val_nm      VARCHAR(100) NOT NULL,                       -- 코드값명(국문)
  cd_val_eng_nm  VARCHAR(100),                                -- 코드값영문명
  cd_val_desc    TEXT,
  sort_seq       INT          NOT NULL DEFAULT 0,             -- 정렬순서(공통표준 SORT_SEQ)
  vld_end_dt     DATE,                                        -- 유효종료일자(NULL = 무기한, 04 §6.1 코드 폐기 기준)
  use_yn         CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),  -- 폐기는 use_yn='N'(04 §6.1)
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX cod_val_cd_group_id_cd_val_cd_key ON cod_val (cd_group_id, cd_val_cd) WHERE del_yn = 'N';
CREATE INDEX idx_cod_val_cd_group_id_sort_seq         ON cod_val (cd_group_id, sort_seq) WHERE del_yn = 'N';
CREATE INDEX idx_cod_val_cd_val_nm_trgm               ON cod_val USING gin (cd_val_nm gin_trgm_ops) WHERE del_yn = 'N';

-- B-3. 대상 시스템 (mdl_sys) — 19 사이트 1행씩. site_nm = sites.json 도메인 문자열(cafe.pi)
CREATE TABLE mdl_sys (
  sys_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sys_nm    VARCHAR(100) NOT NULL,                            -- 시스템명(PyCafé™ 등 표시명)
  site_nm   VARCHAR(100) NOT NULL CHECK (site_nm ~ '^[a-z0-9][a-z0-9.-]*$'),  -- 사이트명
  sys_desc  TEXT,
  use_yn    CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),   -- 수집 대상 여부
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX mdl_sys_site_nm_key ON mdl_sys (site_nm) WHERE del_yn = 'N';

-- B-4. 대상 DB·스키마 (mdl_db) — 1행 = DB 1개의 스키마 1개. 접속 비밀 저장 금지 : env 키 이름만, 형식 CHECK 로 접속 문자열 유입 차단
CREATE TABLE mdl_db (
  db_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sys_id      UUID         NOT NULL CONSTRAINT mdl_db_mdl_sys_id_fkey REFERENCES mdl_sys (sys_id),
  env_cd      VARCHAR(20)  NOT NULL CHECK (env_cd IN ('DEV', 'STG', 'PROD')),   -- 환경코드(P39 실행계획은 STG 만)
  db_tp_cd    VARCHAR(20)  NOT NULL DEFAULT 'PG' CHECK (db_tp_cd = 'PG'),       -- 이기종 DBMS 제외(제안서 §7)
  schm_nm     VARCHAR(63)  NOT NULL DEFAULT 'public',         -- 스키마명
  env_key_nm  VARCHAR(100) NOT NULL CHECK (env_key_nm ~ '^META_DB_[A-Z0-9_]+$'),  -- 환경키명 — META_DB_<SITE> 형식만(비밀 키 이름 SUPABASE_SERVICE_ROLE_KEY 등 차단)
  db_desc     TEXT,
  cntn_test_dtm      TIMESTAMPTZ,                             -- 접속시험일시
  cntn_test_rslt_cd  VARCHAR(10)  CHECK (cntn_test_rslt_cd IN ('OK', 'FAIL')),     -- 접속시험결과코드
  last_clct_dtm      TIMESTAMPTZ,                             -- 최종수집일시(반정규화 — 목록 표시용, 성공 이력은 _hist clct_dtm distinct)
  last_clct_rslt_cd  VARCHAR(10)  CHECK (last_clct_rslt_cd IN ('OK', 'FAIL')),     -- 최종수집결과코드
  last_err_txt       TEXT,                                    -- 최종오류텍스트(FAIL 사유, 접속 문자열·비밀값 기록 금지)
  use_yn      CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX mdl_db_sys_id_env_cd_schm_nm_key ON mdl_db (sys_id, env_cd, schm_nm) WHERE del_yn = 'N';

-- B-5. 설계 테이블 (mdl_tbl) — P08 편집·P09 DDL import 결과. 스키마는 db_id 로 도출(mdl_db 가 스키마 단위). 승인 요청은 approval_queue 다형 참조(entity_type='MDL_TBL')
CREATE TABLE mdl_tbl (
  tbl_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  db_id        UUID         NOT NULL CONSTRAINT mdl_tbl_mdl_db_id_fkey REFERENCES mdl_db (db_id),
  tbl_phys_nm  VARCHAR(63)  NOT NULL CHECK (tbl_phys_nm ~ '^[a-z][a-z0-9_]*$'),  -- 테이블물리명
  tbl_lgc_nm   VARCHAR(200) NOT NULL,                         -- 테이블논리명
  tbl_desc     TEXT,                                          -- 테이블설명(P28 COMMENT ON 원천)
  tpc_rlm_cd   VARCHAR(20),                                   -- 주제영역코드(cod_group 'TPC_RLM_CD' 의 cd_val_cd 값 — 코드 컬럼 물리 FK 없음, 04 §6.1)
  apv_sts_cd   VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' CHECK (apv_sts_cd IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED')),  -- 승인상태코드
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX mdl_tbl_db_id_tbl_phys_nm_key ON mdl_tbl (db_id, tbl_phys_nm) WHERE del_yn = 'N';
CREATE INDEX idx_mdl_tbl_tbl_phys_nm_trgm         ON mdl_tbl USING gin (tbl_phys_nm gin_trgm_ops) WHERE del_yn = 'N';
CREATE INDEX idx_mdl_tbl_tbl_lgc_nm_trgm          ON mdl_tbl USING gin (tbl_lgc_nm gin_trgm_ops) WHERE del_yn = 'N';

-- B-6. 설계 컬럼 (mdl_col) — 물리명은 표준용어 참조(term_id NULL = 비표준 → P18 점검 대상). FK 는 단일 컬럼만(참조 테이블·컬럼명)
CREATE TABLE mdl_col (
  col_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tbl_id        UUID         NOT NULL CONSTRAINT mdl_col_mdl_tbl_id_fkey REFERENCES mdl_tbl (tbl_id),
  col_seq       INT          NOT NULL CHECK (col_seq > 0),    -- 컬럼순번
  col_phys_nm   VARCHAR(63)  NOT NULL CHECK (col_phys_nm ~ '^[a-z][a-z0-9_]*$'),
  col_lgc_nm    VARCHAR(200) NOT NULL,
  term_id       UUID         CONSTRAINT mdl_col_std_term_id_fkey REFERENCES std_term (term_id),
  dom_id        TEXT         CONSTRAINT mdl_col_std_dom_id_fkey REFERENCES std_dom (dom_id),
  data_tp_nm    VARCHAR(50)  NOT NULL,                        -- 자료유형명(format_type(atttypid, atttypmod) 원문 — 길이 포함, 예 character varying(100))
  data_len      INT          CHECK (data_len > 0),            -- 자료길이(신규 도메인 len)
  dcpt_len      INT          CHECK (dcpt_len >= 0),           -- 소수점길이
  nul_prm_yn    CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (nul_prm_yn IN ('Y', 'N')),  -- 널허용여부
  pk_seq        INT,                                          -- 기본키순번(NULL = PK 아님, 복합 PK 순서 보존)
  rfrnc_tbl_nm  VARCHAR(63),                                  -- 참조테이블명(FK 대상)
  rfrnc_col_nm  VARCHAR(63),                                  -- 참조컬럼명
  bsc_val_txt   TEXT,                                         -- 기본값텍스트(pg_get_expr 형식)
  col_desc      TEXT,
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mdl_col_pk_seq_check CHECK (pk_seq IS NULL OR (pk_seq > 0 AND nul_prm_yn = 'N')),  -- PK 컬럼은 NOT NULL
  CONSTRAINT mdl_col_rfrnc_col_nm_check CHECK ((rfrnc_tbl_nm IS NULL) = (rfrnc_col_nm IS NULL))
);
-- 인덱스 6개(PK 포함) — 사유 : 활성행 UNIQUE 2(물리명·순번), P25 검색 trgm 2(물리·논리명), P23 용어 영향 1
CREATE UNIQUE INDEX mdl_col_tbl_id_col_phys_nm_key ON mdl_col (tbl_id, col_phys_nm) WHERE del_yn = 'N';
CREATE UNIQUE INDEX mdl_col_tbl_id_col_seq_key     ON mdl_col (tbl_id, col_seq)     WHERE del_yn = 'N';
CREATE INDEX idx_mdl_col_col_phys_nm_trgm          ON mdl_col USING gin (col_phys_nm gin_trgm_ops) WHERE del_yn = 'N';
CREATE INDEX idx_mdl_col_col_lgc_nm_trgm           ON mdl_col USING gin (col_lgc_nm gin_trgm_ops) WHERE del_yn = 'N';
CREATE INDEX idx_mdl_col_term_id                   ON mdl_col (term_id) WHERE del_yn = 'N';

-- B-7. 테이블 카탈로그 수집 이력 (mdl_tbl_hist) — 시점 스냅샷 패턴(04 §5.1). 수집 1회 = (db_id, clct_dtm). append-only : R6·트리거 면제
CREATE TABLE mdl_tbl_hist (
  tbl_hist_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  db_id        UUID        NOT NULL CONSTRAINT mdl_tbl_hist_mdl_db_id_fkey REFERENCES mdl_db (db_id),
  clct_dtm     TIMESTAMPTZ NOT NULL,                          -- 수집일시(같은 수집 실행의 전 행 동일값)
  tbl_nm       VARCHAR(63) NOT NULL,                          -- pg_class.relname
  tbl_tp_cd    VARCHAR(20) NOT NULL CHECK (tbl_tp_cd IN ('TABLE', 'VIEW', 'MVIEW', 'PARTITIONED', 'FOREIGN')),  -- 테이블유형코드(relkind r·v·m·p·f)
  tbl_desc     TEXT,                                          -- obj_description
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX mdl_tbl_hist_db_id_clct_dtm_tbl_nm_key ON mdl_tbl_hist (db_id, clct_dtm, tbl_nm);
CREATE INDEX idx_mdl_tbl_hist_tbl_nm_trgm ON mdl_tbl_hist USING gin (tbl_nm gin_trgm_ops);

-- B-8. 컬럼 카탈로그 수집 이력 (mdl_col_hist) — pg_attribute·pg_attrdef·pg_constraint(PK·단일컬럼 FK). 수집 시점·테이블은 tbl_hist_id 로 도출
CREATE TABLE mdl_col_hist (
  col_hist_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tbl_hist_id   UUID        NOT NULL CONSTRAINT mdl_col_hist_mdl_tbl_hist_id_fkey REFERENCES mdl_tbl_hist (tbl_hist_id),
  col_seq       INT         NOT NULL,                         -- pg_attribute.attnum
  col_nm        VARCHAR(63) NOT NULL,
  data_tp_nm    VARCHAR(50) NOT NULL,                         -- format_type(atttypid, atttypmod) 원문(길이 포함). data_len·dcpt_len 은 atttypmod 분해
  data_len      INT,                                          -- atttypmod 해석(varchar n·numeric p)
  dcpt_len      INT,                                          -- numeric s
  nul_prm_yn    CHAR(1)     NOT NULL CHECK (nul_prm_yn IN ('Y', 'N')),
  bsc_val_txt   TEXT,                                         -- pg_get_expr(adbin, adrelid)
  pk_seq        INT,                                          -- 기본키순번(conkey 내 위치)
  rfrnc_tbl_nm  VARCHAR(63),                                  -- 참조테이블명(단일 컬럼 FK)
  rfrnc_col_nm  VARCHAR(63),
  col_desc      TEXT,                                         -- col_description
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mdl_col_hist_rfrnc_col_nm_check CHECK ((rfrnc_tbl_nm IS NULL) = (rfrnc_col_nm IS NULL))
);
CREATE UNIQUE INDEX mdl_col_hist_tbl_hist_id_col_nm_key ON mdl_col_hist (tbl_hist_id, col_nm);
CREATE INDEX idx_mdl_col_hist_col_nm_trgm ON mdl_col_hist USING gin (col_nm gin_trgm_ops);  -- P23 용어 역조회·P25

-- B-9. 인덱스 카탈로그 수집 이력 (mdl_index_hist) — pg_index
CREATE TABLE mdl_index_hist (
  index_hist_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tbl_hist_id    UUID        NOT NULL CONSTRAINT mdl_index_hist_mdl_tbl_hist_id_fkey REFERENCES mdl_tbl_hist (tbl_hist_id),
  index_nm       VARCHAR(63) NOT NULL,
  unq_yn         CHAR(1)     NOT NULL CHECK (unq_yn IN ('Y', 'N')),  -- 고유여부
  pk_yn          CHAR(1)     NOT NULL,                        -- 기본키여부
  index_dfn_txt  TEXT        NOT NULL,                        -- 인덱스정의텍스트(pg_get_indexdef)
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mdl_index_hist_pk_yn_check CHECK (pk_yn IN ('Y', 'N') AND (pk_yn = 'N' OR unq_yn = 'Y'))  -- PK 인덱스는 UNIQUE
);
CREATE UNIQUE INDEX mdl_index_hist_tbl_hist_id_index_nm_key ON mdl_index_hist (tbl_hist_id, index_nm);

-- B-10. 수집 시점 간 변경 이력 (mdl_chg_hist) — P15 diff 결과. 전·후 = 기등재 OLD/NEW + val(sql/176)
CREATE TABLE mdl_chg_hist (
  chg_hist_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  db_id         UUID         NOT NULL CONSTRAINT mdl_chg_hist_mdl_db_id_fkey REFERENCES mdl_db (db_id),
  clct_dtm      TIMESTAMPTZ  NOT NULL,                        -- 이번 수집일시
  old_clct_dtm  TIMESTAMPTZ  NOT NULL,                        -- 비교 기준(직전) 수집일시
  objt_tp_cd    VARCHAR(20)  NOT NULL CHECK (objt_tp_cd IN ('TBL', 'COL', 'INDEX')),  -- 객체유형코드
  objt_nm       VARCHAR(200) NOT NULL,                        -- 객체명(tbl | tbl.col | index)
  chg_tp_cd     VARCHAR(20)  NOT NULL,                        -- ADD·DROP·ALTER (값·전후값 정합은 아래 명명 CHECK)
  old_val       JSONB,
  new_val       JSONB,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mdl_chg_hist_clct_dtm_check CHECK (clct_dtm > old_clct_dtm),
  CONSTRAINT mdl_chg_hist_chg_tp_cd_check CHECK (
    (chg_tp_cd = 'ADD'   AND old_val IS NULL     AND new_val IS NOT NULL) OR
    (chg_tp_cd = 'DROP'  AND old_val IS NOT NULL AND new_val IS NULL) OR
    (chg_tp_cd = 'ALTER' AND old_val IS NOT NULL AND new_val IS NOT NULL))
);
CREATE INDEX idx_mdl_chg_hist_db_id_clct_dtm ON mdl_chg_hist (db_id, clct_dtm DESC);

-- B-11. 표준 점검 결과 (std_chck_rslt) — P18 전수 점검(수집 스냅샷 대상). DB·객체명은 FK 로 도출(3NF — 치환표 db_id·objt_tp_cd·objt_nm 미채택, 모델 §6-1)
CREATE TABLE std_chck_rslt (
  chck_rslt_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tbl_hist_id     UUID        NOT NULL CONSTRAINT std_chck_rslt_mdl_tbl_hist_id_fkey REFERENCES mdl_tbl_hist (tbl_hist_id),
  col_hist_id     UUID        CONSTRAINT std_chck_rslt_mdl_col_hist_id_fkey REFERENCES mdl_col_hist (col_hist_id),  -- NULL = 테이블 단위 위반
  chck_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 점검일시
  rul_cd          VARCHAR(10) NOT NULL CHECK (rul_cd ~ '^R[0-9]{1,2}$'),              -- 규칙코드(검증 엔진 R1~R10, 설계서 §6-4)
  chck_grd_cd     VARCHAR(10) NOT NULL CHECK (chck_grd_cd IN ('P1', 'P2', 'P3')),     -- 점검등급코드(품질점검기준서)
  chck_rslt_cont  TEXT        NOT NULL,                       -- 점검결과내용(위반 내용·권장값)
  excp_yn         CHAR(1)     NOT NULL DEFAULT 'N' CHECK (excp_yn IN ('Y', 'N')),  -- 예외여부(grandfathered — 엔진 상수로 세팅(원천 = 01 §6 승계 객체 목록·03 §3-1 grandfathered), P18 배지·P19 준수율 분리)
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_std_chck_rslt_tbl_hist_id       ON std_chck_rslt (tbl_hist_id) WHERE del_yn = 'N';
CREATE INDEX idx_std_chck_rslt_chck_dtm_rul_cd   ON std_chck_rslt (chck_dtm DESC, rul_cd) WHERE del_yn = 'N';

-- =====================================================================
-- C. 2단계 신규 6 테이블 (접두사 metric_ = 기존 승인 접두사 재사용, 리더 판정 2 — 제안서 prf_ 미채택)
-- =====================================================================

-- C-1. 성능 수집 시점 (metric_clct_hist) — pg_stat_statements 누적치 증분 환산용 초기화 시점 보관
CREATE TABLE metric_clct_hist (
  clct_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  db_id           UUID        NOT NULL CONSTRAINT metric_clct_hist_mdl_db_id_fkey REFERENCES mdl_db (db_id),
  clct_dtm        TIMESTAMPTZ NOT NULL,
  stats_init_dtm  TIMESTAMPTZ,                                -- 통계초기화일시(pg_stat_statements_info.stats_reset)
  db_ver_nm       VARCHAR(50),                                -- 데이터베이스버전명(server_version — GENERIC_PLAN 가능 판단)
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX metric_clct_hist_db_id_clct_dtm_key ON metric_clct_hist (db_id, clct_dtm);

-- C-2. 쿼리 통계 (metric_qry_hist) — toplevel DML 을 queryid 단위로 합산 수집. 평균은 sum/clot 로 도출(치환표 avg_excn_ms 미채택, 3NF)
CREATE TABLE metric_qry_hist (
  qry_stats_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clct_id       UUID          NOT NULL CONSTRAINT metric_qry_hist_metric_clct_hist_id_fkey REFERENCES metric_clct_hist (clct_id),
  qry_uid       TEXT          NOT NULL,                       -- 쿼리외부식별자(pg_stat_statements queryid, bigint 문자열)
  qry_txt       TEXT          NOT NULL,                       -- 정규화 + 상수 마스킹 쿼리
  clot_cnt      BIGINT        NOT NULL CHECK (clot_cnt >= 0),             -- 호출건수
  sum_excn_ms   NUMERIC(18,3) NOT NULL CHECK (sum_excn_ms >= 0),          -- 합계실행밀리초(신규 도메인 ms)
  row_cnt       BIGINT        NOT NULL,
  blck_hit_cnt  BIGINT        NOT NULL,                       -- shared_blks_hit
  blck_rd_cnt   BIGINT        NOT NULL,                       -- shared_blks_read
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX metric_qry_hist_clct_id_qry_uid_key ON metric_qry_hist (clct_id, qry_uid);
CREATE INDEX idx_metric_qry_hist_qry_uid                ON metric_qry_hist (qry_uid);  -- P36 queryid 별 추이

-- C-3. 테이블 통계·크기 (metric_tbl_hist) — 스키마는 clct_id → db_id 로 도출
CREATE TABLE metric_tbl_hist (
  tbl_stats_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clct_id        UUID        NOT NULL CONSTRAINT metric_tbl_hist_metric_clct_hist_id_fkey REFERENCES metric_clct_hist (clct_id),
  tbl_nm         VARCHAR(63) NOT NULL,
  whol_scn_cnt   BIGINT      NOT NULL,                        -- 전체스캔건수(pg seq_scan)
  index_scn_cnt  BIGINT,                                      -- 인덱스스캔건수(인덱스 없는 테이블 NULL)
  vld_row_cnt    BIGINT      NOT NULL,                        -- n_live_tup
  invld_row_cnt  BIGINT      NOT NULL,                        -- n_dead_tup
  tbl_sz         BIGINT      NOT NULL,                        -- 바이트
  index_sz       BIGINT      NOT NULL,
  last_vcm_dtm   TIMESTAMPTZ,                                 -- greatest(last_vacuum, last_autovacuum)
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX metric_tbl_hist_clct_id_tbl_nm_key ON metric_tbl_hist (clct_id, tbl_nm);

-- C-4. 인덱스 통계 (metric_index_hist) — 테이블 통계 행에 종속(clct_id·tbl_nm 은 tbl_stats_id 로 도출, 이행 종속 제거)
CREATE TABLE metric_index_hist (
  index_stats_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tbl_stats_id    UUID        NOT NULL CONSTRAINT metric_index_hist_metric_tbl_hist_id_fkey REFERENCES metric_tbl_hist (tbl_stats_id),
  index_nm        VARCHAR(63) NOT NULL,
  index_scn_cnt   BIGINT      NOT NULL,                       -- 0 = 미사용 인덱스 후보
  index_sz        BIGINT      NOT NULL,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX metric_index_hist_tbl_stats_id_index_nm_key ON metric_index_hist (tbl_stats_id, index_nm);

-- C-5. AI 개선 권고 (metric_impv_rcmnd) — 상태 전이 규칙을 CHECK 로 강제(승인 없이 APPROVED/APPLIED 불가, APPLIED ⇔ 적용일시)
CREATE TABLE metric_impv_rcmnd (
  rcmnd_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  db_id           UUID         NOT NULL CONSTRAINT metric_impv_rcmnd_mdl_db_id_fkey REFERENCES mdl_db (db_id),
  clct_id         UUID         CONSTRAINT metric_impv_rcmnd_metric_clct_hist_id_fkey REFERENCES metric_clct_hist (clct_id),  -- 근거 수집 시점
  qry_uid         TEXT,                                       -- 대상 쿼리외부식별자(pg_stat_statements queryid)(VACUUM 등 쿼리 무관 권고는 NULL)
  rcmnd_tp_cd     VARCHAR(20)  NOT NULL CHECK (rcmnd_tp_cd IN ('INDEX', 'REWRITE', 'VACUUM', 'PARTITION')),  -- 권고유형코드
  rcmnd_rsn_cont  TEXT         NOT NULL,                      -- 권고사유내용
  rcmnd_qry_txt   TEXT         NOT NULL,                      -- 권고쿼리텍스트(DDL·재작성 SQL 초안 — 적용은 P10 → sql/ → 사람)
  expt_efct_cont  TEXT,                                       -- 기대효과내용
  risk_grd_cd     VARCHAR(10)  NOT NULL CHECK (risk_grd_cd IN ('LOW', 'MID', 'HIGH')),  -- 위험등급코드
  mdl_nm          VARCHAR(100) NOT NULL,                      -- 모델명(AI 모델, 공통 MDL_NM)
  rcmnd_sts_cd    VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' CHECK (rcmnd_sts_cd IN ('DRAFT', 'PENDING', 'APPROVED', 'APPLIED', 'REJECTED')),
  apv_id          UUID         CONSTRAINT metric_impv_rcmnd_approval_queue_id_fkey REFERENCES approval_queue (apv_id),
  aplcn_dtm       TIMESTAMPTZ,                                -- 적용일시(공통 APLCN, P42 전후 구간 경계)
  dmnd_cont       TEXT,                                       -- 요청내용(AI 프롬프트 원문 — 마스킹 후, 05 가이드 추적성)
  rspns_cont      TEXT,                                       -- 응답내용(AI 응답 원문 JSON)
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT metric_impv_rcmnd_apv_id_check    CHECK (rcmnd_sts_cd NOT IN ('APPROVED', 'APPLIED') OR apv_id IS NOT NULL),
  CONSTRAINT metric_impv_rcmnd_aplcn_dtm_check CHECK ((rcmnd_sts_cd = 'APPLIED') = (aplcn_dtm IS NOT NULL))
);
CREATE INDEX idx_metric_impv_rcmnd_db_id_rcmnd_sts_cd ON metric_impv_rcmnd (db_id, rcmnd_sts_cd) WHERE del_yn = 'N';
CREATE INDEX idx_metric_impv_rcmnd_qry_uid             ON metric_impv_rcmnd (qry_uid) WHERE del_yn = 'N';

-- C-6. 개선 효과 측정 (metric_impv_rslt) — 적용 전/후 = 기등재 OLD/NEW
CREATE TABLE metric_impv_rslt (
  impv_rslt_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  rcmnd_id          UUID          NOT NULL CONSTRAINT metric_impv_rslt_metric_impv_rcmnd_id_fkey REFERENCES metric_impv_rcmnd (rcmnd_id),
  msrmt_dtm         TIMESTAMPTZ   NOT NULL,                   -- 측정일시
  old_avg_excn_ms   NUMERIC(18,3) NOT NULL,                   -- 적용 전 구간 평균실행밀리초(구간 집계값 — 원천 행 없음, 도출 아님)
  new_avg_excn_ms   NUMERIC(18,3) NOT NULL,
  old_clot_cnt      BIGINT        NOT NULL,
  new_clot_cnt      BIGINT        NOT NULL,
  old_blck_rd_cnt   BIGINT        NOT NULL,                   -- P42 "블록 읽기 비교"
  new_blck_rd_cnt   BIGINT        NOT NULL,
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_metric_impv_rslt_rcmnd_id_msrmt_dtm ON metric_impv_rslt (rcmnd_id, msrmt_dtm DESC) WHERE del_yn = 'N';

-- =====================================================================
-- D. 트리거
-- =====================================================================

-- D-1. mod_dtm 자동 갱신 — 신규 운영 테이블 9개(1단계 7 + 2단계 2). _hist 는 면제(정본 §6 예외). 승계 4개 트리거는 04 M1-7
-- 템플릿 9벌 반복 대신 DO 루프 1개 — 생성 객체명은 템플릿과 동일(fn_upd_<t>_mod_dtm·trg_<t>_mod_dtm). sql/ 확정본에서 펼칠지는 da-leader 판단
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
                           'cod_group', 'cod_val', 'mdl_sys', 'mdl_db', 'mdl_tbl', 'mdl_col', 'std_chck_rslt',
                           'metric_impv_rcmnd', 'metric_impv_rslt'] LOOP
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION fn_upd_%1$s_mod_dtm() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $b$
      BEGIN
        NEW.mod_dtm = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $b$;
      CREATE TRIGGER trg_%1$s_mod_dtm BEFORE UPDATE ON %1$s
        FOR EACH ROW EXECUTE FUNCTION fn_upd_%1$s_mod_dtm();
    $f$, t);
  END LOOP;
END $$;

-- D-2. 표준 감사 — 코드 2종에 04 의 fn_std_audit_log() 를 붙인다. 함수 PK 매핑(A절 ①)은 04 반영 완료
CREATE TRIGGER trg_cod_group_audit AFTER INSERT OR UPDATE OR DELETE ON cod_group FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();
CREATE TRIGGER trg_cod_val_audit   AFTER INSERT OR UPDATE OR DELETE ON cod_val   FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();

-- =====================================================================
-- E. PK UUID 전환은 04 M4(비 UUID 0건 게이트, 미통과 시 EXCEPTION 중단)가 정본. 02 는 M4 통과 뒤 실행하므로 apv_id 를 UUID 로 선언했다(C-5)
-- =====================================================================

-- =====================================================================
-- F. 컬럼 주석 (표준담당 r1 판정 5 — 외부 발급 식별자 출처 명기)
-- =====================================================================
COMMENT ON COLUMN metric_qry_hist.qry_uid   IS '쿼리외부식별자 — pg_stat_statements queryid(bigint)의 문자열';
COMMENT ON COLUMN metric_impv_rcmnd.qry_uid IS '대상 쿼리외부식별자 — pg_stat_statements queryid(bigint)의 문자열, 쿼리 무관 권고는 NULL';

-- =====================================================================
-- G. 권한 잠금 — 04 M1-9 패턴 미러링(baseline 공용 함수 : RLS 비활성 + PUBLIC·anon·authenticated 회수 + service_role 부여)
--    PostgREST 는 anon 키로도 public 스키마를 노출하므로 신규 17 테이블·트리거 함수 9개를 서버 전용으로 잠근다.
--    fn_std_audit_log() 권한은 04 M1-9 소관(02 는 트리거만 붙임).
-- =====================================================================
SELECT fn_grant_svc_only('TABLE', t) FROM unnest(ARRAY[
  'cod_group', 'cod_val', 'mdl_sys', 'mdl_db', 'mdl_tbl', 'mdl_col',
  'mdl_tbl_hist', 'mdl_col_hist', 'mdl_index_hist', 'mdl_chg_hist', 'std_chck_rslt',
  'metric_clct_hist', 'metric_qry_hist', 'metric_tbl_hist', 'metric_index_hist', 'metric_impv_rcmnd', 'metric_impv_rslt']) AS t;
SELECT fn_grant_svc_only('FUNCTION', 'fn_upd_' || t || '_mod_dtm()') FROM unnest(ARRAY[
  'cod_group', 'cod_val', 'mdl_sys', 'mdl_db', 'mdl_tbl', 'mdl_col', 'std_chck_rslt',
  'metric_impv_rcmnd', 'metric_impv_rslt']) AS t;
