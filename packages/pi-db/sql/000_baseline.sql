-- ============================================================
-- 000_baseline.sql — @pi/db 전 사이트 공통 baseline (PRD_28 §4·§5)
-- 적용 : scripts/db-migrate.mjs --app <site> --tier <dev|stg|prod> 가 사이트 SQL보다 먼저 실행
--        (운영 = 사이트 전용 Supabase public / 개발·스테이징 = pi-nonprod 의 <site>_dev·<site>_stg 스키마)
-- 정본 : docs/da/데이터표준규칙.md  ·  DA 검토 : da-governance-expert 2026-10-09
-- ============================================================
--
-- [DA 판정 요약]
-- 1. 스키마 비의존 : 모든 오브젝트를 스키마 접두 없이 생성 — 대상 스키마는 실행 세션의 search_path
--    (마이그레이션 스크립트가 SET search_path TO <site>_<tier> 후 실행). public. 하드코딩 금지.
-- 2. 접근 통제 : RLS 비활성 + 서버 전용 service_role 키만 접근 (cafe.pi 패턴 승계).
--    RLS를 끄는 대신 anon·authenticated 권한을 테이블·함수 단위로 회수한다(fn_grant_svc_only).
--    anon 키가 클라이언트에 노출돼도 PostgREST 로 읽기·쓰기 불가 — 방어 심층화.
-- 3. sys_user 컬럼명 = 정본 v2.4 §1-3(단일 단어 금지)·마스터 확정 개명 7건 반영(2026-10-10,
--    sitemap 데이터 모델 §10-1·§10-2) : id→usr_id · role→role_cd(VARCHAR(20)) · pi_username→pi_usr_nm ·
--    pi_wallet_address→pi_wlt_adr_txt · display_name→dsp_nm · last_login_dtm→lst_lgn_dtm · rejoin_dtm→rjn_dtm.
--    세션·API 필드명(userId·role·username·displayName, UserRow 필드)은 불변 — DB 컬럼 ↔ TS 필드 매핑은
--    @pi/db users.ts 한 곳에서만 처리. cafe.pi 자체 DB(id·role·pi_username 등)는 범위 밖(정본 §10 잔여 위반).
--    ⚠ cafe 가 @pi/db 로 옮겨 오려면 cafe DB 도 같은 개명을 선행해야 한다.
-- 4. sys_user 는 Pi 전용 최소 컬럼 : Google(NextAuth)·LBS 동의·실명·연락처·카카오 등 cafe 전용 컬럼 제외.
--    ⚠ @pi/db 로 upsertPiUser 이관 시 재가입 부활 분기의 lbs_consent_* 갱신·sys_user_consent 논리삭제를 제거할 것.
-- 5. pi_pymnt 제외 (PRD_28 §4 목록과의 차이 — 의도적) :
--    첫 소비 사이트 sitemap.pi 의 Phase 1(무료 MVP)은 결제가 없고, cafe 의 pi_pymnt 는 amount·status 등
--    표준 미준수 컬럼을 가진 채 @pi/payments 코어 계약(metadata.type 레지스트리·멱등 상태)이 아직 미확정이다.
--    소비자 없이 스키마를 먼저 굳히면 코어 확정 때 이행 비용만 생긴다.
--    → @pi/payments 코어 확정 시 packages/pi-db/sql/010_pi_pymnt.sql 로 별도 추가(sitemap Phase 2 착수 조건).
-- 6. 물리 DELETE 금지 — 탈퇴·차단은 del_yn='Y' + del_dtm + del_rsn_cd, 재가입은 행 부활(rjn_dtm).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) 공용 함수 — 서버 전용 권한 설정 (RLS 비활성 + anon/authenticated 회수 + service_role 부여)
--    p_kind : 'TABLE' | 'FUNCTION'   p_obj : 테이블명 또는 '함수명(인자타입,...)'
--    Supabase 역할이 없는 일반 PostgreSQL(로컬 검증)에서도 오류 없이 동작하도록 역할 존재를 확인한다.
-- ------------------------------------------------------------
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

-- 개발·스테이징 스키마(<site>_dev 등)는 Supabase 기본 권한이 없으므로 현재 스키마 USAGE 를 부여한다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', current_schema());
  END IF;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_grant_svc_only(text, text)');

-- ------------------------------------------------------------
-- 0-1) pg_trgm — 텍스트 부분일치 검색 표준(CLAUDE.md). 확장은 데이터베이스 단위 1회 설치.
--      Supabase 는 extensions 스키마에 설치, 없으면(일반 PostgreSQL) 현재 스키마.
--      사이트 SQL 은 opclass 스키마를 pg_extension 에서 조회해 쓰므로 설치 위치에 의존하지 않는다.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
    ELSE
      CREATE EXTENSION pg_trgm;
    END IF;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1) sys_user — Pi 사용자 (사이트마다 별도 DB, 사이트 안에서 1인 1행)
