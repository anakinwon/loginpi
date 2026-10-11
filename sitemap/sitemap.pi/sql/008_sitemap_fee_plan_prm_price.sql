-- 008_sitemap_fee_plan_prm_price.sql — 프리미엄 단가 조정 : PRM1 40%·PRM2 50% 할인에 맞춤 (마스터 확정 2026-10-11)
-- DA-APPROVED: 마스터 확정 2026-10-11 — 데이터 UPDATE 2행(pi_amt), DDL 없음 (2026-10-11)
-- 선행 : 007. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 변경 (1개월 기준단가 3 Pi) :
--  · PRM1 3년(36개월) : 54 → 64.8 Pi  = 108 × 0.6 (40% 할인)
--  · PRM2 5년(60개월) : 108 → 90 Pi   = 180 × 0.5 (50% 할인)
--  · 기간 길수록 할인 커지는 순서 복원 : BSC1 17% < BSC2 25% < PRM1 40% < PRM2 50%, VIP 25%(10년 환산)
BEGIN;

UPDATE fee_plan SET pi_amt = 64.8 WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 90   WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';

COMMIT;
