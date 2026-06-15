-- sql/048_evt_pi_reward.sql
-- DA-APPROVED: evt_pi_reward_log — evt_ 이벤트 주제영역 기존 승인(044, 2026-06-14) 연장 적용.
--              fail_reason_tx · reward_pi_memo — _tx 패턴(044에서 metadata_tx 등 인정) 동일 적용 (2026-06-16)

BEGIN;

-- ============================================================================
-- evt_event: Pi 자동 보상 설정 컬럼 추가
-- ============================================================================
ALTER TABLE evt_event
  ADD COLUMN IF NOT EXISTS reward_pi_yn           CHAR(1)          NOT NULL DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS reward_pi_amt          NUMERIC(18,7)    NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS reward_pi_memo         VARCHAR(200)     NOT NULL DEFAULT '이벤트 미션 완료 보상 (1 Pi)',
  ADD COLUMN IF NOT EXISTS reward_mission_count_no INT             NOT NULL DEFAULT 10;

-- ============================================================================
-- evt_pi_reward_log: 이벤트 Pi 보상 지급 이력
-- PENDING → PAID(성공) / FAILED(실패, 재시도 대상)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_pi_reward_log (
  evt_pi_reward_log_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              VARCHAR(30)   NOT NULL REFERENCES evt_event(event_id),
  user_id               UUID          NOT NULL REFERENCES sys_user(id),
  pi_uid                VARCHAR(100)  NOT NULL,
  reward_amt            NUMERIC(18,7) NOT NULL,
  payment_id            VARCHAR(100),
  reward_st_cd          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  paid_dtm              TIMESTAMPTZ,
  fail_reason_tx        TEXT,
  regr_id               TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id               TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn                CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm               TIMESTAMPTZ,
  CONSTRAINT evt_pi_reward_log_event_user_uq UNIQUE (event_id, user_id)
);

COMMENT ON COLUMN evt_pi_reward_log.reward_st_cd IS 'PENDING | PAID | FAILED';

CREATE INDEX IF NOT EXISTS idx_evt_pi_reward_log_event_st
  ON evt_pi_reward_log(event_id, reward_st_cd);

CREATE INDEX IF NOT EXISTS idx_evt_pi_reward_log_user
  ON evt_pi_reward_log(user_id);

-- ============================================================================
-- 현재 이벤트(evt-20260614-001)에 Pi 보상 활성화
-- ============================================================================
UPDATE evt_event
   SET reward_pi_yn            = 'Y',
       reward_pi_amt           = 1.0,
       reward_pi_memo          = '「Pi 요원 육성」10개 미션 완료 보상 (1 Pi)',
       reward_mission_count_no = 10,
       modr_id                 = 'ADMIN',
       mod_dtm                 = CURRENT_TIMESTAMP
 WHERE event_id = 'evt-20260614-001';

COMMIT;
