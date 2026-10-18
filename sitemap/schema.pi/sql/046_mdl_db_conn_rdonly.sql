-- 046_mdl_db_conn_rdonly.sql : 접속 '조회 전용 계정' 지정(SQL 편집기 보안 — 자동 보안 검토 2026-10-18)
-- DA-APPROVED: 마스터 결정 2026-10-18 'SQL 편집기 전부 즉시(쓰기 = DA)' 의 보안 보강 — mdl_db_conn 칼럼 1개(fn_add_cols_keep_sys), 약어 RDONLY(읽기전용)·ACCT(계정) 표준단어 [확인중 : da-standards]
-- 배경 : 문장 판정(어휘)·READ ONLY 트랜잭션은 사용자 함수 안의 부작용(pg_terminate_backend·Oracle 자율 트랜잭션·괄호 없는 함수 호출)을 원천적으로 못 막음
--  → DA 아닌 역할(SQL_QUERY)은 DA 가 'SELECT 권한만 가진 계정'으로 지정한 접속에서만 실행(앱), DA 는 모든 접속
-- 주의(042 와 같음) : 칼럼 이동은 UPDATE 라 NOT VALID 제약이 다시 검사됨 → 정의를 읽어 내렸다가 그대로 다시 올림, 사용자 트리거는 이동 동안 정지
BEGIN;

CREATE TEMP TABLE _nv ON COMMIT DROP AS
  SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'mdl_db_conn'::regclass AND contype = 'c' AND NOT convalidated;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM _nv LOOP
    EXECUTE format('ALTER TABLE mdl_db_conn DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE mdl_db_conn DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_db_conn', $c$
  ADD COLUMN rdonly_acct_yn CHAR(1) NOT NULL DEFAULT 'N'$c$);
ALTER TABLE mdl_db_conn ENABLE TRIGGER USER;
COMMENT ON COLUMN mdl_db_conn.rdonly_acct_yn IS '읽기전용계정여부 — DA 가 SELECT 권한만 가진 계정이라고 지정(Y 인 접속만 DA 아닌 역할이 SQL 편집기로 조회)';

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname, def FROM _nv LOOP
    EXECUTE format('ALTER TABLE mdl_db_conn ADD CONSTRAINT %I %s', r.conname, r.def);
  END LOOP;
END $$;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_rdonly_acct_yn_check CHECK (rdonly_acct_yn IN ('Y','N'));

COMMIT;

NOTIFY pgrst, 'reload schema';
