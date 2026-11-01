-- 070_dbms_lake_ds.sql — 분석·레이크 데이터셋 설계(PRD 12절 8-1·8-3, ANL-R01) : 연결·프로젝트·테이블별 레이크 3층 이름·표준 적합률·적재 상태
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 설계 테이블 1개, 이름·건수 통계만(고객 DB 행 데이터 없음, 계약 A3), 시스템 칼럼 4·논리삭제
-- 선행 : 004(dbm_lnk, F1b). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 1행 = 레이크에 올릴 원천 테이블 1개의 3층 이름(raw_·std_·cur_) — 화면 '레이크 설계에 추가'가 schema.pi /model 로 다시 계산해 저장
--  · 저장소(PRD 10절 #7)는 미결 — 적재 상태 load_sts_cd 는 DSGN(설계만)으로 시작, 적재 엔진(PipeLine, F7)이 LOADED·FAIL 과 lst_load_dtm 갱신 예정
--  · 다시 추가하면 같은 행을 되살림(유일 제약 x_dbm_lake_ds_01 + upsert, del_yn='N') — 물리 DELETE 없음
--  · prj_id = schema.pi 프로젝트ID(다른 DB 라 FK 없음, 앱 참조)
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_lake_ds (
  ds_id         UUID          NOT NULL DEFAULT gen_random_uuid(),          -- 데이터셋ID
  lnk_id        UUID          NOT NULL,                                    -- 연결ID(dbm_lnk)
  prj_id        TEXT          NOT NULL,                                    -- 프로젝트ID(schema.pi)
  prj_nm        TEXT,                                                      -- 프로젝트명(저장 당시)
  tbl_nm        TEXT          NOT NULL,                                    -- 원천테이블명
  raw_tbl_nm    TEXT          NOT NULL,                                    -- 원천층테이블명
  std_tbl_nm    TEXT          NOT NULL,                                    -- 표준층테이블명
  cur_tbl_nm    TEXT          NOT NULL,                                    -- 분석층테이블명
  col_cnt       INTEGER       NOT NULL DEFAULT 0,                          -- 칼럼수
  cnfm_pct      NUMERIC(5, 1) NOT NULL DEFAULT 0,                          -- 표준적합률(%)
  load_sts_cd   VARCHAR(10)   NOT NULL DEFAULT 'DSGN',                     -- 적재상태코드: DSGN·LOADED·FAIL
  lst_load_dtm  TIMESTAMPTZ,                                               -- 최종적재일시
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT pk_dbm_lake_ds PRIMARY KEY (ds_id),
  CONSTRAINT dbm_lake_ds_load_sts_cd_check CHECK (load_sts_cd IN ('DSGN', 'LOADED', 'FAIL')),
  CONSTRAINT dbm_lake_ds_cnfm_pct_check CHECK (cnfm_pct BETWEEN 0 AND 100),
  CONSTRAINT dbm_lake_ds_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_lake_ds IS '레이크 데이터셋 설계 — 원천 테이블별 3층(raw·standardized·curated) 이름·표준 적합률·적재 상태, 행 데이터 없음';

-- upsert 대상(연결·프로젝트·테이블 1행) — 논리삭제 행도 되살리므로 부분 인덱스 아님
CREATE UNIQUE INDEX IF NOT EXISTS x_dbm_lake_ds_01
  ON dbm_lake_ds (lnk_id, prj_id, tbl_nm);
-- 조회 : 연결별 카탈로그(최근 변경 순)
CREATE INDEX IF NOT EXISTS x_dbm_lake_ds_02
  ON dbm_lake_ds (lnk_id, mod_dtm DESC) WHERE del_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'dbm_lake_ds');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_lake_ds_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_dbm_lake_ds_mod_dtm ON dbm_lake_ds;
CREATE TRIGGER trg_dbm_lake_ds_mod_dtm
  BEFORE UPDATE ON dbm_lake_ds
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_lake_ds_mod_dtm();

COMMIT;
