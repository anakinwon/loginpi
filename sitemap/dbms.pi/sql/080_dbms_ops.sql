-- 080_dbms_ops.sql — DB 운영 안전(PRD 12 §9) : 진단 실행 요약(dbm_ops_run) + 백업·복구 수동 점검표(dbm_ops_chk)
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 2테이블, 진단 판정 요약·점검 체크만 저장(고객 DB 행 데이터 없음 · 계약 A3), sys_user 무변경
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only)·004(dbm_lnk). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 진단 = POST /api/ops/diagnose 1회 → dbm_ops_run 1행(판정 건수 + 판정 JSON — 설정값·롤명·테이블명 같은 메타데이터만)
--  · 점검표 = (연결, 접속, 점검코드) 1행 upsert. 점검코드는 앱 src/lib/ops/params.ts MANUAL_CHECKS
--  · lnk_id → dbm_lnk FK 는 두지 않음(임베디드 조인 미사용). 정리는 논리삭제(del_yn), 물리 DELETE 없음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_ops_run (
  run_id          UUID         NOT NULL DEFAULT gen_random_uuid(),         -- 진단실행ID
  lnk_id          UUID         NOT NULL,                                   -- 연결ID(dbm_lnk)
  conn_id         TEXT         NOT NULL,                                   -- 접속ID(schema.pi 접속)
  run_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 실행일시
  ok_cnt          INTEGER      NOT NULL DEFAULT 0,                         -- 정상건수
  warn_cnt        INTEGER      NOT NULL DEFAULT 0,                         -- 경고건수
  risk_cnt        INTEGER      NOT NULL DEFAULT 0,                         -- 위험건수
  rslt_json       JSONB        NOT NULL DEFAULT '{}'::jsonb,               -- 판정결과JSON
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_ops_run PRIMARY KEY (run_id),
  CONSTRAINT dbm_ops_run_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_ops_run IS 'DB 운영 안전 진단 실행 요약 — 파라미터·권한·백업·복제 판정(메타데이터만, 행 데이터 없음)';

-- 조회 : 연결·접속의 최근 진단(최신 1건·이력 페이지)
CREATE INDEX IF NOT EXISTS x_dbm_ops_run_01
  ON dbm_ops_run (lnk_id, conn_id, run_dtm DESC) WHERE del_yn = 'N';

CREATE TABLE IF NOT EXISTS dbm_ops_chk (
  lnk_id          UUID         NOT NULL,                                   -- 연결ID(dbm_lnk)
  conn_id         TEXT         NOT NULL,                                   -- 접속ID(schema.pi 접속)
  chk_cd          VARCHAR(40)  NOT NULL,                                   -- 점검코드
  done_yn         CHAR(1)      NOT NULL DEFAULT 'N',                       -- 완료여부
  memo_txt        VARCHAR(500),                                            -- 메모
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_ops_chk PRIMARY KEY (lnk_id, conn_id, chk_cd),
  CONSTRAINT dbm_ops_chk_done_yn_check CHECK (done_yn IN ('Y', 'N')),
  CONSTRAINT dbm_ops_chk_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_ops_chk IS 'DB 운영 안전 — 백업·복구 수동 점검표(연결·접속·점검코드별 완료 여부·메모)';

SELECT fn_grant_svc_only('TABLE', 'dbm_ops_run');
SELECT fn_grant_svc_only('TABLE', 'dbm_ops_chk');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_ops_run_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_dbm_ops_run_mod_dtm ON dbm_ops_run;
CREATE TRIGGER trg_dbm_ops_run_mod_dtm
  BEFORE UPDATE ON dbm_ops_run
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_ops_run_mod_dtm();

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_ops_chk_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_dbm_ops_chk_mod_dtm ON dbm_ops_chk;
CREATE TRIGGER trg_dbm_ops_chk_mod_dtm
  BEFORE UPDATE ON dbm_ops_chk
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_ops_chk_mod_dtm();

COMMIT;
