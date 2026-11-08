-- DA-APPROVED: fn_bean_subscribe_product 레거시 오버로드 제거 (2026-06-21)
-- 버그: sql/070이 타입을 바꿔(varchar→text, integer→bigint) 재정의하면서
--   시그니처가 달라 CREATE OR REPLACE가 아닌 '새 오버로드'가 생성됨 → 구버전과 공존.
--   → RPC 호출 시 "Could not choose the best candidate function" 모호성 에러
--   → 구독 처리 실패. 구버전(varchar/integer)을 제거해 신버전(text/bigint)만 남긴다.

DROP FUNCTION IF EXISTS public.fn_bean_subscribe_product(
  TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER, TEXT
);

-- 확인: 신버전만 남아야 함 (p_fee_plan_cd text, p_bean_amt bigint, OUT out_bal/out_expire)
-- SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'fn_bean_subscribe_product';
