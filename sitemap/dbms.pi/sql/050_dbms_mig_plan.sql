-- 050_dbms_mig_plan.sql — PiMig 이행 계획(PRD 12 §6-1, MIG-R02·R08~R14, F6)
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 계획 1개, 설계 스냅샷(이름·타입만)·체크리스트만, 고객 DB 행 데이터 없음(계약 A3·A4)
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only), sql/004(dbm_lnk). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 계획 1건 = 1행. 대상 = 연결(lnk_id)·프로젝트(prj_id, schema.pi) — 다른 DB 의 ID 라 FK 없음(앱 참조)
--  · snap_json = 계획 생성 시점 설계 스냅샷 { tables:[{nm,cols:[{nm,tp,pk}]}], rels:[{p,c}], dropped } — 이후 모델이 바뀌어도 계획은 고정(A4)
--  · chk_json = 컷오버 체크리스트 { cdcHandoff, valueConv, charset, lob, seqResync, timezone, backpressure : boolean }
--  · sts_cd = DRAFT(작성중) / READY(체크리스트 전부 확인 — 서버가 검사). 실행 엔진은 범위 밖(D6)
--  · 목록 = 연결별 최근 변경순 페이지 조회(x_dbm_mig_plan_01). 물리 삭제 없음
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_mig_plan (
  mig_plan_id   UUID         NOT NULL DEFAULT gen_random_uuid(),           -- 이행계획ID
  lnk_id        UUID         NOT NULL,                                     -- 연결ID → dbm_lnk.lnk_id
  prj_id        TEXT         NOT NULL,                                     -- 프로젝트ID(schema.pi)
  prj_nm        TEXT,                                                      -- 프로젝트명(생성 당시)
  plan_nm       TEXT         NOT NULL,                                     -- 계획명
  chnk_sz       INTEGER      NOT NULL DEFAULT 10000,                       -- 묶음크기(커밋 단위 행 수)
  prll_cnt      INTEGER      NOT NULL DEFAULT 4,                           -- 병렬수
  snap_json     JSONB        NOT NULL DEFAULT '{}'::jsonb,                 -- 설계스냅샷JSON
  chk_json      JSONB        NOT NULL DEFAULT '{}'::jsonb,                 -- 점검JSON(컷오버 체크리스트)
  sts_cd        TEXT         NOT NULL DEFAULT 'DRAFT',                     -- 상태코드
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',                         -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 등록자ID
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 등록일시
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 변경자ID
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 변경일시
  CONSTRAINT pk_dbm_mig_plan PRIMARY KEY (mig_plan_id),
  CONSTRAINT dbm_mig_plan_del_yn_check CHECK (del_yn IN ('Y', 'N')),
  CONSTRAINT dbm_mig_plan_sts_cd_check CHECK (sts_cd IN ('DRAFT', 'READY')),
  CONSTRAINT dbm_mig_plan_chnk_sz_check CHECK (chnk_sz BETWEEN 100 AND 1000000),
  CONSTRAINT dbm_mig_plan_prll_cnt_check CHECK (prll_cnt BETWEEN 1 AND 64)
);
COMMENT ON TABLE dbm_mig_plan IS 'PiMig 이행 계획 — 설계 스냅샷·컷오버 체크리스트(행 데이터 없음)';

-- 조회 : 연결별 최근 변경 계획 페이지
CREATE INDEX IF NOT EXISTS x_dbm_mig_plan_01
  ON dbm_mig_plan (lnk_id, mod_dtm DESC) WHERE del_yn = 'N';

SELECT fn_grant_svc_only('TABLE', 'dbm_mig_plan');

-- mod_dtm 자동 갱신(DA 검토 m1 — 앱 누락 시 정렬 보호)
CREATE OR REPLACE FUNCTION fn_upd_dbm_mig_plan_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_mig_plan_mod_dtm ON dbm_mig_plan;
CREATE TRIGGER trg_dbm_mig_plan_mod_dtm
  BEFORE UPDATE ON dbm_mig_plan
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_mig_plan_mod_dtm();

COMMIT;
