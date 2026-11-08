-- DA-APPROVED: 신규 도메인 접두사 'bean_'(Bean 토큰 이코노미) + 표준약어 'wlt'(지갑/wallet) 등재 (2026-06-18, 마스터 승인)
--   Bean은 플랫폼 내부 화폐 — 결제(pi_)와 분리된 독립 도메인. 향후 bean_rwd(보상)·bean_spend 등 확장.
--   ('txn' 거래/transaction 은 mps_txn_hist 기등록, 'bean' 빈/Bean 은 브랜드 표준어)
-- Bean 토큰 이코노미 1단계 — Pi로 Bean(플랫폼 내부 적립금) 충전 기반:
--   Bean Token은 [pi-mainnet-listing-redlines] Phase 17 미발행 → 지금은 오프체인 내부 잔액(store credit).
--   1 Pi = 100 Bean 고정. Bean은 정수 전용(BIGINT). 환율 변동 무관 — 충전 시점 pi_amt만 원장에 스냅샷.
--   원장(bean_txn, append-only)이 진실, 잔액(bean_wlt)은 빠른 조회용 캐시. fn_bean_apply가 둘을 원자적으로 동기화.

-- ──────────────────────────────────────────────────────────────
-- 1. bean_wlt — Bean 지갑 (잔액 캐시, 사용자당 1행)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_wlt (
  wlt_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id    TEXT        NOT NULL UNIQUE,                       -- sys_user.id (1인 1지갑)
  bean_amt  BIGINT      NOT NULL DEFAULT 0 CHECK (bean_amt >= 0),  -- 현재 Bean 잔액 (정수)
  del_yn    CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm   TIMESTAMPTZ,
  regr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.bean_wlt          IS 'Bean 지갑 — 사용자별 Bean 내부 적립금 잔액 캐시 (정수). 진실은 bean_txn 원장';
COMMENT ON COLUMN public.bean_wlt.bean_amt IS '현재 Bean 잔액 (정수). 1 Pi = 100 Bean 고정. 음수 불가';

CREATE INDEX IF NOT EXISTS idx_bean_wlt_usr ON public.bean_wlt(usr_id) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 2. bean_txn — Bean 거래 원장 (모든 증감, append-only)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_txn (
  txn_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id     TEXT          NOT NULL,                  -- sys_user.id
  txn_tp_cd  VARCHAR(10)   NOT NULL,                  -- CHARGE(충전+) · SPEND(사용-) · REWARD(보상+) · REFUND(환불+)
  bean_amt   BIGINT        NOT NULL,                  -- 부호 있는 증감액 (+충전/-사용)
  bal_amt    BIGINT        NOT NULL CHECK (bal_amt >= 0),  -- 거래 직후 잔액 스냅샷 (감사용)
  pi_amt     NUMERIC(18,7),                           -- CHARGE 시 지불한 Pi (그 외 NULL)
  pymnt_id   TEXT,                                    -- CHARGE 시 pi_pymnt.payment_id
  ref_tp_cd  VARCHAR(20),                             -- SPEND 출처 분류 (SUBSCR·FEATURE 등)
  ref_id     TEXT,                                    -- 연관 거래 id
  memo_txt   TEXT,
  del_yn     CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.bean_txn           IS 'Bean 거래 원장 — 충전·사용·보상·환불 모든 증감 (append-only). 진실의 원천';
COMMENT ON COLUMN public.bean_txn.txn_tp_cd IS 'CHARGE(충전+) · SPEND(사용-) · REWARD(보상+) · REFUND(환불+)';
COMMENT ON COLUMN public.bean_txn.bean_amt  IS '부호 있는 Bean 증감액 (충전/보상/환불=양수, 사용=음수)';
COMMENT ON COLUMN public.bean_txn.bal_amt   IS '거래 직후 Bean 잔액 스냅샷 (감사 추적용)';

CREATE INDEX IF NOT EXISTS idx_bean_txn_usr ON public.bean_txn(usr_id, reg_dtm DESC) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 3. fn_bean_apply — Bean 증감 원자적 적용 (원장 INSERT + 지갑 잔액 동기화)
--    충전 완료 콜백(BEAN_CHARGE 분기)·사용·보상에서 공용 호출.
--    SPEND로 잔액이 음수가 되면 INSUFFICIENT_BEAN 예외 → 전체 롤백.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bean_apply(
  p_usr_id    TEXT,
  p_txn_tp    VARCHAR,
  p_bean_amt  BIGINT,              -- 부호 있는 증감액 (충전 양수 / 사용 음수)
  p_pi_amt    NUMERIC DEFAULT NULL,
  p_pymnt_id  TEXT    DEFAULT NULL,
  p_ref_tp    VARCHAR DEFAULT NULL,
  p_ref_id    TEXT    DEFAULT NULL,
  p_memo      TEXT    DEFAULT NULL,
  p_regr_id   TEXT    DEFAULT 'SYSTEM'
)
RETURNS public.bean_wlt
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wlt     public.bean_wlt;
  v_new_bal BIGINT;
BEGIN
  -- 지갑 행 잠금 (없으면 0 잔액으로 생성) — 동시 증감 직렬화
  SELECT * INTO v_wlt
    FROM public.bean_wlt
   WHERE usr_id = p_usr_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.bean_wlt (usr_id, bean_amt, regr_id, modr_id)
    VALUES (p_usr_id, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_wlt;
  END IF;

  v_new_bal := v_wlt.bean_amt + p_bean_amt;

  IF v_new_bal < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;

  UPDATE public.bean_wlt
     SET bean_amt = v_new_bal,
         del_yn   = 'N',
         del_dtm  = NULL,
         modr_id  = p_regr_id,
         mod_dtm  = CURRENT_TIMESTAMP
   WHERE wlt_id = v_wlt.wlt_id
  RETURNING * INTO v_wlt;

  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, pymnt_id, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, p_txn_tp, p_bean_amt, v_new_bal, p_pi_amt, p_pymnt_id, p_ref_tp, p_ref_id, p_memo, p_regr_id, p_regr_id);

  RETURN v_wlt;
END;
$$;
