-- 003_sitemap_auth_link.sql — 일반 브라우저 Google 로그인 ↔ Pi 계정 연동 (마스터 지시 2026-10-11, cafe.pi 방식 승계)
-- DA-APPROVED: 마스터 지시 2026-10-11 — Google 로그인 통합(PRD_28 §1.1-2 예외는 마스터 결정). sys_user baseline 무변경, 신규 2테이블(sys_ 접두). DA 사후 리뷰 대상 (2026-10-11)
-- 선행 : packages/pi-db/sql/000_baseline.sql → 001 → 002. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
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
  CONSTRAINT sys_usr_auth_lnk_pkey PRIMARY KEY (lnk_id),
  CONSTRAINT sys_usr_auth_lnk_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT sys_usr_auth_lnk_prvd_cd_check CHECK (prvd_cd IN ('GOOGLE')),
  CONSTRAINT sys_usr_auth_lnk_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  sys_usr_auth_lnk IS '사용자 외부인증 연동 — Google 등 Pi 외 로그인 식별자와 sys_user 매핑(일반 브라우저 로그인용)';
COMMENT ON COLUMN sys_usr_auth_lnk.prvd_sub_txt IS '제공자 식별자 — Google OAuth sub(숫자 문자열). 이메일은 매칭 키로 쓰지 않는다(계정 탈취 방어)';

-- 제공자 식별자 활성 1건(타인 계정에 같은 Google 을 붙일 수 없음) / 사용자당 제공자 1건
CREATE UNIQUE INDEX IF NOT EXISTS ux_sys_usr_auth_lnk_prvd_actv
  ON sys_usr_auth_lnk (prvd_cd, prvd_sub_txt) WHERE del_yn = 'N';
CREATE UNIQUE INDEX IF NOT EXISTS ux_sys_usr_auth_lnk_usr_prvd_actv
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
  CONSTRAINT sys_auth_lnk_cd_pkey PRIMARY KEY (lnk_cd_id),
  CONSTRAINT sys_auth_lnk_cd_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT sys_auth_lnk_cd_lnk_cd_check CHECK (lnk_cd ~ '^[0-9]{6}$'),
  CONSTRAINT sys_auth_lnk_cd_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE sys_auth_lnk_cd IS '연동 코드 — Pi Browser 로그인 사용자가 발급, 일반 브라우저 Google 세션이 10분 내 입력하면 sys_usr_auth_lnk 생성';

-- 미사용 활성 코드는 값 유일(사용·폐기된 코드는 재사용 가능). 만료 미사용 코드는 논리삭제 배치로 정리
CREATE UNIQUE INDEX IF NOT EXISTS ux_sys_auth_lnk_cd_lnk_cd_actv
  ON sys_auth_lnk_cd (lnk_cd) WHERE del_yn = 'N' AND use_dtm IS NULL;
CREATE INDEX IF NOT EXISTS idx_sys_auth_lnk_cd_usr_id ON sys_auth_lnk_cd (usr_id);

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
