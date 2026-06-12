-- PiVoice™ v3.0: 보이스챗 권한 정책 — 승인 상태 머신 (PRD_9_VOICE_CHAT v3.0 R1~R7)
-- DA-APPROVED: mic_st_cd 상태 코드 신설 — 방장 보장 슬롯 + 멤버 자동 2/승인 2. (2026-06-12)

-- mic_st_cd: CONNECTED(송출 가능) | PENDING(방장 승인 대기) | LISTEN_ONLY(청취 전용)
-- mic_yn은 하위 호환 유지 — 항상 (mic_st_cd = 'CONNECTED')와 동기화 (서버에서 함께 갱신)
ALTER TABLE public.msg_call_participant
  ADD COLUMN IF NOT EXISTS mic_st_cd VARCHAR(12) NOT NULL DEFAULT 'CONNECTED'
  CHECK (mic_st_cd IN ('CONNECTED','PENDING','LISTEN_ONLY'));

-- 기존 활성 데이터 동기화: mic_yn='N'이었던 참여자는 청취 전용으로 정렬
UPDATE public.msg_call_participant
SET mic_st_cd = 'LISTEN_ONLY'
WHERE mic_yn = 'N' AND mic_st_cd = 'CONNECTED';

COMMENT ON COLUMN public.msg_call_participant.mic_st_cd IS
  'v3.0 권한 상태: CONNECTED(송출) | PENDING(방장 승인 대기) | LISTEN_ONLY(청취 전용 — 미승인·거절·회수)';
