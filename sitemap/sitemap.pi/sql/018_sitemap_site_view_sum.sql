-- 018_sitemap_site_view_sum.sql — 사이트 상세 조회수 합계를 DB 에서 SUM(1행 반환) : 앱이 stat_site_dly 전 행을 받아 합산하면 PostgREST 1000행 상한에서 과소 집계(구축 결함 원장 2.2 C1, 2026-10-24)
-- DA-APPROVED: [확인중 : 마스터] 신규 테이블·컬럼 없음, 조회 전용 RPC 1개(fn_sel_ 접두 — 001 fn_sel_stat_site_chg 선례) + 서비스 전용 권한. 인덱스 추가 없음(PK (site_id, stat_dt) 선두 칼럼으로 site_id 범위 스캔)
-- 선행 : 017. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
--   코드(api/sites/[domain]) 는 이 함수가 없으면(PGRST202) 기존 행 합산으로 폴백 — 적용 전·후 배포 순서 무관
-- 롤백(참고) : DROP FUNCTION fn_sel_site_view_sum(uuid);
BEGIN;

CREATE OR REPLACE FUNCTION fn_sel_site_view_sum(p_site_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path FROM CURRENT
AS $$
  SELECT COALESCE(SUM(view_cnt), 0)::BIGINT
    FROM stat_site_dly
   WHERE site_id = p_site_id
     AND del_yn = 'N';
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_sel_site_view_sum(uuid)');

COMMIT;
