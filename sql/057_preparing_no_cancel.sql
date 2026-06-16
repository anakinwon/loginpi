-- 정책 변경: 상품준비중(PREPARING)부터는 판매자도 취소 불가 (접수=준비 시작=약속)
-- 취소 가능 구간을 ORDERED 한 곳으로 축소 — 구매자 취소(수수료) 또는 판매자 거절.
-- PREPARING/READY는 관리자만 취소 가능. (056의 PREPARING 판매자 취소 허용을 철회)

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
  v_order   public.mps_order;
  v_prev_st VARCHAR(11);
  v_bonded  BOOLEAN;
BEGIN
  SELECT * INTO v_order
    FROM public.mps_order
   WHERE order_id = p_order_id AND del_yn = 'N'
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  v_prev_st := v_order.order_st_cd;

  -- 상태·권한 검증
  IF v_prev_st IN ('DONE', 'CANCELLED') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  ELSIF v_prev_st = 'BUYER_DONE' THEN
    IF NOT p_is_admin THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSIF v_prev_st IN ('PREPARING', 'READY') THEN
    -- 오프라인 접수 후 — 양측 취소 불가(관리자만)
    IF NOT p_is_admin THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSIF v_prev_st = 'SELLER_DONE' THEN
    IF NOT (p_is_admin OR p_cancel_req_id = v_order.buyer_id) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  ELSE
    -- PENDING, ESCROW, TRADING, ORDERED — 당사자·관리자
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

  -- 취소수수료 0.1π (보증금 활성 거래만)
  --   판매자 수수료: 직거래(ESCROW/TRADING/SELLER_DONE)에서 판매자 취소 (오프라인 PREPARING은 취소 불가로 제외)
  --   구매자 수수료: 직거래(ESCROW/TRADING/SELLER_DONE) 또는 오프라인 ORDERED에서 구매자 취소
  IF p_cancel_req_id = v_order.seller_id
     AND v_prev_st IN ('ESCROW', 'TRADING', 'SELLER_DONE') THEN
    UPDATE public.mps_seller_bond
       SET bond_bal_pi = bond_bal_pi - 0.1,
           cancel_cnt  = cancel_cnt + 1,
           modr_id     = p_cancel_req_id,
           mod_dtm     = CURRENT_TIMESTAMP
     WHERE seller_id = v_order.seller_id
       AND del_yn = 'N'
       AND (bond_bal_pi - rsv_pi) >= 0.1;

    IF FOUND THEN
      INSERT INTO public.mps_txn_hist
        (order_id, user_id, txn_type_cd, pi_amt, memo, regr_id, modr_id)
      VALUES
        (p_order_id, v_order.seller_id, 'FEE', -0.1,
         '판매자 취소수수료 — 보증금 차감, 구매자 보상 지급 대기 (운영자 처리)',
         p_cancel_req_id, p_cancel_req_id);
    END IF;
  ELSIF p_cancel_req_id = v_order.buyer_id
        AND v_prev_st IN ('ESCROW', 'TRADING', 'SELLER_DONE', 'ORDERED') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mps_seller_bond
       WHERE seller_id = v_order.seller_id
         AND del_yn = 'N'
         AND (bond_bal_pi - rsv_pi) >= 0.1
    ) INTO v_bonded;

    IF v_bonded THEN
      INSERT INTO public.mps_txn_hist
        (order_id, user_id, txn_type_cd, pi_amt, memo, regr_id, modr_id)
      VALUES
        (p_order_id, v_order.buyer_id, 'FEE', -0.1,
         '구매자 취소수수료 — 환불 시 0.1π 공제, 판매자 보상 지급 대기 (운영자 처리)',
         p_cancel_req_id, p_cancel_req_id);
    END IF;
  END IF;

  RETURN v_order;
END;
$$;
