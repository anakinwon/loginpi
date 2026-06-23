-- PiShop™ 구독 상품 수량 한도 정정 (2026-06-24)
-- 변경: S=30→10, M=50→30, L=무제한(유지)
-- 출처: bean-subscr-plan.ts item_limit 동기화

UPDATE public.bean_fee_plan
SET qty_limit    = 10,
    fee_plan_desc = '스토어 구독 S 월 (상품 10개 이하)',
    mod_dtm      = CURRENT_TIMESTAMP
WHERE fee_plan_cd = 'SM200';

UPDATE public.bean_fee_plan
SET qty_limit    = 30,
    fee_plan_desc = '스토어 구독 M 월 (상품 30개 이하)',
    mod_dtm      = CURRENT_TIMESTAMP
WHERE fee_plan_cd = 'SM300';

UPDATE public.bean_fee_plan
SET fee_plan_desc = '스토어 구독 L 월 (상품 30개 초과)',
    mod_dtm      = CURRENT_TIMESTAMP
WHERE fee_plan_cd = 'SM400';

UPDATE public.bean_fee_plan
SET qty_limit    = 10,
    fee_plan_desc = '스토어 구독 S 년 (상품 10개 이하)',
    mod_dtm      = CURRENT_TIMESTAMP
WHERE fee_plan_cd = 'SY200';

UPDATE public.bean_fee_plan
SET qty_limit    = 30,
    fee_plan_desc = '스토어 구독 M 년 (상품 30개 이하)',
    mod_dtm      = CURRENT_TIMESTAMP
WHERE fee_plan_cd = 'SY300';

UPDATE public.bean_fee_plan
SET fee_plan_desc = '스토어 구독 L 년 (상품 30개 초과)',
    mod_dtm      = CURRENT_TIMESTAMP
WHERE fee_plan_cd = 'SY400';
