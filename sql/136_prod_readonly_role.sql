-- DA-APPROVED: 운영DB 읽기전용 롤 — Staging의 'Stage DB ⇄ 운영DB(읽기전용)' 스위치용.
--   서버 레벨 ROLE 생성(테이블 DDL 아님 — DA 명명/시스템컬럼 규칙 비대상).
--   ⚠️ 운영DB(Product_CafePi)에만 적용. PROD_RO_SUPABASE_KEY = 이 롤(readonly_ro)을
--   role 클레임으로 갖는 JWT(프로젝트 JWT secret HS256 서명). 발급법: docs/OPS_TOOLS_SETUP.md.
-- 목적: staging이 운영 실데이터를 '읽기 전용'으로 미리보기 — 쓰기·DDL 전면 차단. (2026-06-28)

-- 1) 롤 생성(멱등). BYPASSRLS: 우리 테이블은 RLS ENABLE + 정책이 service_role/authenticated
--    중심이라, 읽기전용 롤이 모든 행을 보려면 RLS 우회가 필요(SELECT 권한만이라 쓰기는 여전히 불가).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_ro') THEN
    CREATE ROLE readonly_ro NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- 2) 읽기 전용 권한 — SELECT만. INSERT/UPDATE/DELETE/TRUNCATE/DDL 일절 미부여 → 운영 원장 보호.
GRANT USAGE ON SCHEMA public TO readonly_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO readonly_ro;
-- 향후 생성 테이블도 자동 SELECT(postgres가 만드는 객체 기준)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_ro;

-- 3) PostgREST(authenticator)가 JWT role=readonly_ro 요청 시 이 롤로 SET ROLE 가능하도록 멤버십 부여.
GRANT readonly_ro TO authenticator;

-- 검증(수동): SET ROLE readonly_ro; SELECT count(*) FROM sys_user;  -- 성공(전체 행)
--             SET ROLE readonly_ro; UPDATE sys_user SET addr='x';   -- ERROR: permission denied
--             RESET ROLE;
