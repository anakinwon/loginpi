-- 127_sys_user_del_yn.sql
-- sys_user 논리삭제 컬럼 추가 (DA 표준: del_yn CHAR(1) DEFAULT 'N' + del_dtm TIMESTAMPTZ)
--
-- 목적: 관리자가 "앞으로 절대 사용하지 않는 계정"을 del_yn='Y'로 표시.
--   del_yn='Y' 계정은 인증(getSessionUser)·단건 조회·jwt 로그인에서 일괄 차단되어
--   모든 화면에서 동일하게 비활성 처리된다. 물리 DELETE는 DA 표준상 금지.
--
-- 적용: 2026-06-26

ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS del_yn CHAR(1) NOT NULL DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS del_dtm TIMESTAMPTZ;

-- 활성 계정(del_yn='N') 조회가 인증·목록 전반에서 빈번하므로 부분 인덱스로 가속
CREATE INDEX IF NOT EXISTS idx_sys_user_active
  ON sys_user (id)
  WHERE del_yn = 'N';
