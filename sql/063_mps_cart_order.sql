-- DA-APPROVED: 'ord'(주문/order 약어, 기존 ordered_qty 일관) · mps_order_item(주문 라인 엔터티) 신규. (2026-06-17)
--   FR-14 오프라인매장 카트 다중상품 주문: mps_order(header) 1:N mps_order_item(line).
--   fn_mps_cart_order_create — 다중라인 원자적 재고차감 + 헤더/라인 생성(단일 트랜잭션, 부분성공 금지).
--   결제 흐름은 단건과 동일(metadata.type='MPS_ESCROW' by order_id) — /complete 분기 변경 불필요.

-- ──────────────────────────────────────────────────────────────
-- 1. mps_order 헤더 확장 — 오프라인매장 식별(카트 주문)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.mps_shop(shop_id);
COMMENT ON COLUMN public.mps_order.shop_id IS '오프라인매장 카트 주문 식별. 단건 P2P 주문은 NULL';

-- ──────────────────────────────────────────────────────────────
-- 2. mps_order_item — 주문 라인(카트 다중상품)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_order_item (
  order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.mps_order(order_id),
  item_id       UUID NOT NULL REFERENCES public.mps_item(item_id),
  ord_qty       INT  NOT NULL DEFAULT 1 CHECK (ord_qty >= 1),  -- 주문 수량
  price_pi      NUMERIC(18,7) NOT NULL,                        -- 주문 시점 단가 스냅샷(정본)
  ccy_cd        VARCHAR(3),                                    -- 등록시점 통화 스냅샷(ISO 4217)
  ccy_amt       NUMERIC(18,2),                                 -- 등록시점 자국통화 단가 스냅샷(고정 참고가)
  del_yn        CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mps_order_item_order ON public.mps_order_item(order_id);
CREATE INDEX IF NOT EXISTS idx_mps_order_item_item  ON public.mps_order_item(item_id);

COMMENT ON TABLE public.mps_order_item IS '주문 라인(카트 다중상품). mps_order(header) 1:N. FR-14';

-- ──────────────────────────────────────────────────────────────
-- 3. fn_mps_cart_order_create — 카트 다중라인 주문 원자 생성
--    p_items: JSONB 배열 [{ "item_id": "uuid", "qty": 2 }, ...]
--    한 라인이라도 재고 부족·타매장·판매중 아님 → EXCEPTION → 함수 전체 롤백(차감 복원)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mps_cart_order_create(
  p_shop_id    UUID,
  p_buyer_id   TEXT,
  p_items      JSONB,
  p_regr_id    TEXT DEFAULT 'SYSTEM',
  p_order_mthd TEXT DEFAULT 'DINE_IN',
  p_dlvr_addr  TEXT DEFAULT NULL,
  p_allow_self BOOLEAN DEFAULT false
)
RETURNS public.mps_order
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seller   TEXT;
  v_first_id UUID;
  v_order    public.mps_order;
  v_line     JSONB;
  v_item_id  UUID;
  v_qty      INT;
  v_item     public.mps_item;
  v_total    NUMERIC(18,7) := 0;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;

  -- 매장·판매자 확인
  SELECT seller_id INTO v_seller
    FROM public.mps_shop
   WHERE shop_id = p_shop_id AND del_yn = 'N';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;
  IF v_seller = p_buyer_id AND NOT p_allow_self THEN
    RAISE EXCEPTION 'SELF_PURCHASE';
  END IF;

  v_first_id := ((p_items->0)->>'item_id')::UUID;

  -- 헤더 생성(총액 0 — 라인 처리 후 UPDATE). item_id=대표(첫 라인)
  INSERT INTO public.mps_order
    (item_id, buyer_id, seller_id, order_price_pi, order_st_cd, shop_id,
     order_mthd_cd, dlvr_addr, regr_id, modr_id)
  VALUES
    (v_first_id, p_buyer_id, v_seller, 0, 'PENDING', p_shop_id,
     p_order_mthd, CASE WHEN p_order_mthd = 'DELIVERY' THEN p_dlvr_addr ELSE NULL END,
     p_regr_id, p_regr_id)
  RETURNING * INTO v_order;

  -- 라인별 원자적 재고차감 + 라인 INSERT
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_line->>'item_id')::UUID;
    v_qty     := COALESCE((v_line->>'qty')::INT, 1);
    IF v_qty < 1 THEN RAISE EXCEPTION 'BAD_QTY'; END IF;

    UPDATE public.mps_item
       SET ordered_qty = ordered_qty + v_qty,
           stock_qty   = reg_qty - (ordered_qty + v_qty),
           item_st_cd  = CASE
                           WHEN reg_qty - (ordered_qty + v_qty) = 0 AND reg_qty != 9999
                           THEN 'SOLD' ELSE item_st_cd
                         END,
           modr_id = p_regr_id,
           mod_dtm = CURRENT_TIMESTAMP
     WHERE item_id = v_item_id
       AND del_yn = 'N'
       AND item_st_cd = 'OPEN'
       AND shop_id = p_shop_id                       -- 카트=매장 단위(타매장 라인 차단)
       AND (reg_qty = 9999 OR stock_qty >= v_qty)    -- 재고 충분(무제한 제외)
    RETURNING * INTO v_item;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OUT_OF_STOCK';                -- 롤백 → 앞 라인 차감도 복원
    END IF;

    v_total := v_total + v_item.price_pi * v_qty;

    INSERT INTO public.mps_order_item
      (order_id, item_id, ord_qty, price_pi, ccy_cd, ccy_amt, regr_id, modr_id)
    VALUES
      (v_order.order_id, v_item_id, v_qty, v_item.price_pi,
       v_item.ccy_cd, v_item.ccy_amt, p_regr_id, p_regr_id);
  END LOOP;

  -- 헤더 총액 확정
  UPDATE public.mps_order
     SET order_price_pi = v_total, mod_dtm = CURRENT_TIMESTAMP
   WHERE order_id = v_order.order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. fn_mps_cart_order_cancel — 카트 주문 롤백(결제 미완료 PENDING만)
