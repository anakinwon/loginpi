-- 016_sitemap_fee_plan_nm.sql — 요금제 명칭 확정 (마스터 확정 2026-10-13, 표 그림) : 기본요금(1개월)·골드요금(3개월)·프리미엄요금(6개월)·플래티넘요금(12개월)·VIP요금(24개월)
-- DA-APPROVED: 마스터 확정 2026-10-13 — fee_plan 데이터 UPDATE 10행(fee_plan_nm 관리 표시명), DDL 없음. 코드값(plan_cd BSC1·BSC2·PRM1·PRM2·VIP)은 식별자라 유지 — 사용자 표시는 번역키 plan.<cd> (2026-10-13)
-- 선행 : 015. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 매핑 : BSC1=기본 · BSC2=골드 · PRM1=프리미엄 · PRM2=플래티넘 · VIP=VIP
BEGIN;

UPDATE fee_plan SET fee_plan_nm = '사용료 — 기본요금'     WHERE fee_plan_cd = 'REG_BSC1' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '사용료 — 골드요금'     WHERE fee_plan_cd = 'REG_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '사용료 — 프리미엄요금' WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '사용료 — 플래티넘요금' WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '사용료 — VIP요금'      WHERE fee_plan_cd = 'REG_VIP'  AND del_yn = 'N';

UPDATE fee_plan SET fee_plan_nm = '반짝임 부가서비스 — 기본요금'     WHERE fee_plan_cd = 'SPK_BSC1' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '반짝임 부가서비스 — 골드요금'     WHERE fee_plan_cd = 'SPK_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '반짝임 부가서비스 — 프리미엄요금' WHERE fee_plan_cd = 'SPK_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '반짝임 부가서비스 — 플래티넘요금' WHERE fee_plan_cd = 'SPK_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET fee_plan_nm = '반짝임 부가서비스 — VIP요금'      WHERE fee_plan_cd = 'SPK_VIP'  AND del_yn = 'N';

COMMIT;
