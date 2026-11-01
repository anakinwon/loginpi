-- 001_dbms_auth_link.sql — 일반 브라우저 Google 로그인 ↔ Pi 계정 연동 (sitemap.pi sql/003 승계, dbms.pi Google 연동 예외 마스터 결정 2026-11-01 — PRD §4)
-- DA-APPROVED: 2026-11-01 da-governance-expert — seminar 001 동일 구조 dbms 적용 승인(본문 diff 0). 예외 : lnk_cd CHAR(6)(CHECK ^[0-9]{6}$ 로 패딩 불가, 형제 앱 정합 유지 — 3앱 VARCHAR(6) 일괄 정정은 §10 추적). Google 연동 예외는 마스터 2026-11-01(PRD §4), LOGIN_PLAYBOOK 예외 목록 등재 [확인중 : 마스터]
-- 선행 : packages/pi-db/sql/000_baseline.sql(sys_user · fn_grant_svc_only). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod (dbms.pi 전용 Supabase 프로젝트 public — 2026-10-29 전 환경 public 결정, --tier dev|stg 는 <app>_<tier> 스키마를 만들므로 쓰지 않음)
-- 설계 :
--  · sys_usr_auth_lnk — 사용자 외부인증 연동(현재 GOOGLE). 사용자당 제공자 1건, 제공자 식별자(sub) 활성 1건
--  · sys_auth_lnk_cd  — 연동 코드. Pi Browser(Pi 세션)가 숫자 6자리 발급(10분) → 일반 브라우저(Google 세션)가 입력 → 성립 시 use_dtm 기록
--  · Google 만으로 신규 계정 생성 금지(cafe.pi 규칙) — 연동 전 Google 세션은 usr_id 없음(앱 src/auth.ts)
--  · 물리 DELETE 금지 — 연동 해제·코드 폐기는 del_yn='Y'. 만료 코드 정리는 논리삭제 배치(후속)
BEGIN;

