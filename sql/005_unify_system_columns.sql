-- P2 #7-10: 시스템 컬럼 suffix 한국 DA 표준(reg_dtm/mod_dtm)으로 통일
-- sys_user: created_at → reg_dtm, updated_at → mod_dtm
-- pi_pymnt: created_at → reg_dtm, updated_at → mod_dtm
-- auth_link_cd: reg_dtm 신규 추가 (기존 created_at 없음)
-- 트리거 함수명 표준화

BEGIN;

-- ===== 1. sys_user 컬럼명 변경 =====
ALTER TABLE public.sys_user RENAME COLUMN created_at TO reg_dtm;
ALTER TABLE public.sys_user RENAME COLUMN updated_at TO mod_dtm;

-- 기존 트리거/함수 교체 (fn_update_users_updated_at → fn_upd_sys_user_mod_dtm)
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.sys_user;
DROP FUNCTION IF EXISTS fn_update_users_updated_at();

CREATE OR REPLACE FUNCTION fn_upd_sys_user_mod_dtm()
RETURNS TRIGGER AS $$
BEGIN
  NEW.mod_dtm = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_user_mod_dtm
  BEFORE UPDATE ON public.sys_user
  FOR EACH ROW EXECUTE FUNCTION fn_upd_sys_user_mod_dtm();

-- ===== 2. pi_pymnt 컬럼명 변경 =====
ALTER TABLE public.pi_pymnt RENAME COLUMN created_at TO reg_dtm;
ALTER TABLE public.pi_pymnt RENAME COLUMN updated_at TO mod_dtm;

-- ===== 3. auth_link_cd: reg_dtm 신규 추가 (기존 created_at 없음) =====
ALTER TABLE public.auth_link_cd
  ADD COLUMN reg_dtm TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
