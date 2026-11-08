-- DA-APPROVED: 후기 보상 Pi A2U 송금 멱등 로그 (PRD_24 §0, 2026-06-29)
--   PI 모드에서 후기 보상은 Bean 지급 대신 Pi A2U(App-to-User)로 송금한다.
--   fn_fbck_reward_apply가 보증금을 차감하고 bean_txn(FBCK_PI)에 대기 기록을 남기면,
--   이 로그가 실제 A2U 송금 상태(PENDING/PAID/FAILED)를 멱등하게 추적한다.
--   멱등 키: UNIQUE(fbck_id) — 후기 1건당 정확히 1회만 지급(중복 송금 차단).
--   처리: feedback POST의 after() 즉시 시도 + cron(/api/cron/fbck-pi-payout) 재시도.
-- DA 표준: 시스템4 + del_yn. FK 무설계 관례(fbck_id·usr_id 참조 컬럼만).

CREATE TABLE IF NOT EXISTS public.fbck_pi_reward_log (
  fbck_pi_log_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  fbck_id        TEXT         NOT NULL,                  -- 후기(fbck_mst) 식별자
  usr_id         TEXT         NOT NULL,                  -- 보상 수령자(후기 작성자)
  pi_uid         TEXT,                                   -- Pi Network UID(송금 시점 스냅샷)
  pi_amt         NUMERIC(18,7) NOT NULL CHECK (pi_amt > 0),  -- 송금액(Pi, Bean÷100)
  payment_id     TEXT,                                   -- Pi A2U 결제 식별자(완료 시)
  reward_st_cd   VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                 CHECK (reward_st_cd IN ('PENDING','PAID','FAILED')),
  fail_reason_tx TEXT,                                   -- 실패 사유(재시도 진단)
  paid_dtm       TIMESTAMPTZ,                            -- 송금 완료 시각
  del_yn         CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_fbck_pi_reward_fbck UNIQUE (fbck_id)     -- 후기 1건당 1회 지급(멱등)
);

COMMENT ON TABLE  public.fbck_pi_reward_log              IS '후기 보상 Pi A2U 송금 멱등 로그 — PI 모드 후기보상 실송금 추적. PRD_24 §0';
COMMENT ON COLUMN public.fbck_pi_reward_log.fbck_id      IS '후기(fbck_mst) 식별자 — 멱등 키';
COMMENT ON COLUMN public.fbck_pi_reward_log.pi_amt       IS '송금액(Pi) = 보상 Bean ÷ 100 (1π=100 Bean)';
COMMENT ON COLUMN public.fbck_pi_reward_log.reward_st_cd IS 'PENDING(대기)·PAID(완료)·FAILED(실패, cron 재시도)';

-- 미송금(PENDING/FAILED) 대기분 cron 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_fbck_pi_reward_pending
  ON public.fbck_pi_reward_log(reward_st_cd)
  WHERE del_yn = 'N' AND reward_st_cd IN ('PENDING','FAILED');

-- 검증:
--   SELECT reward_st_cd, count(*) FROM public.fbck_pi_reward_log WHERE del_yn='N' GROUP BY reward_st_cd;
