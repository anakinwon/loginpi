-- DA-APPROVED: 접두사 'site_' 는 sitemap.pi 001_sitemap_phase1.sql 의 DA-APPROVED(da-governance-expert, 2026-10-09)를 승계한다 — 신규 site_sts_hist·site_img 는 같은 .pi 사이트 디렉터리 주제영역. 그 외 신규 접두사 없음(usr_·fee_·promo_·sys_ 는 정본 §2-1 등재). 표준사전 01_standards_dictionary.md 01 r3(leader r4 APPROVED) 준수 (2026-10-10)
-- ============================================================
-- 02_modeler_ddl.sql — sitemap.pi 1차 데이터 모델 DDL 초안 (001 대비 델타)
-- ⛔ 초안 — 운영 적용 금지, 마스터 승인 후 sql/ 확정
--    확정 시 분리 : Part A → sitemap/sitemap.pi/sql/002_sitemap_phase1_delta.sql
--                   Part B → sitemap/sitemap.pi/sql/003_sitemap_phase2.sql (Phase 2 착수 + @pi/db 010_pi_pymnt.sql 적용 후)
-- 선행 : packages/pi-db/sql/000_baseline.sql(**sys_user 7컬럼 개명본** — 정본 v2.4·마스터 확정, 구현 단계 같은 배포) →
--        sitemap/sitemap.pi/sql/001_sitemap_phase1.sql(이 잡에서 수정하지 않음. REFERENCES sys_user (id) 2곳은 구현 단계에서 (usr_id) 로 수정하거나
--        이미 적용된 DB 는 000 RENAME 델타로 FK 자동 추종 — 설계서 §k-3 동반 변경표)
-- r3 (2026-10-10 재점검·마스터 확정) : sys_user 7컬럼 개명(usr_id·role_cd·pi_usr_nm·pi_wlt_adr_txt·dsp_nm·lst_lgn_dtm·rjn_dtm) — 이 파일의 영향은
--   REFERENCES sys_user (usr_id) 4곳·COMMENT 뿐. 기존 함수 인자(fn_sel_stat_site_chg p_days 등)는 grandfathered(신규 함수만 인자 규칙 적용)
-- 설계서 : docs/da/_workspace/20261010_sitemap-data-model/02_modeler_model.md (판정 근거·REQ 추적은 설계서 참조)
-- 원칙 : 스키마 접두 없음(search_path) · 함수 SET search_path FROM CURRENT · 신규 객체마다 fn_grant_svc_only ·
--        FK NO ACTION(ON DELETE 미지정) · 물리 DELETE 금지(논리삭제) · 코드값은 CHECK(표시명은 번역키)
-- ============================================================


-- ############################################################
-- Part A — Phase 1 델타 (무료 MVP 보강)
--   A1 site_mst 컬럼 추가 : 이동 URL(REQ-36) · 도메인 소유 확인 결과(REQ-28)
--   A2 site_sts_hist     : 사이트 상태 변경 이력(REQ-80, 001 판정 11 번복) + 자동 기록 트리거 + 기준선 이력
--   A3 fn_prcs_site_rpt  : 신고 처리 RPC — 인용→사이트 정지를 단일 트랜잭션으로(REQ-76, 앱 보상 처리 대체)
-- ############################################################
BEGIN;

-- ------------------------------------------------------------
-- A1) site_mst 컬럼 추가
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS site_mv_url TEXT;                              -- 사이트이동URL (등록자 입력·심사 대상, NULL = 도메인으로 이동)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS vrf_yn       CHAR(1)      NOT NULL DEFAULT 'N'; -- 확인여부 (도메인 소유 확인)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS vrf_dtm      TIMESTAMPTZ;                       -- 확인일시
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS vrf_usr_id   UUID;                              -- 확인사용자ID → sys_user.usr_id (확인한 관리자)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS vrf_dom_nm   VARCHAR(253);                      -- 확인도메인명 (확인 시점 스냅샷)

ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_site_mv_url_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_site_mv_url_check
  CHECK (site_mv_url IS NULL OR (site_mv_url ~ '^https://[^\s/?#]+' AND char_length(site_mv_url) <= 1000));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_vrf_yn_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_vrf_yn_check CHECK (vrf_yn IN ('Y', 'N'));
-- 반려·정지 안내 문구 상한 500(앱 LIMITS.rsnCont) — 이력 chg_rsn_cont(≤500) 복사가 실패하지 않도록 원천에서 차단. 001 시드는 NULL
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_rjct_rsn_cont_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_rjct_rsn_cont_check
  CHECK (rjct_rsn_cont IS NULL OR char_length(rjct_rsn_cont) <= 500);
-- 확인 사실은 일시·확인자·대상 도메인이 함께 있어야 감사 근거가 된다
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_vrf_dtm_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_vrf_dtm_check
  CHECK (vrf_yn = 'N' OR (vrf_dtm IS NOT NULL AND vrf_usr_id IS NOT NULL AND vrf_dom_nm IS NOT NULL));
-- 외부 등록 사이트는 "현재 도메인"의 소유 확인 없이 노출·정지 상태가 될 수 없다(승인 API 의 ownershipVerified 를 DB 에서 재강제).
-- 도메인이 바뀌면(DRAFT·REJECTED 에서만 가능) vrf_dom_nm 불일치로 다음 승인 전 재확인이 강제된다 — 별도 초기화 로직 불필요
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_vrf_yn_apv_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_vrf_yn_apv_check
  CHECK (own_site_yn = 'Y' OR site_sts_cd NOT IN ('APPROVED', 'SUSPENDED') OR (vrf_yn = 'Y' AND vrf_dom_nm = site_dom_nm));
-- 2번째 sys_user FK — 부모가 같아 표준명(site_mst_sys_user_id_fkey, ownr_usr_id 사용 중)과 구분하려 컬럼명 사용.
--   PostgREST 임베드 시 sys_user!site_mst_vrf_usr_id_fkey(...) 힌트 필요
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_vrf_usr_id_fkey;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_vrf_usr_id_fkey FOREIGN KEY (vrf_usr_id) REFERENCES sys_user (usr_id);

COMMENT ON COLUMN site_mst.site_mv_url IS '이동 URL — .pi 가 열리지 않는 일반 브라우저용 연결 주소(https). 등록자 입력·관리자 심사(입력·변경 시 PENDING 재심사). 공개 응답 포함. 이동은 클릭+안내+새 창(A-6)';
COMMENT ON COLUMN site_mst.vrf_yn       IS '도메인 소유 확인 여부 — 외부 등록(own_site_yn=N)은 APPROVED·SUSPENDED 이려면 Y 이고 vrf_dom_nm = site_dom_nm 이어야 함. Phase 3 "운영자 확인" 배지 근거';
COMMENT ON COLUMN site_mst.vrf_dtm      IS '소유 확인 일시(최근) — 확인 키(HMAC 계산값)는 저장하지 않음';
COMMENT ON COLUMN site_mst.vrf_usr_id   IS '소유 확인 관리자 sys_user.usr_id';
COMMENT ON COLUMN site_mst.vrf_dom_nm   IS '소유 확인 당시 도메인 스냅샷 — 현재 도메인과 다르면 확인 무효';

CREATE INDEX IF NOT EXISTS idx_site_mst_vrf_usr_id
  ON site_mst (vrf_usr_id)
  WHERE del_yn = 'N' AND vrf_usr_id IS NOT NULL;

