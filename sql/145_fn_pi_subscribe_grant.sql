-- DA-APPROVED: PI 모드 구독 부여 — Bean 차감 없이 bean_subscr 연장 (PRD_24 §0, 2026-06-29)
--   PI 모드 구독은 Pi U2A 직결제(metadata.type='CHAT_SUBSCR')로 받으므로, Bean 지갑 차감·
--   governance 배분 없이 bean_subscr만 연장한다(실수령은 pi_pymnt에 기록).
--   fn_bean_subscribe_product(BEAN 전용, 검증 완료)는 건드리지 않고 PI 전용으로 분리.
--   ⭐멱등: bean_txn(ref_tp='SUBSCR_PI', ref_id=pymnt_id) 마커로 중복 complete 시 재연장 차단.
--   회계 일관: bean_subscr.bean_amt=정가(Bean 기준, BEAN과 동일) / bean_txn.pi_amt=실결제 Pi(=정가÷100).
--   PI 구독은 Pi 자동결제 불가(SDK invokeContract 미지원) → auto_renew_yn='N'(만료 후 수동 재결제).

CREATE OR REPLACE FUNCTION public.fn_pi_subscribe_grant(
  p_usr_id      TEXT,
  p_prod        VARCHAR,
  p_grade       VARCHAR,
  p_cycle       VARCHAR,
  p_fee_plan_cd TEXT,
  p_bean_amt    BIGINT,     -- 정가(Bean 기준). 실결제는 pi_pymnt(=p_bean_amt÷100 Pi)
  p_months      INT,
  p_pymnt_id    TEXT,       -- Pi 결제 식별자(멱등 키)
  p_regr_id     TEXT DEFAULT 'SYSTEM',
  OUT out_expire  TIMESTAMPTZ,
  OUT out_already BOOLEAN
)
RETURNS SETOF RECORD
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sid     UUID;
  v_cur_exp TIMESTAMPTZ;
  v_base    TIMESTAMPTZ;
  v_exp     TIMESTAMPTZ;
  v_pi      NUMERIC(18,7);
  v_bal     BIGINT;
BEGIN
  IF p_bean_amt <= 0 OR p_months <= 0 THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  -- 멱등: 이 결제(pymnt_id)로 이미 구독 부여했으면 현재 만료만 반환(재연장 금지)
  IF EXISTS (
    SELECT 1 FROM public.bean_txn
     WHERE ref_tp_cd = 'SUBSCR_PI' AND ref_id = p_pymnt_id
  ) THEN
    SELECT expire_dtm INTO out_expire
      FROM public.bean_subscr
     WHERE usr_id = p_usr_id AND prod_ctgr_cd = p_prod AND del_yn = 'N';
    out_already := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_pi := ROUND(p_bean_amt / 100.0, 7);   -- 1 Pi = 100 Bean

  -- bean_subscr UPSERT (만료 전 갱신 시 잔여기간 이어붙임 — fn_bean_subscribe_product와 동일 정책)
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
           bean_amt = p_bean_amt, expire_dtm = v_exp, auto_renew_yn = 'N',
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE subscr_id = v_sid;
  ELSE
    INSERT INTO public.bean_subscr
      (usr_id, prod_ctgr_cd, grade_cd, bill_cycle_cd, fee_plan_cd, bean_amt,
       start_dtm, expire_dtm, auto_renew_yn, regr_id, modr_id)
    VALUES
      (p_usr_id, p_prod, p_grade, p_cycle, p_fee_plan_cd, p_bean_amt,
       CURRENT_TIMESTAMP, v_exp, 'N', p_regr_id, p_regr_id);
  END IF;

  -- 멱등 마커 + 회계(Pi 결제 흔적). bean_amt=0(Bean 미차감), pi_amt=실결제 Pi, ref_id=pymnt_id
  v_bal := COALESCE(
    (SELECT bean_amt FROM public.bean_token_wallet
      WHERE usr_id = p_usr_id AND wallet_type = 'USER'), 0);
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, 'SUBSCRIBE', 0, v_bal, v_pi, 'SUBSCR_PI', p_pymnt_id,
     'Pi 구독 ' || p_prod || ' ' || p_grade || '/' || p_cycle, p_regr_id, p_regr_id);

  out_expire  := v_exp;
  out_already := false;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_pi_subscribe_grant(TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, BIGINT, INT, TEXT, TEXT)
  IS 'PI 모드 구독 부여(Bean 차감 없이 bean_subscr 연장) — pymnt_id 멱등. PRD_24 §0';

-- 검증:
--   SELECT * FROM public.fn_pi_subscribe_grant('test-uid','PICAFE','GENERAL','M','PICAFE_M',500,1,'pi-pay-1','tester');
--   SELECT * FROM public.fn_pi_subscribe_grant('test-uid','PICAFE','GENERAL','M','PICAFE_M',500,1,'pi-pay-1','tester'); -- already=true
