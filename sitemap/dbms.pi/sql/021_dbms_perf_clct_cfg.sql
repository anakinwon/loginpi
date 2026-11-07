-- 021_dbms_perf_clct_cfg.sql — 성능 관측 상시 자동 수집(PRD 12 §3-1, ANL-R02) 설정 : 연결·접속별 켜기/끄기 + 마지막 실행 결과
-- DA-APPROVED: 2026-11-07 da-governance-expert — dbm_ 접두 설정 테이블 1개(dbm_prf_clct_cfg), 신규 표준단어 없음(CLCT·CFG·LST·RUN·RSLT 기존 선례), 시스템 칼럼 4·논리삭제, FK 없음(020 과 같음 · 임베디드 조인 미사용), 고객 DB 행 데이터 없음(계약 A3)
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only)·004(dbm_lnk)·020(dbm_prf_clct). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 1행 = 연결(dbm_lnk) × 접속(schema.pi 접속) 자동 수집 설정. 켜기 = D1 관측 요금제부터(src/lib/plan-rules.ts PERM_MIN.PERF_AUTO), 끄기 = 누구나
--  · 실행 = Vercel Cron GET /api/cron/perf-collect(매일 KST 03:00~04:50 10분 간격) — 오늘 기준 시각(KST 03:00) 이전에 마지막으로 돈 행만 대상, 접속마다 하루 1번
--  · 수집 결과는 기존 dbm_prf_clct·자식 3종에 그대로 쌓고 regr_id = 'SYSTEM' 으로 표시(무료 하루 수동 수집 횟수에서 제외)
--  · 일시 오류(시간 초과·schema.pi 장애·호출 한도·DB) = lst_run_dtm 미갱신 → 같은 시간대 다음 회차 재시도. 다시 해도 안 되는 오류(토큰 만료·연결 해제·접속 범위 밖·미지원 접속) = use_yn 'N' 로 자동 끔
--  · lnk_id → dbm_lnk FK 는 두지 않음(임베디드 조인 미사용, 별도 조회 — 020 과 같음). 정리는 논리삭제(del_yn), 물리 DELETE 없음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_prf_clct_cfg (
  lnk_id          UUID         NOT NULL,                                   -- 연결ID(dbm_lnk)
  conn_id         TEXT         NOT NULL,                                   -- 접속ID(schema.pi 접속)
  use_yn          CHAR(1)      NOT NULL DEFAULT 'Y',                       -- 사용여부(자동 수집 켜짐)
  lst_run_dtm     TIMESTAMPTZ,                                             -- 최종실행일시(성공 또는 다시 해도 안 되는 실패)
  lst_rslt_cd     VARCHAR(40),                                             -- 최종결과코드(OK 또는 오류 코드)
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_prf_clct_cfg PRIMARY KEY (lnk_id, conn_id),
  CONSTRAINT dbm_prf_clct_cfg_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT dbm_prf_clct_cfg_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_prf_clct_cfg IS '성능 수집 설정 — 연결·접속별 상시 자동 수집 켜기/끄기·마지막 실행 결과';

-- 크론 대상 조회 : 켜진 행 중 마지막 실행이 기준 시각 이전(또는 없음)
CREATE INDEX IF NOT EXISTS x_dbm_prf_clct_cfg_01
  ON dbm_prf_clct_cfg (lst_run_dtm NULLS FIRST) WHERE use_yn = 'Y' AND del_yn = 'N';
COMMENT ON INDEX x_dbm_prf_clct_cfg_01 IS '크론 대상 조회 — 켜진 행 최종실행일시 오름차순(NULL 먼저)';

SELECT fn_grant_svc_only('TABLE', 'dbm_prf_clct_cfg');

-- mod_dtm 자동 갱신(020 과 같은 규칙)
CREATE OR REPLACE FUNCTION fn_upd_dbm_prf_clct_cfg_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_prf_clct_cfg_mod_dtm ON dbm_prf_clct_cfg;
CREATE TRIGGER trg_dbm_prf_clct_cfg_mod_dtm
  BEFORE UPDATE ON dbm_prf_clct_cfg
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_prf_clct_cfg_mod_dtm();

COMMIT;
