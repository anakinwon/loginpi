-- 정산 실패 사유 저장 — A2U 예외 메시지를 DB에 남겨 관리자 화면에서 진단 가능하게
-- DA-APPROVED: settle(정산) err(오류) _tx(텍스트) 도메인 준수, mps_order 가산 컬럼
ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS settle_err_tx TEXT;

COMMENT ON COLUMN public.mps_order.settle_err_tx IS '판매자 정산 실패 사유(A2U 예외 메시지 등) — 성공 시 NULL로 초기화';