-- ------------------------------------------------------------
-- 1. sys_usr_auth_lnk — 사용자 외부인증 연동
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_usr_auth_lnk (
  lnk_id        UUID         NOT NULL DEFAULT gen_random_uuid(),           -- 연동ID
  usr_id        UUID         NOT NULL,                                     -- 사용자ID → sys_user.usr_id
  prvd_cd       VARCHAR(20)  NOT NULL,                                     -- 제공자코드: GOOGLE
  prvd_sub_txt  TEXT         NOT NULL,                                     -- 제공자 식별자(Google sub, 숫자 문자열)
  prvd_eml_txt  TEXT,                                                      -- 제공자 이메일(참고용 — 매칭 키 아님)
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',                         -- 삭제여부(연동 해제)
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 등록자ID
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 등록일시
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',                     -- 변경자ID
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,           -- 변경일시
  CONSTRAINT pk_sys_usr_auth_lnk PRIMARY KEY (lnk_id),
  CONSTRAINT sys_usr_auth_lnk_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT sys_usr_auth_lnk_prvd_cd_check CHECK (prvd_cd IN ('GOOGLE')),
  CONSTRAINT sys_usr_auth_lnk_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  sys_usr_auth_lnk IS '사용자 외부인증 연동 — Google 등 Pi 외 로그인 식별자와 sys_user 매핑(일반 브라우저 로그인용)';
COMMENT ON COLUMN sys_usr_auth_lnk.prvd_sub_txt IS '제공자 식별자 — Google OAuth sub(숫자 문자열). 이메일은 매칭 키로 쓰지 않는다(계정 탈취 방어)';

-- 제공자 식별자 활성 1건(타인 계정에 같은 Google 을 붙일 수 없음) / 사용자당 제공자 1건
CREATE UNIQUE INDEX IF NOT EXISTS x_sys_usr_auth_lnk_01
  ON sys_usr_auth_lnk (prvd_cd, prvd_sub_txt) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS x_sys_usr_auth_lnk_02
  ON sys_usr_auth_lnk (usr_id, prvd_cd) WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_sys_usr_auth_lnk_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sys_usr_auth_lnk_mod_dtm ON sys_usr_auth_lnk;
CREATE TRIGGER trg_sys_usr_auth_lnk_mod_dtm
  BEFORE UPDATE ON sys_usr_auth_lnk
  FOR EACH ROW EXECUTE FUNCTION fn_upd_sys_usr_auth_lnk_mod_dtm();

-- ------------------------------------------------------------
-- 2. sys_auth_lnk_cd — 연동 코드 (Pi 세션 발급 → Google 세션 사용)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_auth_lnk_cd (
  lnk_cd_id        UUID         NOT NULL DEFAULT gen_random_uuid(),        -- 연동코드ID
  lnk_cd           CHAR(6)      NOT NULL,                                  -- 연동코드(숫자 6자리)
  usr_id           UUID         NOT NULL,                                  -- 발급 사용자ID(Pi 세션) → sys_user.usr_id
  exp_dtm          TIMESTAMPTZ  NOT NULL,                                  -- 만료일시(발급 + 10분)
  use_dtm          TIMESTAMPTZ,                                            -- 사용일시(연동 성립)
  use_prvd_cd      VARCHAR(20),                                            -- 사용 제공자코드
  use_prvd_sub_txt TEXT,                                                   -- 사용 제공자 식별자
  del_yn           CHAR(1)      NOT NULL DEFAULT 'N',                      -- 삭제여부(폐기)
  del_dtm          TIMESTAMPTZ,                                            -- 삭제일시
  regr_id          TEXT         NOT NULL DEFAULT 'ADMIN',                  -- 등록자ID
  reg_dtm          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,        -- 등록일시
  modr_id          TEXT         NOT NULL DEFAULT 'ADMIN',                  -- 변경자ID
  mod_dtm          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,        -- 변경일시
  CONSTRAINT pk_sys_auth_lnk_cd PRIMARY KEY (lnk_cd_id),
  CONSTRAINT sys_auth_lnk_cd_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT sys_auth_lnk_cd_lnk_cd_check CHECK (lnk_cd ~ '^[0-9]{6}$'),
  CONSTRAINT sys_auth_lnk_cd_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE sys_auth_lnk_cd IS '연동 코드 — Pi Browser 로그인 사용자가 발급, 일반 브라우저 Google 세션이 10분 내 입력하면 sys_usr_auth_lnk 생성';

-- 미사용 활성 코드는 값 유일(사용·폐기된 코드는 재사용 가능). 만료 미사용 코드는 논리삭제 배치로 정리
CREATE UNIQUE INDEX IF NOT EXISTS x_sys_auth_lnk_cd_01
  ON sys_auth_lnk_cd (lnk_cd) WHERE del_yn = 'N' AND use_dtm IS NULL;
CREATE INDEX IF NOT EXISTS x_sys_auth_lnk_cd_02 ON sys_auth_lnk_cd (usr_id);

CREATE OR REPLACE FUNCTION fn_upd_sys_auth_lnk_cd_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sys_auth_lnk_cd_mod_dtm ON sys_auth_lnk_cd;
CREATE TRIGGER trg_sys_auth_lnk_cd_mod_dtm
  BEFORE UPDATE ON sys_auth_lnk_cd
  FOR EACH ROW EXECUTE FUNCTION fn_upd_sys_auth_lnk_cd_mod_dtm();

-- ------------------------------------------------------------
-- 3. 권한 — 서버 전용 service_role (anon·authenticated 회수)
-- ------------------------------------------------------------
SELECT fn_grant_svc_only('TABLE', 'sys_usr_auth_lnk');
SELECT fn_grant_svc_only('TABLE', 'sys_auth_lnk_cd');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT count(*) FROM sys_usr_auth_lnk;                                   → 0
-- INSERT INTO sys_auth_lnk_cd (lnk_cd, usr_id, exp_dtm) VALUES ('12345', '<usr_id>', now()); → 23514(6자리 CHECK)
