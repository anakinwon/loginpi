-- DA-APPROVED: 후기 보상 보증금 (PRD_24_FEES_STRATAGE §10-7, v0.4, 2026-06-29)
--   신규 'fbck_reward_bond' — 매장이 후기 보상 재원을 선예치. 보증금에서 직접 차감(=재원).
--   규칙: 보증금 활성(잔액≥보상액) 매장만 후기 작성·보상(api/feedback 게이트 ③).
--   Bean/Pi 일관: bond_bal_bean을 Bean 기준 단일 저장 → 모드 전환 시 잔액 불변(표시·차감만 ÷100/×100).
-- DA 표준: 시스템4 + del_yn. FK 무설계 관례(owner_id 참조 컬럼만).

-- ── 1. fbck_reward_bond — 후기 보상 보증금 (매장 주체당 1행) ──────────────────
CREATE TABLE IF NOT EXISTS public.fbck_reward_bond (
  bond_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       TEXT        NOT NULL,                  -- 매장 주체: 카페 owner(usr_id) / 상점 seller(usr_id)
  bond_kind      VARCHAR(10) NOT NULL CHECK (bond_kind IN ('CAFE','SHOP')),
  bond_bal_bean  BIGINT      NOT NULL DEFAULT 0 CHECK (bond_bal_bean >= 0),  -- 보증금 잔액(Bean 기준, Pi=÷100)
  del_yn         CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT        NOT NULL DEFAULT 'SYSTEM',
  reg_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT        NOT NULL DEFAULT 'SYSTEM',
  mod_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_fbck_bond_owner UNIQUE (owner_id, bond_kind)   -- 매장 주체당 1행(예치 누적)
);

COMMENT ON TABLE  public.fbck_reward_bond               IS '후기 보상 보증금 — 매장 선예치 재원, 보상 시 직접 차감(소진=후기보상 중단). PRD_24 §10-7';
COMMENT ON COLUMN public.fbck_reward_bond.owner_id      IS '매장 주체 usr_id (카페 msg_room owner / 상점 mps_shop seller)';
COMMENT ON COLUMN public.fbck_reward_bond.bond_kind     IS 'CAFE=카페 후기 / SHOP=상점 후기';
COMMENT ON COLUMN public.fbck_reward_bond.bond_bal_bean IS '보증금 잔액(Bean 정수). Pi 표시·차감 = ÷100. 1π=100 Bean';

CREATE INDEX IF NOT EXISTS idx_fbck_bond_owner
  ON public.fbck_reward_bond(owner_id, bond_kind) WHERE del_yn = 'N';

-- ── 2. fn_fbck_bond_deposit — 예치(+잔액, 멱등 UPSERT) ───────────────────────
--   p_pay_src='BEAN' → 매장 Bean 지갑 차감(원자) / 'PI' → pi_pymnt 선완료(호출부 검증), bond +만.
--   PI 예치액은 호출부에서 Pi×100 Bean으로 환산해 p_bean_amt로 전달(1:100 단일 저장 일관).
CREATE OR REPLACE FUNCTION public.fn_fbck_bond_deposit(
  p_owner_id   TEXT,
  p_bond_kind  VARCHAR(10),
  p_bean_amt   BIGINT,
  p_pay_src    VARCHAR(10) DEFAULT 'BEAN',
  p_pymnt_id   TEXT        DEFAULT NULL,
  p_regr_id    TEXT        DEFAULT 'SYSTEM'
)
RETURNS BIGINT          -- 예치 후 보증금 잔액
LANGUAGE plpgsql AS $$
DECLARE
  v_bal     BIGINT;
  v_wlt_bal BIGINT;
