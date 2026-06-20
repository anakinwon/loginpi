-- 074_mps_order_ccy_atomic.sql
-- 자국통화(ccy) 헤더 스냅샷을 주문생성 RPC에 원자적으로 내장 — TS 사후 UPDATE 의존 제거.
--
-- [배경] 카트 RPC(063)는 ccy를 라인(mps_order_item)에만 기록하고 헤더(mps_order)엔 누락했다.
--        정산 settleOrder가 헤더 ccy를 참조하므로 자국통화가 NULL로 정산장부(RELEASE_OUT)까지 전파됨.
--        단건(055)·카트(063) 모두 헤더 ccy를 "주문생성과 별개인 TS 사후 UPDATE"로 채워 원자적이지 않았다
--        (그 UPDATE 실패 시 침묵 누락 → 돈 장부에 자국통화 구멍).
-- [조치] 두 RPC가 주문생성과 동일 트랜잭션에서 헤더 ccy를 확정한다 → 구조적으로 누락 불가능.
--        item에 자국통화 미설정이면 NULL 유지(Pi 직거래) — 임의값 주입 없음.
--
-- DDL only: 기존 컬럼(ccy_cd VARCHAR(3) / ccy_amt NUMERIC)만 사용. 신규 테이블·컬럼 없음.
--           시그니처 불변 → CREATE OR REPLACE (DROP 불필요).

-- ──────────────────────────────────────────────────────────────
-- 1. fn_mps_order_create (단건) — 헤더 INSERT에 item 통화 스냅샷 직접 포함
-- ──────────────────────────────────────────────────────────────
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

  -- 자국통화 스냅샷을 헤더에 원자적으로 포함(item 미설정 시 NULL = Pi 직거래)
  INSERT INTO public.mps_order
    (item_id, buyer_id, seller_id, order_price_pi, order_st_cd, meet_loc_desc,
     ccy_cd, ccy_amt, regr_id, modr_id)
  VALUES
    (p_item_id, p_buyer_id, v_item.seller_id, v_item.price_pi, 'PENDING', p_meet_loc,
     v_item.ccy_cd, v_item.ccy_amt, p_regr_id, p_regr_id)
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. fn_mps_cart_order_create (카트) — 라인 합계 SUM(ccy_amt×qty)를 헤더에 원자적 반영
--    헤더 통화는 매장 단위 단일 통화 가정(카트=동일 매장). 라인에 ccy 없으면 헤더도 NULL.
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
  v_ccy_cd   VARCHAR(3) := NULL;          -- 라인에서 캡처한 자국통화 코드(매장 단일 통화)
  v_ccy_amt  NUMERIC(18,2) := 0;          -- 라인 합계 SUM(ccy_amt × qty)
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

  -- 라인별 원자적 재고차감 + 라인 INSERT + 통화 누적
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

    -- 자국통화 누적 — 라인에 ccy 있으면 코드 캡처 + 금액 합산(qty 반영)
    IF v_item.ccy_cd IS NOT NULL THEN
      v_ccy_cd  := v_item.ccy_cd;
      v_ccy_amt := v_ccy_amt + COALESCE(v_item.ccy_amt, 0) * v_qty;
    END IF;

    INSERT INTO public.mps_order_item
      (order_id, item_id, ord_qty, price_pi, ccy_cd, ccy_amt, regr_id, modr_id)
    VALUES
      (v_order.order_id, v_item_id, v_qty, v_item.price_pi,
       v_item.ccy_cd, v_item.ccy_amt, p_regr_id, p_regr_id);
  END LOOP;

  -- 헤더 총액 + 자국통화 합계 확정(원자적). ccy 없으면 NULL 유지(Pi 직거래)
  UPDATE public.mps_order
     SET order_price_pi = v_total,
         ccy_cd  = v_ccy_cd,
         ccy_amt = CASE WHEN v_ccy_cd IS NOT NULL THEN v_ccy_amt ELSE NULL END,
         mod_dtm = CURRENT_TIMESTAMP
   WHERE order_id = v_order.order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