--    라인별 재고 복원(전체) + CANCELLED. 결제 취소·오류 시 클라이언트가 호출.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mps_cart_order_cancel(
  p_order_id UUID,
  p_user_id  TEXT,
  p_reason   TEXT DEFAULT NULL,
  p_regr_id  TEXT DEFAULT 'SYSTEM'
)
RETURNS public.mps_order
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.mps_order;
  v_line  RECORD;
BEGIN
  SELECT * INTO v_order FROM public.mps_order
   WHERE order_id = p_order_id AND del_yn = 'N';
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  -- 결제 미완료(PENDING) 카트 주문의 본인 롤백만 허용 (결제 후 취소는 단건 취소 정책 별도)
  IF v_order.order_st_cd <> 'PENDING' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_order.buyer_id <> p_user_id THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  -- 라인별 재고 복원
  FOR v_line IN
    SELECT item_id, ord_qty FROM public.mps_order_item
     WHERE order_id = p_order_id AND del_yn = 'N'
  LOOP
    UPDATE public.mps_item
       SET ordered_qty = GREATEST(0, ordered_qty - v_line.ord_qty),
           stock_qty   = reg_qty - GREATEST(0, ordered_qty - v_line.ord_qty),
           item_st_cd  = CASE
                           WHEN item_st_cd = 'SOLD' AND reg_qty != 9999 THEN 'OPEN'
                           ELSE item_st_cd
                         END,
           modr_id = p_regr_id,
           mod_dtm = CURRENT_TIMESTAMP
     WHERE item_id = v_line.item_id;
  END LOOP;

  UPDATE public.mps_order
     SET order_st_cd = 'CANCELLED',
         cancel_req_id = p_user_id,
         cancel_reason = p_reason,
         modr_id = p_regr_id,
         mod_dtm = CURRENT_TIMESTAMP
   WHERE order_id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
