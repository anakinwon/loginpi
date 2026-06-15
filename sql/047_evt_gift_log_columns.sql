-- DA-APPROVED: gift_nm(_nm=TEXT), sent_yn(_yn=CHAR(1)), sent_dtm(_dtm=TIMESTAMPTZ) — 기존 gift_send_status_cd와 병존, 빠른 발송 상태 토글용
ALTER TABLE evt_gift_log
  ADD COLUMN IF NOT EXISTS gift_nm TEXT,
  ADD COLUMN IF NOT EXISTS sent_yn  CHAR(1)      NOT NULL DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS sent_dtm TIMESTAMPTZ;

-- upsert를 위한 (event_id, user_id) unique constraint
ALTER TABLE evt_gift_log
  ADD CONSTRAINT evt_gift_log_event_user_uq UNIQUE (event_id, user_id);
