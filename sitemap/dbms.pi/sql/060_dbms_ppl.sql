-- 060_dbms_ppl.sql — PiCDC 파이프라인 정의 (PRD 12 §7-2, F7 — D6 설계 전용, 실행 엔진 없음)
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 정의 1개, 고객 DB 행 데이터 없음(단계·일정·대상 설명만, 계약 A3)
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only), sql/004(dbm_lnk). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 파이프라인 1개 = 1행. 원천 = 연결(lnk_id)의 접속(src_conn_id, schema.pi ID — 다른 DB 라 FK 없음, 앱 참조)
--  · adapter_cd = POLL(변경시각 폴링)·LOGICAL(WAL 논리 복제)·KEY_DIFF(PK 스냅샷 비교), sts_cd = DRAFT(워커 확정 전 고정)
--  · def_json = { steps:[{kind:SOURCE|TRANSFORM|TARGET, op, note}], tables:[원천 테이블명] }, sched_txt = cron 5필드(빈 값 = 수동)
--  · 이름은 연결 안에서 유일(x_dbm_ppl_02, 활성행) — 충돌은 API 가 409. 목록 = 연결별 최근 변경순 페이지(x_dbm_ppl_01). 물리 삭제 없음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_ppl (
  ppl_id        UUID         NOT NULL DEFAULT gen_random_uuid(),           -- 파이프라인ID
  lnk_id        UUID         NOT NULL,                                     -- 연결ID → dbm_lnk.lnk_id
  ppl_nm        TEXT         NOT NULL,                                     -- 파이프라인명
  src_conn_id   TEXT         NOT NULL,                                     -- 원천접속ID(schema.pi)
  tgt_desc      TEXT,                                                      -- 대상설명(대상 DB·레이크 등 자유 기술)
  adapter_cd    TEXT         NOT NULL,                                     -- 어댑터코드
  sched_txt     TEXT,                                                      -- 일정(cron 5필드)
  def_json      JSONB        NOT NULL DEFAULT '{}'::jsonb,                 -- 정의JSON(단계·대상 테이블)
  sts_cd        TEXT         NOT NULL DEFAULT 'DRAFT',                     -- 상태코드
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',                         -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 등록자ID
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 등록일시
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 변경자ID
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 변경일시
  CONSTRAINT pk_dbm_ppl PRIMARY KEY (ppl_id),
  CONSTRAINT dbm_ppl_adapter_cd_check CHECK (adapter_cd IN ('POLL', 'LOGICAL', 'KEY_DIFF')),
  CONSTRAINT dbm_ppl_sts_cd_check CHECK (sts_cd IN ('DRAFT')),
  CONSTRAINT dbm_ppl_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_ppl IS 'PiCDC 파이프라인 정의 — 설계 전용(DRAFT), 행 데이터 없음';

-- 조회 : 연결별 최근 변경 페이지
CREATE INDEX IF NOT EXISTS x_dbm_ppl_01
  ON dbm_ppl (lnk_id, mod_dtm DESC) WHERE del_yn = 'N';
-- 유일 : 연결 안 활성 파이프라인명
CREATE UNIQUE INDEX IF NOT EXISTS x_dbm_ppl_02
  ON dbm_ppl (lnk_id, ppl_nm) WHERE del_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'dbm_ppl');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_ppl_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_dbm_ppl_mod_dtm ON dbm_ppl;
CREATE TRIGGER trg_dbm_ppl_mod_dtm
  BEFORE UPDATE ON dbm_ppl
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_ppl_mod_dtm();

COMMIT;
