-- 취소수수료 당사자를 명시적 역할(p_cancel_role)로 판정 — self-purchase(buyer=seller) 구분.
-- 판매관리 화면 취소=SELLER, 구매관리 화면 취소=BUYER. 비-self 주문은 id로 강제(보안).
-- (실제 DB에는 mcp apply로 이미 반영 — 본 파일은 형상관리 기록용. CREATE OR REPLACE 멱등)

CREATE OR REPLACE FUNCTION public.fn_mps_order_cancel(
  p_order_id      UUID,
  p_cancel_req_id TEXT,
  p_reason        TEXT,
  p_is_admin      BOOLEAN DEFAULT false,
  p_cancel_role   TEXT DEFAULT NULL
)
RETURNS public.mps_order
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order   public.mps_order;
  v_prev_st VARCHAR(11);
  v_bonded  BOOLEAN;
  v_role    TEXT;
BEGIN
  SELECT * INTO v_order
    FROM public.mps_order
   WHERE order_id = p_order_id AND del_yn = 'N'
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  v_prev_st := v_order.order_st_cd;

  IF v_prev_st IN ('DONE', 'CANCELLED') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  ELSIF v_prev_st = 'BUYER_DONE' THEN
    IF NOT p_is_admin THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSIF v_prev_st IN ('PREPARING', 'READY') THEN
    IF NOT p_is_admin THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSIF v_prev_st = 'SELLER_DONE' THEN
    IF NOT (p_is_admin OR p_cancel_req_id = v_order.buyer_id) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  ELSE
    IF NOT (p_is_admin OR p_cancel_req_id IN (v_order.buyer_id, v_order.seller_id)) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  END IF;

  -- 취소 당사자 역할 — self-purchase(buyer=seller)면 힌트 사용(테스트), 아니면 id로 강제(보안)
  IF v_order.buyer_id = v_order.seller_id THEN
    v_role := COALESCE(NULLIF(p_cancel_role, ''), 'BUYER');
  ELSIF p_cancel_req_id = v_order.seller_id THEN
    v_role := 'SELLER';
  ELSIF p_cancel_req_id = v_order.buyer_id THEN
    v_role := 'BUYER';
  ELSE
    v_role := NULL;
  END IF;

  UPDATE public.mps_order
     SET order_st_cd   = 'CANCELLED',
         cancel_req_id = p_cancel_req_id,
         cancel_reason = p_reason,
         modr_id       = p_cancel_req_id,
         mod_dtm       = CURRENT_TIMESTAMP
   WHERE order_id = p_order_id
  RETURNING * INTO v_order;

  UPDATE public.mps_item
     SET ordered_qty = ordered_qty - 1,
         stock_qty   = reg_qty - (ordered_qty - 1),
         item_st_cd  = CASE WHEN item_st_cd = 'SOLD' THEN 'OPEN' ELSE item_st_cd END,
         modr_id     = p_cancel_req_id,
         mod_dtm     = CURRENT_TIMESTAMP
   WHERE item_id = v_order.item_id;

  IF v_role = 'SELLER'
     AND v_prev_st IN ('ESCROW', 'TRADING', 'SELLER_DONE', 'ORDERED') THEN
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
  ELSIF v_role = 'BUYER'
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
