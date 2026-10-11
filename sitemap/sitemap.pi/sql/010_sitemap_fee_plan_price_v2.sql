-- 010_sitemap_fee_plan_price_v2.sql — 등록 심사비 단가 재산정 : 기간별 할인율 10·12·15·18·23% (마스터 확정 2026-10-11)
-- DA-APPROVED: 마스터 확정 2026-10-11 — 데이터 UPDATE 5행(pi_amt), DDL 없음 (2026-10-11)
-- 선행 : 009. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 산식 : pi_amt = mon_pi_amt(3 Pi) × use_mon_cnt × (1 - 할인율). 할인율 표시는 서버(regFeeDiscountPct)가 같은 식을 역산하므로 값이 어긋날 수 없다
--  · BSC1  6개월 10% :  18 × 0.90 =  16.2  Pi
--  · BSC2 12개월 12% :  36 × 0.88 =  31.68 Pi
--  · PRM1 24개월 15% :  72 × 0.85 =  61.2  Pi
--  · PRM2 36개월 18% : 108 × 0.82 =  88.56 Pi
--  · VIP  60개월 23% : 180 × 0.77 = 138.6  Pi
BEGIN;

UPDATE fee_plan SET pi_amt = 16.2   WHERE fee_plan_cd = 'REG_BSC1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 31.68  WHERE fee_plan_cd = 'REG_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 61.2   WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 88.56  WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 138.6  WHERE fee_plan_cd = 'REG_VIP'  AND del_yn = 'N';

COMMIT;
