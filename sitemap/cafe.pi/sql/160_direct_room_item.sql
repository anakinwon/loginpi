-- 160_direct_room_item.sql
-- 직거래 문의방 상품별 분리 — msg_room에 item_id(문의 상품) 추가.
-- 같은 판매자라도 다른 상품을 문의하면 별도 방(getOrCreateDirectRoom가 item_id로 구분).
-- 그룹/이벤트방은 item_id NULL. 기존 직거래방(item_id NULL)은 레거시로 유지.

-- DA-APPROVED: msg_room에 item_id 추가 (직거래방 문의 상품, mps_item.item_id 참조) (2026-07-01)
--   무FK: mps_item 참조는 app 레벨(REFERENCES 미사용, mps 도메인 무FK 관례). nullable.
ALTER TABLE public.msg_room ADD COLUMN IF NOT EXISTS item_id UUID; -- mps_item.item_id (app 레벨 FK)

CREATE INDEX IF NOT EXISTS idx_msg_room_item
  ON public.msg_room(item_id) WHERE del_yn = 'N' AND item_id IS NOT NULL;

COMMENT ON COLUMN public.msg_room.item_id IS '직거래방 문의 상품 (mps_item.item_id, app 레벨 FK) — 상품별 방 분리. 그룹/이벤트방은 NULL';
