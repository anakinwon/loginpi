-- 090_pistore_to_pishop_rename.sql
-- 목적: 브랜드 통일 — 코드값 PISTORE → PISHOP (PiShop으로 명칭 일원화)
-- 범위: bean_fee_plan.prod_ctgr_cd 라벨 변경(금액·fee_plan_cd 불변), bean_subscr.prod_ctgr_cd
-- 영향: bean_fee_plan 26행(PISTORE_GENERAL 10 + PISTORE_SUBSCR 16), bean_subscr 0행(PISTORE 구독 실사용 없음)
-- 안전성: CHECK 제약 없음 / 구독함수는 prod 파라미터 동적처리 / 실제 요금적용은 fee_plan_cd 기반
--         → 라벨만 바뀌며 금액·요금적용 로직 무영향. 멱등(WHERE 조건으로 재실행 안전).
-- 적용: 2026-06-22 운영 DB에 DML 직접 반영 완료. 본 파일은 추적·재현용.

-- bean_fee_plan: 비구독자 스토어 요금
UPDATE public.bean_fee_plan
   SET prod_ctgr_cd = 'PISHOP_GENERAL', modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
 WHERE prod_ctgr_cd = 'PISTORE_GENERAL';

-- bean_fee_plan: 구독·구독자 스토어 요금
UPDATE public.bean_fee_plan
   SET prod_ctgr_cd = 'PISHOP_SUBSCR', modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
 WHERE prod_ctgr_cd = 'PISTORE_SUBSCR';

-- bean_subscr: 구독 상품군 코드값 (실사용 0건이나 안전망)
UPDATE public.bean_subscr
   SET prod_ctgr_cd = 'PISHOP', modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
 WHERE prod_ctgr_cd = 'PISTORE';
