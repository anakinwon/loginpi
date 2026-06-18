-- DA-APPROVED: Bean Token 토크노믹스 거버넌스 정비 (2026-06-19, PRD_16_TOKEN_MNG v1.3)
-- 수정 내용:
--   1. fn_bean_apply 버그 수정: CHARGE 시 PLATFORM 오증가 제거
--   2. fn_bean_subscribe_product 재작성: bean_wlt → bean_token_wallet + PLATFORM 갱신
--   3. wallet_type 확장: FOUNDATION(재단 적립금) + REWARD_POOL(생태계 기금) 추가
--   4. 신규 지갑 삽입 (0 잔액 초기)
--   5. bean_supply_config (발행 한도 + 배분 정책) 신설
-- Pi Network 공식 기준: Foundation ~10% / Ecosystem ~20% / Operating ~70%
-- TASK-181 (Phase 19, 2026-06-19)

-- ── 1. wallet_type CHECK 제약 확장 ──────────────────────────────
ALTER TABLE public.bean_token_wallet
  DROP CONSTRAINT IF EXISTS bean_token_wallet_wallet_type_check;

ALTER TABLE public.bean_token_wallet
  ADD CONSTRAINT bean_token_wallet_wallet_type_check
    CHECK (wallet_type IN ('PLATFORM','USER','FOUNDATION','REWARD_POOL'));

COMMENT ON COLUMN public.bean_token_wallet.wallet_type IS
  'PLATFORM: 운영 수익 회수 지갑(1개) | USER: 사용자 개별 보유(1인1개) | FOUNDATION: 재단 적립금(1개,Pi Network 기준 ~10%) | REWARD_POOL: 생태계 보상 기금(1개,Pi Network 기준 ~20%)';

-- ── 2. FOUNDATION 재단 지갑 삽입 ────────────────────────────────
INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
VALUES ('FOUNDATION', NULL, 0, 'SYSTEM', 'SYSTEM')
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_btw_foundation_single
  ON public.bean_token_wallet(wallet_type) WHERE wallet_type = 'FOUNDATION';

-- ── 3. REWARD_POOL 생태계 기금 지갑 삽입 ────────────────────────
INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
VALUES ('REWARD_POOL', NULL, 0, 'SYSTEM', 'SYSTEM')
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_btw_reward_pool_single
  ON public.bean_token_wallet(wallet_type) WHERE wallet_type = 'REWARD_POOL';

-- PLATFORM/FOUNDATION/REWARD_POOL 모두 usr_id = NULL 허용 (chk_btw_user_has_id는 USER만 검사)

-- ── 4. fn_bean_apply 버그 수정 + REWARD_POOL 처리 추가 ──────────
-- 버그: CHARGE 시 PLATFORM 오증가 → 제거
-- 추가: REWARD 시 REWARD_POOL 차감 (보상은 생태계 기금에서)
-- 항등식: PLATFORM + FOUNDATION + REWARD_POOL + SUM(USER) = total_CHARGE
DROP FUNCTION IF EXISTS public.fn_bean_apply(TEXT, VARCHAR, BIGINT, NUMERIC, TEXT, VARCHAR, TEXT, TEXT, TEXT);

CREATE FUNCTION public.fn_bean_apply(
  p_usr_id    TEXT,
  p_txn_tp    VARCHAR,
  p_bean_amt  BIGINT,            -- 충전 양수 / 사용·환불 음수
  p_pi_amt    NUMERIC  DEFAULT NULL,
  p_pymnt_id  TEXT     DEFAULT NULL,
  p_ref_tp    VARCHAR  DEFAULT NULL,
  p_ref_id    TEXT     DEFAULT NULL,
  p_memo      TEXT     DEFAULT NULL,
  p_regr_id   TEXT     DEFAULT 'SYSTEM'
)
RETURNS public.bean_token_wallet
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wlt     public.bean_token_wallet;
  v_new_bal BIGINT;
  v_collect BIGINT;  -- 회수된 절대값
