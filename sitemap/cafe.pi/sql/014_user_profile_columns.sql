-- DA-APPROVED: sys_user 프로필 컬럼 5개 추가 (Phase 10 마이페이지)
ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS real_nm  TEXT,
  ADD COLUMN IF NOT EXISTS nick_nm  TEXT,
  ADD COLUMN IF NOT EXISTS phone_no TEXT,
  ADD COLUMN IF NOT EXISTS addr     TEXT,
  ADD COLUMN IF NOT EXISTS addr_dtl TEXT;

COMMENT ON COLUMN sys_user.real_nm  IS '실명';
COMMENT ON COLUMN sys_user.nick_nm  IS '닉네임';
COMMENT ON COLUMN sys_user.phone_no IS '연락처';
COMMENT ON COLUMN sys_user.addr     IS '주소';
COMMENT ON COLUMN sys_user.addr_dtl IS '상세주소';
