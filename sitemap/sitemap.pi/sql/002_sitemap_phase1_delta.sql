-- DA-APPROVED: 접두사 'site_' 는 sitemap.pi 001_sitemap_phase1.sql 의 DA-APPROVED(da-governance-expert, 2026-10-09)를 승계한다 — 신규 site_sts_hist·site_img 는 같은 .pi 사이트 디렉터리 주제영역. 그 외 신규 접두사 없음(usr_·fee_·promo_·sys_ 는 정본 §2-1 등재). 표준사전 01_standards_dictionary.md 01 r3(leader r4 APPROVED) 준수 (2026-10-10)
-- ============================================================
-- 002_sitemap_phase1_delta.sql — sitemap.pi Phase 1 델타(무료 MVP 보강) — 001 대비 Part A
-- 선행 : packages/pi-db/sql/000_baseline.sql(sys_user 7컬럼 개명본 — usr_id 등) → sitemap/sitemap.pi/sql/001_sitemap_phase1.sql
-- 적용 : scripts/db-migrate.mjs --app sitemap --tier <dev|stg|prod> (파일 단위 실행 — 이 파일이 자체 BEGIN/COMMIT 을 가진다. 멱등)
-- 출처 : docs/da/_workspace/20261010_sitemap-data-model/02_modeler_ddl.sql r3 의 Part A 를 그대로 추출
--        (Part B = Phase 2 결제·부가서비스, pi_pymnt 의존 → 003_sitemap_phase2.sql 로 별도. 이 파일에 넣지 않음)
-- 설계 정본 : sitemap/sitemap.pi/data-model/sitemaps-data-model.md §10 (판정 근거·REQ 추적은 02_modeler_model.md)
-- DA 승인 : docs/da/_workspace/20261010_sitemap-data-model/04_leader_final-approval_r2.md (leader APPROVED, 2026-10-10)
-- ⚠ 동시 배포 조건 : 앱 승인 API(src/app/api/admin/sites/[id]/route.ts — 승인 시 vrf_* 기록)와
--    관리자 목록 임베드 FK 힌트(src/app/api/admin/sites/route.ts — sys_user!site_mst_sys_user_id_fkey)를 같은 배포로.
--    이 파일만 적용하면 외부 사이트 승인이 site_mst_vrf_yn_apv_check(23514)에, 관리자 목록이 PGRST201 에 걸린다.
-- 원칙 : 스키마 접두 없음(search_path) · 함수 SET search_path FROM CURRENT · 신규 객체마다 fn_grant_svc_only ·
--        FK NO ACTION(ON DELETE 미지정) · 물리 DELETE 금지(논리삭제) · 코드값은 CHECK(표시명은 번역키)
-- ============================================================
--
-- Part A
--   A1 site_mst 컬럼 추가 : 이동 URL(REQ-36) · 도메인 소유 확인 결과(REQ-28)
--   A2 site_sts_hist     : 사이트 상태 변경 이력(REQ-80, 001 판정 11 번복) + 자동 기록 트리거 + 기준선 이력
--   A3 fn_prcs_site_rpt  : 신고 처리 RPC — 인용→사이트 정지를 단일 트랜잭션으로(REQ-76, 앱 보상 처리 대체)
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

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT new_sts_cd, COUNT(*) FROM site_sts_hist GROUP BY 1;                       → 기준선 APPROVED 19
-- UPDATE site_mst SET site_sts_cd='PENDING' WHERE own_site_yn='N' ...;            → 이후 승인 시 vrf 없으면 23514(site_mst_vrf_yn_apv_check)
-- SELECT fn_prcs_site_rpt(<rpt_id>, 'ACCEPTED', '메모', <admin usr_id>);           → site_rpt ACCEPTED + site_mst SUSPENDED + 이력 chg_rsn_cd=RPT_ACCEPT