BEGIN
  -- ① USER 지갑 행 잠금 (없으면 0 잔액으로 자동 생성)
  SELECT * INTO v_wlt
    FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER'
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
    VALUES ('USER', p_usr_id, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_wlt;
  END IF;

  -- ② 신규 잔액 계산 (음수 방지)
  v_new_bal := v_wlt.bean_amt + p_bean_amt;
  IF v_new_bal < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BEAN'; END IF;

  -- ③ USER 지갑 업데이트
  UPDATE public.bean_token_wallet
     SET bean_amt = v_new_bal,
         del_yn   = 'N', del_dtm = NULL,
         modr_id  = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wlt_id = v_wlt.wlt_id
  RETURNING * INTO v_wlt;

  -- ④ 플랫폼 지갑 처리 (거래 유형별 명세)
  --
  -- CHARGE  (충전): USER 증가, PLATFORM 변동 없음
  --   → 총 발행량은 bean_txn CHARGE SUM으로 추적. PLATFORM 건드리면 항등식 깨짐 (버그 수정)
  --
  -- SPEND/SUBSCRIBE/TIP/FEE (소비 회수): USER 감소(-), 거버넌스 지갑 증가
  --   → 배분: 운영 70% / 생태계기금 20% / 재단 10% (Pi Network 기준)
  --
  -- REWARD (보상 지급): USER 증가(+), REWARD_POOL 차감
  --   → 보상은 생태계 기금에서 지출
  --
  -- REFUND (환불): USER 증가(+), PLATFORM 변동 없음
  --   → 충전 역거래. bean_txn REFUND로 총발행 보정만

  IF p_txn_tp IN ('SPEND','SUBSCRIBE','TIP','FEE') THEN
    v_collect := ABS(p_bean_amt);  -- 양수 회수금액

    -- 운영 수익 70% → PLATFORM
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt + FLOOR(v_collect * 0.70),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'PLATFORM';

    -- 생태계 기금 20% → REWARD_POOL (Pi Network Ecosystem Fund 기준)
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt + FLOOR(v_collect * 0.20),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'REWARD_POOL';

    -- 재단 적립금 10% → FOUNDATION (Pi Network Foundation Reserve 기준)
    -- 나머지 = 반올림 오차 없이 정확한 배분
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt + (v_collect - FLOOR(v_collect * 0.70) - FLOOR(v_collect * 0.20)),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'FOUNDATION';

  ELSIF p_txn_tp = 'REWARD' THEN
    -- 보상은 REWARD_POOL에서 지출
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt - p_bean_amt),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'REWARD_POOL';
  END IF;
  -- CHARGE, REFUND는 플랫폼 지갑 변동 없음 (bean_txn으로만 추적)

  -- ⑤ 거래 원장 기록 (append-only)
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, pymnt_id, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, p_txn_tp, p_bean_amt, v_new_bal, p_pi_amt, p_pymnt_id, p_ref_tp, p_ref_id, p_memo, p_regr_id, p_regr_id);

  RETURN v_wlt;
END;
$$;

-- ── 5. fn_bean_subscribe_product 재작성: bean_wlt → bean_token_wallet ──
-- 기존 함수가 구버전 bean_wlt를 직접 참조하는 치명적 버그 수정
-- PLATFORM(70%) + REWARD_POOL(20%) + FOUNDATION(10%) 배분 포함
CREATE OR REPLACE FUNCTION public.fn_bean_subscribe_product(
  p_usr_id       TEXT,
  p_prod         VARCHAR,
  p_grade        VARCHAR,
  p_cycle        VARCHAR,
  p_fee_plan_cd  TEXT,
  p_bean_amt     BIGINT,   -- 차감할 양수 금액
  p_months       INT,
  p_regr_id      TEXT DEFAULT 'SYSTEM',
  OUT out_bal    BIGINT,
  OUT out_expire TIMESTAMPTZ
)
RETURNS SETOF RECORD
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wlt     public.bean_token_wallet;
  v_new_bal BIGINT;
  v_sid     UUID;
  v_cur_exp TIMESTAMPTZ;
  v_base    TIMESTAMPTZ;
  v_exp     TIMESTAMPTZ;
  v_collect BIGINT;
