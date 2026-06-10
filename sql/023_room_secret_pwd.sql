-- DA-APPROVED: 비밀방 입장 비밀번호 — PWD(외래어 약어, 표준사전 미등재) DA 승인. 평문이 아닌 scrypt 해시만 저장.
-- TASK: 채팅방 수정 — 공개/비밀 전환 + 비밀방 비밀번호 설정

-- 비밀방(is_public_yn='N') 입장 비밀번호 해시. NULL = 비밀번호 없음(초대/생성자만).
ALTER TABLE public.msg_room
  ADD COLUMN IF NOT EXISTS join_pwd_hash TEXT;
