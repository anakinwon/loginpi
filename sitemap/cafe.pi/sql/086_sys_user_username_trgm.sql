-- 086_sys_user_username_trgm.sql
-- 구독관리 등 어드민 화면의 pi_username 부분일치 검색('%q%') 가속.
-- CLAUDE.md 텍스트 검색 표준: PostgREST .ilike → 컬럼 직접 gin_trgm_ops 인덱스가 자동 가속(코드 변경 0).
--   (카페 072는 RPC의 lower() LIKE용이라 lower() 식 인덱스를 썼으나, 여기선 .ilike 직접 사용.)
-- sys_user(=구 users)는 del_yn 컬럼이 없어 부분 인덱스 미적용 — 전체 GIN.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pi_username substring/ILIKE 가속 (대소문자 무시 자동 가속)
CREATE INDEX IF NOT EXISTS idx_sys_user_pi_username_trgm
  ON public.sys_user USING gin (pi_username gin_trgm_ops);
