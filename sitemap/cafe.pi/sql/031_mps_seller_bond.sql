-- DA-APPROVED: mps_seller_bond 신규 + fn_mps_bond_deposit + fn_mps_order_cancel 수수료 확장
-- PRD_8_MPS v1.4~v1.8 보증금 정책 베타 구현:
--   판매자 계정 단위 1π 예치(옵션) · 취소수수료 정액 0.1π · 누적 9회(0.9π) 충당 · 지급준비금 0.1π
--   수수료는 보증금 활성 판매자의 거래에서만 양방향 발생 (FR-10 단서 — 인센티브 대칭)
--   반환(환불) 기능은 §12 #9 법적 자문 완료 전 미구현

-- ──────────────────────────────────────────────────────────────
-- 1. mps_seller_bond — 판매자 보증금 (계정 단위 스테이킹, 1인 1행)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mps_seller_bond (
  bond_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    TEXT          NOT NULL UNIQUE,           -- sys_user.id (계정당 1행, 예치 시 누적)
  bond_bal_pi  NUMERIC(18,7) NOT NULL DEFAULT 0 CHECK (bond_bal_pi >= 0),  -- 현재 잔액 (지급준비금 포함)
  rsv_pi       NUMERIC(18,7) NOT NULL DEFAULT 0 CHECK (rsv_pi >= 0),       -- 지급준비금 누계 (예치 1회당 0.1π)
  cancel_cnt   INT           NOT NULL DEFAULT 0 CHECK (cancel_cnt >= 0),   -- 누적 취소 차감 횟수
  pymnt_id     TEXT,                                    -- 최근 예치 pi_pymnt.payment_id
  del_yn       CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT          NOT NULL DEFAULT 'SYSTEM',
  reg_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT          NOT NULL DEFAULT 'SYSTEM',
  mod_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 지급준비금은 수수료 공제 대상이 아니므로 잔액이 지급준비금 미만으로 내려갈 수 없다
  CONSTRAINT chk_bond_rsv CHECK (bond_bal_pi >= rsv_pi)
);

COMMENT ON TABLE  public.mps_seller_bond             IS 'MPS 판매자 보증금 — 1π 예치 옵션, 취소수수료 0.1π×9회 충당, 지급준비금 0.1π (PRD v1.6~1.8)';
COMMENT ON COLUMN public.mps_seller_bond.bond_bal_pi IS '현재 잔액 (지급준비금 포함). 가용 수수료 잔액 = bond_bal_pi - rsv_pi';
COMMENT ON COLUMN public.mps_seller_bond.rsv_pi      IS '지급준비금 누계 — 수수료 공제 불가 최소 유지 잔액 (예치 1회당 0.1π)';

CREATE INDEX IF NOT EXISTS idx_mps_seller_bond_seller ON public.mps_seller_bond(seller_id) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 2. fn_mps_bond_deposit — 예치 (1π 입금, 지급준비금 0.1π 적립) 원자적 UPSERT
--    Pi 결제 완료 콜백(MPS_BOND 분기)에서 호출
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mps_bond_deposit(
  p_seller_id TEXT,
  p_pymnt_id  TEXT,
  p_regr_id   TEXT DEFAULT 'SYSTEM'
)
RETURNS public.mps_seller_bond
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bond public.mps_seller_bond;
BEGIN
  INSERT INTO public.mps_seller_bond
    (seller_id, bond_bal_pi, rsv_pi, pymnt_id, regr_id, modr_id)
  VALUES
    (p_seller_id, 1, 0.1, p_pymnt_id, p_regr_id, p_regr_id)
  ON CONFLICT (seller_id) DO UPDATE SET
    bond_bal_pi = public.mps_seller_bond.bond_bal_pi + 1,
    rsv_pi      = public.mps_seller_bond.rsv_pi + 0.1,
    pymnt_id    = EXCLUDED.pymnt_id,
    del_yn      = 'N',
    del_dtm     = NULL,
    modr_id     = p_regr_id,
    mod_dtm     = CURRENT_TIMESTAMP
  RETURNING * INTO v_bond;

  RETURN v_bond;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. fn_mps_order_cancel 재정의 — 취소수수료 0.1π 로직 추가 (FR-10 단서)
--    수수료 발생 조건: ① 거래 중(ESCROW 이후) 취소 ② 관리자 아님 ③ 판매자 보증금 활성(가용 ≥ 0.1π)
--    - 판매자 취소: 보증금에서 0.1π 원자적 차감 + FEE 이력 (구매자 보상 대기)
--    - 구매자 취소: FEE 이력만 기록 (환불 시 0.1π 공제 → 판매자 보상, 송금은 운영자 처리)
--    무보증금 판매자의 거래는 양방향 수수료 없음 (인센티브 대칭)
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

  -- ─── 취소수수료 0.1π (보증금 활성 판매자의 거래 중 취소에 한함) ───
  IF NOT p_is_admin AND v_prev_st IN ('ESCROW', 'TRADING', 'SELLER_DONE') THEN
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
