-- PiVoice™ v2.0: 1:1 통화 → N:N 다:다 음성채널 전환 (PRD_9_VOICE_CHAT v2.0)
-- DA-APPROVED: msg_call_participant 신규 — participant 외래어 약어 DA 승인. caller/callee 컬럼 제거(N:N 구조 전환). (2026-06-12)

-- ── msg_call_log: 1:1 caller/callee 구조 제거 → room 레벨 통화 세션 메타만 유지 ──
ALTER TABLE public.msg_call_log DROP COLUMN IF EXISTS caller_usr_id;
ALTER TABLE public.msg_call_log DROP COLUMN IF EXISTS callee_usr_id;
ALTER TABLE public.msg_call_log DROP COLUMN IF EXISTS call_st_cd;
ALTER TABLE public.msg_call_log DROP COLUMN IF EXISTS relay_yn;
DROP INDEX IF EXISTS idx_msg_call_log_callee;

ALTER TABLE public.msg_call_log DROP CONSTRAINT IF EXISTS msg_call_log_end_rsn_cd_check;
ALTER TABLE public.msg_call_log
  ADD CONSTRAINT msg_call_log_end_rsn_cd_check
  CHECK (end_rsn_cd IN ('ALL_LEFT','TIMEOUT','FAILED'));

-- ── msg_call_participant 신규: 음성채널 참여자 추적 (1~4명 마이크, 청취 전용 포함) ──
CREATE TABLE IF NOT EXISTS public.msg_call_participant (
  participant_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES public.msg_room(room_id),
  usr_id          UUID         NOT NULL REFERENCES public.sys_user(id),
  mic_yn          CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (mic_yn IN ('Y','N')),
                  -- 'Y': 마이크 활성(동시 최대 4명) | 'N': 청취 전용(5명째 이후) 또는 방장 강제 mute
  join_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leave_dtm       TIMESTAMPTZ,
  duration_sec    INTEGER,
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 같은 방에 동일 사용자의 활성(미퇴장) 참여 1건만 허용
CREATE UNIQUE INDEX IF NOT EXISTS uq_msg_call_participant_active
  ON public.msg_call_participant (room_id, usr_id)
  WHERE leave_dtm IS NULL AND del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_msg_call_participant_room
  ON public.msg_call_participant (room_id)
  WHERE del_yn = 'N';

-- ── msg_call_quality_stat: call 세션 단위 → room 단위로 전환 (참여자별 최종 측정 upsert) ──
ALTER TABLE public.msg_call_quality_stat
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.msg_room(room_id);
ALTER TABLE public.msg_call_quality_stat ALTER COLUMN call_id DROP NOT NULL;

-- PostgREST upsert(on_conflict) 대상 — 부분 인덱스가 아닌 일반 UNIQUE 제약 필요
ALTER TABLE public.msg_call_quality_stat DROP CONSTRAINT IF EXISTS uq_msg_call_qual_room_usr;
ALTER TABLE public.msg_call_quality_stat
  ADD CONSTRAINT uq_msg_call_qual_room_usr UNIQUE (room_id, usr_id);

CREATE INDEX IF NOT EXISTS idx_msg_call_qual_room
  ON public.msg_call_quality_stat (room_id)
  WHERE del_yn = 'N';

-- RLS 활성화 — 프로젝트 표준: anon 차단, 서버 service role만 접근 (정책 없음)
ALTER TABLE public.msg_call_participant ENABLE ROW LEVEL SECURITY;
