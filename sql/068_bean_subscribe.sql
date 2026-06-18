-- Bean 토큰 이코노미 2단계 — Bean으로 구독 결제(SPEND)
-- [currency-routing-rule] 플랫폼↔사용자 거래(구독) = Bean 결제 정본 (Pi 직접 구독결제 폐기, 커밋 d33fb64).
-- 차감(bean_wlt/bean_txn SPEND) + 구독 부여(msg_subscr upsert)를 단일 트랜잭션으로 원자 처리 —
-- Bean만 빠지고 구독이 안 되는(또는 그 반대) 사고를 원천 차단. 1 Pi = 100 Bean 고정.

CREATE OR REPLACE FUNCTION public.fn_bean_subscribe(
  p_usr_id   TEXT,
  p_plan_cd  TEXT,
  p_regr_id  TEXT DEFAULT 'ADMIN'
)
RETURNS TABLE(out_bal BIGINT, out_expire TIMESTAMPTZ, out_plan VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan   public.msg_subscr_plan;
  v_cost   BIGINT;
  v_bal    BIGINT;
  v_new    BIGINT;
  v_months INT;
  v_start  TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_exp    TIMESTAMPTZ;
BEGIN
  -- 플랜 확정 (서버 권위값) — 유료 플랜만 결제 대상
  SELECT * INTO v_plan
    FROM public.msg_subscr_plan
   WHERE plan_cd = p_plan_cd AND use_yn = 'Y' AND del_yn = 'N';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;
  IF v_plan.plan_tp_cd = 'FREE' OR v_plan.price_pi <= 0 THEN
    RAISE EXCEPTION 'FREE_PLAN';
  END IF;

  v_cost   := round(v_plan.price_pi * 100)::bigint;   -- 1 Pi = 100 Bean
  v_months := GREATEST(v_plan.mth_cnt, 1);
  v_exp    := v_start + (v_months || ' months')::interval;

  -- 지갑 잠금 (없으면 0 잔액 생성) — 동시 결제 직렬화
  SELECT bean_amt INTO v_bal
    FROM public.bean_wlt
   WHERE usr_id = p_usr_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.bean_wlt (usr_id, bean_amt, regr_id, modr_id)
    VALUES (p_usr_id, 0, p_regr_id, p_regr_id);
    v_bal := 0;
  END IF;

  IF v_bal < v_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;
  v_new := v_bal - v_cost;

  -- 1) Bean 차감 + 원장 SPEND
  UPDATE public.bean_wlt
     SET bean_amt = v_new, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE usr_id = p_usr_id;

  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, 'SPEND', -v_cost, v_new, 'SUBSCR', p_plan_cd,
     '구독 ' || v_plan.plan_nm, p_regr_id, p_regr_id);

  -- 2) 구독 부여/갱신 (usr_id UNIQUE — 업·다운그레이드는 덮어쓰기)
  INSERT INTO public.msg_subscr
    (usr_id, plan_cd, pymnt_id, start_dtm, expire_dtm, auto_renew_yn,
     del_yn, del_dtm, regr_id, modr_id, mod_dtm)
  VALUES
    (p_usr_id::uuid, p_plan_cd, NULL, v_start, v_exp, 'Y',
     'N', NULL, p_regr_id, p_regr_id, CURRENT_TIMESTAMP)
  ON CONFLICT (usr_id) DO UPDATE SET
    plan_cd       = EXCLUDED.plan_cd,
    start_dtm     = EXCLUDED.start_dtm,
    expire_dtm    = EXCLUDED.expire_dtm,
    auto_renew_yn = 'Y',
    del_yn        = 'N',
    del_dtm       = NULL,
    modr_id       = p_regr_id,
    mod_dtm       = CURRENT_TIMESTAMP;

  out_bal    := v_new;
  out_expire := v_exp;
  out_plan   := p_plan_cd;
  RETURN NEXT;
END;
$$;
