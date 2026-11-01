-- 011_dbms_sql_tun.sql — SQL 튜닝 랩 AI 튜닝 권고(PRD 12 §2-4, P40~P42·ANL-R06). 저장 계획(dbm_sql_plan) 1건 → 권고 → 승인/반려 → 효과 측정 뒤에만 적용 완료
-- DA-APPROVED: 2026-11-01 아소카(마스터 지시 "AI 튜닝 권고 바로 다음 진행") — 권고 결과 전용(행 데이터 미저장 A3 : 입력은 마스킹된 계획뿐), dbm_ 접두 dbms 소유
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only), sql/010(dbm_sql_plan — 참조는 앱 레벨, FK 미생성 : 임베디드 조인 미사용)
-- 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 상태 tun_sts_cd : RCMD 권고 → APRV 승인 | RJCT 반려 → APLD 적용완료(효과 측정 필수 — CHECK 로 aft_cost 없는 APLD 차단)
--  · engn_cd : AI(Claude) | RULE(키 없음·AI 실패 시 계획 경고·SQL 점검 규칙)
--  · 계획 1건당 활성 권고 1건(x_dbm_sql_tun_02 유일) — AI 비용 반복 방지
--  · 물리 DELETE 금지 — 삭제는 del_yn='Y'
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_sql_tun (
  tun_id       UUID          NOT NULL DEFAULT gen_random_uuid(),            -- 튜닝ID
  lnk_id       UUID          NOT NULL,                                      -- 연결ID → dbm_lnk.lnk_id(앱 레벨 참조)
  conn_id      VARCHAR(64)   NOT NULL,                                      -- 접속ID(schema.pi)
  plan_id      UUID          NOT NULL,                                      -- 전 계획ID → dbm_sql_plan.plan_id
  sql_hash     CHAR(64)      NOT NULL,                                      -- SQL해시(전 계획과 같음 — 후 계획 대조 키)
  engn_cd      VARCHAR(10)   NOT NULL,                                      -- 엔진코드(AI·RULE)
  rcmd_json    JSONB         NOT NULL,                                      -- 권고JSON(권고 항목 배열)
  tun_sts_cd   VARCHAR(10)   NOT NULL DEFAULT 'RCMD',                       -- 튜닝상태코드
  bfr_cost     NUMERIC(20,2) NOT NULL DEFAULT 0,                            -- 전비용(전 계획 Total Cost)
  aprv_id      TEXT,                                                        -- 승인자ID(승인·반려한 사용자)
  aprv_dtm     TIMESTAMPTZ,                                                 -- 승인일시(승인·반려 일시)
  aft_plan_id  UUID,                                                        -- 후 계획ID → dbm_sql_plan.plan_id
  aft_cost     NUMERIC(20,2),                                               -- 후비용(효과 측정)
  msr_dtm      TIMESTAMPTZ,                                                 -- 측정일시
  del_yn       CHAR(1)       NOT NULL DEFAULT 'N',                          -- 삭제여부
  del_dtm      TIMESTAMPTZ,                                                 -- 삭제일시
  regr_id      TEXT          NOT NULL DEFAULT 'ADMIN',                      -- 등록자ID
  reg_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 등록일시
  modr_id      TEXT          NOT NULL DEFAULT 'ADMIN',                      -- 변경자ID
  mod_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 변경일시
  CONSTRAINT pk_dbm_sql_tun PRIMARY KEY (tun_id),
  CONSTRAINT dbm_sql_tun_del_yn_check CHECK (del_yn IN ('Y', 'N')),
  CONSTRAINT dbm_sql_tun_engn_cd_check CHECK (engn_cd IN ('AI', 'RULE')),
  CONSTRAINT dbm_sql_tun_sts_cd_check CHECK (tun_sts_cd IN ('RCMD', 'APRV', 'RJCT', 'APLD')),
  CONSTRAINT dbm_sql_tun_sql_hash_check CHECK (sql_hash ~ '^[0-9a-f]{64}$'),
  -- 효과 측정 없이는 적용 완료 불가(P42)
  CONSTRAINT dbm_sql_tun_apld_check CHECK (tun_sts_cd <> 'APLD' OR (aft_cost IS NOT NULL AND aft_plan_id IS NOT NULL AND msr_dtm IS NOT NULL))
);
COMMENT ON TABLE  dbm_sql_tun IS 'SQL 튜닝 랩 AI 튜닝 권고 — 저장 계획 1건의 권고·승인·효과 측정(측정 없으면 적용 완료 불가)';
COMMENT ON COLUMN dbm_sql_tun.tun_sts_cd IS 'RCMD 권고 / APRV 승인 / RJCT 반려 / APLD 적용완료(aft_cost 필수)';
COMMENT ON COLUMN dbm_sql_tun.rcmd_json IS '권고 항목 배열 [{kind: INDEX|REWRITE|STATS|CONFIG, title, reason, ddl?, sql?}] — 입력 SQL·계획은 상수 마스킹본';

-- 목록(연결별 최신순) / 계획 1건당 활성 권고 1건
CREATE INDEX IF NOT EXISTS x_dbm_sql_tun_01 ON dbm_sql_tun (lnk_id, reg_dtm DESC) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS x_dbm_sql_tun_02 ON dbm_sql_tun (plan_id) WHERE del_yn = 'N';
COMMENT ON INDEX x_dbm_sql_tun_02 IS '계획 1건당 활성 권고 1건 — 같은 계획 AI 재호출(비용) 방지';

CREATE OR REPLACE FUNCTION fn_upd_dbm_sql_tun_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_sql_tun_mod_dtm ON dbm_sql_tun;
CREATE TRIGGER trg_dbm_sql_tun_mod_dtm
  BEFORE UPDATE ON dbm_sql_tun
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_sql_tun_mod_dtm();

SELECT fn_grant_svc_only('TABLE', 'dbm_sql_tun');

COMMIT;
