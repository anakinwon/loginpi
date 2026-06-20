-- 스티커팩 Bean 가격 컬럼 추가 — Pi 결제 → Bean 결제 전환 (PRD_15_FEE §1-6 순위 4)
-- price_pi(Pi 소수)는 레거시 보존, price_bean(Bean 정수)이 결제 기준이 됨
-- 1 Pi = 100 Bean 고정 → 초기값 = ROUND(price_pi * 100)

ALTER TABLE public.msg_stkr_pack
  ADD COLUMN IF NOT EXISTS price_bean INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.msg_stkr_pack.price_bean IS 'Bean 가격 (정수, 0=무료). 결제 기준 컬럼. 1 Pi = 100 Bean.';

-- 기존 팩 초기값: price_pi * 100 (소수점 반올림)
UPDATE public.msg_stkr_pack
SET price_bean = ROUND(price_pi * 100)::INTEGER,
    modr_id    = 'ADMIN',
    mod_dtm    = CURRENT_TIMESTAMP
WHERE del_yn = 'N';
