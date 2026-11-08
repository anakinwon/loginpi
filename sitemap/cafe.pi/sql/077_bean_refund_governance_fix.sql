-- DA-APPROVED: Bean Token REFUND 회계 버그 수정 + 항등식 누적 불일치 보정 (2026-06-21, PRD_16_TOKEN_MNG)
-- 배경:
--   fn_bean_apply(sql/070)의 REFUND 분기가 USER 지갑만 복원(+)하고 거버넌스(회수) 지갑을
--   되돌리지 않아, 환불액이 거버넌스에 그대로 남고 USER에도 복원되어 이중 계상됨.
--   → 항등식(발행 = 유통 + 회수)이 정확히 ΣREFUND 만큼 깨짐.
--   실측(2026-06-21): 발행 10000, 유통 9880, 회수 140 → diff -20 (= REFUND 2건 합)
--
-- REFUND 의미: 채팅방 입장 실패 환불·뱃지 업그레이드 환불 = 직전 SPEND(소비)의 역연산.
--   SPEND가 거버넌스에 70/20/10으로 회수했으므로, REFUND는 동일 비율로 역차감해야 대칭·균형.
--   (PLATFORM 단독 차감은 단일 거래에서도 CHECK(bean_amt>=0) 위반 롤백 위험 → 비율 역분배 채택)
--
-- 수정 내용:
--   1. fn_bean_apply REFUND 분기 추가 (SPEND 분배의 정확한 역 — 클램프 없음)
--   2. 기존 누적 불일치분 1회 보정 (멱등 — 현재 diff 기준 재계산)
--   3. (주석) REWARD 분기의 GREATEST(0,…) 클램프 잠재위험 경고

-- ── 1. fn_bean_apply 재정의 (070 본문 + REFUND 역분배 분기) ────────────
CREATE OR REPLACE FUNCTION public.fn_bean_apply(
  p_usr_id    TEXT,
  p_txn_tp    VARCHAR,
  p_bean_amt  BIGINT,            -- 충전·보상·환불 양수 / 사용 음수
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
  v_collect BIGINT;  -- 회수/역회수 절대값
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

  -- ④ 거버넌스 지갑 처리 (거래 유형별)
  IF p_txn_tp IN ('SPEND','SUBSCRIBE','TIP','FEE') THEN
    -- 소비 회수: USER 감소 → 거버넌스 증가 (운영70 / 생태계20 / 재단10)
    v_collect := ABS(p_bean_amt);
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

  ELSIF p_txn_tp = 'REFUND' THEN
    -- 환불 = 소비(SPEND) 취소 → 거버넌스 회수분을 동일 비율로 역차감 (정확한 대칭)
    -- 클램프(GREATEST) 미사용 — 회수된 적 없는 환불은 CHECK(bean_amt>=0) 위반으로 롤백(정상 방어)
    v_collect := ABS(p_bean_amt);
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt - FLOOR(v_collect * 0.70),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'PLATFORM';
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt - FLOOR(v_collect * 0.20),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'REWARD_POOL';
    UPDATE public.bean_token_wallet
       SET bean_amt = bean_amt - (v_collect - FLOOR(v_collect * 0.70) - FLOOR(v_collect * 0.20)),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'FOUNDATION';

  ELSIF p_txn_tp = 'REWARD' THEN
    -- 보상 지급: USER 증가 → REWARD_POOL 차감
    -- ⚠️ 잠재위험: GREATEST(0,…) 클램프는 REWARD_POOL 잔액 부족 시 항등식을 깬다
    --    (USER는 전액 +, POOL은 0까지만 감소 → 유통>회수). 현재 REWARD 0건이라 미발현.
    --    REWARD 본격 도입 시: 부족분을 PLATFORM에서 폭포 차감하도록 재설계 필요.
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt - p_bean_amt),
           modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'REWARD_POOL';
  END IF;
  -- CHARGE는 거버넌스 변동 없음 (발행은 bean_txn CHARGE SUM으로 추적)

  -- ⑤ 거래 원장 기록 (append-only)
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, pymnt_id, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_usr_id, p_txn_tp, p_bean_amt, v_new_bal, p_pi_amt, p_pymnt_id, p_ref_tp, p_ref_id, p_memo, p_regr_id, p_regr_id);

  RETURN v_wlt;
END;
$$;

-- ── 2. 기존 누적 불일치분 1회 보정 (멱등) ──────────────────────────────
-- 과거 REFUND가 거버넌스에서 역차감되지 않아 남은 초과분을 동일 비율(70/20/10)로 차감.
-- 현재 diff를 매번 재계산하므로 재실행해도 0이면 변동 없음(멱등).
DO $$
DECLARE
  v_issued BIGINT;
  v_circ   BIGINT;
  v_coll   BIGINT;
  v_diff   BIGINT;  -- 초과분 = (유통 + 회수) - 발행
BEGIN
  SELECT COALESCE(SUM(bean_amt),0) INTO v_issued
    FROM public.bean_txn WHERE txn_tp_cd = 'CHARGE' AND del_yn = 'N';
  SELECT COALESCE(SUM(bean_amt),0) INTO v_circ
    FROM public.bean_token_wallet WHERE wallet_type = 'USER' AND del_yn = 'N';
  SELECT COALESCE(SUM(bean_amt),0) INTO v_coll
    FROM public.bean_token_wallet
   WHERE wallet_type IN ('PLATFORM','FOUNDATION','REWARD_POOL') AND del_yn = 'N';

  v_diff := (v_circ + v_coll) - v_issued;

  IF v_diff > 0 THEN
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt - FLOOR(v_diff * 0.70)),
           modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'PLATFORM';
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt - FLOOR(v_diff * 0.20)),
           modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'REWARD_POOL';
    UPDATE public.bean_token_wallet
       SET bean_amt = GREATEST(0, bean_amt - (v_diff - FLOOR(v_diff * 0.70) - FLOOR(v_diff * 0.20))),
           modr_id = 'SYSTEM', mod_dtm = CURRENT_TIMESTAMP
     WHERE wallet_type = 'FOUNDATION';
    RAISE NOTICE 'Bean 항등식 보정 완료: 거버넌스에서 % Bean 역차감 (P/RP/FND 70/20/10)', v_diff;
  ELSE
    RAISE NOTICE 'Bean 항등식 정상(diff=%) — 보정 불필요', v_diff;
  END IF;
END $$;

-- ── 3. 검증 쿼리 (수동 실행 — diff = 0 확인) ──────────────────────────
-- WITH
--   issued AS (SELECT COALESCE(SUM(bean_amt),0) v FROM public.bean_txn WHERE txn_tp_cd='CHARGE' AND del_yn='N'),
--   circ   AS (SELECT COALESCE(SUM(bean_amt),0) v FROM public.bean_token_wallet WHERE wallet_type='USER' AND del_yn='N'),
--   coll   AS (SELECT COALESCE(SUM(bean_amt),0) v FROM public.bean_token_wallet WHERE wallet_type IN ('PLATFORM','FOUNDATION','REWARD_POOL') AND del_yn='N')
-- SELECT issued.v AS 발행, circ.v AS 유통, coll.v AS 회수, issued.v - circ.v - coll.v AS diff
-- FROM issued, circ, coll;   -- diff = 0 이면 정상
