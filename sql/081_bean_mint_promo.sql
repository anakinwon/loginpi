-- DA-APPROVED: 프로모션 Bean 신규 발행(보조금) — REWARD_POOL 등 거버넌스 지갑 충전 (2026-06-21)
-- 목적: 매장주 선지급 등 보상 캠페인 재원을 플랫폼이 무상 발행해 거버넌스 지갑에 주입.
-- 회계: 발행(MINT)은 현금(Pi) 유입 없는 보조금성 발행 → 매출 아님.
--   항등식(발행=유통+회수) 유지: dest 지갑(회수) +amt 와 동시에 '발행 총량'에 +amt.
--   대차대조표 발행 집계 = ΣCHARGE.bean_amt + Σbean_mint_log.bean_amt 로 확장(stats route 반영).

-- ── 1. bean_mint_log — 프로모션 발행 원장 (append-only) ──────────────
CREATE TABLE IF NOT EXISTS public.bean_mint_log (
  mint_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bean_amt     BIGINT       NOT NULL CHECK (bean_amt > 0),       -- 발행액(양수)
  dest_wallet  VARCHAR(16)  NOT NULL DEFAULT 'REWARD_POOL'
                 CHECK (dest_wallet IN ('PLATFORM','FOUNDATION','REWARD_POOL')),
  reason_txt   VARCHAR(200) NOT NULL,                           -- 발행 사유(필수)
  del_yn       CHAR(1)      NOT NULL DEFAULT 'N',
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.bean_mint_log         IS '프로모션 Bean 발행 원장 — 현금 없는 보조금성 발행(거버넌스 지갑 충전). 매출 아님, 대차대조표 발행에 포함';
COMMENT ON COLUMN public.bean_mint_log.dest_wallet IS '발행 대상 거버넌스 지갑(기본 REWARD_POOL=보상재원)';

CREATE INDEX IF NOT EXISTS idx_bean_mint_dtm ON public.bean_mint_log(reg_dtm DESC) WHERE del_yn = 'N';

-- ── 2. fn_bean_mint — 거버넌스 지갑 발행 충전 (원자적) ────────────────
CREATE OR REPLACE FUNCTION public.fn_bean_mint(
  p_bean_amt    BIGINT,
  p_dest_wallet VARCHAR DEFAULT 'REWARD_POOL',
  p_reason      TEXT    DEFAULT '프로모션 발행',
  p_regr_id     TEXT    DEFAULT 'ADMIN'
)
RETURNS BIGINT          -- 충전 후 대상 지갑 잔액
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bal BIGINT;
BEGIN
  IF p_bean_amt IS NULL OR p_bean_amt <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF p_dest_wallet NOT IN ('PLATFORM','FOUNDATION','REWARD_POOL') THEN
    RAISE EXCEPTION 'INVALID_WALLET';
  END IF;

  -- 대상 거버넌스 지갑 +amt
  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + p_bean_amt,
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = p_dest_wallet
  RETURNING bean_amt INTO v_bal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  -- 발행 원장 기록 (발행 총량 추적 — 대차대조표 발행에 합산됨)
  INSERT INTO public.bean_mint_log (bean_amt, dest_wallet, reason_txt, regr_id, modr_id)
  VALUES (p_bean_amt, p_dest_wallet, p_reason, p_regr_id, p_regr_id);

  RETURN v_bal;
END;
$$;

COMMENT ON FUNCTION public.fn_bean_mint IS
  '프로모션 Bean 발행 — 거버넌스 지갑 +amt + bean_mint_log 기록. 발행 총량에 포함(항등식 유지)';
