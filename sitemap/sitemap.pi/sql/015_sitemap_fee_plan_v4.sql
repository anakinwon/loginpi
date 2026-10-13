-- 015_sitemap_fee_plan_v4.sql — 요금제 재정의 (마스터 확정 2026-10-13, 표 그림 2차) : 사용료 10·25·45·80·130 Pi, 할인율 0·16.67·25·33.33·45.83%, 반짝임 2·5·9·16·26 Pi. 약정기간은 014 그대로(1·3·6·12·24개월)
-- DA-APPROVED: 마스터 확정 2026-10-13 — fee_plan 데이터 UPDATE 10행(REGISTER·SPARKLE pi_amt), DDL 없음 (2026-10-13)
-- 선행 : 014. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 산식 : 할인율 = 1 − pi_amt / (mon_pi_amt 10 × use_mon_cnt). 표시는 서버(regFeeDiscountPct, 소수 2자리)가 같은 식을 역산
--  | 요금제 | 약정 | 사용료 | 할인율  | 부가서비스 |
--  | BSC1  |  1  |  10 |  0%     |  2 |
--  | BSC2  |  3  |  25 | 16.67%  |  5 |
--  | PRM1  |  6  |  45 | 25%     |  9 |
--  | PRM2  | 12  |  80 | 33.33%  | 16 |
--  | VIP   | 24  | 130 | 45.83%  | 26 |
BEGIN;

UPDATE fee_plan SET pi_amt = 10  WHERE fee_plan_cd = 'REG_BSC1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 25  WHERE fee_plan_cd = 'REG_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 45  WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 80  WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 130 WHERE fee_plan_cd = 'REG_VIP'  AND del_yn = 'N';

UPDATE fee_plan SET pi_amt = 2  WHERE fee_plan_cd = 'SPK_BSC1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 5  WHERE fee_plan_cd = 'SPK_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 9  WHERE fee_plan_cd = 'SPK_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 16 WHERE fee_plan_cd = 'SPK_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 26 WHERE fee_plan_cd = 'SPK_VIP'  AND del_yn = 'N';

COMMIT;
