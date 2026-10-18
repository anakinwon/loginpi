-- 042_mdl_db_conn_ca.sql : 접속 프로파일 서버 CA 인증서(마스터 지시 2026-10-18 "접속정보 저장 전 접속테스트 필요")
-- DA-APPROVED: 마스터 지시 2026-10-18 — mdl_db_conn 칼럼 1개(fn_add_cols_keep_sys), 약어 CA(인증기관)·CERT(인증서) 표준단어 [확인중 : da-standards]
-- 배경 : Supabase 등은 자체 루트 CA 로 서명해 인증서 검증 TLS 가 실패(SELF_SIGNED_CERT_IN_CHAIN) → 검증을 끄지 않고 접속별 CA(공개 인증서 PEM)를 지정
-- 주의 : 칼럼 이동(행 재작성)도 UPDATE 라 NOT VALID 제약이 다시 검사됨 → 카탈로그에서 정의를 읽어 내렸다가 그대로 다시 올림(041 교훈의 일반화), 사용자 트리거는 이동 동안 정지
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
  ADD COLUMN ca_cert_txt TEXT$c$);
ALTER TABLE mdl_db_conn ENABLE TRIGGER USER;
COMMENT ON COLUMN mdl_db_conn.ca_cert_txt IS '인증기관인증서내용 — 서버 TLS 검증용 CA(PEM, 공개 인증서·비밀 아님)';

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname, def FROM _nv LOOP
    EXECUTE format('ALTER TABLE mdl_db_conn ADD CONSTRAINT %I %s', r.conname, r.def);
  END LOOP;
END $$;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_ca_check CHECK (
  ca_cert_txt IS NULL OR (length(ca_cert_txt) <= 20000 AND ca_cert_txt ~ '^\s*(-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=[:space:]]+-----END CERTIFICATE-----\s*)+$')
);

COMMIT;

NOTIFY pgrst, 'reload schema';
