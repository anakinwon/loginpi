-- 오프라인 매장 주문 상태 머신 — 직거래와 별개 흐름
-- ORDERED(상품주문중) → PREPARING(상품준비중) → READY(상품준비완료) → DONE(픽업/자동완료)
-- 취소: 구매자는 ORDERED에서만, 판매자는 ORDERED(거절·무료)·PREPARING(수수료)에서.
-- 자동완료: READY + ready_dtm 기준 10분 경과 시 DONE (앱 레이어 배치).

-- 1. order_st_cd CHECK 확장 — 신규 3개 상태 추가
ALTER TABLE public.mps_order DROP CONSTRAINT IF EXISTS chk_order_st;
ALTER TABLE public.mps_order
  ADD CONSTRAINT chk_order_st CHECK (
    order_st_cd IN (
      'PENDING', 'ESCROW', 'TRADING', 'SELLER_DONE', 'BUYER_DONE', 'DONE', 'CANCELLED',
      'ORDERED', 'PREPARING', 'READY'
    )
  );

-- 2. 준비완료 시각 — 10분 자동완료 기준
ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS ready_dtm TIMESTAMPTZ;

COMMENT ON COLUMN public.mps_order.ready_dtm IS '오프라인 상품준비완료(READY) 시각 — 10분 후 자동 거래완료 기준';

-- 3. 취소 RPC 확장 — 오프라인 상태 권한·수수료 규칙 추가
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
  ELSIF v_prev_st = 'READY' THEN
    -- 오프라인 준비완료 후 — 픽업/자동완료만, 관리자만 취소 가능
    IF NOT p_is_admin THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSIF v_prev_st = 'PREPARING' THEN
    -- 오프라인 준비중 — 구매자 취소 불가, 판매자·관리자만
    IF NOT (p_is_admin OR p_cancel_req_id = v_order.seller_id) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
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
  --   판매자 수수료: 직거래(ESCROW/TRADING/SELLER_DONE) 또는 오프라인 PREPARING에서 판매자 취소
  --   구매자 수수료: 직거래(ESCROW/TRADING/SELLER_DONE) 또는 오프라인 ORDERED에서 구매자 취소
  --   (오프라인 ORDERED에서 판매자 거절은 접수 전이므로 수수료 없음)
  IF p_cancel_req_id = v_order.seller_id
     AND v_prev_st IN ('ESCROW', 'TRADING', 'SELLER_DONE', 'PREPARING') THEN
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
