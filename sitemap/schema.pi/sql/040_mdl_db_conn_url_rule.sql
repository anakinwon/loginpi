-- 040_mdl_db_conn_url_rule.sql : 에이전트 접속 URL·JNDI 이름 규칙 강화(자동 보안 검토 2026-10-18 — JNDI 주입·임의 JDBC 드라이버 인자)
-- DA-APPROVED: 마스터 지시 2026-10-18 DDL 직접 실행 보안 — 제약만 교체(칼럼 변경 없음)
-- JDBC URL = postgresql:// · oracle:thin:@ · tibero:thin:@ 세 형식, 공백·세미콜론·#·사용자/비밀번호 인자 금지, PostgreSQL 은 user@ 금지·인자는 허용 목록만
--  (DBMS 일치·호스트/포트/DB 형식은 앱 urlStorable 과 에이전트가 검사)
-- JNDI = 로컬 이름만(java:comp/env/… · java:global/… 등 또는 접두 없는 이름), ldap:·rmi: 등 원격 조회 금지
BEGIN;

ALTER TABLE mdl_db_conn DROP CONSTRAINT IF EXISTS mdl_db_conn_url_check;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_url_check CHECK (
  conn_url_txt IS NULL OR (
    conn_url_txt ~ '^jdbc:(postgresql://|oracle:thin:@|tibero:thin:@)'
    AND conn_url_txt !~ '[[:space:];#]'
    AND conn_url_txt !~* '(password|pwd|user)='
    AND (conn_url_txt !~ '^jdbc:postgresql://' OR conn_url_txt !~ '@')
    AND (conn_url_txt !~ '\?' OR conn_url_txt ~ '^jdbc:postgresql://[^?]+\?(sslmode|ApplicationName|currentSchema|connectTimeout)=[A-Za-z0-9_.-]{1,64}(&(sslmode|ApplicationName|currentSchema|connectTimeout)=[A-Za-z0-9_.-]{1,64})*$')
  )
) NOT VALID;
ALTER TABLE mdl_db_conn ADD CONSTRAINT mdl_db_conn_jndi_check CHECK (
  jndi_nm IS NULL OR (jndi_nm ~ '^(java:(comp/env|global|app|module|jboss)/)?[A-Za-z0-9_][A-Za-z0-9_/.-]*$' AND position('..' IN jndi_nm) = 0)
) NOT VALID;

COMMIT;

NOTIFY pgrst, 'reload schema';