BEGIN
  IF p_bean_amt <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_bond_kind NOT IN ('CAFE','SHOP') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  IF p_pay_src NOT IN ('BEAN','PI') THEN RAISE EXCEPTION 'INVALID_SRC'; END IF;

  -- BEAN 예치: 매장 Bean 지갑에서 보증금으로 이동(원자). PI 예치는 pi_pymnt 선완료.
  IF p_pay_src = 'BEAN' THEN
    UPDATE public.bean_wlt
       SET bean_amt = bean_amt - p_bean_amt, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE usr_id = p_owner_id AND del_yn = 'N' AND bean_amt >= p_bean_amt
     RETURNING bean_amt INTO v_wlt_bal;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_BEAN'; END IF;

    INSERT INTO public.bean_txn (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
    VALUES (p_owner_id, 'SPEND', -p_bean_amt, v_wlt_bal, 'FBCK_BOND', p_bond_kind, '후기 보상 보증금 예치', p_regr_id, p_regr_id);
  END IF;

  INSERT INTO public.fbck_reward_bond (owner_id, bond_kind, bond_bal_bean, regr_id, modr_id)
  VALUES (p_owner_id, p_bond_kind, p_bean_amt, p_regr_id, p_regr_id)
  ON CONFLICT (owner_id, bond_kind) DO UPDATE SET
    bond_bal_bean = public.fbck_reward_bond.bond_bal_bean + p_bean_amt,
    modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
  RETURNING bond_bal_bean INTO v_bal;

  RETURN v_bal;
END $$;

COMMENT ON FUNCTION public.fn_fbck_bond_deposit(TEXT, VARCHAR, BIGINT, VARCHAR, TEXT, TEXT)
  IS '후기 보상 보증금 예치(+) — BEAN=지갑 차감 원자 / PI=pi_pymnt 선완료 후 ×100 Bean 누적';

-- ── 3. fn_fbck_reward_apply — 후기 보상 지급 + 보증금 차감 (원자) ─────────────
--   게이트: 보증금 잔액 ≥ 보상액이어야 성공(부족 시 INSUFFICIENT_BOND, 전체 롤백 → 후기 보상 차단).
--   BEAN 모드: 작성자 Bean 지갑 +지급 + bean_txn REWARD.
--   PI 모드: bean_txn에 A2U '대기' 기록(bean_amt=0·pi_amt=÷100·ref_tp=FBCK_PI). 실 A2U 송금은 앱(triggerPiReward).
CREATE OR REPLACE FUNCTION public.fn_fbck_reward_apply(
  p_usr_id      TEXT,         -- 후기 작성자(보상 수령)
  p_owner_id    TEXT,         -- 매장 주체(보증금 차감)
  p_bond_kind   VARCHAR(10),
  p_fbck_id     TEXT,
  p_reward_bean BIGINT,       -- 보상액(점수별 bean_fee_plan FBCK_REWARD)
  p_mode        VARCHAR(10)   -- 'BEAN' | 'PI'
)
RETURNS TABLE (ok BOOLEAN, message TEXT, bond_bal BIGINT, reward_bean BIGINT, reward_pi NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_bond     BIGINT;
  v_pi       NUMERIC(18,7);
  v_wlt_bal  BIGINT;
BEGIN
  IF p_reward_bean <= 0 THEN
    RETURN QUERY SELECT false, 'INVALID_REWARD', NULL::BIGINT, p_reward_bean, NULL::NUMERIC; RETURN;
  END IF;

  -- 보증금 차감(원자) — 잔액 부족 시 차단(후기 보상 게이트)
  UPDATE public.fbck_reward_bond
     SET bond_bal_bean = bond_bal_bean - p_reward_bean, modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
   WHERE owner_id = p_owner_id AND bond_kind = p_bond_kind AND del_yn = 'N'
     AND bond_bal_bean >= p_reward_bean
   RETURNING bond_bal_bean INTO v_bond;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INSUFFICIENT_BOND', NULL::BIGINT, p_reward_bean, NULL::NUMERIC; RETURN;
  END IF;

  v_pi := ROUND(p_reward_bean / 100.0, 7);   -- 1:100

  IF p_mode = 'BEAN' THEN
    -- 작성자 Bean 지갑 지급(없으면 생성)
    UPDATE public.bean_wlt
       SET bean_amt = bean_amt + p_reward_bean, modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
     WHERE usr_id = p_usr_id AND del_yn = 'N'
     RETURNING bean_amt INTO v_wlt_bal;
    IF NOT FOUND THEN
      INSERT INTO public.bean_wlt (usr_id, bean_amt) VALUES (p_usr_id, p_reward_bean)
      RETURNING bean_amt INTO v_wlt_bal;
    END IF;

    INSERT INTO public.bean_txn (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
    VALUES (p_usr_id, 'REWARD', p_reward_bean, v_wlt_bal, NULL, 'FBCK', p_fbck_id, '이용후기 보상(Bean)', 'SYSTEM', 'SYSTEM');
  ELSE
    -- PI 모드: Bean 지갑 미증가. A2U 대기 기록(앱이 triggerPiReward로 실송금·멱등)
    v_wlt_bal := COALESCE((SELECT bean_amt FROM public.bean_wlt WHERE usr_id = p_usr_id AND del_yn = 'N'), 0);
    INSERT INTO public.bean_txn (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
    VALUES (p_usr_id, 'REWARD', 0, v_wlt_bal, v_pi, 'FBCK_PI', p_fbck_id, '이용후기 보상(Pi A2U 대기)', 'SYSTEM', 'SYSTEM');
  END IF;

  RETURN QUERY SELECT true, 'OK', v_bond, p_reward_bean, v_pi;
END $$;

COMMENT ON FUNCTION public.fn_fbck_reward_apply(TEXT, TEXT, VARCHAR, TEXT, BIGINT, VARCHAR)
  IS '후기 보상 지급 + 보증금 차감(원자). 잔액 부족 시 차단. PI 모드는 A2U 대기 기록(앱이 송금)';

-- 검증:
--   SELECT public.fn_fbck_bond_deposit('owner-uuid','SHOP',1000,'BEAN');           -- 예치 → 1000
--   SELECT * FROM public.fn_fbck_reward_apply('writer','owner-uuid','SHOP','fbck-1',100,'BEAN');  -- 보상 → bond 900
--   SELECT * FROM public.fn_fbck_reward_apply('writer','owner-uuid','SHOP','fbck-2',100,'PI');    -- Pi 대기, bond 800
