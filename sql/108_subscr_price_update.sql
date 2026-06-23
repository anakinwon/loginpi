-- DA-APPROVED: 구독요금제 가격 변경 + PiShop™ 단일등급 전환 (2026-06-24)
-- ① PiShop S/M/L 3-tier → GENERAL 단일 5,000 Bean/월 / 50,000 Bean/년
-- ② PiTranslate 1,000→3,000/월, 10,000→30,000/년
-- ③ PiShop M/L 행(SM300,SM400,SY300,SY400) 논리 삭제

-- ─── PiShop 월간 S → GENERAL, 5,000 Bean ────────────────────────────────
UPDATE public.bean_fee_plan
   SET grade_cd      = 'GENERAL',
       amt_bean      = 5000,
       fee_plan_desc = '스토어 구독 월 (단일등급)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM200';

-- PiShop 월간 M / L → 논리 삭제
UPDATE public.bean_fee_plan
   SET use_yn  = 'N',
       del_yn  = 'Y',
       del_dtm = CURRENT_TIMESTAMP,
       modr_id = 'SYSTEM',
       mod_dtm = CURRENT_TIMESTAMP
 WHERE fee_plan_cd IN ('SM300','SM400');

-- ─── PiShop 년간 S → GENERAL, 50,000 Bean ───────────────────────────────
UPDATE public.bean_fee_plan
   SET grade_cd      = 'GENERAL',
       amt_bean      = 50000,
       fee_plan_desc = '스토어 구독 년 (단일등급)',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY200';

-- PiShop 년간 M / L → 논리 삭제
UPDATE public.bean_fee_plan
   SET use_yn  = 'N',
       del_yn  = 'Y',
       del_dtm = CURRENT_TIMESTAMP,
       modr_id = 'SYSTEM',
       mod_dtm = CURRENT_TIMESTAMP
 WHERE fee_plan_cd IN ('SY300','SY400');

-- ─── PiTranslate 월간 1,000 → 3,000 Bean ────────────────────────────────
UPDATE public.bean_fee_plan
   SET amt_bean      = 3000,
       fee_plan_desc = '자동번역 구독 월',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SM500';

-- ─── PiTranslate 년간 10,000 → 30,000 Bean ───────────────────────────────
UPDATE public.bean_fee_plan
   SET amt_bean      = 30000,
       fee_plan_desc = '자동번역 구독 년',
       modr_id       = 'SYSTEM',
       mod_dtm       = CURRENT_TIMESTAMP
 WHERE fee_plan_cd = 'SY500';

-- ─── qty_limit 정리 (단일등급이므로 0=무제한) ──────────────────────────
UPDATE public.bean_fee_plan
   SET qty_limit = 0,
       modr_id   = 'SYSTEM',
       mod_dtm   = CURRENT_TIMESTAMP
 WHERE fee_plan_cd IN ('SM200','SY200');
