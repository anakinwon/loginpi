-- 주문방법 3종(매장이용·픽업·배달) + 매장 배달가능 플래그
-- 배달 선택 시 배달 위치(dlvr_addr) 입력 필수, 매장이 배달가능(dlvr_yn='Y')일 때만 허용.

-- 1. mps_shop: 배달 가능 여부 (점주 설정)
ALTER TABLE public.mps_shop
  ADD COLUMN IF NOT EXISTS dlvr_yn CHAR(1) NOT NULL DEFAULT 'N';

COMMENT ON COLUMN public.mps_shop.dlvr_yn IS '배달 가능 여부 (Y=배달 지원, N=미지원) — 배달 주문방법 노출 게이트';

-- 2. mps_order: 주문방법 + 배달주소
ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS order_mthd_cd VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dlvr_addr     TEXT;

COMMENT ON COLUMN public.mps_order.order_mthd_cd IS '주문방법: DINE_IN(매장이용), PICKUP(픽업), DELIVERY(배달)';
COMMENT ON COLUMN public.mps_order.dlvr_addr     IS '배달 위치 — order_mthd_cd=DELIVERY일 때 필수';

ALTER TABLE public.mps_order
  ADD CONSTRAINT chk_order_mthd
  CHECK (order_mthd_cd IS NULL OR order_mthd_cd IN ('DINE_IN', 'PICKUP', 'DELIVERY'));
