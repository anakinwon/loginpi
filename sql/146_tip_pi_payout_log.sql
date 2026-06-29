-- DA-APPROVED: 카페방 Pi 선물(P2P) A2U 송금 멱등 로그 (PRD_24 §0, 2026-06-29)
--   Pi는 U2U(사용자↔사용자) 직접 송금 불가 → 앱 경유: 보내는 사람 U2A 결제(앱 수령) →
--   앱이 받는 사람에게 A2U 송금. 이 로그가 A2U 송금 상태(PENDING/PAID/FAILED)를 멱등 추적.
--   멱등 키: UNIQUE(payment_id) — A의 U2A 결제 1건당 정확히 1회 A2U(중복 송금 차단).
--   처리: complete의 after() 즉시 시도 + cron(/api/cron/tip-pi-payout) 재시도(누락 0 보장).
-- DA 표준: 시스템4 + del_yn. FK 무설계 관례(참조 컬럼만).

CREATE TABLE IF NOT EXISTS public.tip_pi_payout_log (
  tip_pi_log_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        TEXT         NOT NULL,                 -- 보내는 사람 U2A 결제 식별자(멱등 키)
  sender_id         TEXT         NOT NULL,                 -- 선물 보낸 사람
  recipient_id      TEXT         NOT NULL,                 -- 받는 사람(A2U 수령)
  recipient_pi_uid  TEXT,                                  -- 받는 사람 Pi UID(송금 시점 스냅샷)
  pi_amt            NUMERIC(18,7) NOT NULL CHECK (pi_amt > 0),  -- 송금액(Pi)
  room_id           TEXT,                                  -- 선물한 카페방(알림용)
  payout_payment_id TEXT,                                  -- A2U 송금 식별자(완료 시)
  reward_st_cd      VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                    CHECK (reward_st_cd IN ('PENDING','PAID','FAILED')),
  fail_reason_tx    TEXT,
  paid_dtm          TIMESTAMPTZ,
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm           TIMESTAMPTZ,
  regr_id           TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id           TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tip_pi_payout_pay UNIQUE (payment_id)
);

COMMENT ON TABLE  public.tip_pi_payout_log         IS '카페방 Pi 선물(P2P) A2U 송금 멱등 로그 — 앱 경유 U2A→A2U. PRD_24 §0';
COMMENT ON COLUMN public.tip_pi_payout_log.payment_id IS '보내는 사람 U2A 결제 식별자 — 멱등 키';
COMMENT ON COLUMN public.tip_pi_payout_log.pi_amt  IS '선물 송금액(Pi)';

CREATE INDEX IF NOT EXISTS idx_tip_pi_payout_pending
  ON public.tip_pi_payout_log(reward_st_cd)
  WHERE del_yn = 'N' AND reward_st_cd IN ('PENDING','FAILED');
