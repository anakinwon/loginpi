-- DA-APPROVED: mps_ 주제영역 신규 등록 (TASK-100) — PiShop P2P 마켓플레이스 6개 테이블 + 주문 RPC 2종
-- Phase 13: PRD_8_MPS.md v1.1 §7 DB 스키마 — 핵심 불변 조건 stock_qty = reg_qty - ordered_qty

-- ──────────────────────────────────────────────────────────────
-- 1. mps_ctgr — 상품 카테고리 (2단계 계층, parent_ctgr_id 자기참조)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_ctgr (
  ctgr_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_ctgr_id UUID         REFERENCES public.mps_ctgr(ctgr_id),  -- NULL이면 대분류
  ctgr_nm        VARCHAR(100) NOT NULL,
  ctgr_desc      TEXT,
  sort_ord       INT          NOT NULL DEFAULT 0,
  use_yn         CHAR(1)      NOT NULL DEFAULT 'Y',
  del_yn         CHAR(1)      NOT NULL DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.mps_ctgr IS 'MPS 상품 카테고리 — 2단계 계층(parent_ctgr_id 자기참조)';

-- ──────────────────────────────────────────────────────────────
-- 2. mps_shop — 판매자 매장 (Google Maps 확장 포인트: place_id·lat·lng)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_shop (
  shop_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id      TEXT          NOT NULL,             -- sys_user.id
  shop_nm        VARCHAR(200)  NOT NULL,
  shop_type_cd   VARCHAR(10)   NOT NULL,             -- ONLINE / OFFLINE / BOTH
  shop_desc      TEXT,
  addr           TEXT,                               -- 오프라인 주소 (OFFLINE·BOTH 권장)
  lat            NUMERIC(9,6),                       -- 위도 (WGS84, nullable)
  lng            NUMERIC(10,6),                      -- 경도 (WGS84, nullable)
  place_id       TEXT,                               -- Google Maps Place ID (Phase 3 연동용)
  biz_hour       TEXT,
  contact_tel    VARCHAR(30),
  contact_email  VARCHAR(200),
  sns_url        TEXT,
  thumb_url      TEXT,
  use_yn         CHAR(1)       NOT NULL DEFAULT 'Y',
  del_yn         CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_shop_type CHECK (shop_type_cd IN ('ONLINE', 'OFFLINE', 'BOTH'))
);

COMMENT ON TABLE public.mps_shop IS 'MPS 판매자 매장 — 온·오프라인, lat/lng/place_id는 Google Maps Phase 3 확장 포인트';

CREATE INDEX IF NOT EXISTS idx_mps_shop_seller ON public.mps_shop(seller_id) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 3. mps_item — 상품
--    ⚠️ 핵심 불변 조건: stock_qty = reg_qty - ordered_qty (CHECK 이중 안전장치)
--    reg_qty = 9999 무제한 센티널: 재고 소진 시에도 SOLD 자동전환 억제
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_item (
  item_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id      TEXT          NOT NULL,             -- sys_user.id
  shop_id        UUID          REFERENCES public.mps_shop(shop_id),  -- nullable: 매장 미지정 허용
  ctgr_id        UUID          REFERENCES public.mps_ctgr(ctgr_id),  -- nullable: 카테고리 미지정 허용
  item_nm        VARCHAR(300)  NOT NULL,
  item_desc      TEXT,
  price_pi       NUMERIC(18,7) NOT NULL CHECK (price_pi > 0),
  item_cnd_cd    VARCHAR(10)   NOT NULL,             -- NEW / USED / HANDMADE
  item_type_cd   VARCHAR(10)   NOT NULL DEFAULT 'GOODS',
  item_st_cd     VARCHAR(10)   NOT NULL DEFAULT 'DRAFT', -- DRAFT / OPEN / CLOSED / SOLD
  view_cnt       INT           NOT NULL DEFAULT 0,
  thumbnail_url  TEXT,
  reg_qty        INT           NOT NULL DEFAULT 1 CHECK (reg_qty > 0),     -- 등록수량 (9999 = 무제한)
  ordered_qty    INT           NOT NULL DEFAULT 0 CHECK (ordered_qty >= 0), -- 주문수량 누적
  stock_qty      INT           NOT NULL DEFAULT 1 CHECK (stock_qty >= 0),   -- 재고 (= reg_qty - ordered_qty)
  del_yn         CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_item_cnd CHECK (item_cnd_cd IN ('NEW', 'USED', 'HANDMADE')),
  CONSTRAINT chk_item_st  CHECK (item_st_cd IN ('DRAFT', 'OPEN', 'CLOSED', 'SOLD')),
  CONSTRAINT chk_stock_eq CHECK (stock_qty = reg_qty - ordered_qty)
);

COMMENT ON TABLE  public.mps_item          IS 'MPS 상품 — 재고 불변 조건 stock_qty = reg_qty - ordered_qty';
COMMENT ON COLUMN public.mps_item.reg_qty  IS '판매자 등록수량. 9999 = 무제한 센티널(자동 SOLD 전환 억제)';

CREATE INDEX IF NOT EXISTS idx_mps_item_seller ON public.mps_item(seller_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_mps_item_ctgr   ON public.mps_item(ctgr_id)   WHERE del_yn = 'N' AND item_st_cd = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_mps_item_open   ON public.mps_item(item_st_cd, reg_dtm DESC) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 4. mps_item_img — 상품 이미지 (최대 5장, thumbnail_yn 1장)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_item_img (
  img_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID         NOT NULL REFERENCES public.mps_item(item_id),
  img_url        TEXT         NOT NULL,
  sort_ord       INT          NOT NULL DEFAULT 0,
  thumbnail_yn   CHAR(1)      NOT NULL DEFAULT 'N',
  del_yn         CHAR(1)      NOT NULL DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mps_item_img_item ON public.mps_item_img(item_id, sort_ord) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 5. mps_order — 주문 (상태 머신: PENDING→ESCROW→TRADING→SELLER_DONE→DONE / CANCELLED)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_order (
  order_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID          NOT NULL REFERENCES public.mps_item(item_id),
  buyer_id       TEXT          NOT NULL,             -- sys_user.id
  seller_id      TEXT          NOT NULL,             -- sys_user.id
  order_price_pi NUMERIC(18,7) NOT NULL,             -- 주문 시점 가격 스냅샷
  order_st_cd    VARCHAR(11)   NOT NULL DEFAULT 'PENDING',
  escrow_txid    TEXT,                               -- Pi 에스크로 결제 txid
  release_txid   TEXT,                               -- 판매자 정산 전송 txid
  cancel_req_id  TEXT,                               -- 취소 요청자 user_id
  cancel_reason  TEXT,
  fee_pi         NUMERIC(18,7),                      -- 수수료 (MVP: 0, 정책 §12 미결)
  fee_payer_id   TEXT,
  meet_loc_desc  TEXT,                               -- 직거래 장소 메모
  del_yn         CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_order_st CHECK (
    order_st_cd IN ('PENDING', 'ESCROW', 'TRADING', 'SELLER_DONE', 'DONE', 'CANCELLED')
  )
);

COMMENT ON TABLE public.mps_order IS 'MPS 주문 — 양방향 확인 에스크로 (SELLER_DONE→DONE 시 판매자 정산)';

CREATE INDEX IF NOT EXISTS idx_mps_order_buyer  ON public.mps_order(buyer_id,  reg_dtm DESC);
CREATE INDEX IF NOT EXISTS idx_mps_order_seller ON public.mps_order(seller_id, reg_dtm DESC);
CREATE INDEX IF NOT EXISTS idx_mps_order_item   ON public.mps_order(item_id);

-- ──────────────────────────────────────────────────────────────
-- 6. mps_txn_hist — 거래 이력 (에스크로 입출금·환불·수수료)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_txn_hist (
  txn_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID          NOT NULL REFERENCES public.mps_order(order_id),
  user_id        TEXT          NOT NULL,             -- 거래 당사자 user_id
  txn_type_cd    VARCHAR(20)   NOT NULL,             -- ESCROW_IN / RELEASE_OUT / AUTO_RELEASE / REFUND / FEE
  pi_amt         NUMERIC(18,7) NOT NULL,             -- 입금 +, 출금 -
  txn_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pi_txid        TEXT,
  memo           TEXT,
  del_yn         CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_txn_type CHECK (
    txn_type_cd IN ('ESCROW_IN', 'RELEASE_OUT', 'AUTO_RELEASE', 'REFUND', 'FEE')
  )
);

CREATE INDEX IF NOT EXISTS idx_mps_txn_order ON public.mps_txn_hist(order_id, txn_dtm DESC);
CREATE INDEX IF NOT EXISTS idx_mps_txn_user  ON public.mps_txn_hist(user_id,  txn_dtm DESC);

-- ──────────────────────────────────────────────────────────────
-- 7. fn_mps_order_create — 주문 생성 + 재고 원자적 차감 (단일 트랜잭션)
--    재고 차감·SOLD 전환·주문 INSERT가 한 트랜잭션 — race condition 안전
--    예외: OUT_OF_STOCK(재고 없음·미게시) / SELF_PURCHASE(본인 상품)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mps_order_create(
  p_item_id  UUID,
  p_buyer_id TEXT,
  p_meet_loc TEXT DEFAULT NULL,
  p_regr_id  TEXT DEFAULT 'SYSTEM'
)
RETURNS public.mps_order
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item  public.mps_item;
  v_order public.mps_order;
BEGIN
  -- 원자적 재고 차감: OPEN + stock_qty > 0 조건과 차감이 단일 UPDATE
  -- reg_qty = 9999(무제한 센티널)이면 재고 0 도달 시에도 SOLD 자동전환 억제
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

  -- 본인 상품 구매 차단 (예외 발생 시 트랜잭션 롤백 → 재고 자동 복원)
  IF v_item.seller_id = p_buyer_id THEN
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

-- ──────────────────────────────────────────────────────────────
-- 8. fn_mps_order_cancel — 주문 취소 + 재고 원자적 복원 (단일 트랜잭션)
--    취소 가능: PENDING·ESCROW·TRADING(당사자·관리자) / SELLER_DONE(구매자·관리자만)
--    SOLD였던 상품은 재고 복원과 함께 OPEN 재전환
--    예외: ORDER_NOT_FOUND / NOT_ALLOWED(권한·상태 위반)
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

  -- 상태·권한 검증
  IF v_order.order_st_cd IN ('DONE', 'CANCELLED') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
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