-- ------------------------------------------------------------
-- A2) site_sts_hist — 사이트 상태 변경 이력 (append-only)
--     기록 주체 = site_mst 트리거(앱·RPC 어느 경로로 바꿔도 누락 없음). 행위자 = NEW.modr_id
--     chg_rsn_cd : REJECTED → rjct_rsn_cd 복사 / 신고 인용 정지 → RPT_ACCEPT(fn_prcs_site_rpt 가 트랜잭션 로컬 설정) / 그 외 NULL
--                  (전이 종류는 old·new 쌍으로 판별 — 제출·승인·관리자 직권 정지·복구·철회)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_sts_hist (
  hist_id       UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 이력ID
  site_id       UUID          NOT NULL,                               -- 사이트ID → site_mst
  old_sts_cd    VARCHAR(20),                                          -- 이전상태코드 (최초 생성 NULL)
  new_sts_cd    VARCHAR(20)   NOT NULL,                               -- 이후상태코드
  chg_rsn_cd    VARCHAR(20),                                          -- 변경사유코드
  chg_rsn_cont  TEXT,                                                 -- 변경사유내용 (반려·정지 안내 문구 스냅샷)
  site_dom_nm   VARCHAR(253)  NOT NULL,                               -- 사이트도메인명 (전이 시점 스냅샷 — OWNERSHIP 반려 근거)
  chgr_id       TEXT          NOT NULL,                               -- 변경자ID (업무 감사 — sys_user.usr_id 또는 SYSTEM·ADMIN)
  chg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시 (업무 감사)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT site_sts_hist_pkey PRIMARY KEY (hist_id),
  CONSTRAINT site_sts_hist_site_mst_id_fkey FOREIGN KEY (site_id) REFERENCES site_mst (site_id),
  CONSTRAINT site_sts_hist_old_sts_cd_check CHECK (old_sts_cd IS NULL OR old_sts_cd IN
    ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN')),
  CONSTRAINT site_sts_hist_new_sts_cd_check CHECK (new_sts_cd IN
    ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN')),
  -- 반려사유 9종 + RPT_ACCEPT(신고 인용 정지). 관리자 직권 정지는 NULL(old=APPROVED,new=SUSPENDED 로 판별)
  CONSTRAINT site_sts_hist_chg_rsn_cd_check CHECK (chg_rsn_cd IS NULL OR chg_rsn_cd IN
    ('GAMBLING', 'NON_PI_PYMNT', 'GIFT_CARD', 'INVEST', 'ADULT', 'PII_COLLECT', 'PI_BRAND', 'OWNERSHIP', 'ETC',
     'RPT_ACCEPT')),
  CONSTRAINT site_sts_hist_chg_rsn_cont_check CHECK (chg_rsn_cont IS NULL OR char_length(chg_rsn_cont) <= 500),
  CONSTRAINT site_sts_hist_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
-- mod_dtm 트리거 없음 : append-only 감사 테이블 예외(정본 §6) — 논리삭제 UPDATE 시 modr_id·mod_dtm 수동 설정 필수

COMMENT ON TABLE  site_sts_hist             IS '사이트 상태 변경 이력(append-only) — site_mst 트리거가 자동 기록. 반려·정지 사유·도메인 스냅샷 보존(현재값 덮어쓰기로 인한 근거 소실 방지)';
COMMENT ON COLUMN site_sts_hist.chg_rsn_cd  IS 'REJECTED 시 rjct_rsn_cd 복사 · 신고 인용 정지 RPT_ACCEPT · 그 외 NULL';
COMMENT ON COLUMN site_sts_hist.site_dom_nm IS '전이 시점 도메인 — OWNERSHIP 반려 (등록자, 도메인) 재제출 차단 판정 근거';
COMMENT ON COLUMN site_sts_hist.chgr_id     IS '전이 수행자 — site_mst.modr_id 복사(등록자·관리자 sys_user.usr_id 또는 ADMIN·SYSTEM)';
COMMENT ON COLUMN site_sts_hist.site_id     IS 'site_mst.site_id FK — 이력 대상 사이트';

-- 사이트별 이력 조회(최근순)
CREATE INDEX IF NOT EXISTS idx_site_sts_hist_site_id
  ON site_sts_hist (site_id, chg_dtm DESC)
  WHERE del_yn = 'N';
-- OWNERSHIP 반려 도메인 조회(재제출 차단 판정) — 등록자는 site_mst.ownr_usr_id 조인
CREATE INDEX IF NOT EXISTS idx_site_sts_hist_site_dom_nm
  ON site_sts_hist (site_dom_nm)
  WHERE del_yn = 'N' AND chg_rsn_cd = 'OWNERSHIP';

CREATE OR REPLACE FUNCTION fn_ins_site_sts_hist()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.site_sts_cd IS NOT DISTINCT FROM OLD.site_sts_cd THEN
    RETURN NULL;
  END IF;
  INSERT INTO site_sts_hist (site_id, old_sts_cd, new_sts_cd, chg_rsn_cd, chg_rsn_cont, site_dom_nm, chgr_id, regr_id, modr_id)
  VALUES (
    NEW.site_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.site_sts_cd END,
    NEW.site_sts_cd,
    CASE WHEN NEW.site_sts_cd = 'REJECTED' THEN NEW.rjct_rsn_cd
         ELSE NULLIF(current_setting('sitemap.chg_rsn_cd', true), '') END,
    CASE WHEN NEW.site_sts_cd IN ('REJECTED', 'SUSPENDED') THEN NEW.rjct_rsn_cont END,
    NEW.site_dom_nm,
    NEW.modr_id,
    NEW.modr_id,
    NEW.modr_id
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_site_mst_sts_hist
  AFTER INSERT OR UPDATE OF site_sts_cd ON site_mst
  FOR EACH ROW EXECUTE FUNCTION fn_ins_site_sts_hist();

-- 기준선 이력 — 트리거 생성 전(001 시드)에 만들어진 행의 현재 상태를 1건씩 남긴다(멱등)
INSERT INTO site_sts_hist (site_id, old_sts_cd, new_sts_cd, site_dom_nm, chgr_id, chg_dtm, regr_id, modr_id)
SELECT m.site_id, NULL, m.site_sts_cd, m.site_dom_nm, 'SYSTEM', m.reg_dtm, 'SYSTEM', 'SYSTEM'
  FROM site_mst m
 WHERE NOT EXISTS (SELECT 1 FROM site_sts_hist h WHERE h.site_id = m.site_id);

SELECT fn_grant_svc_only('TABLE', 'site_sts_hist');

-- ------------------------------------------------------------
-- A3) fn_prcs_site_rpt — 신고 처리 RPC (인용 → 사이트 정지, 단일 트랜잭션)
--     앱 : supabase.rpc('fn_prcs_site_rpt', { p_rpt_id, p_rpt_sts_cd: 'ACCEPTED'|'DISMISSED', p_prcs_cont, p_prcs_usr_id })
--     반환 : 처리된 site_rpt 행 / NULL = 대상 없음·이미 처리됨(앱 409). 사이트가 APPROVED 가 아니면 정지 없이 신고만 처리
--     Phase 2 : 사이트 정지 시 슬롯 회수는 site_mst 트리거(Part B B6)가 같은 트랜잭션에서 수행
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prcs_site_rpt(p_rpt_id UUID, p_rpt_sts_cd TEXT, p_prcs_cont TEXT, p_prcs_usr_id UUID)
RETURNS site_rpt
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_rpt site_rpt;
BEGIN
  IF p_rpt_sts_cd NOT IN ('ACCEPTED', 'DISMISSED') THEN
    RAISE EXCEPTION 'fn_prcs_site_rpt: p_rpt_sts_cd 는 ACCEPTED 또는 DISMISSED (입력값 %)', p_rpt_sts_cd
      USING ERRCODE = '22023';
  END IF;

  UPDATE site_rpt r
     SET rpt_sts_cd = p_rpt_sts_cd,
         prcs_dtm   = CURRENT_TIMESTAMP,
         prcs_cont  = p_prcs_cont,
         modr_id    = p_prcs_usr_id::TEXT
   WHERE r.rpt_id = p_rpt_id
     AND r.del_yn = 'N'
     AND r.rpt_sts_cd = 'RECEIVED'
  RETURNING r.* INTO v_rpt;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_rpt_sts_cd = 'ACCEPTED' THEN
    -- site_sts_hist 트리거에 사유 전달(트랜잭션 로컬). 같은 트랜잭션이라 신고 prcs_dtm = 이력 chg_dtm
    PERFORM set_config('sitemap.chg_rsn_cd', 'RPT_ACCEPT', true);
    UPDATE site_mst
       SET site_sts_cd   = 'SUSPENDED',
           rjct_rsn_cont = p_prcs_cont,          -- 정지 안내 문구 = 처리 내용(이전 반려 문구가 이력에 섞이지 않게)
           modr_id       = p_prcs_usr_id::TEXT
     WHERE site_id = v_rpt.site_id
       AND del_yn = 'N'
       AND site_sts_cd = 'APPROVED';
    PERFORM set_config('sitemap.chg_rsn_cd', '', true);
  END IF;

  RETURN v_rpt;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_prcs_site_rpt(uuid, text, text, uuid)');

COMMIT;


-- ############################################################
-- Part B — Phase 2 (결제·부가서비스·멤버십·제재)
--   ⛔ 실행 조건 : Phase 2 착수 + @pi/db 010_pi_pymnt.sql 적용 후. 단가·기간 시드 없음([확인중 : 마스터])
--   B1 sys_cfg · sys_cfg_chg_hist   운영 설정 단일 출처 + 설정 변경 감사(REQ-59·61)
--   B2 promo_fee_cfg                오픈 프로모션 싱글톤(REQ-61)
--   B3 fee_plan · fee_plan_bnd     요금 상품 단일 출처 · 묶음 구성(REQ-53·56·58, SPARKLE REQ-55)
--   B4 usr_snc                     계정 제재(REQ-14 — sys_user 확장 금지)
--   B5 fee_ord · fee_ord_hist     전 구매 주문 · 주문 상태 이력(REQ-64·65·80)
--   B6 트리거                        구매 자격·중복 점유·프로모 대상·재고 확보 / 사이트 정지·철회→회수 / 제재→정지·복구·보상
--   B7 site_img                     추가 이미지 2~5장(REQ-39)
--   B8 fn_sel_mbr_actv_yn           멤버십 활성 판정 단일 함수(REQ-66)
-- ############################################################
BEGIN;

-- ------------------------------------------------------------
-- B1) sys_cfg — 운영 설정 (키-값, 코드 상수 금지 항목의 단일 출처)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_cfg (
  cfg_id        UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 설정ID
  cfg_key       VARCHAR(50)   NOT NULL,                               -- 설정키 (UPPER_SNAKE)
  cfg_val       JSONB         NOT NULL,                               -- 설정값
  cfg_desc      TEXT,                                                 -- 설정설명
  use_yn        CHAR(1)       NOT NULL DEFAULT 'Y',                   -- 사용여부
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT sys_cfg_pkey PRIMARY KEY (cfg_id),
  CONSTRAINT sys_cfg_cfg_key_check CHECK (cfg_key ~ '^[A-Z][A-Z0-9_]{0,49}$'),
  CONSTRAINT sys_cfg_cfg_desc_check CHECK (cfg_desc IS NULL OR char_length(cfg_desc) <= 2000),
  CONSTRAINT sys_cfg_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT sys_cfg_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  sys_cfg         IS '운영 설정 키-값 — 연장·유예·알림·할인 등 코드 상수 금지 항목의 단일 출처. 변경은 sys_cfg_chg_hist 에 기록';
COMMENT ON COLUMN sys_cfg.cfg_val IS '설정값(JSONB) — 숫자는 JSON 숫자, 목록은 배열(예 NTCE_DAY_LIST [7,3,1])';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sys_cfg_cfg_key_actv
  ON sys_cfg (cfg_key)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_sys_cfg_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_sys_cfg_mod_dtm
  BEFORE UPDATE ON sys_cfg
  FOR EACH ROW EXECUTE FUNCTION fn_upd_sys_cfg_mod_dtm();

-- 시드 — PRD §7 제안값 [확인중 : 마스터]. 키는 코드값(단어 등재 대상 아님). 멱등
INSERT INTO sys_cfg (cfg_key, cfg_val, cfg_desc)
SELECT v.cfg_key, v.cfg_val::JSONB, v.cfg_desc
  FROM (VALUES
    ('EXTEND_BGN_DAY',  '7',       '슬롯 연장 가능 시작 — 만료 N일 전부터'),
    ('EXTEND_MAX_DAY',  '90',      '슬롯 연속 연장 상한 일수'),
    ('EXTEND_COOL_DAY', '7',       '연속 상한 도달 후 재구매 쿨다운 일수'),
    ('GRACE_DAY',       '7',       '멤버십 만료 후 유예 일수(전 멤버십 공통)'),
    ('NTCE_DAY_LIST',   '[7,3,1]', '멤버십 만료 알림 — 만료 N일 전 목록'),
    ('MBR_DC_PCT',      '10',      '멤버십 할인율(%) — 30일 슬롯·PREMIUM30'),
    ('MBR_DC_MIN_PI',   '1',       '멤버십 할인 적용 후 하한 Pi')
  ) AS v (cfg_key, cfg_val, cfg_desc)
 WHERE NOT EXISTS (SELECT 1 FROM sys_cfg c WHERE c.cfg_key = v.cfg_key AND c.del_yn = 'N');

-- sys_cfg_chg_hist — 설정 변경 감사(append-only, cafe sql/176 구조 승계 · SWITCH 제외)
--   대상 4종 : sys_cfg · promo_fee_cfg · fee_plan(단가 변경) · fee_plan_bnd(묶음 구성) — 앱/RPC 가 변경과 같은 트랜잭션에서 기록
CREATE TABLE IF NOT EXISTS sys_cfg_chg_hist (
  hist_id       UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 이력ID
  cfg_tbl_nm    VARCHAR(63)   NOT NULL,                               -- 설정테이블명
  cfg_tgt_id    TEXT          NOT NULL,                               -- 설정대상ID (대상 행 PK 문자열)
  chg_actn_cd   VARCHAR(20)   NOT NULL,                               -- 변경행위코드
  old_val       JSONB,                                                -- 이전값 (업무 컬럼 스냅샷, INSERT 면 NULL)
  new_val       JSONB,                                                -- 이후값 (DELETE 면 NULL)
  chg_rsn_cont  TEXT,                                                 -- 변경사유내용
  chgr_id       TEXT          NOT NULL,                               -- 변경자ID (업무 감사)
  chg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시 (업무 감사)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT sys_cfg_chg_hist_pkey PRIMARY KEY (hist_id),
  CONSTRAINT sys_cfg_chg_hist_cfg_tbl_nm_check CHECK (cfg_tbl_nm IN ('sys_cfg', 'promo_fee_cfg', 'fee_plan', 'fee_plan_bnd')),
  CONSTRAINT sys_cfg_chg_hist_chg_actn_cd_check CHECK (chg_actn_cd IN ('INSERT', 'UPDATE', 'TOGGLE', 'ROLLBACK', 'DELETE')),
  CONSTRAINT sys_cfg_chg_hist_chg_rsn_cont_check CHECK (chg_rsn_cont IS NULL OR char_length(chg_rsn_cont) <= 500),
  CONSTRAINT sys_cfg_chg_hist_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
-- mod_dtm 트리거 없음 : append-only 감사 테이블 예외(정본 §6)
COMMENT ON TABLE sys_cfg_chg_hist IS '운영 설정 변경 감사 이력(append-only) — sys_cfg·promo_fee_cfg·fee_plan·fee_plan_bnd 변경 추적(cafe sql/176 구조)';
COMMENT ON COLUMN sys_cfg_chg_hist.chg_actn_cd IS 'INSERT·UPDATE·TOGGLE(프로모 토글)·ROLLBACK·DELETE — cafe 의 SWITCH 는 fee_mode 전용이라 제외';

CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_hist_cfg_tgt_id
  ON sys_cfg_chg_hist (cfg_tbl_nm, cfg_tgt_id, chg_dtm DESC)
  WHERE del_yn = 'N';

-- ------------------------------------------------------------
-- B2) promo_fee_cfg — 오픈 프로모션 싱글톤 토글 (활성 행 1개 — 키 컬럼 없이 상수 식 부분 UNIQUE)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_fee_cfg (
  promo_fee_id  UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 프로모션요금ID
  promo_actv_yn CHAR(1)       NOT NULL DEFAULT 'N',                   -- 프로모션활성여부
  promo_bgn_dtm TIMESTAMPTZ,                                          -- 프로모션시작일시
  promo_end_dtm TIMESTAMPTZ,                                          -- 프로모션종료일시
  chg_rsn_cont  TEXT,                                                 -- 변경사유내용 (최근 토글 사유)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT promo_fee_cfg_pkey PRIMARY KEY (promo_fee_id),
  CONSTRAINT promo_fee_cfg_promo_actv_yn_check CHECK (promo_actv_yn IN ('Y', 'N')),
  CONSTRAINT promo_fee_cfg_promo_end_dtm_check CHECK (promo_end_dtm IS NULL OR promo_bgn_dtm IS NULL OR promo_end_dtm > promo_bgn_dtm),
  CONSTRAINT promo_fee_cfg_chg_rsn_cont_check CHECK (chg_rsn_cont IS NULL OR char_length(chg_rsn_cont) <= 500),
  CONSTRAINT promo_fee_cfg_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE promo_fee_cfg IS '오픈 프로모션 싱글톤 — 7일 슬롯만 0 Pi, 사이트당 누적 1건. 청구 판정은 캐시 없이 이 행 직접 조회. 토글은 sys_cfg_chg_hist(TOGGLE) 기록';

CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_fee_cfg_sngl
  ON promo_fee_cfg ((1))
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_promo_fee_cfg_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_promo_fee_cfg_mod_dtm
  BEFORE UPDATE ON promo_fee_cfg
  FOR EACH ROW EXECUTE FUNCTION fn_upd_promo_fee_cfg_mod_dtm();

-- 싱글톤 행 시드(비활성) — 멱등
INSERT INTO promo_fee_cfg (promo_actv_yn)
SELECT 'N' WHERE NOT EXISTS (SELECT 1 FROM promo_fee_cfg WHERE del_yn = 'N');

-- ------------------------------------------------------------
-- B3) fee_plan — 요금 상품(단가 단일 출처) / fee_plan_bnd — 묶음 구성
--     fee_tp_cd : 판매 행이 생기는 유형만(REGISTER 무료=주문 없음, EXTEND=주문유형 ord_tp_cd 로 표현 — 설계서 §d 판정)
--     재고는 유형 단위 : 같은 fee_tp_cd 행은 stk_cnt·stk_scp_cd 를 같게 둔다(반정규화 — 재고 판정은 유형별 MIN)
--     행 시드 없음 — 단가·기간 [확인중 : 마스터](PRD §9 #3), SPARKLE 가격·기간·재고 [확인중 : 마스터]
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_plan (
  fee_plan_id   UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 요금상품ID
  fee_plan_cd   VARCHAR(30)   NOT NULL,                               -- 요금상품코드 (자연키, 재사용 금지)
  fee_tp_cd     VARCHAR(20)   NOT NULL,                               -- 요금유형코드
  use_day_cnt   INT,                                                  -- 사용일건수 (영구 NULL)
  lft_yn       CHAR(1)       NOT NULL DEFAULT 'N',                   -- 영구여부
  subscr_yn     CHAR(1)       NOT NULL DEFAULT 'N',                   -- 구독여부
  pi_amt        NUMERIC(18,7) NOT NULL,                               -- Pi금액 (판매가)
  nrm_pi_amt   NUMERIC(18,7) NOT NULL,                               -- 정가Pi금액
  stk_cnt       INT,                                                  -- 재고건수 (동시 노출 수, NULL = 무제한)
  stk_scp_cd    VARCHAR(20),                                          -- 재고범위코드 (NULL = 비배타)
  promo_apl_yn CHAR(1)       NOT NULL DEFAULT 'N',                   -- 프로모션적용여부 (오픈 프로모 0 Pi 대상)
  apl_bgn_dtm  TIMESTAMPTZ,                                          -- 적용시작일시 (판매 개시)
  apl_end_dtm  TIMESTAMPTZ,                                          -- 적용종료일시
  use_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 사용여부 (판매 on/off — 기본 판매 중지)
  sort_seq      INT           NOT NULL DEFAULT 0,                     -- 정렬순서
  fee_plan_desc TEXT,                                                 -- 요금상품설명 (관리 메모 — 표시명은 번역키)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT fee_plan_pkey PRIMARY KEY (fee_plan_id),
  -- 전체 UNIQUE(부분 아님) — fee_ord·fee_plan_bnd FK 대상. 코드는 폐기해도 재사용하지 않는다
  CONSTRAINT fee_plan_fee_plan_cd_key UNIQUE (fee_plan_cd),
  CONSTRAINT fee_plan_fee_plan_cd_check CHECK (fee_plan_cd ~ '^[A-Z][A-Z0-9_]{0,29}$'),
  CONSTRAINT fee_plan_fee_tp_cd_check CHECK (fee_tp_cd IN
    ('CTGR_SLOT', 'HOME_SLOT', 'STATS', 'PREMIUM30', 'MEMBERSHIP', 'SPARKLE')),
  CONSTRAINT fee_plan_use_day_cnt_check CHECK ((lft_yn = 'Y' AND use_day_cnt IS NULL) OR (lft_yn = 'N' AND use_day_cnt > 0)),
  CONSTRAINT fee_plan_lft_yn_check CHECK (lft_yn IN ('Y', 'N') AND (lft_yn = 'N' OR fee_tp_cd = 'MEMBERSHIP')),
  CONSTRAINT fee_plan_subscr_yn_check CHECK (subscr_yn IN ('Y', 'N') AND (subscr_yn = 'N' OR fee_tp_cd = 'MEMBERSHIP')),
  CONSTRAINT fee_plan_pi_amt_check CHECK (pi_amt >= 0 AND nrm_pi_amt >= pi_amt),
  CONSTRAINT fee_plan_stk_cnt_check CHECK ((stk_cnt IS NULL) = (stk_scp_cd IS NULL) AND (stk_cnt IS NULL OR stk_cnt > 0)),
  CONSTRAINT fee_plan_stk_scp_cd_check CHECK (stk_scp_cd IS NULL OR stk_scp_cd IN ('PER_CTGR', 'GLOBAL')),
  CONSTRAINT fee_plan_promo_apl_yn_check CHECK (promo_apl_yn IN ('Y', 'N')),
  CONSTRAINT fee_plan_apl_end_dtm_check CHECK (apl_end_dtm IS NULL OR apl_bgn_dtm IS NULL OR apl_end_dtm > apl_bgn_dtm),
  CONSTRAINT fee_plan_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT fee_plan_fee_plan_desc_check CHECK (fee_plan_desc IS NULL OR char_length(fee_plan_desc) <= 2000),
  CONSTRAINT fee_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  fee_plan             IS '요금 상품 — 단가 단일 출처(코드 하드코딩 금지). 가격 변경은 행 갱신 + sys_cfg_chg_hist, 기존 주문은 fee_ord 금액 스냅샷으로 보호';
COMMENT ON COLUMN fee_plan.fee_tp_cd   IS 'CTGR_SLOT·HOME_SLOT·STATS·PREMIUM30·MEMBERSHIP·SPARKLE(부가서비스 반짝임) — 표시명은 번역키. 부가서비스 추가 = 코드값 추가';
COMMENT ON COLUMN fee_plan.use_day_cnt IS '사용 일수(1개월 30·6개월 180·12개월 365·2년 730·5년 1825·10년 3650). 영구 NULL — infinity 금지';
COMMENT ON COLUMN fee_plan.pi_amt      IS '판매가(Pi, NUMERIC(18,7) — 1 Pi = 10^7 units). 서버 complete 시 정가 재계산 기준';
COMMENT ON COLUMN fee_plan.stk_cnt     IS '동시 노출 슬롯 수 — 유형(fee_tp_cd) 단위 재고라 같은 유형 행은 같은 값. PREMIUM30 은 NULL(구성 항목 재고로 판정)';
COMMENT ON COLUMN fee_plan.stk_scp_cd  IS 'PER_CTGR 카테고리별 · GLOBAL 전체 — NULL = 비배타(재고 무제한, stk_cnt 와 동시 NULL)';
COMMENT ON COLUMN fee_plan.use_yn      IS '판매 on/off — 판매 개시 게이트(PRD §9)는 데이터로만 제어';

CREATE INDEX IF NOT EXISTS idx_fee_plan_fee_tp_cd
  ON fee_plan (fee_tp_cd, sort_seq)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_fee_plan_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_fee_plan_mod_dtm
  BEFORE UPDATE ON fee_plan
  FOR EACH ROW EXECUTE FUNCTION fn_upd_fee_plan_mod_dtm();

CREATE TABLE IF NOT EXISTS fee_plan_bnd (
  bnd_id       UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 묶음ID
  bnd_plan_cd  VARCHAR(30)   NOT NULL,                               -- 묶음상품코드 → fee_plan
  item_plan_cd  VARCHAR(30)   NOT NULL,                               -- 항목상품코드 → fee_plan
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT fee_plan_bnd_pkey PRIMARY KEY (bnd_id),
  -- 부모가 같은 FK 2개 — 컬럼명으로 구분. PostgREST 임베드 시 fee_plan!fee_plan_bnd_item_plan_cd_fkey(...) 힌트 필요
  CONSTRAINT fee_plan_bnd_bnd_plan_cd_fkey FOREIGN KEY (bnd_plan_cd) REFERENCES fee_plan (fee_plan_cd),
  CONSTRAINT fee_plan_bnd_item_plan_cd_fkey FOREIGN KEY (item_plan_cd) REFERENCES fee_plan (fee_plan_cd),
  CONSTRAINT fee_plan_bnd_item_plan_cd_check CHECK (item_plan_cd <> bnd_plan_cd),
  CONSTRAINT fee_plan_bnd_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE fee_plan_bnd IS '묶음 상품 구성(PREMIUM30 = CTGR_SLOT + HOME_SLOT + STATS 30일) — 묶음 주문은 구성 항목 재고를 모두 확보해야 성립';
COMMENT ON COLUMN fee_plan_bnd.bnd_plan_cd  IS 'fee_plan.fee_plan_cd FK(자연키) — 묶음 상품(PREMIUM30)';
COMMENT ON COLUMN fee_plan_bnd.item_plan_cd IS 'fee_plan.fee_plan_cd FK(자연키) — 구성 항목 상품';

CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_plan_bnd_item_actv
  ON fee_plan_bnd (bnd_plan_cd, item_plan_cd)
  WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_fee_plan_bnd_item_plan_cd
  ON fee_plan_bnd (item_plan_cd)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_fee_plan_bnd_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_fee_plan_bnd_mod_dtm
  BEFORE UPDATE ON fee_plan_bnd
  FOR EACH ROW EXECUTE FUNCTION fn_upd_fee_plan_bnd_mod_dtm();

-- ------------------------------------------------------------
-- B4) usr_snc — 계정 제재 (마스터 확정 REQ-14 : sitemap 측 별도 엔터티, sys_user 확장 금지)
--     ACTIVE 행 등록 → 대상 사용자의 ACTIVE 멤버십 주문 SUSPENDED (B6 트리거)
--     RELEASED(정상 해제·기간 만료) / CANCELED(관리자 오인) → SUSPENDED 주문 복귀, CANCELED 는 0 Pi 보상 연장 주문 생성
--     제재는 등록 즉시 발효(snc_bgn_dtm 기본 현재) — 예약 제재 미지원
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usr_snc (
  snc_id       UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 제재ID
  tgt_usr_id    UUID          NOT NULL,                               -- 대상사용자ID → sys_user.usr_id
  snc_tp_cd    VARCHAR(20)   NOT NULL DEFAULT 'SUSPEND',             -- 제재유형코드
  snc_sts_cd   VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',              -- 제재상태코드
  snc_rsn_cd   VARCHAR(20)   NOT NULL,                               -- 제재사유코드
  snc_rsn_cont TEXT,                                                 -- 제재사유내용
  snc_bgn_dtm  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 제재시작일시
  snc_end_dtm  TIMESTAMPTZ,                                          -- 제재종료일시 (예정, NULL = 무기한)
  rel_dtm      TIMESTAMPTZ,                                          -- 해제일시 (실제 해제·취소 시각)
  prcs_usr_id   UUID          NOT NULL,                               -- 처리사용자ID (제재를 건 관리자) → sys_user.usr_id
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID (해제·취소 처리자)
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT usr_snc_pkey PRIMARY KEY (snc_id),
  -- 부모가 같은 FK 2개 — 컬럼명으로 구분. 임베드 시 sys_user!usr_snc_tgt_usr_id_fkey(...) 힌트
  CONSTRAINT usr_snc_tgt_usr_id_fkey FOREIGN KEY (tgt_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT usr_snc_prcs_usr_id_fkey FOREIGN KEY (prcs_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT usr_snc_snc_tp_cd_check CHECK (snc_tp_cd IN ('SUSPEND')),
  CONSTRAINT usr_snc_snc_sts_cd_check CHECK (snc_sts_cd IN ('ACTIVE', 'RELEASED', 'CANCELED')),
  -- [TBD : legal-compliance-advisor] 제안값 — 신고사유 10종 재사용 + ADMIN_ETC
  CONSTRAINT usr_snc_snc_rsn_cd_check CHECK (snc_rsn_cd IN
    ('GAMBLING', 'NON_PI_PYMNT', 'GIFT_CARD', 'INVEST', 'ADULT', 'PII_COLLECT', 'PI_BRAND',
     'FRAUD', 'BROKEN', 'ETC', 'ADMIN_ETC')),
  CONSTRAINT usr_snc_snc_rsn_cont_check CHECK (snc_rsn_cont IS NULL OR char_length(snc_rsn_cont) <= 500),
  CONSTRAINT usr_snc_snc_end_dtm_check CHECK (snc_end_dtm IS NULL OR snc_end_dtm > snc_bgn_dtm),
  -- 해제일시는 종료 상태에서만, 종료 상태면 필수
  CONSTRAINT usr_snc_rel_dtm_check CHECK ((snc_sts_cd = 'ACTIVE') = (rel_dtm IS NULL) AND (rel_dtm IS NULL OR rel_dtm >= snc_bgn_dtm)),
  CONSTRAINT usr_snc_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  usr_snc             IS '계정 제재(멤버십 혜택 정지) — sys_user 미확장. 등록·해제 시 fee_ord 멤버십 주문 상태 연쇄(트리거, 단일 트랜잭션). 상태 전이는 ACTIVE→RELEASED|CANCELED 1회뿐이라 이력 = 행 자체(처리자 prcs_usr_id·해제자 modr_id)';
COMMENT ON COLUMN usr_snc.snc_sts_cd IS 'ACTIVE 제재 중 · RELEASED 정상 해제(기간 만료 배치 포함) · CANCELED 관리자 오인 취소 → 제재 기간만큼 0 Pi 보상 연장';
COMMENT ON COLUMN usr_snc.snc_end_dtm IS '예정 종료 — 경과 시 배치가 RELEASED 로 전환(전환 전까지 주문은 SUSPENDED 유지)';
COMMENT ON COLUMN usr_snc.rel_dtm    IS '실제 해제·취소 시각 — 보상 연장 일수 = rel_dtm − snc_bgn_dtm(일 올림)';
COMMENT ON COLUMN usr_snc.tgt_usr_id  IS 'sys_user.usr_id FK — 제재 대상 사용자';
COMMENT ON COLUMN usr_snc.prcs_usr_id IS 'sys_user.usr_id FK — 제재를 건 관리자(해제·취소 처리자는 modr_id)';
COMMENT ON COLUMN usr_snc.snc_tp_cd   IS 'SUSPEND 멤버십 혜택 정지 — 1차는 이 값만(추가 유형 [TBD])';

-- 사용자당 진행 중 제재 1건
CREATE UNIQUE INDEX IF NOT EXISTS ux_usr_snc_tgt_usr_id_actv
  ON usr_snc (tgt_usr_id)
  WHERE del_yn = 'N' AND snc_sts_cd = 'ACTIVE';
-- 만료 해제 배치
CREATE INDEX IF NOT EXISTS idx_usr_snc_snc_end_dtm
  ON usr_snc (snc_end_dtm)
  WHERE del_yn = 'N' AND snc_sts_cd = 'ACTIVE' AND snc_end_dtm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usr_snc_prcs_usr_id
  ON usr_snc (prcs_usr_id)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_usr_snc_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_usr_snc_mod_dtm
  BEFORE UPDATE ON usr_snc
  FOR EACH ROW EXECUTE FUNCTION fn_upd_usr_snc_mod_dtm();

-- ------------------------------------------------------------
-- B5) fee_ord — 전 구매 주문(슬롯·STATS·PREMIUM30·멤버십·구독·SPARKLE) / fee_ord_hist — 주문 상태 이력
--     상태 : HELD → ACTIVE | EXPIRED(15분) | CANCELED · ACTIVE → EXPIRED | SUSPENDED(제재) | REVOKED · SUSPENDED → ACTIVE | EXPIRED
--     갱신·연장·보상 = 새 주문 + upr_ord_id(체인). 구독 해지 = subscr_cnl_yn 표시만. 구독 별도 테이블 없음
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_ord (
  ord_id        UUID          NOT NULL DEFAULT gen_random_uuid(),    -- 주문ID
  ord_usr_id    UUID          NOT NULL,                              -- 주문사용자ID → sys_user.usr_id
  site_id        UUID,                                                -- 사이트ID → site_mst (멤버십 NULL)
  fee_plan_cd    VARCHAR(30)   NOT NULL,                              -- 요금상품코드 → fee_plan
  site_ctgr_cd   VARCHAR(20),                                         -- 사이트카테고리코드 (주문 시점 스냅샷 — 트리거가 채움, 멤버십 NULL)
  ord_pi_amt    NUMERIC(18,7) NOT NULL,                              -- 주문Pi금액 (실결제 스냅샷)
  nrm_pi_amt    NUMERIC(18,7) NOT NULL,                              -- 정가Pi금액 (주문 시점 정가 스냅샷)
  promo_apl_yn  CHAR(1)       NOT NULL DEFAULT 'N',                  -- 프로모션적용여부 (스냅샷)
  pymnt_id       TEXT,                                                -- 결제ID → pi_pymnt [TBD 010 : 타입·FK 는 pi_pymnt PK 확정 후, 0 Pi 주문 NULL]
  ord_sts_cd    VARCHAR(20)   NOT NULL DEFAULT 'HELD',               -- 주문상태코드
  ord_tp_cd     VARCHAR(20)   NOT NULL DEFAULT 'NEW',                -- 주문유형코드
  use_bgn_dtm    TIMESTAMPTZ,                                         -- 사용시작일시
  use_end_dtm    TIMESTAMPTZ,                                         -- 사용종료일시 (영구 NULL)
  hld_expr_dtm  TIMESTAMPTZ,                                         -- 확보만료일시 (HELD 15분)
  upr_ord_id   UUID,                                                -- 상위주문ID → fee_ord (갱신·연장·보상 체인)
  subscr_cnl_yn CHAR(1)       NOT NULL DEFAULT 'N',                  -- 구독해지여부 ("갱신 안 함")
  rvk_rsn_cd     VARCHAR(20),                                         -- 회수사유코드
  rvk_dtm        TIMESTAMPTZ,                                         -- 회수일시
  snc_id        UUID,                                                -- 제재ID → usr_snc (SUSPENDED 원인 — 복귀 대상 식별)
  del_yn         CHAR(1)       NOT NULL DEFAULT 'N',                  -- 삭제여부
  del_dtm        TIMESTAMPTZ,                                         -- 삭제일시
  regr_id        TEXT          NOT NULL DEFAULT 'ADMIN',              -- 등록자ID
  reg_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 등록일시
  modr_id        TEXT          NOT NULL DEFAULT 'ADMIN',              -- 변경자ID
  mod_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 변경일시
  CONSTRAINT fee_ord_pkey PRIMARY KEY (ord_id),
  CONSTRAINT fee_ord_sys_user_id_fkey FOREIGN KEY (ord_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT fee_ord_site_mst_id_fkey FOREIGN KEY (site_id) REFERENCES site_mst (site_id),
  CONSTRAINT fee_ord_fee_plan_cd_fkey FOREIGN KEY (fee_plan_cd) REFERENCES fee_plan (fee_plan_cd),
  CONSTRAINT fee_ord_upr_ord_id_fkey FOREIGN KEY (upr_ord_id) REFERENCES fee_ord (ord_id),
  CONSTRAINT fee_ord_usr_snc_id_fkey FOREIGN KEY (snc_id) REFERENCES usr_snc (snc_id),
  -- [TBD 010] CONSTRAINT fee_ord_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (<PK>) — 010 적용 후 ALTER 로 추가
  CONSTRAINT fee_ord_site_ctgr_cd_check CHECK (site_ctgr_cd IS NULL OR site_ctgr_cd IN
    ('COMMUNITY', 'EDU', 'SHOP', 'CONTENT', 'PERSONAL', 'EVENT', 'GAME', 'TOOL', 'ETC')),
  CONSTRAINT fee_ord_ord_pi_amt_check CHECK (ord_pi_amt >= 0 AND nrm_pi_amt >= ord_pi_amt),
  CONSTRAINT fee_ord_promo_apl_yn_check CHECK (promo_apl_yn IN ('Y', 'N')),
  -- 오픈 프로모 주문은 신규·0 Pi 만(연장·갱신·보상 불가 — PRD §3-3)
  CONSTRAINT fee_ord_promo_apl_yn_tp_check CHECK (promo_apl_yn = 'N' OR (ord_tp_cd = 'NEW' AND ord_pi_amt = 0)),
  CONSTRAINT fee_ord_ord_sts_cd_check CHECK (ord_sts_cd IN
    ('HELD', 'ACTIVE', 'EXPIRED', 'CANCELED', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT fee_ord_ord_tp_cd_check CHECK (ord_tp_cd IN ('NEW', 'RENEW', 'EXTEND', 'CMPN')),
  -- 갱신·연장·보상은 체인 필수, 보상은 0 Pi
  CONSTRAINT fee_ord_upr_ord_id_check CHECK (ord_tp_cd = 'NEW' OR upr_ord_id IS NOT NULL),
  CONSTRAINT fee_ord_ord_tp_cd_amt_check CHECK (ord_tp_cd <> 'CMPN' OR ord_pi_amt = 0),
  -- 유료 주문이 이용 상태면 결제가 있어야 한다
  CONSTRAINT fee_ord_pymnt_id_check CHECK (ord_pi_amt = 0 OR ord_sts_cd NOT IN ('ACTIVE', 'SUSPENDED', 'REVOKED') OR pymnt_id IS NOT NULL),
  CONSTRAINT fee_ord_hld_expr_dtm_check CHECK (ord_sts_cd <> 'HELD' OR hld_expr_dtm IS NOT NULL),
  CONSTRAINT fee_ord_use_bgn_dtm_check CHECK (ord_sts_cd NOT IN ('ACTIVE', 'SUSPENDED', 'REVOKED') OR use_bgn_dtm IS NOT NULL),
  CONSTRAINT fee_ord_use_end_dtm_check CHECK (use_end_dtm IS NULL OR use_bgn_dtm IS NULL OR use_end_dtm > use_bgn_dtm),
  CONSTRAINT fee_ord_subscr_cnl_yn_check CHECK (subscr_cnl_yn IN ('Y', 'N')),
  -- [TBD] 제안명 — LFTM_UPGRADE 만 PRD 확정
  CONSTRAINT fee_ord_rvk_rsn_cd_check CHECK (rvk_rsn_cd IS NULL OR rvk_rsn_cd IN
    ('SITE_SUSPENDED', 'SITE_WITHDRAWN', 'SITE_DELETED', 'LFTM_UPGRADE')),
  CONSTRAINT fee_ord_rvk_dtm_check CHECK ((ord_sts_cd = 'REVOKED') = (rvk_rsn_cd IS NOT NULL) AND (ord_sts_cd <> 'REVOKED' OR rvk_dtm IS NOT NULL)),
  CONSTRAINT fee_ord_snc_id_check CHECK (ord_sts_cd <> 'SUSPENDED' OR snc_id IS NOT NULL),
  CONSTRAINT fee_ord_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  fee_ord              IS '전 구매 주문 — 슬롯·STATS·PREMIUM30·멤버십·구독·SPARKLE 공통. 금액은 주문 시점 스냅샷(소급 없음). 구매 자격·중복 점유·프로모 대상·재고는 INSERT 트리거가 강제';
COMMENT ON COLUMN fee_ord.ord_pi_amt  IS '실결제 Pi 스냅샷 — complete 시 서버가 fee_plan(구독 갱신은 체인 최초 주문 금액)으로 재계산해 대조, 클라이언트 금액 불신';
COMMENT ON COLUMN fee_ord.ord_tp_cd   IS 'NEW 신규 · RENEW 구독 갱신(가격 잠금) · EXTEND 슬롯 연장(재고 미차감) · CMPN 0 Pi 보상 연장';
COMMENT ON COLUMN fee_ord.use_end_dtm  IS '사용 종료 — 영구 NULL(infinity 금지). 멤버십은 + GRACE_DAY 유예까지 혜택 유지';
COMMENT ON COLUMN fee_ord.pymnt_id     IS 'pi_pymnt 참조 — [TBD 010] 타입은 @pi/db 010_pi_pymnt.sql PK 확정 후 교체, FK 는 010 적용 후 추가';
COMMENT ON COLUMN fee_ord.rvk_rsn_cd   IS 'SITE_SUSPENDED·SITE_WITHDRAWN·SITE_DELETED(사이트 트리거 자동) · LFTM_UPGRADE(영구 구매로 잔여 기간 종료)';
COMMENT ON COLUMN fee_ord.ord_sts_cd   IS 'HELD 결제 대기(재고 확보) · ACTIVE 이용 · EXPIRED 만료 · CANCELED 취소 · SUSPENDED 제재 정지 · REVOKED 회수';
COMMENT ON COLUMN fee_ord.ord_usr_id   IS 'sys_user.usr_id FK — 주문 사용자';
COMMENT ON COLUMN fee_ord.site_id      IS 'site_mst.site_id FK — 사이트 단위 상품 대상, 멤버십 NULL(트리거 강제)';
COMMENT ON COLUMN fee_ord.fee_plan_cd  IS 'fee_plan.fee_plan_cd FK(자연키) — 주문 상품';
COMMENT ON COLUMN fee_ord.upr_ord_id   IS 'fee_ord.ord_id 자기참조 FK — 갱신·연장·보상 체인의 직전 주문(NEW 외 필수)';
COMMENT ON COLUMN fee_ord.snc_id       IS 'usr_snc.snc_id FK — SUSPENDED 원인 제재(해제 시 이 값으로 복귀 대상 식별)';

-- 결제 1건 = 주문 1건
CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_ord_pymnt_id_actv
  ON fee_ord (pymnt_id)
  WHERE del_yn = 'N' AND pymnt_id IS NOT NULL;
-- 오픈 프로모 : 사이트당 누적 1건(취소 제외). ponytail: 프로모 행사 1회 전제 — 2회차부터는 promo_fee_id 를 키에 추가
CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_ord_site_id_promo_actv
  ON fee_ord (site_id)
  WHERE del_yn = 'N' AND promo_apl_yn = 'Y' AND ord_sts_cd <> 'CANCELED';
-- 내 주문·멤버십 판정
CREATE INDEX IF NOT EXISTS idx_fee_ord_ord_usr_id
  ON fee_ord (ord_usr_id, ord_sts_cd)
  WHERE del_yn = 'N';
-- 사이트별 활성 주문(버블 반짝임·추천 영역·회수)
CREATE INDEX IF NOT EXISTS idx_fee_ord_site_id
  ON fee_ord (site_id, ord_sts_cd)
  WHERE del_yn = 'N' AND site_id IS NOT NULL;
-- 재고 판정(유형·카테고리별 점유)
CREATE INDEX IF NOT EXISTS idx_fee_ord_fee_plan_cd
  ON fee_ord (fee_plan_cd, site_ctgr_cd)
  WHERE del_yn = 'N' AND ord_sts_cd IN ('HELD', 'ACTIVE');
-- 만료 배치
CREATE INDEX IF NOT EXISTS idx_fee_ord_use_end_dtm
  ON fee_ord (use_end_dtm)
  WHERE del_yn = 'N' AND ord_sts_cd = 'ACTIVE' AND use_end_dtm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_ord_hld_expr_dtm
  ON fee_ord (hld_expr_dtm)
  WHERE del_yn = 'N' AND ord_sts_cd = 'HELD';
-- FK 컬럼
CREATE INDEX IF NOT EXISTS idx_fee_ord_upr_ord_id
  ON fee_ord (upr_ord_id)
  WHERE upr_ord_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_ord_snc_id
  ON fee_ord (snc_id)
  WHERE snc_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_upd_fee_ord_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_fee_ord_mod_dtm
  BEFORE UPDATE ON fee_ord
  FOR EACH ROW EXECUTE FUNCTION fn_upd_fee_ord_mod_dtm();

CREATE TABLE IF NOT EXISTS fee_ord_hist (
  hist_id       UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 이력ID
  ord_id       UUID          NOT NULL,                               -- 주문ID → fee_ord
  old_sts_cd    VARCHAR(20),                                          -- 이전상태코드 (생성 NULL)
  new_sts_cd    VARCHAR(20)   NOT NULL,                               -- 이후상태코드
  chg_rsn_cd    VARCHAR(20),                                          -- 변경사유코드 (REVOKED 시 rvk_rsn_cd 복사)
  chgr_id       TEXT          NOT NULL,                               -- 변경자ID (업무 감사)
  chg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시 (업무 감사)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT fee_ord_hist_pkey PRIMARY KEY (hist_id),
  CONSTRAINT fee_ord_hist_fee_ord_id_fkey FOREIGN KEY (ord_id) REFERENCES fee_ord (ord_id),
  CONSTRAINT fee_ord_hist_old_sts_cd_check CHECK (old_sts_cd IS NULL OR old_sts_cd IN
    ('HELD', 'ACTIVE', 'EXPIRED', 'CANCELED', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT fee_ord_hist_new_sts_cd_check CHECK (new_sts_cd IN
    ('HELD', 'ACTIVE', 'EXPIRED', 'CANCELED', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT fee_ord_hist_chg_rsn_cd_check CHECK (chg_rsn_cd IS NULL OR chg_rsn_cd IN
    ('SITE_SUSPENDED', 'SITE_WITHDRAWN', 'SITE_DELETED', 'LFTM_UPGRADE')),
  CONSTRAINT fee_ord_hist_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
-- mod_dtm 트리거 없음 : append-only 감사 테이블 예외(정본 §6)
COMMENT ON TABLE fee_ord_hist IS '주문 상태 변경 이력(append-only) — fee_ord 트리거 자동 기록. 제재 정지 원인은 fee_ord.snc_id';
COMMENT ON COLUMN fee_ord_hist.ord_id IS 'fee_ord.ord_id FK — 이력 대상 주문';

CREATE INDEX IF NOT EXISTS idx_fee_ord_hist_ord_id
  ON fee_ord_hist (ord_id, chg_dtm DESC)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_ins_fee_ord_hist()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.ord_sts_cd IS NOT DISTINCT FROM OLD.ord_sts_cd THEN
    RETURN NULL;
  END IF;
  INSERT INTO fee_ord_hist (ord_id, old_sts_cd, new_sts_cd, chg_rsn_cd, chgr_id, regr_id, modr_id)
  VALUES (NEW.ord_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.ord_sts_cd END, NEW.ord_sts_cd,
          CASE WHEN NEW.ord_sts_cd = 'REVOKED' THEN NEW.rvk_rsn_cd END,
          NEW.modr_id, NEW.modr_id, NEW.modr_id);
  RETURN NULL;
END;
$$;
CREATE OR REPLACE TRIGGER trg_fee_ord_sts_hist
  AFTER INSERT OR UPDATE OF ord_sts_cd ON fee_ord
  FOR EACH ROW EXECUTE FUNCTION fn_ins_fee_ord_hist();

-- ------------------------------------------------------------
-- B6) 연쇄·자격 트리거 (다중 테이블 불변식 — 경로 무관 단일 트랜잭션)
-- ------------------------------------------------------------

-- B6-1) 주문 INSERT 게이트 — 구매 자격(자사 금지·SPARKLE 유료 요금제 한정·APPROVED·프로모 대상) + 카테고리 스냅샷 + 같은 사이트 중복 점유 거절 + 재고 원자 확보
--   재고 판정 : 유형(fee_tp_cd)·범위별 advisory lock(트랜잭션 종료까지) 후 점유 사이트 수 계산.
--   점유 = (HELD 이고 hld_expr_dtm 미경과) 또는 (ACTIVE 이고 use_end_dtm 미경과·NULL). 같은 사이트의 연장 체인은 1개로 센다(DISTINCT site_id)
--   NEW·RENEW 만 재고 검사 — EXTEND(같은 사이트 이미 점유)·CMPN(관리자 보상, 초과 허용) 제외
CREATE OR REPLACE FUNCTION fn_vrf_fee_ord_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_plan  fee_plan;
  v_site  site_mst;
  r       RECORD;
  v_used  INT;
BEGIN
  SELECT * INTO v_plan FROM fee_plan WHERE fee_plan_cd = NEW.fee_plan_cd AND del_yn = 'N';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND: %', NEW.fee_plan_cd USING ERRCODE = 'P0001';
  END IF;
  -- 오픈 프로모 0 Pi 는 프로모 대상 상품(7일 슬롯)만
  IF NEW.promo_apl_yn = 'Y' AND v_plan.promo_apl_yn <> 'Y' THEN
    RAISE EXCEPTION 'PROMO_NOT_ELIGIBLE: %', NEW.fee_plan_cd USING ERRCODE = 'P0001';
  END IF;

  -- 멤버십 : 계정 단위(사이트 없음), 진행 중 제재가 있으면 구매 불가
  IF v_plan.fee_tp_cd = 'MEMBERSHIP' THEN
    IF NEW.site_id IS NOT NULL THEN
      RAISE EXCEPTION 'MBR_SITE_NOT_ALLOWED' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM usr_snc s
                WHERE s.tgt_usr_id = NEW.ord_usr_id AND s.del_yn = 'N' AND s.snc_sts_cd = 'ACTIVE') THEN
      RAISE EXCEPTION 'USR_SANCTIONED' USING ERRCODE = 'P0001';
    END IF;
    NEW.site_ctgr_cd := NULL;
    RETURN NEW;
  END IF;

  -- 사이트 단위 상품 : APPROVED·활성·외부 사이트만(자사 구매 상시 금지 — REQ-44)
  IF NEW.site_id IS NULL THEN
    RAISE EXCEPTION 'SITE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_site FROM site_mst WHERE site_id = NEW.site_id FOR SHARE;
  IF NOT FOUND OR v_site.del_yn <> 'N' OR v_site.site_sts_cd <> 'APPROVED' THEN
    RAISE EXCEPTION 'SITE_NOT_APPROVED' USING ERRCODE = 'P0001';
  END IF;
  IF v_site.own_site_yn = 'Y' THEN
    RAISE EXCEPTION 'OWN_SITE_NOT_BUYABLE' USING ERRCODE = 'P0001';
  END IF;
  -- 마스터 확정 REQ-55 : 반짝임은 유료 요금제(VIP~BSC1) 사이트만
  IF v_plan.fee_tp_cd = 'SPARKLE' AND v_site.plan_cd = 'NONE' THEN
    RAISE EXCEPTION 'SPARKLE_PLAN_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  NEW.site_ctgr_cd := v_site.site_ctgr_cd;

  IF NEW.ord_tp_cd NOT IN ('NEW', 'RENEW') THEN
    RETURN NEW;
  END IF;

  -- 같은 사이트가 같은 소비 유형(자기 유형 + 묶음 구성 유형)을 이미 점유 중이면 신규 거절 — 이어 구매는 EXTEND(이중 결제·기간 중복 방지)
  PERFORM pg_advisory_xact_lock(hashtext('fee_site:' || NEW.site_id::TEXT));
  IF EXISTS (
    SELECT 1
      FROM fee_ord o
      JOIN fee_plan op ON op.fee_plan_cd = o.fee_plan_cd
     WHERE o.del_yn = 'N'
       AND o.site_id = NEW.site_id
       AND ((o.ord_sts_cd = 'HELD' AND o.hld_expr_dtm > CURRENT_TIMESTAMP)
         OR (o.ord_sts_cd = 'ACTIVE' AND (o.use_end_dtm IS NULL OR o.use_end_dtm > CURRENT_TIMESTAMP)))
       AND EXISTS (
             SELECT 1
               FROM (SELECT op.fee_tp_cd AS tp
                     UNION
                     SELECT i.fee_tp_cd FROM fee_plan_bnd b JOIN fee_plan i ON i.fee_plan_cd = b.item_plan_cd
                      WHERE b.bnd_plan_cd = o.fee_plan_cd AND b.del_yn = 'N') ot
               JOIN (SELECT v_plan.fee_tp_cd AS tp
                     UNION
                     SELECT i.fee_tp_cd FROM fee_plan_bnd b JOIN fee_plan i ON i.fee_plan_cd = b.item_plan_cd
                      WHERE b.bnd_plan_cd = v_plan.fee_plan_cd AND b.del_yn = 'N') nt ON nt.tp = ot.tp)
  ) THEN
    RAISE EXCEPTION 'ALREADY_OCCUPIED: %', v_plan.fee_tp_cd USING ERRCODE = 'P0001';
  END IF;

  -- 이 주문이 소비하는 재고 유형 = 자기 유형 + 묶음 구성 항목 유형(재고 있는 것만), 잠금 순서 고정(교착 방지)
  FOR r IN
    SELECT p.fee_tp_cd, MIN(p.stk_cnt) AS stk_cnt, MIN(p.stk_scp_cd) AS stk_scp_cd
      FROM fee_plan p
     WHERE p.del_yn = 'N'
       AND p.stk_cnt IS NOT NULL
       AND p.fee_tp_cd IN (
             SELECT v_plan.fee_tp_cd
             UNION
             SELECT i.fee_tp_cd
               FROM fee_plan_bnd b JOIN fee_plan i ON i.fee_plan_cd = b.item_plan_cd
              WHERE b.bnd_plan_cd = v_plan.fee_plan_cd AND b.del_yn = 'N')
     GROUP BY p.fee_tp_cd
     ORDER BY p.fee_tp_cd
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('fee_stk:' || r.fee_tp_cd || ':' ||
            CASE WHEN r.stk_scp_cd = 'PER_CTGR' THEN v_site.site_ctgr_cd ELSE '*' END));
    SELECT COUNT(DISTINCT o.site_id) INTO v_used
      FROM fee_ord o
      JOIN fee_plan op ON op.fee_plan_cd = o.fee_plan_cd
     WHERE o.del_yn = 'N'
       AND o.site_id <> NEW.site_id
       AND (r.stk_scp_cd = 'GLOBAL' OR o.site_ctgr_cd = v_site.site_ctgr_cd)
       AND ((o.ord_sts_cd = 'HELD' AND o.hld_expr_dtm > CURRENT_TIMESTAMP)
         OR (o.ord_sts_cd = 'ACTIVE' AND (o.use_end_dtm IS NULL OR o.use_end_dtm > CURRENT_TIMESTAMP)))
       AND (op.fee_tp_cd = r.fee_tp_cd
         OR EXISTS (SELECT 1 FROM fee_plan_bnd b JOIN fee_plan i ON i.fee_plan_cd = b.item_plan_cd
                     WHERE b.bnd_plan_cd = o.fee_plan_cd AND b.del_yn = 'N' AND i.fee_tp_cd = r.fee_tp_cd));
    IF v_used >= r.stk_cnt THEN
      RAISE EXCEPTION 'STOCK_EXHAUSTED: %', r.fee_tp_cd USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_fee_ord_ins_vrf
  BEFORE INSERT ON fee_ord
  FOR EACH ROW EXECUTE FUNCTION fn_vrf_fee_ord_ins();

-- B6-2) 사이트 정지·철회·논리삭제 → 사이트 단위 주문 회수 (ACTIVE→REVOKED, 결제 대기 HELD→CANCELED). 멤버십(site_id NULL) 무영향
--   신고 인용(fn_prcs_site_rpt)·관리자 직권 정지·등록자 철회 어느 경로든 같은 트랜잭션에서 수행
CREATE OR REPLACE FUNCTION fn_rvk_site_fee_ord()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_rsn_cd VARCHAR(20);
BEGIN
  IF NEW.del_yn = 'Y' AND OLD.del_yn = 'N' THEN
    v_rsn_cd := 'SITE_DELETED';
  ELSIF NEW.site_sts_cd IS DISTINCT FROM OLD.site_sts_cd AND NEW.site_sts_cd IN ('SUSPENDED', 'WITHDRAWN') THEN
    v_rsn_cd := 'SITE_' || NEW.site_sts_cd;
  ELSE
    RETURN NULL;
  END IF;
  UPDATE fee_ord
     SET ord_sts_cd = CASE WHEN ord_sts_cd = 'HELD' THEN 'CANCELED' ELSE 'REVOKED' END,
         rvk_rsn_cd  = CASE WHEN ord_sts_cd = 'HELD' THEN NULL ELSE v_rsn_cd END,
         rvk_dtm     = CASE WHEN ord_sts_cd = 'HELD' THEN NULL ELSE CURRENT_TIMESTAMP END,
         modr_id     = NEW.modr_id
   WHERE site_id = NEW.site_id
     AND del_yn = 'N'
     AND ord_sts_cd IN ('HELD', 'ACTIVE');
  RETURN NULL;
END;
$$;
CREATE OR REPLACE TRIGGER trg_site_mst_ord_rvk
  AFTER UPDATE OF site_sts_cd, del_yn ON site_mst
  FOR EACH ROW EXECUTE FUNCTION fn_rvk_site_fee_ord();

-- B6-3) 계정 제재 → 멤버십 주문 정지 / 해제·취소 → 복귀(유예 경과분은 EXPIRED) / 취소(오인) → 0 Pi 보상 연장
CREATE OR REPLACE FUNCTION fn_chg_usr_snc_fee_ord()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_grace  INT;
  v_days   INT;
  v_bgn    TIMESTAMPTZ;
  v_upr   fee_ord;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.snc_sts_cd = 'ACTIVE' THEN
      UPDATE fee_ord o
         SET ord_sts_cd = 'SUSPENDED',
             snc_id     = NEW.snc_id,
             modr_id     = NEW.modr_id
        FROM fee_plan p
       WHERE p.fee_plan_cd = o.fee_plan_cd
         AND p.fee_tp_cd = 'MEMBERSHIP'
         AND o.ord_usr_id = NEW.tgt_usr_id
         AND o.del_yn = 'N'
         AND o.ord_sts_cd = 'ACTIVE';
    END IF;
    RETURN NULL;
  END IF;

  IF NOT (OLD.snc_sts_cd = 'ACTIVE' AND NEW.snc_sts_cd IN ('RELEASED', 'CANCELED')) THEN
    RETURN NULL;
  END IF;

  SELECT (c.cfg_val #>> '{}')::INT INTO v_grace
    FROM sys_cfg c WHERE c.cfg_key = 'GRACE_DAY' AND c.del_yn = 'N' AND c.use_yn = 'Y';
  IF v_grace IS NULL THEN
    RAISE EXCEPTION 'CFG_MISSING: GRACE_DAY' USING ERRCODE = 'P0001';
  END IF;

  -- 정지 기간에도 기간은 계속 차감(PRD §3-1) — 종료+유예가 지났으면 EXPIRED 로 복귀
  UPDATE fee_ord
     SET ord_sts_cd = CASE WHEN use_end_dtm IS NOT NULL
                             AND use_end_dtm + make_interval(days => v_grace) <= CURRENT_TIMESTAMP
                            THEN 'EXPIRED' ELSE 'ACTIVE' END,
         modr_id     = NEW.modr_id
   WHERE snc_id = NEW.snc_id
     AND del_yn = 'N'
     AND ord_sts_cd = 'SUSPENDED';

  -- 관리자 오인 취소 : 정지된 멤버십이 있었고 영구가 아니면 제재 기간(일 올림)만큼 0 Pi 보상 주문을 이어붙인다
  IF NEW.snc_sts_cd = 'CANCELED'
     AND NOT EXISTS (SELECT 1 FROM fee_ord WHERE snc_id = NEW.snc_id AND del_yn = 'N' AND use_end_dtm IS NULL) THEN
    SELECT * INTO v_upr
      FROM fee_ord
     WHERE snc_id = NEW.snc_id AND del_yn = 'N'
     ORDER BY use_end_dtm DESC
     LIMIT 1;
    IF FOUND THEN
      v_days := CEIL(EXTRACT(EPOCH FROM (NEW.rel_dtm - NEW.snc_bgn_dtm)) / 86400.0)::INT;
      SELECT MAX(o.use_end_dtm) INTO v_bgn
        FROM fee_ord o JOIN fee_plan p ON p.fee_plan_cd = o.fee_plan_cd
       WHERE p.fee_tp_cd = 'MEMBERSHIP'
         AND o.ord_usr_id = NEW.tgt_usr_id
         AND o.del_yn = 'N'
         AND o.ord_sts_cd = 'ACTIVE';
      v_bgn := GREATEST(COALESCE(v_bgn, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP);
      IF v_days > 0 THEN
        INSERT INTO fee_ord (ord_usr_id, fee_plan_cd, ord_pi_amt, nrm_pi_amt, ord_sts_cd, ord_tp_cd,
                              use_bgn_dtm, use_end_dtm, upr_ord_id, regr_id, modr_id)
        VALUES (NEW.tgt_usr_id, v_upr.fee_plan_cd, 0, 0, 'ACTIVE', 'CMPN',
                v_bgn, v_bgn + make_interval(days => v_days), v_upr.ord_id, NEW.modr_id, NEW.modr_id);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE OR REPLACE TRIGGER trg_usr_snc_ord_chg
  AFTER INSERT OR UPDATE OF snc_sts_cd ON usr_snc
  FOR EACH ROW EXECUTE FUNCTION fn_chg_usr_snc_fee_ord();

-- ------------------------------------------------------------
-- B7) site_img — 추가 이미지(2~5장, 멤버십 혜택). 대표(로고) 1장은 기존 site_mst.site_img_url 이 단일 출처
--     멤버십 만료 시 삭제 없이 비노출 — 노출 여부는 조회 시 fn_sel_mbr_actv_yn 으로 계산(저장 안 함)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_img (
  img_id        UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 이미지ID
  site_id       UUID          NOT NULL,                               -- 사이트ID → site_mst
  img_url       TEXT          NOT NULL,                               -- 이미지URL (Storage site-img/<usr>/<uuid>, 심사 대상)
  img_seq       INT           NOT NULL,                               -- 이미지순서 (2~5 — 1 은 site_mst.site_img_url)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT site_img_pkey PRIMARY KEY (img_id),
  CONSTRAINT site_img_site_mst_id_fkey FOREIGN KEY (site_id) REFERENCES site_mst (site_id),
  CONSTRAINT site_img_img_url_check CHECK (img_url ~ '^https://' AND char_length(img_url) <= 1000),
  CONSTRAINT site_img_img_seq_check CHECK (img_seq BETWEEN 2 AND 5),
  CONSTRAINT site_img_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  site_img         IS '사이트 추가 이미지(멤버십 최대 5장 중 2~5번째). 대표 이미지는 site_mst.site_img_url. 만료 시 비노출(조회 계산), 재가입 시 복원';
COMMENT ON COLUMN site_img.img_seq IS '표시 순서 2~5 — 사이트 안에서 활성 행 UNIQUE';
COMMENT ON COLUMN site_img.site_id IS 'site_mst.site_id FK — 이미지 소속 사이트';

CREATE UNIQUE INDEX IF NOT EXISTS ux_site_img_site_id_img_seq_actv
  ON site_img (site_id, img_seq)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_site_img_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_site_img_mod_dtm
  BEFORE UPDATE ON site_img
  FOR EACH ROW EXECUTE FUNCTION fn_upd_site_img_mod_dtm();

-- ------------------------------------------------------------
-- B8) fn_sel_mbr_actv_yn — 멤버십 활성 판정 단일 함수 (PRD §7)
--     ACTIVE AND (영구 OR use_end_dtm + GRACE_DAY > now). 계정 제재는 주문이 SUSPENDED 라 자동 제외
--     앱 : supabase.rpc('fn_sel_mbr_actv_yn', { p_usr_id }) → 'Y' | 'N'
--     GRACE_DAY 누락 시 CFG_MISSING 예외(트리거 B6-3 과 동일) — 기본값으로 숨기지 않는다(설정 1행 누락이 유료 회원 혜택을 조용히 박탈하지 않게)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sel_mbr_actv_yn(p_usr_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path FROM CURRENT
AS $$
DECLARE
  v_grace INT;
BEGIN
  SELECT (c.cfg_val #>> '{}')::INT INTO v_grace
    FROM sys_cfg c WHERE c.cfg_key = 'GRACE_DAY' AND c.del_yn = 'N' AND c.use_yn = 'Y';
  IF v_grace IS NULL THEN
    RAISE EXCEPTION 'CFG_MISSING: GRACE_DAY' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN EXISTS (
    SELECT 1
      FROM fee_ord o
      JOIN fee_plan p ON p.fee_plan_cd = o.fee_plan_cd
     WHERE p.fee_tp_cd = 'MEMBERSHIP'
       AND o.ord_usr_id = p_usr_id
       AND o.del_yn = 'N'
       AND o.ord_sts_cd = 'ACTIVE'
       AND o.use_bgn_dtm <= CURRENT_TIMESTAMP
       AND (o.use_end_dtm IS NULL OR o.use_end_dtm + make_interval(days => v_grace) > CURRENT_TIMESTAMP)
  ) THEN 'Y' ELSE 'N' END;
END;
$$;

-- ------------------------------------------------------------
-- 접근 통제 — RLS 비활성 + service_role 전용
-- ------------------------------------------------------------
SELECT fn_grant_svc_only('TABLE', 'sys_cfg');
SELECT fn_grant_svc_only('TABLE', 'sys_cfg_chg_hist');
SELECT fn_grant_svc_only('TABLE', 'promo_fee_cfg');
SELECT fn_grant_svc_only('TABLE', 'fee_plan');
SELECT fn_grant_svc_only('TABLE', 'fee_plan_bnd');
SELECT fn_grant_svc_only('TABLE', 'usr_snc');
SELECT fn_grant_svc_only('TABLE', 'fee_ord');
SELECT fn_grant_svc_only('TABLE', 'fee_ord_hist');
SELECT fn_grant_svc_only('TABLE', 'site_img');
SELECT fn_grant_svc_only('FUNCTION', 'fn_sel_mbr_actv_yn(uuid)');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- [A] SELECT new_sts_cd, COUNT(*) FROM site_sts_hist GROUP BY 1;                       → 기준선 APPROVED 19
-- [A] UPDATE site_mst SET site_sts_cd='PENDING' WHERE own_site_yn='N' ...;            → 이후 승인 시 vrf 없으면 23514(site_mst_vrf_yn_apv_check)
-- [A] SELECT fn_prcs_site_rpt(<rpt_id>, 'ACCEPTED', '메모', <admin id>);              → site_rpt ACCEPTED + site_mst SUSPENDED + 이력 chg_rsn_cd=RPT_ACCEPT
-- [B] SELECT fn_sel_mbr_actv_yn(<usr id>);                                            → 'N'
-- [B] SELECT COUNT(*) FROM promo_fee_cfg WHERE del_yn='N';                            → 1