BEGIN
  IF p_bean_amt <= 0 OR p_months <= 0 THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  -- USER 지갑 잠금 (bean_token_wallet)
  SELECT * INTO v_wlt
    FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER'
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
    VALUES ('USER', p_usr_id, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_wlt;
  END IF;

  IF v_wlt.bean_amt < p_bean_amt THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;

  v_new_bal := v_wlt.bean_amt - p_bean_amt;
  v_collect := p_bean_amt;

  -- USER 지갑 차감
  UPDATE public.bean_token_wallet
     SET bean_amt = v_new_bal, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wlt_id = v_wlt.wlt_id;

  -- 회수 배분: Pi Network 기준 (운영70% / 생태계20% / 재단10%)
  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + FLOOR(v_collect * 0.70),
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'PLATFORM';

  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + FLOOR(v_collect * 0.20),
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'REWARD_POOL';

  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt + (v_collect - FLOOR(v_collect * 0.70) - FLOOR(v_collect * 0.20)),
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'FOUNDATION';

  -- bean_txn 원장 기록
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, 'SUBSCRIBE', -p_bean_amt, v_new_bal, 'SUBSCR', p_fee_plan_cd,
     '구독 ' || p_prod || ' ' || p_grade || '/' || p_cycle, p_regr_id, p_regr_id);

  -- bean_subscr UPSERT (구독 기간 연장)
  SELECT subscr_id, expire_dtm INTO v_sid, v_cur_exp
    FROM public.bean_subscr
   WHERE usr_id = p_usr_id AND prod_ctgr_cd = p_prod AND del_yn = 'N'
   FOR UPDATE;

  v_base := CURRENT_TIMESTAMP;
  IF v_sid IS NOT NULL AND v_cur_exp > v_base THEN v_base := v_cur_exp; END IF;
  v_exp := v_base + (p_months || ' months')::interval;

  IF v_sid IS NOT NULL THEN
    UPDATE public.bean_subscr
       SET grade_cd = p_grade, bill_cycle_cd = p_cycle, fee_plan_cd = p_fee_plan_cd,
           bean_amt = p_bean_amt, expire_dtm = v_exp, auto_renew_yn = 'Y',
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE subscr_id = v_sid;
  ELSE
    INSERT INTO public.bean_subscr
      (usr_id, prod_ctgr_cd, grade_cd, bill_cycle_cd, fee_plan_cd, bean_amt,
       start_dtm, expire_dtm, regr_id, modr_id)
    VALUES
      (p_usr_id, p_prod, p_grade, p_cycle, p_fee_plan_cd, p_bean_amt,
       CURRENT_TIMESTAMP, v_exp, p_regr_id, p_regr_id);
  END IF;

  out_bal    := v_new_bal;
  out_expire := v_exp;
  RETURN NEXT;
END;
$$;

-- ── 6. bean_supply_config — 발행 한도 + 배분 정책 (Pi Network 기준) ──
CREATE TABLE IF NOT EXISTS public.bean_supply_config (
  cfg_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  max_supply_bean     BIGINT,                        -- 총 발행 한도 (NULL=무제한)
  monthly_limit_bean  BIGINT,                        -- 월 발행 한도
  platform_pct        SMALLINT    NOT NULL DEFAULT 70,  -- 운영 수익 배분 %
  reward_pool_pct     SMALLINT    NOT NULL DEFAULT 20,  -- 생태계 기금 배분 %
  foundation_pct      SMALLINT    NOT NULL DEFAULT 10,  -- 재단 적립금 배분 %
  note_txt            TEXT,
  del_yn              CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm             TIMESTAMPTZ,
  regr_id             TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id             TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_pct_sum CHECK (platform_pct + reward_pool_pct + foundation_pct = 100),
  CONSTRAINT chk_pct_range CHECK (
    platform_pct BETWEEN 0 AND 100 AND
    reward_pool_pct BETWEEN 0 AND 100 AND
    foundation_pct BETWEEN 0 AND 100
  )
);

COMMENT ON TABLE  public.bean_supply_config              IS 'Bean Token 공급 정책 — Pi Network 기준 Foundation 10% / Ecosystem 20% / Operating 70%';
COMMENT ON COLUMN public.bean_supply_config.max_supply_bean   IS '총 발행 상한 (NULL=무제한). Pi Network처럼 상한 설정 권장';
COMMENT ON COLUMN public.bean_supply_config.monthly_limit_bean IS '월간 발행 상한 (CHARGE 합계 기준). 인플레이션 제어용';
COMMENT ON COLUMN public.bean_supply_config.platform_pct      IS '소비 회수분 중 운영 수익 배분율 (기본 70%)';
COMMENT ON COLUMN public.bean_supply_config.reward_pool_pct   IS '소비 회수분 중 생태계 기금 배분율 — Pi Network Ecosystem Fund 기준 (기본 20%)';
COMMENT ON COLUMN public.bean_supply_config.foundation_pct    IS '소비 회수분 중 재단 적립금 배분율 — Pi Network Foundation Reserve 기준 (기본 10%)';

-- 초기 정책 삽입 (Pi Network 공식 기준 참조)
INSERT INTO public.bean_supply_config
  (max_supply_bean, monthly_limit_bean, platform_pct, reward_pool_pct, foundation_pct, note_txt, regr_id, modr_id)
VALUES
  (NULL, 1000000, 70, 20, 10,
   'Pi Network 공식 기준 참조: Foundation 10% / Ecosystem(REWARD_POOL) 20% / Operating(PLATFORM) 70%. max_supply는 런치패드 토큰 발행 시 확정 예정.',
   'SYSTEM', 'SYSTEM');
