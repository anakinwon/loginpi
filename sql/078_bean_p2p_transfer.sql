-- DA-APPROVED: Bean P2P 전송(fn_bean_transfer) 신설 — 카페방 선물을 Pi 결제→Bean 전송으로 전환 (2026-06-21)
-- 배경:
--   기존 카페방 선물은 Pi 결제(window.Pi) 후 TIP_NOTI 알림만 남기고 실제 토큰 이전이 없었음.
--   이를 USER→USER Bean 실전송으로 교체. 보내는 사람 차감 + 받는 사람 적립을 원자적으로 수행.
--
-- 회계:
--   USER→USER 순수 이전 → 거버넌스(PLATFORM/REWARD_POOL/FOUNDATION) 무변동.
--   유통(ΣUSER) 총합 불변 → 대차대조표 항등식(발행=유통+회수) 그대로 유지.
--   txn_tp_cd='TRANSFER' (보낸 사람 음수 / 받은 사람 양수, 동일 유형 부호로 구분).
--
-- 주의: fn_bean_apply의 'TIP'(SPEND군 거버넌스 회수)과 다름 — P2P는 회수하지 않는다.

CREATE OR REPLACE FUNCTION public.fn_bean_transfer(
  p_from_usr  TEXT,
  p_to_usr    TEXT,
  p_bean_amt  BIGINT,            -- 양수 전송액
  p_ref_id    TEXT     DEFAULT NULL,   -- 연관 room_id 등
  p_memo      TEXT     DEFAULT NULL,
  p_regr_id   TEXT     DEFAULT 'SYSTEM',
  OUT out_from_bal BIGINT,        -- 보낸 사람 거래 후 잔액
  OUT out_to_bal   BIGINT         -- 받은 사람 거래 후 잔액
)
RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from     public.bean_token_wallet;
  v_to       public.bean_token_wallet;
  v_from_bal BIGINT;
  v_to_bal   BIGINT;
BEGIN
  IF p_bean_amt IS NULL OR p_bean_amt <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF p_from_usr = p_to_usr THEN
    RAISE EXCEPTION 'SELF_TRANSFER';
  END IF;

  -- 데드락 방지: 두 USER 지갑을 usr_id 정렬 순서로 미리 잠금(동시 양방향 전송 대비)
  PERFORM 1
    FROM public.bean_token_wallet
   WHERE wallet_type = 'USER' AND usr_id IN (p_from_usr, p_to_usr)
   ORDER BY usr_id
   FOR UPDATE;

  -- ① 보내는 사람 지갑 (없거나 잔액 부족 → 예외)
  SELECT * INTO v_from
    FROM public.bean_token_wallet
   WHERE usr_id = p_from_usr AND wallet_type = 'USER';
  IF NOT FOUND OR v_from.bean_amt < p_bean_amt THEN
    RAISE EXCEPTION 'INSUFFICIENT_BEAN';
  END IF;

  -- ② 받는 사람 지갑 (없으면 0 잔액 생성)
  SELECT * INTO v_to
    FROM public.bean_token_wallet
   WHERE usr_id = p_to_usr AND wallet_type = 'USER';
  IF NOT FOUND THEN
    INSERT INTO public.bean_token_wallet (wallet_type, usr_id, bean_amt, regr_id, modr_id)
    VALUES ('USER', p_to_usr, 0, p_regr_id, p_regr_id)
    RETURNING * INTO v_to;
  END IF;

  v_from_bal := v_from.bean_amt - p_bean_amt;
  v_to_bal   := v_to.bean_amt + p_bean_amt;

  -- ③ 차감 / 적립
  UPDATE public.bean_token_wallet
     SET bean_amt = v_from_bal, modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wlt_id = v_from.wlt_id;
  UPDATE public.bean_token_wallet
     SET bean_amt = v_to_bal, del_yn = 'N', del_dtm = NULL,
         modr_id = p_regr_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE wlt_id = v_to.wlt_id;

  -- ④ 원장 2건 (append-only) — 보낸 사람 음수 / 받은 사람 양수
  INSERT INTO public.bean_txn
    (usr_id, txn_tp_cd, bean_amt, bal_amt, ref_tp_cd, ref_id, memo_txt, regr_id, modr_id)
  VALUES
    (p_from_usr, 'TRANSFER', -p_bean_amt, v_from_bal, 'TIP', p_ref_id, p_memo, p_regr_id, p_regr_id),
    (p_to_usr,   'TRANSFER',  p_bean_amt, v_to_bal,   'TIP', p_ref_id, p_memo, p_regr_id, p_regr_id);

  out_from_bal := v_from_bal;
  out_to_bal   := v_to_bal;
END;
$$;

COMMENT ON FUNCTION public.fn_bean_transfer IS
  'Bean P2P 전송 — USER→USER 원자적 이전(거버넌스 무변동). 카페방 선물에 사용. 잔액부족=INSUFFICIENT_BEAN 예외';
