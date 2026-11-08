-- PiVoice™ Phase 14: 음성통화 이력 + 품질 메트릭 테이블
-- DA-APPROVED: msg_call_log·msg_call_quality_stat — call/quality 외래어 약어 DA 승인. (2026-06-11)

CREATE TABLE IF NOT EXISTS public.msg_call_log (
  call_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES public.msg_room(room_id),
  caller_usr_id   UUID         NOT NULL,
  callee_usr_id   UUID         NOT NULL,
  call_st_cd      VARCHAR(10)  NOT NULL DEFAULT 'RINGING'
                  CHECK (call_st_cd IN ('RINGING','CONNECTED','ENDED','DECLINED','MISSED')),
  relay_yn        CHAR(1)      NOT NULL DEFAULT 'N' CHECK (relay_yn IN ('Y','N')),
  start_dtm       TIMESTAMPTZ,
  end_dtm         TIMESTAMPTZ,
  duration_sec    INTEGER,
  end_rsn_cd      VARCHAR(15)  CHECK (end_rsn_cd IN ('USER_ENDED','TIMEOUT','REJECTED','FAILED')),
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.msg_call_quality_stat (
  stat_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         UUID         NOT NULL REFERENCES public.msg_call_log(call_id),
  usr_id          UUID         NOT NULL,
  rtt_ms          INTEGER,
  packet_loss_pct DECIMAL(5,2),
  jitter_ms       DECIMAL(7,2),
  relay_yn        CHAR(1)      NOT NULL DEFAULT 'N' CHECK (relay_yn IN ('Y','N')),
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (call_id, usr_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_call_log_room   ON public.msg_call_log (room_id)        WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_msg_call_log_callee ON public.msg_call_log (callee_usr_id)  WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_msg_call_qual_call  ON public.msg_call_quality_stat (call_id) WHERE del_yn='N';
