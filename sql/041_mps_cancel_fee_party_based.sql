-- DA-APPROVED: fn_mps_order_cancel 재정의 — 취소수수료 판정을 '관리자 여부'에서 '거래 당사자 여부'로 교정
-- 배경 (FR-10 버그):
--   기존 수수료 게이트가 `IF NOT p_is_admin AND ...` 였다. 그러나 cancel route는 로그인 유저가
--   ADMIN이면 무조건 p_is_admin=true로 RPC를 호출한다. 따라서 ADMIN 계정이 '판매자 본인'으로서
--   자기 거래를 취소하면 관리자 중재 취소로 오인되어 보증금 차감·FEE 이력이 통째로 스킵됐다.
--   → 환불 단계에서 seller FEE 행 부재 → 판매자 취소 환불에 +0.1π 보상이 누락(price 전액만 환불).
-- 교정:
--   수수료는 '취소 요청자가 거래 당사자(구매자/판매자)인가'로 판정한다. 내부 분기가 이미
--   p_cancel_req_id = seller_id / = buyer_id 로 당사자를 거르므로, 바깥 게이트의 NOT p_is_admin
--   조건만 제거하면 된다.
--     · 거래 당사자 취소  → ADMIN 여부 무관하게 수수료 적용
--     · 제3자 관리자 중재 → 두 분기 모두 불일치 → 수수료 면제(기존 의도 유지)
--   권한 판정용 p_is_admin(BUYER_DONE 관리자 취소 허용 등)은 그대로 둔다.

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
     FOR UPDATE;  -- 동시 상태 전이 직렬화

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  v_prev_st := v_order.order_st_cd;

  IF v_prev_st IN ('DONE', 'CANCELLED') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  ELSIF v_prev_st = 'BUYER_DONE' THEN
    IF NOT p_is_admin THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
  ELSIF v_prev_st = 'SELLER_DONE' THEN
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

  -- ─── 취소수수료 0.1π (거래 중 + 거래 당사자 취소 + 판매자 보증금 활성에 한함) ───
  -- 판정 기준: p_is_admin(권한)이 아니라 '취소 요청자가 당사자인가'. 제3자 관리자 중재 취소는
  -- 아래 두 분기 모두 불일치하여 자연히 수수료가 면제된다.
  IF v_prev_st IN ('ESCROW', 'TRADING', 'SELLER_DONE') THEN
    IF p_cancel_req_id = v_order.seller_id THEN
      -- 판매자 취소: 보증금에서 원자적 차감 (가용 잔액 = bond_bal - rsv ≥ 0.1 조건과 차감이 단일 UPDATE)
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
    ELSIF p_cancel_req_id = v_order.buyer_id THEN
      -- 구매자 취소: 판매자 보증금 활성일 때만 수수료 발생 (FR-10 단서 — 무보증금 거래는 자유 취소)
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
  END IF;

  RETURN v_order;
END;
$$;
