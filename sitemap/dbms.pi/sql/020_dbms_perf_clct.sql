-- 020_dbms_perf_clct.sql — 성능 관측(PRD 12 §3, ANL-R02·R03) 수집 스냅샷 : 수집 1회 + 쿼리·테이블·인덱스 통계 자식 3종
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 성능 스냅샷 4테이블, 통계 수치만 저장(행 데이터 없음 · 계약 A3), sys_user 무변경
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only)·004(dbm_lnk). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 수집 = POST /api/perf/collect 1회 → dbm_prf_clct 1행 + 자식(쿼리 Top·테이블·인덱스) 여러 행. 자식 PK = (clct_id, *_seq) — pg_stat_statements queryid 는 사용자·DB 별로 겹칠 수 있어 순번 키
--  · 누적치 역전 보정(stat_reset_dtm 비교 + 호출 수 감소 감지)은 앱 src/lib/perf/calc.ts. 쿼리문은 정규화 문구 + 상수 마스킹 후 저장
--  · lnk_id → dbm_lnk FK 는 두지 않음(임베디드 조인 미사용, 별도 조회). 정리는 논리삭제(del_yn), 물리 DELETE 없음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_prf_clct (
  clct_id         UUID         NOT NULL DEFAULT gen_random_uuid(),         -- 수집ID
  lnk_id          UUID         NOT NULL,                                   -- 연결ID(dbm_lnk)
  conn_id         TEXT         NOT NULL,                                   -- 접속ID(schema.pi 접속)
  clct_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 수집일시
  stat_reset_dtm  TIMESTAMPTZ,                                             -- 통계초기화일시(없으면 NULL)
  pgss_yn         CHAR(1)      NOT NULL DEFAULT 'N',                       -- pg_stat_statements 사용여부
  db_sz_byte      BIGINT,                                                  -- DB크기(바이트)
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_prf_clct PRIMARY KEY (clct_id),
  CONSTRAINT dbm_prf_clct_pgss_yn_check CHECK (pgss_yn IN ('Y', 'N')),
  CONSTRAINT dbm_prf_clct_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_prf_clct IS '성능 수집 스냅샷 — 연결·접속별 수집 1회(통계 수치만, 행 데이터 없음)';

-- 조회 : 연결·접속의 최근 수집 2건(증감)·30일 추이
CREATE INDEX IF NOT EXISTS x_dbm_prf_clct_01
  ON dbm_prf_clct (lnk_id, conn_id, clct_dtm DESC) WHERE del_yn = 'N';

CREATE TABLE IF NOT EXISTS dbm_prf_qry (
  clct_id         UUID           NOT NULL,                                 -- 수집ID(dbm_prf_clct)
  qry_seq         INTEGER        NOT NULL,                                 -- 쿼리순번
  qry_id          TEXT           NOT NULL,                                 -- 쿼리ID(pg_stat_statements queryid)
  qry_txt         TEXT,                                                    -- 쿼리문(정규화 + 상수 마스킹)
  call_cnt        BIGINT         NOT NULL DEFAULT 0,                       -- 호출수(누적)
  tot_ms          NUMERIC(20,3)  NOT NULL DEFAULT 0,                       -- 총수행시간ms(누적)
  avg_ms          NUMERIC(20,3)  NOT NULL DEFAULT 0,                       -- 평균수행시간ms
  row_cnt         BIGINT         NOT NULL DEFAULT 0,                       -- 처리행수(누적)
  del_yn          CHAR(1)        NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT           NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm         TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id         TEXT           NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm         TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_dbm_prf_qry PRIMARY KEY (clct_id, qry_seq),
  CONSTRAINT dbm_prf_qry_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_prf_qry IS '성능 수집 — 쿼리 통계(pg_stat_statements 상위, 누적치)';

CREATE TABLE IF NOT EXISTS dbm_prf_tbl (
  clct_id         UUID         NOT NULL,                                   -- 수집ID(dbm_prf_clct)
  tbl_seq         INTEGER      NOT NULL,                                   -- 테이블순번
  schm_nm         TEXT,                                                    -- 스키마명
  tbl_nm          TEXT         NOT NULL,                                   -- 테이블명
  full_scan_cnt   BIGINT       NOT NULL DEFAULT 0,                         -- 전체스캔수(seq_scan)
  idx_scan_cnt    BIGINT       NOT NULL DEFAULT 0,                         -- 인덱스스캔수
  live_tup_cnt    BIGINT       NOT NULL DEFAULT 0,                         -- 유효튜플수
  dead_tup_cnt    BIGINT       NOT NULL DEFAULT 0,                         -- 죽은튜플수
  tot_sz_byte     BIGINT,                                                  -- 전체크기(바이트, 인덱스·TOAST 포함)
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_prf_tbl PRIMARY KEY (clct_id, tbl_seq),
  CONSTRAINT dbm_prf_tbl_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_prf_tbl IS '성능 수집 — 테이블 통계(pg_stat_user_tables + 크기)';

CREATE TABLE IF NOT EXISTS dbm_prf_idx (
  clct_id         UUID         NOT NULL,                                   -- 수집ID(dbm_prf_clct)
  idx_seq         INTEGER      NOT NULL,                                   -- 인덱스순번
  schm_nm         TEXT,                                                    -- 스키마명
  tbl_nm          TEXT         NOT NULL,                                   -- 테이블명
  idx_nm          TEXT         NOT NULL,                                   -- 인덱스명
  idx_scan_cnt    BIGINT       NOT NULL DEFAULT 0,                         -- 인덱스스캔수
  idx_sz_byte     BIGINT,                                                  -- 인덱스크기(바이트)
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_prf_idx PRIMARY KEY (clct_id, idx_seq),
  CONSTRAINT dbm_prf_idx_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_prf_idx IS '성능 수집 — 인덱스 통계(pg_stat_user_indexes + 크기)';

SELECT fn_grant_svc_only('TABLE', 'dbm_prf_clct');
SELECT fn_grant_svc_only('TABLE', 'dbm_prf_qry');
SELECT fn_grant_svc_only('TABLE', 'dbm_prf_tbl');
SELECT fn_grant_svc_only('TABLE', 'dbm_prf_idx');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_prf_clct_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_prf_clct_mod_dtm ON dbm_prf_clct;
CREATE TRIGGER trg_dbm_prf_clct_mod_dtm
  BEFORE UPDATE ON dbm_prf_clct
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_prf_clct_mod_dtm();

COMMIT;
