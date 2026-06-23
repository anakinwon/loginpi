-- DA-APPROVED: 사용자 대표 매장 지정 (2026-06-23)
-- sys_user.rep_shop_id — 1인 1매장 원칙, 내 매장 수정화면에서 지정
-- NULL이면 최초 등록 매장이 대표 (하위 호환)

ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS rep_shop_id UUID REFERENCES public.mps_shop(shop_id);

COMMENT ON COLUMN public.sys_user.rep_shop_id IS
  '대표 매장 ID — 내 매장 수정화면에서 판매자가 직접 지정. NULL=최초 등록 매장이 대표(기본값)';
