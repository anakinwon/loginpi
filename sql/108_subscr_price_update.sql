-- DA-APPROVED: 구독요금제 확정 (2026-06-24 마스터 결정)
-- ① PiCafé™  SM100: 3,000→2,000 Bean / SY100: 30,000→20,000 Bean
-- ② PiShop™  S/M/L 3단계 유지 (이전 단일등급 전환 취소·복구 포함)
--    S 월3,000·년30,000 / M 월4,000·년40,000 / L 월5,000·년50,000
-- ③ PiTranslate™ SM500: 1,000 Bean / SY500: 10,000 Bean (기존 확정값 유지)
-- ④ 상품명 설명 "자동번역" → "PiTranslate™"

-- ─── PiCafé™ 구독 가격 변경 ──────────────────────────────────────────────
UPDATE public.bean_fee_plan
   SET amt_bean      = 2000,
       fee_plan_desc = 'PiCafé™ 구독 월',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM100';

UPDATE public.bean_fee_plan
   SET amt_bean      = 20000,
       fee_plan_desc = 'PiCafé™ 구독 년',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY100';

-- ─── PiShop™ S — 복구 및 확정 (월 3,000 / 상품 10개 한도) ──────────────
UPDATE public.bean_fee_plan
   SET grade_cd      = 'S',
       amt_bean      = 3000,
       qty_limit     = 10,
       use_yn        = 'Y',
       del_yn        = 'N',
       del_dtm       = NULL,
       fee_plan_desc = '스토어 구독 S 월 (상품 10개 이하)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM200';

UPDATE public.bean_fee_plan
   SET grade_cd      = 'S',
       amt_bean      = 30000,
       qty_limit     = 10,
       use_yn        = 'Y',
       del_yn        = 'N',
       del_dtm       = NULL,
       fee_plan_desc = '스토어 구독 S 년 (상품 10개 이하)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY200';

-- ─── PiShop™ M — 복구 및 확정 (월 4,000 / 상품 30개 한도) ─────────────
UPDATE public.bean_fee_plan
   SET grade_cd      = 'M',
       amt_bean      = 4000,
       qty_limit     = 30,
       use_yn        = 'Y',
       del_yn        = 'N',
       del_dtm       = NULL,
       fee_plan_desc = '스토어 구독 M 월 (상품 30개 이하)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM300';

UPDATE public.bean_fee_plan
   SET grade_cd      = 'M',
       amt_bean      = 40000,
       qty_limit     = 30,
       use_yn        = 'Y',
       del_yn        = 'N',
       del_dtm       = NULL,
       fee_plan_desc = '스토어 구독 M 년 (상품 30개 이하)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY300';

-- ─── PiShop™ L — 복구 및 확정 (월 5,000 / 무제한) ──────────────────────
UPDATE public.bean_fee_plan
   SET grade_cd      = 'L',
       amt_bean      = 5000,
       qty_limit     = 0,
       use_yn        = 'Y',
       del_yn        = 'N',
       del_dtm       = NULL,
       fee_plan_desc = '스토어 구독 L 월 (상품 무제한)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM400';

UPDATE public.bean_fee_plan
   SET grade_cd      = 'L',
       amt_bean      = 50000,
       qty_limit     = 0,
       use_yn        = 'Y',
       del_yn        = 'N',
       del_dtm       = NULL,
       fee_plan_desc = '스토어 구독 L 년 (상품 무제한)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY400';

-- ─── PiTranslate™ 구독료 확정 (월 1,000 / 년 10,000) ────────────────────
UPDATE public.bean_fee_plan
   SET amt_bean      = 1000,
       fee_plan_desc = 'PiTranslate™ 구독 월',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM500';

UPDATE public.bean_fee_plan
   SET amt_bean      = 10000,
       fee_plan_desc = 'PiTranslate™ 구독 년',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY500';

-- ─── PiTranslate™ 건당 요금 설명 업데이트 ────────────────────────────────
UPDATE public.bean_fee_plan
   SET fee_plan_desc = 'PiTranslate™ 건당 (=0.01 Pi)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'TRANS_ONCE';
