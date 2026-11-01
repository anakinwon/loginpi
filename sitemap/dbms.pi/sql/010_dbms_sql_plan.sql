-- 010_dbms_sql_plan.sql — SQL 튜닝 랩 저장 실행계획(PRD 12 §2-2 계획 비교). 연결(dbm_lnk) 단위로 EXPLAIN JSON 스냅샷을 보관해 전/후 비교
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — 계획 스냅샷 전용 테이블(행 데이터 미저장 A3, 상수는 앱이 ? 마스킹 후 저장), dbm_ 접두 dbms 소유
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only), sql/004(dbm_lnk — 참조는 앱 레벨, FK 미생성 : 순번 독립 적용·임베디드 조인 미사용)
-- 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · lnk_id = dbm_lnk.lnk_id(소유 확인은 API requireLink), conn_id = schema.pi 접속ID(문자열 그대로)
--  · sql_hash = 상수 마스킹·공백 정규화한 SQL 의 SHA-256(같은 SQL 의 계획끼리 묶음), sql_txt·plan_json 은 마스킹본
--  · 물리 DELETE 금지 — 삭제는 del_yn='Y'
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_sql_plan (
  plan_id     UUID          NOT NULL DEFAULT gen_random_uuid(),            -- 계획ID
  lnk_id      UUID          NOT NULL,                                      -- 연결ID → dbm_lnk.lnk_id(앱 레벨 참조)
  conn_id     VARCHAR(64)   NOT NULL,                                      -- 접속ID(schema.pi)
  plan_nm     VARCHAR(100),                                                -- 계획명(사용자 이름표 — 예 '인덱스 추가 후')
  sql_hash    CHAR(64)      NOT NULL,                                      -- SQL해시(정규화 SHA-256 hex)
  sql_txt     TEXT          NOT NULL,                                      -- SQL내용(상수 마스킹본)
  plan_json   JSONB         NOT NULL,                                      -- 계획JSON(EXPLAIN FORMAT JSON 최상위 Plan, 상수 마스킹본)
  total_cost  NUMERIC(20,2) NOT NULL DEFAULT 0,                            -- 총비용(최상위 Total Cost)
  del_yn      CHAR(1)       NOT NULL DEFAULT 'N',                          -- 삭제여부
  del_dtm     TIMESTAMPTZ,                                                 -- 삭제일시
  regr_id     TEXT          NOT NULL DEFAULT 'ADMIN',                      -- 등록자ID
  reg_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 등록일시
  modr_id     TEXT          NOT NULL DEFAULT 'ADMIN',                      -- 변경자ID
  mod_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 변경일시
  CONSTRAINT pk_dbm_sql_plan PRIMARY KEY (plan_id),
  CONSTRAINT dbm_sql_plan_del_yn_check CHECK (del_yn IN ('Y', 'N')),
  CONSTRAINT dbm_sql_plan_sql_hash_check CHECK (sql_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT dbm_sql_plan_sql_txt_check CHECK (length(sql_txt) <= 20000)
);
COMMENT ON TABLE  dbm_sql_plan IS 'SQL 튜닝 랩 저장 실행계획 — 연결별 EXPLAIN JSON 스냅샷(상수 마스킹), 전/후 계획 비교용';
COMMENT ON COLUMN dbm_sql_plan.sql_hash IS '상수 마스킹·공백 정규화·소문자 SQL 의 SHA-256 — 같은 SQL 계획 묶음 키';

-- 목록(연결별 최신순) / 같은 SQL 계획 묶음
CREATE INDEX IF NOT EXISTS x_dbm_sql_plan_01 ON dbm_sql_plan (lnk_id, reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS x_dbm_sql_plan_02 ON dbm_sql_plan (lnk_id, sql_hash, reg_dtm DESC) WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_dbm_sql_plan_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_sql_plan_mod_dtm ON dbm_sql_plan;
CREATE TRIGGER trg_dbm_sql_plan_mod_dtm
  BEFORE UPDATE ON dbm_sql_plan
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_sql_plan_mod_dtm();

-- 권한 — 서버 전용 service_role (anon·authenticated 회수), RLS 미사용
SELECT fn_grant_svc_only('TABLE', 'dbm_sql_plan');

COMMIT;

-- 검증 (적용 후 수동 실행)
-- SELECT count(*) FROM dbm_sql_plan;                                          → 0
-- INSERT INTO dbm_sql_plan (lnk_id, conn_id, sql_hash, sql_txt, plan_json) VALUES (gen_random_uuid(), 'c', 'x', 's', '{}'); → 23514(sql_hash CHECK)
