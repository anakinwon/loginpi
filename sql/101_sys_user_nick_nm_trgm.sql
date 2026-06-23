-- 101_sys_user_nick_nm_trgm.sql
-- 목적: Event #1(미션 랭킹)·#2(매장 온보딩) 요원명 검색을 서버 .ilike(pg_trgm)로 전환하며,
--   nick_nm 부분일치('%q%')도 가속. pi_username은 086에서 이미 GIN 인덱스 적용됨.
-- CLAUDE.md 텍스트 검색 표준: PostgREST .ilike → 컬럼 직접 gin_trgm_ops 인덱스가 자동 가속(코드 변경 0).
-- sys_user는 del_yn 컬럼이 없어 부분 인덱스 미적용 — 전체 GIN (086과 동일 정책).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- nick_nm substring/ILIKE 가속 (대소문자 무시 자동 가속)
CREATE INDEX IF NOT EXISTS idx_sys_user_nick_nm_trgm
  ON public.sys_user USING gin (nick_nm gin_trgm_ops);
