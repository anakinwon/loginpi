-- sql/112_sys_user_display_nm_trgm.sql
-- DA-APPROVED: 인덱스 추가만(스키마 변경 없음) — sys_user(022) 승인 범위 내.
--
-- 목적: 관리자 약관동의 내역(/admin/consents) 등 username 검색이 display_name까지 포함하는데
--   display_name엔 trgm 인덱스가 없어 순차 스캔됐다. pi_username(086)·nick_nm(101)과 동일하게
--   gin_trgm_ops 인덱스를 추가해 .ilike '%q%' 부분일치 검색을 자동 가속(코드 변경 0).
--
-- 표준: username 검색 컬럼은 무조건 pg_trgm GIN 인덱스를 둔다(2026-06-24 마스터 지시).
-- sys_user는 del_yn 컬럼이 없어 부분 인덱스 미적용 — 전체 GIN (086·101과 동일 정책).
-- ⚠️ 환경 정책: staging Supabase 먼저 적용·검증 후 운영. git-only.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_sys_user_display_name_trgm
  ON public.sys_user USING gin (display_name gin_trgm_ops);

-- 검증:
--   EXPLAIN SELECT id FROM public.sys_user WHERE display_name ILIKE '%안%';  -- Bitmap Index Scan 확인
