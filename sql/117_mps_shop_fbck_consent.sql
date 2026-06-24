-- 매장주 이용후기·Bean 보상 지급 동의 (opt-in)
-- 매장주가 "내 상품에 대해 고객이 평가하고, 그 후기에 따라 Bean Token을 지급하는 프로세스"에
-- 동의(Y)한 매장의 상품만 후기 작성 버튼을 노출하고 후기 작성을 허용한다.
-- 기존 LBS 동의 캐시(sys_user.lbs_consent_yn/_dtm)와 동일한 표준 패턴.

ALTER TABLE public.mps_shop
  ADD COLUMN IF NOT EXISTS fbck_consent_yn  CHAR(1)     NOT NULL DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS fbck_consent_dtm TIMESTAMPTZ;

COMMENT ON COLUMN public.mps_shop.fbck_consent_yn  IS '이용후기·Bean 보상 지급 동의 여부 (Y=동의 — 상품 후기 작성 버튼 노출·후기 허용, N=미동의 기본값)';
COMMENT ON COLUMN public.mps_shop.fbck_consent_dtm IS '이용후기·Bean 보상 동의/철회 일시';

ALTER TABLE public.mps_shop
  ADD CONSTRAINT chk_mps_shop_fbck_consent
  CHECK (fbck_consent_yn IN ('Y', 'N'));
