-- DA-APPROVED: mps_order BUYER_DONE 상태 추가 — 주문 흐름 3단계 확인으로 확장
-- 변경: 수령완료(구매자) 후 거래완료(판매자) 최종 확인 단계 신설
--   기존: PENDING → ESCROW → SELLER_DONE → DONE(구매자 수령 확인 시 즉시)
--   변경: PENDING → ESCROW → SELLER_DONE(판매자 전달) → BUYER_DONE(구매자 수령) → DONE(판매자 최종 확인 → 정산)

ALTER TABLE public.mps_order DROP CONSTRAINT IF EXISTS chk_order_st;
ALTER TABLE public.mps_order ADD CONSTRAINT chk_order_st CHECK (
  order_st_cd IN ('PENDING', 'ESCROW', 'TRADING', 'SELLER_DONE', 'BUYER_DONE', 'DONE', 'CANCELLED')
);

COMMENT ON TABLE public.mps_order IS 'MPS 주문 — 3단계 확인 에스크로 (전달:판매자 → 수령:구매자 → 거래완료:판매자 → 정산)';

-- ──────────────────────────────────────────────────────────────
-- fn_mps_order_cancel 재정의 — BUYER_DONE 단계 취소 규칙 추가
--   BUYER_DONE(물건 수령까지 확인된 상태)·DONE은 관리자만 취소 가능
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mps_order_cancel(
  p_order_id      UUID,
  p_cancel_req_id TEXT,
  p_reason        TEXT,
  p_is_admin      BOOLEAN DEFAULT false
)
RETURNS public.mps_order
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.mps_order;
BEGIN
  SELECT * INTO v_order
    FROM public.mps_order
   WHERE order_id = p_order_id AND del_yn = 'N'
     FOR UPDATE;  -- 동시 상태 전이 직렬화

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.order_st_cd IN ('DONE', 'CANCELLED') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  ELSIF v_order.order_st_cd = 'BUYER_DONE' THEN
    -- 구매자가 수령까지 확인한 뒤에는 관리자만 취소 가능 (분쟁 처리)
    IF NOT p_is_admin THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  ELSIF v_order.order_st_cd = 'SELLER_DONE' THEN
    -- 판매자가 전달 선언한 뒤에는 구매자·관리자만 취소 가능
    IF NOT (p_is_admin OR p_cancel_req_id = v_order.buyer_id) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  ELSE
    IF NOT (p_is_admin OR p_cancel_req_id IN (v_order.buyer_id, v_order.seller_id)) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  END IF;

  UPDATE public.mps_order
     SET order_st_cd   = 'CANCELLED',
         cancel_req_id = p_cancel_req_id,
         cancel_reason = p_reason,
         modr_id       = p_cancel_req_id,
         mod_dtm       = CURRENT_TIMESTAMP
   WHERE order_id = p_order_id
  RETURNING * INTO v_order;

  -- 재고 복원 + SOLD → OPEN 재전환
  UPDATE public.mps_item
     SET ordered_qty = ordered_qty - 1,
         stock_qty   = reg_qty - (ordered_qty - 1),
         item_st_cd  = CASE WHEN item_st_cd = 'SOLD' THEN 'OPEN' ELSE item_st_cd END,
         modr_id     = p_cancel_req_id,
         mod_dtm     = CURRENT_TIMESTAMP
   WHERE item_id = v_order.item_id;

  RETURN v_order;
END;
$$;
