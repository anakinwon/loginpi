-- 090_dbms_lrn_prgs.sql — DBA 학습(PRD 12 §10-1) SQLP·DAP 실습 진도. 사용자·문제당 마지막 답안 1행(다시 풀면 갱신)
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — 학습 진도 전용 테이블(고객 DB 행 데이터 없음 A3), 문제 은행은 앱 정적 코드(src/lib/learn/questions.ts), dbm_ 접두 dbms 소유
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only)
-- 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · usr_id = sys_user.usr_id(앱 레벨 참조, FK 미생성), qst_id = 문제ID('q' + 두 자리, 앱 정적 은행)
--  · PK (usr_id, qst_id) — 앱은 upsert(onConflict usr_id,qst_id). 물리 DELETE 금지 — 초기화는 del_yn='Y'
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_lrn_prgs (
  usr_id      UUID          NOT NULL,                                      -- 사용자ID → sys_user.usr_id(앱 레벨 참조)
  qst_id      VARCHAR(10)   NOT NULL,                                      -- 문제ID(앱 정적 은행)
  chc_no      SMALLINT      NOT NULL,                                      -- 선택번호(0부터)
  crct_yn     CHAR(1)       NOT NULL,                                      -- 정답여부
  ans_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 답안일시(마지막)
  del_yn      CHAR(1)       NOT NULL DEFAULT 'N',                          -- 삭제여부
  del_dtm     TIMESTAMPTZ,                                                 -- 삭제일시
  regr_id     TEXT          NOT NULL DEFAULT 'ADMIN',                      -- 등록자ID
  reg_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 등록일시
  modr_id     TEXT          NOT NULL DEFAULT 'ADMIN',                      -- 변경자ID
  mod_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,            -- 변경일시
  CONSTRAINT pk_dbm_lrn_prgs PRIMARY KEY (usr_id, qst_id),
  CONSTRAINT dbm_lrn_prgs_qst_id_check CHECK (qst_id ~ '^q[0-9]{2}$'),
  CONSTRAINT dbm_lrn_prgs_chc_no_check CHECK (chc_no BETWEEN 0 AND 9),
  CONSTRAINT dbm_lrn_prgs_crct_yn_check CHECK (crct_yn IN ('Y', 'N')),
  CONSTRAINT dbm_lrn_prgs_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  dbm_lrn_prgs IS 'DBA 학습 실습 진도 — 사용자·문제당 마지막 답안(정답여부·답안일시)';
COMMENT ON COLUMN dbm_lrn_prgs.qst_id IS '앱 정적 문제 은행 ID(src/lib/learn/questions.ts) — 폐기 문제는 앱이 집계에서 제외';

CREATE OR REPLACE FUNCTION fn_upd_dbm_lrn_prgs_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_lrn_prgs_mod_dtm ON dbm_lrn_prgs;
CREATE TRIGGER trg_dbm_lrn_prgs_mod_dtm
  BEFORE UPDATE ON dbm_lrn_prgs
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_lrn_prgs_mod_dtm();

-- 권한 — 서버 전용 service_role (anon·authenticated 회수), RLS 미사용
SELECT fn_grant_svc_only('TABLE', 'dbm_lrn_prgs');

COMMIT;

-- 검증 (적용 후 수동 실행)
-- SELECT count(*) FROM dbm_lrn_prgs;                                                              → 0
-- INSERT INTO dbm_lrn_prgs (usr_id, qst_id, chc_no, crct_yn) VALUES (gen_random_uuid(), 'x1', 0, 'Y'); → 23514(qst_id CHECK)
