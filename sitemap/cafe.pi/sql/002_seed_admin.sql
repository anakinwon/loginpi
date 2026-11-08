-- 첫 번째 관리자 계정 설정
-- Pi 또는 Google로 한 번 로그인한 후 이 SQL을 실행하세요.
-- Supabase SQL Editor → 아래 중 해당하는 줄의 주석을 해제하고 실행

-- Pi 계정으로 ADMIN 설정 (pi_uid 값은 로그인 후 users 테이블에서 확인)
-- UPDATE users SET role = 'ADMIN' WHERE pi_uid = 'your-pi-uid-here';

-- Google 계정으로 ADMIN 설정
-- UPDATE users SET role = 'ADMIN' WHERE google_email = 'your@email.com';

-- 현재 users 테이블 전체 조회 (uid/email 확인용)
SELECT id, pi_uid, pi_username, google_email, role, created_at FROM users;
