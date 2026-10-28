-- 017 fn_hb_smn_hst search_path 재고정 — 016 의 CREATE OR REPLACE 가 015 에서 걸어 둔 SET search_path 를 지웠다(정의 교체 = 설정 교체). 권한도 다시 확인
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-28) — 함수 설정·권한만(본문·테이블 변경 없음), 2회 멱등
-- 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_hb_smn_hst(UUID, UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_hb_smn_hst(UUID, UUID)');
