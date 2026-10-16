-- 001_sys_base.sql : schema.pi 공통 기반 — 서비스 전용 권한 함수, 사용자(sys_user)
-- 적용 : 전용 Supabase 프로젝트, 번호 순서대로 1회 적용(재적용 가능 : IF NOT EXISTS·CREATE OR REPLACE)
-- 명명 : loginpi docs/da/데이터표준규칙.md(시스템 컬럼 4개·del_yn/del_dtm 논리 삭제·제약조건·트리거 명명) 준용, loginpi packages/pi-db/sql/000_baseline.sql 구조 참고(독립 DB 사본)
BEGIN;

-- 서버 전용 접근 : RLS 비활성 + anon·authenticated 권한 회수 + service_role 만 허용(서버 API 전용 패턴)
CREATE OR REPLACE FUNCTION fn_grant_svc_only(p_kind TEXT, p_obj TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  IF p_kind NOT IN ('TABLE', 'FUNCTION') THEN
    RAISE EXCEPTION 'fn_grant_svc_only: 지원하지 않는 p_kind %', p_kind;
  END IF;
  IF p_kind = 'TABLE' THEN
    EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', p_obj);
  END IF;
  EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC', p_kind, p_obj);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON %s %s FROM %I', p_kind, p_obj, r.rolname);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE format('GRANT ALL ON %s %s TO service_role', p_kind, p_obj);
  END IF;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_grant_svc_only(text, text)');

-- 사용자 : Pi 계정 1인 1행(가입은 Pi 계정 필수, Google 은 연동만 : LOGIN_PLAYBOOK R6)
CREATE TABLE IF NOT EXISTS sys_user (
  usr_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 사용자ID
  pi_uid            TEXT,                                                  -- Pi 앱별 scoped uid
  pi_usr_nm         TEXT,                                                  -- Pi 사용자명(불변 키)
  dsp_nm            TEXT         NOT NULL DEFAULT '',                      -- 표시명
  role_cd           VARCHAR(20)  NOT NULL DEFAULT 'USER',                  -- 사이트 권한코드 : ADMIN / USER
  lst_lgn_dtm       TIMESTAMPTZ,                                           -- 최종로그인일시
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT sys_user_pkey PRIMARY KEY (usr_id),
  CONSTRAINT sys_user_role_cd_check CHECK (role_cd IN ('ADMIN', 'USER')),
  CONSTRAINT sys_user_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);

COMMENT ON TABLE  sys_user           IS '사용자 — Pi 계정 1인 1행. 물리 DELETE 금지';
COMMENT ON COLUMN sys_user.pi_uid    IS 'Pi uid — 앱·네트워크 scoped. 영구 식별자로 쓰지 않음';
COMMENT ON COLUMN sys_user.pi_usr_nm IS 'Pi 사용자명 — 사람의 불변 키. 활성 행 UNIQUE';
COMMENT ON COLUMN sys_user.role_cd   IS '사이트 권한 — 분류체계별 역할은 std_area_mbr.mbr_role_cd';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sys_user_pi_usr_nm_actv
  ON sys_user (pi_usr_nm)
  WHERE del_yn = 'N' AND pi_usr_nm IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_upd_sys_user_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_sys_user_mod_dtm
  BEFORE UPDATE ON sys_user
  FOR EACH ROW EXECUTE FUNCTION fn_upd_sys_user_mod_dtm();

SELECT fn_grant_svc_only('TABLE', 'sys_user');

COMMIT;
