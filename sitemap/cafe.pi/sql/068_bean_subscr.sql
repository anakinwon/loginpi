-- DA-APPROVED: 'bean_' 도메인 기등록(067_bean_wallet, 2026-06-18 마스터 승인) 하위 테이블 추가
-- Bean 토큰 이코노미 2단계 — 상품별 구독 (현행 msg_subscr_plan 3-tier 대체)
-- [PRD_14_SUBSC_REDESIGN] 상품군별 독립 구독(PiCafe·PiShop S/M/L·자동번역), 동시 다중.
-- 구독료 = Bean 차감(SPEND). 금액 정본 = src/lib/bean-subscr-plan.ts (bean_fee_plan §4-1 미러, 서버 권위값).
-- 차감(bean_wlt/bean_txn) + 구독부여(bean_subscr)를 단일 트랜잭션 원자 처리.
-- 금액 컬럼은 bean_wlt/bean_txn과 동일하게 bean_amt(접미사 amt).

-- ──────────────────────────────────────────────────────────────
-- 1. bean_subscr — 상품군별 구독 (usr × 상품군 다중행)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_subscr (
  subscr_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id        TEXT        NOT NULL,                     -- sys_user.id
  prod_ctgr_cd  VARCHAR(16) NOT NULL,                     -- PICAFE / PISHOP / TRANSLATE
  grade_cd      VARCHAR(10) NOT NULL DEFAULT 'GENERAL',   -- PiShop: S/M/L, 그 외 GENERAL
  bill_cycle_cd VARCHAR(8)  NOT NULL,                      -- M / Y
  fee_plan_cd   VARCHAR(20) NOT NULL,                     -- 구독 시점 요금코드 스냅샷 (SM100 등)
  bean_amt      INT         NOT NULL,                     -- 결제한 구독료 Bean 스냅샷
  start_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expire_dtm    TIMESTAMPTZ NOT NULL,
  auto_renew_yn CHAR(1)     NOT NULL DEFAULT 'Y',
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N',
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.bean_subscr             IS '상품군별 구독 — PiCafe·PiShop(S/M/L)·자동번역, 동시 다중. 구독료 Bean 차감 (PRD_14_SUBSC_REDESIGN)';
COMMENT ON COLUMN public.bean_subscr.prod_ctgr_cd IS 'PICAFE / PISHOP / TRANSLATE — 구독 대상 상품군';
COMMENT ON COLUMN public.bean_subscr.grade_cd     IS 'PiShop 등급 S/M/L(상품 수 한도), 그 외 GENERAL';

-- 상품군당 1활성 (등급·주기 변경/갱신은 덮어쓰기)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bean_subscr_active
  ON public.bean_subscr(usr_id, prod_ctgr_cd) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 2. fn_bean_subscribe_product — Bean 차감 + 구독 부여/갱신 원자 처리
--    금액·주기는 서버(bean-subscr-plan.ts)가 권위값으로 전달(클라이언트 조작 방지).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bean_subscribe_product(
  p_usr_id      TEXT,
  p_prod        VARCHAR,
  p_grade       VARCHAR,
  p_cycle       VARCHAR,
  p_fee_plan_cd VARCHAR,
  p_bean_amt    INT,
  p_months      INT,
  p_regr_id     TEXT DEFAULT 'ADMIN'
)
RETURNS TABLE(out_bal BIGINT, out_expire TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bal     BIGINT;
  v_new     BIGINT;
  v_sid     UUID;
  v_cur_exp TIMESTAMPTZ;
  v_base    TIMESTAMPTZ;
  v_exp     TIMESTAMPTZ;
BEGIN
  IF p_bean_amt <= 0 OR p_months <= 0 THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  -- 지갑 잠금 (없으면 0 생성)
  SELECT bean_amt INTO v_bal FROM public.bean_wlt WHERE usr_id = p_usr_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.bean_wlt (usr_id, bean_amt, regr_id, modr_id)
    VALUES (p_usr_id, 0, p_regr_id, p_regr_id);
    v_bal := 0;
  END IF;

  IF v_bal < p_bean_amt THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;
  v_new := v_bal - p_bean_amt;

  -- 1) Bean 차감 + 원장 SPEND
  UPDATE public.bean_wlt
     SET bean_amt = v_new, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE usr_id = p_usr_id;

  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, 'SPEND', -p_bean_amt, v_new, 'SUBSCR', p_fee_plan_cd,
     '구독 ' || p_prod || ' ' || p_grade || '/' || p_cycle, p_regr_id, p_regr_id);

  -- 2) 구독 부여/갱신 (상품군당 1활성). 만료 전 갱신 시 잔여기간에 이어붙임.
  SELECT subscr_id, expire_dtm INTO v_sid, v_cur_exp
    FROM public.bean_subscr
   WHERE usr_id = p_usr_id AND prod_ctgr_cd = p_prod AND del_yn = 'N'
   FOR UPDATE;

  v_base := CURRENT_TIMESTAMP;
  IF v_sid IS NOT NULL AND v_cur_exp > v_base THEN
    v_base := v_cur_exp;
  END IF;
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

  out_bal := v_new;
  out_expire := v_exp;
  RETURN NEXT;
END;
$$;
