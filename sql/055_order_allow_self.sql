-- fn_mps_order_create에 p_allow_self 파라미터 추가 — 관리자 본인상품 테스트 결제 허용
-- 기본 false(자기구매 차단 유지). API에서 isAdmin일 때만 true 전달.
-- 시그니처 변경(파라미터 추가)이라 DROP 후 재생성 (오버로드 모호성 방지).

DROP FUNCTION IF EXISTS public.fn_mps_order_create(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_mps_order_create(
  p_item_id    UUID,
  p_buyer_id   TEXT,
  p_meet_loc   TEXT DEFAULT NULL,
  p_regr_id    TEXT DEFAULT 'SYSTEM',
  p_allow_self BOOLEAN DEFAULT false
)
RETURNS public.mps_order
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item  public.mps_item;
  v_order public.mps_order;
BEGIN
  -- 원자적 재고 차감 (OPEN + stock_qty > 0 조건과 차감이 단일 UPDATE)
  UPDATE public.mps_item
     SET ordered_qty = ordered_qty + 1,
         stock_qty   = reg_qty - (ordered_qty + 1),
         item_st_cd  = CASE
                         WHEN reg_qty - (ordered_qty + 1) = 0 AND reg_qty != 9999
                         THEN 'SOLD' ELSE item_st_cd
                       END,
         modr_id = p_regr_id,
         mod_dtm = CURRENT_TIMESTAMP
   WHERE item_id = p_item_id
     AND del_yn = 'N'
     AND item_st_cd = 'OPEN'
     AND stock_qty > 0
  RETURNING * INTO v_item;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OUT_OF_STOCK';
  END IF;

  -- 본인 상품 구매 차단 — 단, p_allow_self(관리자 테스트)면 허용
  IF v_item.seller_id = p_buyer_id AND NOT p_allow_self THEN
    RAISE EXCEPTION 'SELF_PURCHASE';
  END IF;

  INSERT INTO public.mps_order
    (item_id, buyer_id, seller_id, order_price_pi, order_st_cd, meet_loc_desc, regr_id, modr_id)
  VALUES
    (p_item_id, p_buyer_id, v_item.seller_id, v_item.price_pi, 'PENDING', p_meet_loc, p_regr_id, p_regr_id)
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
