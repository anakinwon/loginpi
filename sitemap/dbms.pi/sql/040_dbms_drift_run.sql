-- 040_dbms_drift_run.sql — 모델↔DB 정합 탐지 실행 이력 (PRD 12 §5-3·5-4, F5)
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 이력 1개, 고객 DB 행 데이터 없음(건수 요약 JSON만, 계약 A3)
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only), sql/004(dbm_lnk). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 탐지 1회 = 1행. 대상 = 연결(lnk_id)·접속(conn_id, schema.pi)·프로젝트(prj_id, schema.pi) — 다른 DB 의 ID 라 FK 없음(앱 참조)
--  · smry_json = { missingTables, extraTables, colMismatches, missingIndexes, extraIndexes, ddlMissing, idxUsage, unusedIndexes } 건수만
--  · 목록 = 연결별 최근순 페이지 조회(x_dbm_drift_run_01). 물리 삭제 없음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_drift_run (
  drift_run_id  UUID         NOT NULL DEFAULT gen_random_uuid(),           -- 정합탐지실행ID
  lnk_id        UUID         NOT NULL,                                     -- 연결ID → dbm_lnk.lnk_id
  conn_id       TEXT         NOT NULL,                                     -- 접속ID(schema.pi)
  prj_id        TEXT         NOT NULL,                                     -- 프로젝트ID(schema.pi)
  prj_nm        TEXT,                                                      -- 프로젝트명(실행 당시)
  run_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 실행일시
  smry_json     JSONB        NOT NULL DEFAULT '{}'::jsonb,                 -- 요약JSON(건수만)
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',                         -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 등록자ID
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 등록일시
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 변경자ID
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 변경일시
  CONSTRAINT pk_dbm_drift_run PRIMARY KEY (drift_run_id),
  CONSTRAINT dbm_drift_run_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_drift_run IS '모델↔DB 정합 탐지 실행 이력 — 건수 요약만(행 데이터 없음)';

-- 조회 : 연결별 최근 실행 페이지
CREATE INDEX IF NOT EXISTS x_dbm_drift_run_01
  ON dbm_drift_run (lnk_id, run_dtm DESC) WHERE del_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'dbm_drift_run');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_drift_run_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_dbm_drift_run_mod_dtm ON dbm_drift_run;
CREATE TRIGGER trg_dbm_drift_run_mod_dtm
  BEFORE UPDATE ON dbm_drift_run
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_drift_run_mod_dtm();

COMMIT;
