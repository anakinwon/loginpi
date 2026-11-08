-- DA-APPROVED: sys_user 최근 로그인 일시 컬럼 추가 — 사용자 관리 화면 표시용.
--               sys_user는 레거시 영문 컬럼명 체계(google_email 등)를 따르며, _dtm 도메인 약어 준수.
--
-- 변경 내용:
--   1. sys_user.last_login_dtm TIMESTAMPTZ 추가 (NULL 허용)
--      - Pi 로그인: upsertPiUser() upsert 시 갱신 (pi·pi-redirect·pi-code·link-start 전 경로)
--      - Google 로그인: NextAuth jwt 콜백에서 갱신
--      - 기존 사용자는 NULL 유지 (sys_user_actvty_log는 날짜 단위라 시각 백필 불가 — 부정확한 값 대신 미기록 표시)

ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS last_login_dtm TIMESTAMPTZ;

COMMENT ON COLUMN public.sys_user.last_login_dtm IS
  '최근 로그인 일시 — Pi(upsertPiUser)·Google(NextAuth jwt) 로그인 시각 갱신. 도입(2026-06-11) 이전 사용자는 NULL';
