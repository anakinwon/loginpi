-- P1 #1-3: 시스템 테이블명 도메인 접두사 추가
-- users → sys_user, payments → pi_pymnt, link_codes → auth_link_cd

BEGIN;

-- ===== 1. users → sys_user =====
ALTER TABLE public.users RENAME TO sys_user;
ALTER TABLE public.sys_user RENAME CONSTRAINT users_pkey        TO sys_user_pkey;
ALTER TABLE public.sys_user RENAME CONSTRAINT users_pi_uid_key   TO sys_user_pi_uid_key;
ALTER TABLE public.sys_user RENAME CONSTRAINT users_google_id_key TO sys_user_google_id_key;
ALTER POLICY "service_role_all"   ON public.sys_user RENAME TO "sys_user_service_role_all";
ALTER POLICY "authenticated_read" ON public.sys_user RENAME TO "sys_user_authenticated_read";

-- ===== 2. payments → pi_pymnt =====
-- FK 이름 변경은 child 테이블 기준이므로 rename 전에 수행
ALTER TABLE public.payments RENAME CONSTRAINT payments_user_id_fkey    TO pi_pymnt_sys_user_id_fkey;
ALTER TABLE public.payments RENAME CONSTRAINT payments_pkey             TO pi_pymnt_pkey;
ALTER TABLE public.payments RENAME CONSTRAINT payments_payment_id_key  TO pi_pymnt_payment_id_key;
ALTER TABLE public.payments RENAME TO pi_pymnt;

-- ===== 3. link_codes → auth_link_cd =====
ALTER TABLE public.link_codes RENAME CONSTRAINT link_codes_pi_user_id_fkey TO auth_link_cd_sys_user_id_fkey;
ALTER TABLE public.link_codes RENAME CONSTRAINT link_codes_pkey             TO auth_link_cd_pkey;
ALTER TABLE public.link_codes RENAME TO auth_link_cd;

COMMIT;