--    pi_uid    : (Pi 포털 앱 × Testnet/Mainnet) scoped 값 → 영구 식별자 아님. upsert 충돌 키로만 사용
--    pi_usr_nm : 사람의 불변 키 — 활성 행 부분 UNIQUE(ux_sys_user_pi_usr_nm_actv)로 DB 강제
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_user (
  usr_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- 사용자ID
  pi_uid            TEXT,                                                  -- Pi 앱별 scoped uid
  pi_usr_nm         TEXT,                                                  -- Pi 사용자명 (불변 키)
  pi_wlt_adr_txt    TEXT,                                                  -- Pi 지갑 주소 (A2U 지급 대비)
  dsp_nm            TEXT         NOT NULL DEFAULT '',                      -- 표시명 (기본 = pi_usr_nm)
  role_cd           VARCHAR(20)  NOT NULL DEFAULT 'USER',                  -- 권한코드: ADMIN(최상위) / USER
  lst_lgn_dtm       TIMESTAMPTZ,                                           -- 최종로그인일시
  rjn_dtm           TIMESTAMPTZ,                                           -- 재가입일시 (이전 활동 숨김 컷오프)
  del_rsn_cd        VARCHAR(20),                                           -- 삭제사유코드
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT sys_user_pkey PRIMARY KEY (usr_id),
  -- 전체 UNIQUE(부분 아님) — upsertPiUser 의 upsert(onConflict: 'pi_uid') 추론 대상
  CONSTRAINT sys_user_pi_uid_key UNIQUE (pi_uid),
  -- MASTER 행은 존재하지 않는다(2026-07-16 확정). isMaster() 는 ADMIN 을 최상위로 판정
  CONSTRAINT sys_user_role_cd_check CHECK (role_cd IN ('ADMIN', 'USER')),
  -- WDRW 자진탈퇴(부활 가능) · SYS_DUP uid 재발급 중복정리(부활 가능) · ADMIN_BLCK 관리자 차단(부활 불가)
  CONSTRAINT sys_user_del_rsn_cd_check CHECK (del_rsn_cd IS NULL OR del_rsn_cd IN ('WDRW', 'SYS_DUP', 'ADMIN_BLCK')),
  CONSTRAINT sys_user_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);

COMMENT ON TABLE  sys_user             IS 'Pi 사용자 — @pi/db baseline. 사이트별 DB에 1행/인. 물리 DELETE 금지';
COMMENT ON COLUMN sys_user.pi_uid      IS 'Pi uid — 포털 앱×네트워크 scoped(사이트마다·sandbox 전환 시 재발급). 영구 식별자로 쓰지 말 것';
COMMENT ON COLUMN sys_user.pi_usr_nm   IS 'Pi 사용자명 — 사람의 불변 키. 활성 행(del_yn=N) UNIQUE';
COMMENT ON COLUMN sys_user.role_cd     IS 'ADMIN(최상위, env 시드) / USER. role_cd 문자열 단독 비교 대신 isAdmin()·isMaster() 사용';
COMMENT ON COLUMN sys_user.rjn_dtm     IS '재가입(행 부활) 일시 — 이 시각 이전 활동 기록은 화면에 노출하지 않음';
COMMENT ON COLUMN sys_user.del_rsn_cd  IS '삭제사유: WDRW·SYS_DUP(부활 가능) / ADMIN_BLCK·NULL(부활 불가)';

-- 활성 pi_usr_nm 유일성 (cafe sql/162 의 pi_username 규칙과 같은 의미 — 위반 에러 시 인덱스가 아니라 코드를 고칠 것)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sys_user_pi_usr_nm_actv
  ON sys_user (pi_usr_nm)
  WHERE del_yn = 'N' AND pi_usr_nm IS NOT NULL;

-- mod_dtm 자동 갱신 (정본 §6)
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

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT current_schema();
-- SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'sys_user';
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'sys_user'::regclass;          -- f 이어야 정상
-- SELECT has_table_privilege('anon', 'sys_user', 'SELECT');                       -- f 이어야 정상 (Supabase)
-- SELECT pi_usr_nm, COUNT(*) FROM sys_user WHERE del_yn = 'N' AND pi_usr_nm IS NOT NULL
--   GROUP BY pi_usr_nm HAVING COUNT(*) > 1;                                      -- 0행이어야 정상
