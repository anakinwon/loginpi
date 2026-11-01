-- 030_dbms_mon_rule.sql — 모니터링 임계치 규칙(PRD 12절 4-3) : 연결(dbm_lnk)별 사용자 정의 경보 규칙
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 설정 테이블 1개, 고객 DB 행 데이터 없음(계약 A3), 시스템 칼럼 4·논리삭제
-- 선행 : 004(dbm_lnk, F1b). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 평가는 화면(클라이언트)이 schema.pi 모니터 요약(/mon/summary)에 대해 수행 — 이 표는 규칙만 보관(결정 D7 읽기 연계)
--  · metric_cd : APP_TPS·APP_ERR_PCT·APP_SLOW_CNT·APP_AVG_MS·DB_SESS_CNT·DB_LOCK_WAIT_CNT·DB_CACHE_HIT_PCT·DB_SIZE_MB·URL_RSP_MS·URL_FAIL_CNT
--  · conn_id : DB 지표 대상 접속(schema.pi connId), NULL = 전체 접속
--  · FK 없음 — dbm_lnk 는 F1b 소유·적용 순서 독립(앱이 requireLink 로 소유 확인), 연결당 규칙 상한 50 은 앱이 막음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_mon_rule (
  rule_id    UUID           NOT NULL DEFAULT gen_random_uuid(),  -- 규칙ID
  lnk_id     UUID           NOT NULL,                            -- 연결ID(dbm_lnk)
  metric_cd  VARCHAR(30)    NOT NULL,                            -- 지표코드
  conn_id    TEXT,                                               -- 접속ID(schema.pi, NULL = 전체)
  op_cd      VARCHAR(2)     NOT NULL,                            -- 비교연산코드: GT·GE·LT·LE
  thr_val    NUMERIC(20, 4) NOT NULL,                            -- 임계값
  use_yn     CHAR(1)        NOT NULL DEFAULT 'Y',                -- 사용여부
  del_yn     CHAR(1)        NOT NULL DEFAULT 'N',                -- 삭제여부
  del_dtm    TIMESTAMPTZ,                                        -- 삭제일시
  regr_id    TEXT           NOT NULL DEFAULT 'ADMIN',            -- 등록자ID
  reg_dtm    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 등록일시
  modr_id    TEXT           NOT NULL DEFAULT 'ADMIN',            -- 변경자ID
  mod_dtm    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 변경일시
  CONSTRAINT pk_dbm_mon_rule PRIMARY KEY (rule_id),
  CONSTRAINT dbm_mon_rule_metric_cd_check CHECK (metric_cd IN (
    'APP_TPS', 'APP_ERR_PCT', 'APP_SLOW_CNT', 'APP_AVG_MS',
    'DB_SESS_CNT', 'DB_LOCK_WAIT_CNT', 'DB_CACHE_HIT_PCT', 'DB_SIZE_MB',
    'URL_RSP_MS', 'URL_FAIL_CNT')),
  CONSTRAINT dbm_mon_rule_op_cd_check CHECK (op_cd IN ('GT', 'GE', 'LT', 'LE')),
  CONSTRAINT dbm_mon_rule_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT dbm_mon_rule_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_mon_rule IS '모니터링 임계치 규칙 — 연결별 사용자 정의 경보, 평가는 화면이 schema.pi 모니터 요약에 대해 수행';

-- 조회 : 연결별 활성 규칙 목록(등록 순)
CREATE INDEX IF NOT EXISTS x_dbm_mon_rule_01
  ON dbm_mon_rule (lnk_id, reg_dtm) WHERE del_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'dbm_mon_rule');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_mon_rule_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_dbm_mon_rule_mod_dtm ON dbm_mon_rule;
CREATE TRIGGER trg_dbm_mon_rule_mod_dtm
  BEFORE UPDATE ON dbm_mon_rule
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_mon_rule_mod_dtm();

COMMIT;
