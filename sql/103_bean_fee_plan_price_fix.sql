-- DA 중간점검 P2 조치: bean_fee_plan 노출요금 GENERAL/PREMIUM 가격 역전 정정
-- 2026-06-23 | refs: docs/da/reports/2026-06-23_DA중간점검보고서.md §3
-- DA-APPROVED: SSGDM(GENERAL,10)↔SSPDM(PREMIUM,5) 역전 → swap 정정
--   원칙: PREMIUM amt_bean > GENERAL amt_bean (구독자 등급 프리미엄이 더 비싼 요금)

BEGIN;

-- SSGDM: 구독자 노출 1개월 일반  (GENERAL)  10 Bean → 5 Bean
UPDATE public.bean_fee_plan
SET    amt_bean      = 5,
       fee_plan_desc = '(구독자) 노출 1개월 일반',
       modr_id       = 'ADMIN',
       mod_dtm       = CURRENT_TIMESTAMP
WHERE  fee_plan_cd   = 'SSGDM'
  AND  del_yn        = 'N';

-- SSPDM: 구독자 노출 1개월 프리미엄 (PREMIUM) 5 Bean → 10 Bean
UPDATE public.bean_fee_plan
SET    amt_bean      = 10,
       fee_plan_desc = '(구독자) 노출 1개월 프리미엄',
       modr_id       = 'ADMIN',
       mod_dtm       = CURRENT_TIMESTAMP
WHERE  fee_plan_cd   = 'SSPDM'
  AND  del_yn        = 'N';

COMMIT;
