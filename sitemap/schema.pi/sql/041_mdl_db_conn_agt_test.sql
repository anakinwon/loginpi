-- 041_mdl_db_conn_agt_test.sql : 에이전트 접속 시험(마스터 지시 2026-10-18 "접속테스트 기능을 넣어줘") + 039·040 NOT VALID 제약이 삭제를 막던 문제 + 접속명 비밀 금지
-- DA-APPROVED: 마스터 지시 2026-10-18 — mdl_db_conn 칼럼 4개(fn_add_cols_keep_sys), 약어 AGT·TEST(시험)·REQ·RSLT·MSG 표준단어 [확인중 : da-standards]
-- ① NOT VALID 제약은 기존 행도 UPDATE 때 다시 검사 → 039 이전 에이전트 행은 논리 삭제조차 못 함 : 삭제 행(del_yn='Y')은 검사 제외로 교체
-- ② 에이전트 접속 시험 : 화면이 요청(agt_test_req_dtm) → 에이전트가 다음 확인 때 SELECT 1 → 결과(OK·ERR·메시지) 기록. 서버는 사내망에 직접 접속하지 않음
-- ③ 접속명에 접속 문자열·비밀번호 금지(운영 사고 2026-10-18 : 이름 칸에 비밀번호가 든 접속 문자열 저장)
-- 주의 : 칼럼 이동 동안 사용자 트리거(처리 중 요청 접속 변경 거부·mod_dtm) 정지
BEGIN;

-- 칼럼 이동(행 재작성) 전에 NOT VALID 제약 3개를 먼저 내림 — 재작성도 UPDATE 라 039 이전 행이 걸림. 아래 ①에서 새 규칙으로 다시 올림
ALTER TABLE mdl_db_conn DROP CONSTRAINT IF EXISTS mdl_db_conn_agt_check;
ALTER TABLE mdl_db_conn DROP CONSTRAINT IF EXISTS mdl_db_conn_url_check;
ALTER TABLE mdl_db_conn DROP CONSTRAINT IF EXISTS mdl_db_conn_jndi_check;

ALTER TABLE mdl_db_conn DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_db_conn', $c$
  ADD COLUMN agt_test_req_dtm TIMESTAMPTZ,
  ADD COLUMN agt_test_end_dtm TIMESTAMPTZ,
  ADD COLUMN agt_test_rslt_cd VARCHAR(4),
  ADD COLUMN agt_test_msg VARCHAR(200)$c$);
ALTER TABLE mdl_db_conn ENABLE TRIGGER USER;
COMMENT ON COLUMN mdl_db_conn.agt_test_req_dtm IS '에이전트시험요청일시 — 값이 있고 종료일시가 없으면 에이전트가 다음 확인 때 시험';
COMMENT ON COLUMN mdl_db_conn.agt_test_end_dtm IS '에이전트시험종료일시';
COMMENT ON COLUMN mdl_db_conn.agt_test_rslt_cd IS '에이전트시험결과코드 — OK 성공 / ERR 실패';
COMMENT ON COLUMN mdl_db_conn.agt_test_msg IS '에이전트시험메시지(접속 정보 가림, 200자)';
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_agt_test_check CHECK (agt_test_rslt_cd IS NULL OR agt_test_rslt_cd IN ('OK','ERR'));

-- ① 삭제 행은 검사 제외(039·040 제약 교체)
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_agt_check CHECK (del_yn = 'Y' OR CASE WHEN exec_mthd_cd = 'AGT' THEN agt_id IS NOT NULL AND (conn_url_txt IS NOT NULL OR jndi_nm IS NOT NULL) ELSE agt_id IS NULL AND conn_url_txt IS NULL AND jndi_nm IS NULL END) NOT VALID;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_url_check CHECK (
  del_yn = 'Y' OR conn_url_txt IS NULL OR (
    conn_url_txt ~ '^jdbc:(postgresql://|oracle:thin:@|tibero:thin:@)'
    AND conn_url_txt !~ '[[:space:];#]'
    AND conn_url_txt !~* '(password|pwd|user)='
    AND (conn_url_txt !~ '^jdbc:postgresql://' OR conn_url_txt !~ '@')
    AND (conn_url_txt !~ '\?' OR conn_url_txt ~ '^jdbc:postgresql://[^?]+\?(sslmode|ApplicationName|currentSchema|connectTimeout)=[A-Za-z0-9_.-]{1,64}(&(sslmode|ApplicationName|currentSchema|connectTimeout)=[A-Za-z0-9_.-]{1,64})*$')
  )
) NOT VALID;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_jndi_check CHECK (
  del_yn = 'Y' OR jndi_nm IS NULL OR (jndi_nm ~ '^(java:(comp/env|global|app|module|jboss)/)?[A-Za-z0-9_][A-Za-z0-9_/.-]*$' AND position('..' IN jndi_nm) = 0)
) NOT VALID;
-- ③ 접속명 : 접속 문자열(://)·계정@호스트·비밀번호 인자 금지(삭제 행 제외)
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_nm_check CHECK (del_yn = 'Y' OR (conn_nm !~ '://' AND conn_nm !~* '(password|pwd)\s*=' AND conn_nm !~ '[^[:space:]]+:[^[:space:]]+@')) NOT VALID;

-- 접속 보호 트리거 : 시험 칼럼 변경은 처리 중 요청이 있어도 허용
CREATE OR REPLACE FUNCTION fn_chk_mdl_db_conn_busy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_skip TEXT[] := ARRAY['lst_test_dtm','agt_test_req_dtm','agt_test_end_dtm','agt_test_rslt_cd','agt_test_msg','mod_dtm','modr_id'];
BEGIN
  IF (to_jsonb(NEW) - v_skip) <> (to_jsonb(OLD) - v_skip)
     AND EXISTS (SELECT 1 FROM mdl_ddl_req r WHERE r.conn_id = OLD.conn_id AND r.del_yn = 'N' AND r.req_sts_cd IN ('REQ','APV','RUN')) THEN
    RAISE EXCEPTION 'mdl_db_conn_busy: 처리 중인 실행 요청이 있는 접속은 바꿀 수 없습니다' USING ERRCODE = 'MDB01';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
