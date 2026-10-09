-- DA-APPROVED: 신규 주제영역 접두사 'site_'(.pi 사이트 디렉터리) 등재 — 등록 사이트·신고는 기존 22종 어느 주제영역에도 속하지 않음(sys_=시스템 설정·사용자, mps_=상점·상품, rpt_=cafe 범용 신고(sql/113, 대상유형 다형)). 사이트 상태 흐름·반려 사유가 디렉터리 고유이고 Phase 2~3 확장(site_rvw 등)도 같은 영역이라 신설. 일별 집계는 기존 stat_ 재사용. 승인 사유 외 R1·R3~R7 은 승인 주석 없는 사본으로 Hook 검사 통과 확인 (da-governance-expert, 2026-10-09)
-- ============================================================
-- 001_sitemap_phase1.sql — sitemap.pi Phase 1(무료 MVP) 스키마 + 우선등록 19개 시드
-- 선행 : packages/pi-db/sql/000_baseline.sql (sys_user · fn_grant_svc_only · pg_trgm)
-- 적용 : scripts/db-migrate.mjs --app sitemap.pi --tier <dev|stg|prod>
--        운영 = sitemap 전용 Supabase public / 개발·스테이징 = pi-nonprod 의 sitemap_dev·sitemap_stg
-- 요구 정본 : sitemap/sitemap.pi/docs/PRD.md §2·§4·§5·§7 · 상위 docs/PRD_28_PI_MULTISITE.md §4·§5
-- 표준 정본 : docs/da/데이터표준규칙.md
-- ============================================================
--
-- [DA 판정]
-- 1. 접두사
--    site_mst  (디렉터리 마스터) · site_rpt (신고)  → 신규 site_ 등재(상단 DA-APPROVED)
--    stat_site_dly (일자별 조회·클릭)               → 기존 stat_(일별 rollup, stat_actvty_dly 선례) 재사용
--    · cafe sys_site_mst(sql/173, 테넌트 설정)는 별개 개념이라 이름을 피했다(sys_ = 시스템 설정).
--    · 후속 조치(이 파일 밖) : 정본 §2-1 표와 da-ddl-guard PREFIX_RE 에 site_ 추가(승인 기사용 rpt_ 도 누락 상태).
-- 2. 상태 컬럼 = *_sts_cd : 정본 §9 status = sts. PRD 가칭 site_st_cd·rpt_st_cd 는 cafe 관행(_st_cd) 드리프트라 교정.
--    Phase 2 fee_ordr 도 ordr_sts_cd 로 맞출 것.
-- 3. 코드 도메인 = CHECK 제약(별도 코드 테이블 없음) :
--    카테고리 9종은 평면·고정이고 표시명은 번역키 siteCtgr.<cd>(코드 테이블에 이름을 두면 이중 관리),
--    추가 시 번역·배포가 어차피 필요. 하위 카테고리 도입 시 site_ctgr 코드 테이블 + FK 로 전환.
--    상태·반려사유·신고사유도 같은 이유로 CHECK.
-- 4. PK = UUID(site_id·rpt_id). 자연키 site_dom_nm 은 활성 부분 UNIQUE.
--    (2026-10-09 KISA 점검 WI/PV 반영 — 미적용 상태라 001 직접 수정) 점유 상태 = PENDING·APPROVED·SUSPENDED 만.
--    DRAFT 는 점유 제외 — 타인 도메인을 DRAFT 로 선점해 실소유자 등록을 막는 공격 차단. 제출 시 앱이 409·DRAFT+PENDING 5건 상한 검사.
--    도메인 변경·재등록에도 Phase 2 fee_ordr·site_rpt·stat 의 참조가 유지되도록 대리키를 쓴다.
--    PRD 가칭 site_cd 는 두지 않음 — 도메인이 이미 사람이 읽는 자연키(상세 URL 슬러그)라 코드 중복.
-- 5. 단어 : PRD 가칭 site_domain_nm → site_dom_nm (domain = dom, 정본 §9 등재어).
--    신규 표준단어 등재 대상 : SITE(사이트)·OWNR(소유자)·OWN(자사)·RJCT(반려)·RPTR(신고자)·PRCS(처리)·
--    CLCK(클릭)·CNTC(연락처)·PVT(비공개)·PUB(공개)·IMG(이미지)·VIEW(조회)·DLY(일별)·MST(마스터) — 2~4자 준수.
--    선례 등재어 재사용 : RPT·RSN·APV·CTGR·DOM·STAT·DESC.
-- 6. FK 유지(CLAUDE.md FK 정책) — PostgREST 임베디드 조인 대상 :
--    site_mst.ownr_usr_id→sys_user / site_rpt.site_id→site_mst / site_rpt.rptr_usr_id→sys_user /
--    stat_site_dly.site_id→site_mst. ON DELETE 동작 없음(물리 DELETE 금지 — NO ACTION).
-- 7. RLS 비활성 + 서버 전용 service_role (fn_grant_svc_only 로 anon·authenticated 회수).
-- 8. 스키마명 하드코딩 없음 — search_path 기준. 함수는 SET search_path FROM CURRENT 로 생성 스키마 고정.
-- 9. 인덱스 : 공개 목록 = (del_yn='N' AND site_sts_cd='APPROVED') 부분 인덱스 — 앱 쿼리가 이 두 조건을
--    그대로 걸어야 사용된다. 검색 = pg_trgm GIN(site_nm·site_dom_nm, 활성행) — .ilike 자동 가속.
--    이름순 정렬 인덱스는 생략(MVP 규모 수백 건) — 1만 건 이상이면 (site_ctgr_cd, site_nm) 추가.
-- 10. 집계 upsert 키 = PK (site_id, stat_dt[UTC 일자]). 증가는 fn_inc_stat_site_dly RPC 로만(원자적 +1).
--    조회수 합계는 앱에서 stat_site_dly.view_cnt 합산 — 사이트당 연 365행 상한. 느려지면 site_mst 누계 반정규화.
-- 11. 감사(PRD §8) : 상태 변경 이력은 별도 hist 테이블 없이 논리삭제 + modr_id/mod_dtm 으로 보존(Phase 1).
--    심사 이력 조회 요건이 생기면 site_sts_hist(append-only) 추가.
-- 12. (2026-10-09 마스터 지시 — 메인 화면 버블, 미적용 상태라 001 직접 수정)
--    site_mst.plan_cd = 요금제코드(신규 표준단어 PLAN 요금제 — fee_plan 선례 재사용, 도메인 _cd).
--    7단계 + NONE 을 CHECK 로 고정(판정 3과 같은 이유 — 표시명은 번역키 plan.<cd>). 값 = 메인 버블 크기(유료 노출).
--    Phase 1 은 시드·관리자 수기 값, **Phase 2 에서 멤버십 주문(fee_ordr) 기준으로 동기화 예정**
--    (ACTIVE 멤버십 주문의 기간 → plan_cd, 만료 시 NONE). 그때 진실 원천은 fee_ordr, 이 컬럼은 노출용 반정규화.
--    기간 증감 집계 = fn_sel_stat_site_chg(p_days) RPC — 직전 동일 기간 대비 view_cnt 합(UTC 일자), DB 에서 합산해
--    PostgREST 1,000행 상한·전송량을 피한다. 신규 표준단어 CUR(현재)·PREV(직전)·CHG(변경, sys_cfg_chg_hist 선례).
--    기간 범위 조회용 idx_stat_site_dly_stat_dt(PK 는 site_id 선두라 일자 범위 스캔 불가).
-- 13. (2026-10-09 KISA 재점검 — 도메인 재선점, 미적용 상태라 001 직접 수정) rjct_rsn_cd 에 OWNERSHIP(소유 확인 불가) 추가 — 기존 코드 값 추가뿐(새 단어 없음, 판정 3 CHECK 도메인 유지)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) site_mst — 디렉터리 마스터 (등록 사이트)
--    상태 흐름(PRD §5) : DRAFT → PENDING → APPROVED / REJECTED, APPROVED ↔ SUSPENDED, 임의 → WITHDRAWN
--    삭제는 상태와 별개로 del_yn='Y' 논리삭제만
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_mst (
  site_id       UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 사이트ID
  site_dom_nm   VARCHAR(253)  NOT NULL,                               -- 사이트도메인명 (예: cafe.pi, 소문자)
  site_nm       VARCHAR(100)  NOT NULL,                               -- 사이트명 (표시명)
  site_ctgr_cd  VARCHAR(20)   NOT NULL,                               -- 사이트카테고리코드 (9종)
  site_desc     TEXT,                                                 -- 사이트설명 (기본 500자·멤버십 2,000자 — 한도는 앱 검증)
  site_img_url  TEXT,                                                 -- 사이트이미지URL (등록자 업로드만, 심사 대상)
  site_sts_cd   VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',               -- 사이트상태코드
  rjct_rsn_cd   VARCHAR(20),                                          -- 반려사유코드 (REJECTED 시 필수)
  rjct_rsn_cont TEXT,                                                 -- 반려사유내용 (등록자 안내 문구)
  apv_dtm       TIMESTAMPTZ,                                          -- 승인일시 (일반 순위 기준 — 최초 승인 시 기록)
  ownr_usr_id   UUID,                                                 -- 소유자사용자ID → sys_user.id (자사 시드는 NULL)
  own_site_yn   CHAR(1)       NOT NULL DEFAULT 'N',                   -- 자사사이트여부 (Y = 유료 구매 상시 금지)
  plan_cd       VARCHAR(10)   NOT NULL DEFAULT 'NONE',                -- 요금제코드 (메인 버블 크기 7단계 + NONE)
  pvt_cntc_txt  TEXT,                                                 -- 비공개연락처텍스트 (심사용, 제출 시 필수 — 앱 검증)
  pub_cntc_txt  TEXT,                                                 -- 공개연락처텍스트 (옵트인, NULL = 비공개)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT site_mst_pkey PRIMARY KEY (site_id),
  CONSTRAINT site_mst_sys_user_id_fkey FOREIGN KEY (ownr_usr_id) REFERENCES sys_user (id),
  -- 단일 라벨 .pi 도메인, 소문자만 (DRAFT→PENDING 제출 검증과 동일 규칙을 DB 에서 재강제)
  CONSTRAINT site_mst_site_dom_nm_check CHECK (site_dom_nm ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.pi$'),
  CONSTRAINT site_mst_site_ctgr_cd_check CHECK (site_ctgr_cd IN
    ('COMMUNITY', 'EDU', 'SHOP', 'CONTENT', 'PERSONAL', 'EVENT', 'GAME', 'TOOL', 'ETC')),
  CONSTRAINT site_mst_site_sts_cd_check CHECK (site_sts_cd IN
    ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN')),
  -- 금지 카테고리 7종(PRD §5 고정) + OWNERSHIP(도메인 소유 확인 불가 — 같은 사용자·도메인 재제출 409) + ETC(접속 불가·정보 불충분 등 — rjct_rsn_cont 로 안내)
  CONSTRAINT site_mst_rjct_rsn_cd_check CHECK (rjct_rsn_cd IS NULL OR rjct_rsn_cd IN
    ('GAMBLING', 'NON_PI_PYMNT', 'GIFT_CARD', 'INVEST', 'ADULT', 'PII_COLLECT', 'PI_BRAND', 'OWNERSHIP', 'ETC')),
  CONSTRAINT site_mst_rjct_rsn_cd_req_check CHECK (site_sts_cd <> 'REJECTED' OR rjct_rsn_cd IS NOT NULL),
  CONSTRAINT site_mst_apv_dtm_check CHECK (site_sts_cd NOT IN ('APPROVED', 'SUSPENDED') OR apv_dtm IS NOT NULL),
  -- 소유자 없는 행은 자사 사이트만 허용 (외부 등록은 항상 로그인 사용자 소유)
  CONSTRAINT site_mst_ownr_usr_id_check CHECK (ownr_usr_id IS NOT NULL OR own_site_yn = 'Y'),
  CONSTRAINT site_mst_site_desc_check CHECK (site_desc IS NULL OR char_length(site_desc) <= 2000),
  CONSTRAINT site_mst_own_site_yn_check CHECK (own_site_yn IN ('Y', 'N')),
  -- 큰 순서 : VIP(영구) > PRM3(10년) > PRM2(5년) > PRM1(2년) > BSC3(12개월) > BSC2(6개월) > BSC1(1개월) > NONE(무료)
  CONSTRAINT site_mst_plan_cd_check CHECK (plan_cd IN
    ('VIP', 'PRM3', 'PRM2', 'PRM1', 'BSC3', 'BSC2', 'BSC1', 'NONE')),
  CONSTRAINT site_mst_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);

COMMENT ON TABLE  site_mst              IS '.pi 사이트 디렉터리 마스터 — 등록·심사·노출 단위. 물리 DELETE 금지';
COMMENT ON COLUMN site_mst.site_dom_nm  IS '사이트 도메인(자연키) — PENDING·APPROVED·SUSPENDED 활성 행 사이에서 UNIQUE(DRAFT 미점유). 상세 URL 슬러그';
COMMENT ON COLUMN site_mst.site_ctgr_cd IS 'COMMUNITY·EDU·SHOP·CONTENT·PERSONAL·EVENT·GAME·TOOL·ETC — 표시명은 번역키 siteCtgr.<cd>';
COMMENT ON COLUMN site_mst.site_sts_cd  IS 'DRAFT 작성중·PENDING 심사대기·APPROVED 노출·REJECTED 반려·SUSPENDED 정지·WITHDRAWN 철회';
COMMENT ON COLUMN site_mst.rjct_rsn_cd  IS 'GAMBLING·NON_PI_PYMNT·GIFT_CARD·INVEST·ADULT·PII_COLLECT·PI_BRAND·OWNERSHIP·ETC — OWNERSHIP 반려 (사용자,도메인)은 재제출 불가(앱 409)';
COMMENT ON COLUMN site_mst.apv_dtm      IS '최초 승인일시 — 일반 순위 기본 정렬(역순). 결제 이력은 순위에 반영하지 않음';
COMMENT ON COLUMN site_mst.ownr_usr_id  IS 'sys_user.id — 등록자. 자사 시드(own_site_yn=Y)만 NULL 허용, 운영자 계정 생성 후 귀속';
COMMENT ON COLUMN site_mst.own_site_yn  IS '자사 사이트 여부 — Y 이면 부가서비스 구매 상시 금지(PRD §3)';
COMMENT ON COLUMN site_mst.plan_cd      IS 'VIP·PRM3·PRM2·PRM1·BSC3·BSC2·BSC1·NONE — 메인 버블 크기(유료 노출, 광고 라벨 필수). 표시명은 번역키 plan.<cd>. Phase 2 에서 멤버십 주문(fee_ordr) 기준으로 동기화 예정';
COMMENT ON COLUMN site_mst.pvt_cntc_txt IS '심사용 연락처 — 비공개(공개 API 응답에서 제외 필수)';
COMMENT ON COLUMN site_mst.pub_cntc_txt IS '공개 연락처 — 등록자 옵트인 시에만 값 존재';

-- 도메인 유일성 : 심사 대기·노출·정지(PENDING·APPROVED·SUSPENDED)만 점유. DRAFT·반려·철회·논리삭제 행은 제외
--   (DRAFT 선점으로 실소유자 등록을 막지 못하게 — 같은 도메인 DRAFT 는 여러 건 허용, 제출 시 하나만 통과)
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_mst_site_dom_nm_actv
  ON site_mst (site_dom_nm)
  WHERE del_yn = 'N' AND site_sts_cd IN ('PENDING', 'APPROVED', 'SUSPENDED');

-- 공개 목록(홈 최신 등록) — 승인일 역순 페이지네이션
CREATE INDEX IF NOT EXISTS idx_site_mst_apv_dtm
  ON site_mst (apv_dtm DESC, site_id)
  WHERE del_yn = 'N' AND site_sts_cd = 'APPROVED';

-- 카테고리 목록 — 카테고리별 승인일 역순 페이지네이션
CREATE INDEX IF NOT EXISTS idx_site_mst_site_ctgr_cd
  ON site_mst (site_ctgr_cd, apv_dtm DESC, site_id)
  WHERE del_yn = 'N' AND site_sts_cd = 'APPROVED';

-- 관리자 심사 대기열(상태별 접수순) — 공개 목록과 달리 전 상태 대상
CREATE INDEX IF NOT EXISTS idx_site_mst_site_sts_cd
  ON site_mst (site_sts_cd, reg_dtm)
  WHERE del_yn = 'N';

-- 내 사이트 + FK 컬럼 인덱스
CREATE INDEX IF NOT EXISTS idx_site_mst_ownr_usr_id
  ON site_mst (ownr_usr_id)
  WHERE del_yn = 'N';

-- 검색(부분일치) — pg_trgm GIN, opclass 스키마는 설치 위치에서 조회(스키마 비의존)
DO $$
DECLARE
  v_trgm_schema TEXT;
BEGIN
  SELECT n.nspname INTO v_trgm_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';
  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm 미설치 — packages/pi-db/sql/000_baseline.sql 을 먼저 적용하세요';
  END IF;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_site_mst_site_nm_trgm ON site_mst USING gin (site_nm %I.gin_trgm_ops) WHERE del_yn = %L',
    v_trgm_schema, 'N');
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_site_mst_site_dom_nm_trgm ON site_mst USING gin (site_dom_nm %I.gin_trgm_ops) WHERE del_yn = %L',
    v_trgm_schema, 'N');
END;
$$;

CREATE OR REPLACE FUNCTION fn_upd_site_mst_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_site_mst_mod_dtm
  BEFORE UPDATE ON site_mst
  FOR EACH ROW EXECUTE FUNCTION fn_upd_site_mst_mod_dtm();

-- ------------------------------------------------------------
-- 2) site_rpt — 사이트 신고
--    상태 흐름(PRD §5) : RECEIVED → ACCEPTED(사이트 SUSPENDED 동반) / DISMISSED
--    처리자는 modr_id, 처리 시각은 prcs_dtm
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_rpt (
  rpt_id        UUID          NOT NULL DEFAULT gen_random_uuid(),     -- 신고ID
  site_id       UUID          NOT NULL,                               -- 사이트ID → site_mst
  rptr_usr_id   UUID          NOT NULL,                               -- 신고자사용자ID → sys_user.id (로그인 필수)
  rpt_rsn_cd    VARCHAR(20)   NOT NULL,                               -- 신고사유코드
  rpt_cont      TEXT,                                                 -- 신고내용 (상세 설명, 1,000자)
  rpt_sts_cd    VARCHAR(20)   NOT NULL DEFAULT 'RECEIVED',            -- 신고상태코드
  prcs_dtm      TIMESTAMPTZ,                                          -- 처리일시
  prcs_cont     TEXT,                                                 -- 처리내용 (관리자 메모)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT site_rpt_pkey PRIMARY KEY (rpt_id),
  CONSTRAINT site_rpt_site_mst_id_fkey FOREIGN KEY (site_id) REFERENCES site_mst (site_id),
  CONSTRAINT site_rpt_sys_user_id_fkey FOREIGN KEY (rptr_usr_id) REFERENCES sys_user (id),
  -- 금지 카테고리 7종 + FRAUD(사기)·BROKEN(접속 불가)·ETC [확인중 : legal-compliance-advisor]
  CONSTRAINT site_rpt_rpt_rsn_cd_check CHECK (rpt_rsn_cd IN
    ('GAMBLING', 'NON_PI_PYMNT', 'GIFT_CARD', 'INVEST', 'ADULT', 'PII_COLLECT', 'PI_BRAND',
     'FRAUD', 'BROKEN', 'ETC')),
  CONSTRAINT site_rpt_rpt_sts_cd_check CHECK (rpt_sts_cd IN ('RECEIVED', 'ACCEPTED', 'DISMISSED')),
  CONSTRAINT site_rpt_prcs_dtm_check CHECK (rpt_sts_cd = 'RECEIVED' OR prcs_dtm IS NOT NULL),
  CONSTRAINT site_rpt_rpt_cont_check CHECK (rpt_cont IS NULL OR char_length(rpt_cont) <= 1000),
  CONSTRAINT site_rpt_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);

COMMENT ON TABLE  site_rpt            IS '사이트 신고 — 접수·처리 추적. 인용(ACCEPTED) 시 site_mst.site_sts_cd=SUSPENDED 를 같은 트랜잭션에서 처리';
COMMENT ON COLUMN site_rpt.rpt_sts_cd IS 'RECEIVED 접수 · ACCEPTED 인용(사이트 정지) · DISMISSED 기각';
COMMENT ON COLUMN site_rpt.rpt_rsn_cd IS 'GAMBLING·NON_PI_PYMNT·GIFT_CARD·INVEST·ADULT·PII_COLLECT·PI_BRAND·FRAUD·BROKEN·ETC';

-- 중복 신고 방지 : 같은 사용자의 같은 사이트 미처리 신고는 1건 (site_id 선두 → 사이트별 신고 조회 겸용)
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_rpt_site_id_rptr_actv
  ON site_rpt (site_id, rptr_usr_id)
  WHERE del_yn = 'N' AND rpt_sts_cd = 'RECEIVED';

-- 관리자 신고 처리 대기열
CREATE INDEX IF NOT EXISTS idx_site_rpt_rpt_sts_cd
  ON site_rpt (rpt_sts_cd, reg_dtm)
  WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_site_rpt_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_site_rpt_mod_dtm
  BEFORE UPDATE ON site_rpt
  FOR EACH ROW EXECUTE FUNCTION fn_upd_site_rpt_mod_dtm();

-- ------------------------------------------------------------
-- 3) stat_site_dly — 사이트 일자별 조회·클릭 집계 (Phase 1 합계 / Phase 2 STATS 리포트)
--    upsert 키 = PK (site_id, stat_dt) · stat_dt = UTC 일자
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stat_site_dly (
  site_id       UUID          NOT NULL,                               -- 사이트ID → site_mst
  stat_dt       DATE          NOT NULL,                               -- 통계일자 (UTC)
  view_cnt      INT           NOT NULL DEFAULT 0,                     -- 조회건수 (상세 페이지 조회)
  clck_cnt      INT           NOT NULL DEFAULT 0,                     -- 클릭건수 ("사이트 방문" 이동 안내 확인)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                   -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                          -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',               -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- 변경일시
  CONSTRAINT stat_site_dly_pkey PRIMARY KEY (site_id, stat_dt),
  CONSTRAINT stat_site_dly_site_mst_id_fkey FOREIGN KEY (site_id) REFERENCES site_mst (site_id),
  CONSTRAINT stat_site_dly_view_cnt_check CHECK (view_cnt >= 0),
  CONSTRAINT stat_site_dly_clck_cnt_check CHECK (clck_cnt >= 0),
  CONSTRAINT stat_site_dly_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);

COMMENT ON TABLE  stat_site_dly          IS '사이트 일자별 조회·클릭 rollup — 증가는 fn_inc_stat_site_dly 로만(원자적 upsert)';
COMMENT ON COLUMN stat_site_dly.stat_dt  IS 'UTC 기준 일자';
COMMENT ON COLUMN stat_site_dly.clck_cnt IS '"사이트 방문" 클릭(외부 이동 안내 확인) 건수';

CREATE OR REPLACE FUNCTION fn_upd_stat_site_dly_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_stat_site_dly_mod_dtm
  BEFORE UPDATE ON stat_site_dly
  FOR EACH ROW EXECUTE FUNCTION fn_upd_stat_site_dly_mod_dtm();

-- 원자적 증가 RPC — 앱 : supabase.rpc('fn_inc_stat_site_dly', { p_site_id, p_cnt_tp_cd: 'VIEW' | 'CLCK' })
-- 봇·새로고침 중복 집계 방지(레이트 리밋·세션 1회)는 앱 계층 책임
CREATE OR REPLACE FUNCTION fn_inc_stat_site_dly(p_site_id UUID, p_cnt_tp_cd TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF p_cnt_tp_cd NOT IN ('VIEW', 'CLCK') THEN
    RAISE EXCEPTION 'fn_inc_stat_site_dly: p_cnt_tp_cd 는 VIEW 또는 CLCK (입력값 %)', p_cnt_tp_cd;
  END IF;
  INSERT INTO stat_site_dly AS s (site_id, stat_dt, view_cnt, clck_cnt, regr_id, modr_id)
  VALUES (
    p_site_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE,
    CASE WHEN p_cnt_tp_cd = 'VIEW' THEN 1 ELSE 0 END,
    CASE WHEN p_cnt_tp_cd = 'CLCK' THEN 1 ELSE 0 END,
    'SYSTEM',
    'SYSTEM'
  )
  ON CONFLICT (site_id, stat_dt) DO UPDATE
    SET view_cnt = s.view_cnt + EXCLUDED.view_cnt,
        clck_cnt = s.clck_cnt + EXCLUDED.clck_cnt,
        modr_id  = 'SYSTEM';
END;
$$;

-- 기간 범위(최근 2×N일) 집계용 — PK(site_id, stat_dt)는 일자 범위 스캔에 쓰이지 않는다
CREATE INDEX IF NOT EXISTS idx_stat_site_dly_stat_dt
  ON stat_site_dly (stat_dt)
  WHERE del_yn = 'N';

-- 메인 버블 증감 RPC — 앱 : supabase.rpc('fn_sel_stat_site_chg', { p_days: 1 | 7 | 30 })
--   cur_view_cnt = 최근 p_days 일(오늘 UTC 포함) 조회 합, prev_view_cnt = 그 직전 p_days 일 조회 합. 통계 없는 사이트는 행 없음
CREATE OR REPLACE FUNCTION fn_sel_stat_site_chg(p_days INT)
RETURNS TABLE (site_id UUID, cur_view_cnt BIGINT, prev_view_cnt BIGINT)
LANGUAGE sql
STABLE
SET search_path FROM CURRENT
AS $$
  SELECT s.site_id,
         COALESCE(SUM(s.view_cnt) FILTER (WHERE s.stat_dt >  d.today - p_days), 0),
         COALESCE(SUM(s.view_cnt) FILTER (WHERE s.stat_dt <= d.today - p_days), 0)
    FROM stat_site_dly s
   CROSS JOIN (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE AS today) d
   WHERE s.del_yn = 'N'
     AND s.stat_dt > d.today - 2 * p_days
   GROUP BY s.site_id;
$$;

-- ------------------------------------------------------------
-- 4) 접근 통제 — RLS 비활성 + service_role 전용
-- ------------------------------------------------------------
SELECT fn_grant_svc_only('TABLE', 'site_mst');
SELECT fn_grant_svc_only('TABLE', 'site_rpt');
SELECT fn_grant_svc_only('TABLE', 'stat_site_dly');
SELECT fn_grant_svc_only('FUNCTION', 'fn_inc_stat_site_dly(uuid, text)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_sel_stat_site_chg(integer)');

-- ------------------------------------------------------------
-- 5) 시드 — 우선등록 19개 자사 사이트 (PRD §2 표 그대로, own_site_yn='Y', ownr_usr_id NULL)
--    ⚠ 마스터 지시 2026-10-09 : 메인 버블에 19개 전부 노출 → 보류 4개도 APPROVED. **등재 제출 전 재검토**
--      gifticon(상품권·현금등가물) · omok(도박 — 상금 0 확인 전) · yoda(제3자 상표) · fondation("기부" 어휘·팁 프레임)
--      — 원래 판정은 PENDING 보류였음(sitemap/sites.json hold 사유 유지). 등재 심사 전 다시 PENDING/반려 여부 결정
--    요금제(plan_cd) 배정 — 마스터 확정 2026-10-09, Phase 2 에서 fee_ordr 기준 동기화 예정(판정 12)
--      VIP(영구) sitemap·cafe / PRM3(10년) seminar·gifticon / PRM2(5년) barista·was·webserver /
--      PRM1(2년) lan·schema·dbms·expedition / BSC3(12개월) bluemountain·fondation·teamkorea /
--      BSC2(6개월) yea·omok / BSC1(1개월) anakin·yoda·youngrok
--    사이트명 : PRD 표의 식별자 그대로(cafe 만 공식 브랜드 표기 PyCafé™) — 표시명·설명은 관리 화면에서 보완
--    멱등 : 같은 도메인의 활성 행이 있으면 건너뜀(상태가 바뀐 뒤 재실행해도 덮어쓰지 않음)
--    소유 귀속 : 운영자(ADMIN) sys_user 가 첫 로그인으로 생성된 뒤
--      UPDATE site_mst SET ownr_usr_id = <admin id>, modr_id = 'ADMIN' WHERE own_site_yn = 'Y' AND ownr_usr_id IS NULL;
-- ------------------------------------------------------------
INSERT INTO site_mst (site_dom_nm, site_nm, site_ctgr_cd, site_sts_cd, plan_cd, apv_dtm, own_site_yn)
SELECT v.site_dom_nm, v.site_nm, v.site_ctgr_cd, v.site_sts_cd, v.plan_cd,
       CASE WHEN v.site_sts_cd = 'APPROVED' THEN CURRENT_TIMESTAMP END,
       'Y'
  FROM (VALUES
    ('cafe.pi',         'PyCafé™',      'COMMUNITY', 'APPROVED', 'VIP'),
    ('teamkorea.pi',    'teamkorea',    'COMMUNITY', 'APPROVED', 'BSC3'),
    ('expedition.pi',   'expedition',   'COMMUNITY', 'APPROVED', 'PRM1'),
    ('seminar.pi',      'seminar',      'COMMUNITY', 'APPROVED', 'PRM3'),
    ('lan.pi',          'lan',          'EDU',       'APPROVED', 'PRM1'),
    ('dbms.pi',         'dbms',         'EDU',       'APPROVED', 'PRM1'),
    ('schema.pi',       'schema',       'EDU',       'APPROVED', 'PRM1'),
    ('webserver.pi',    'webserver',    'EDU',       'APPROVED', 'PRM2'),
    ('was.pi',          'was',          'EDU',       'APPROVED', 'PRM2'),
    ('barista.pi',      'barista',      'SHOP',      'APPROVED', 'PRM2'),
    ('bluemountain.pi', 'bluemountain', 'SHOP',      'APPROVED', 'BSC3'),
    ('gifticon.pi',     'gifticon',     'SHOP',      'APPROVED', 'PRM3'),
    ('fondation.pi',    'fondation',    'CONTENT',   'APPROVED', 'BSC3'),
    ('yoda.pi',         'yoda',         'CONTENT',   'APPROVED', 'BSC1'),
    ('anakin.pi',       'anakin',       'PERSONAL',  'APPROVED', 'BSC1'),
    ('youngrok.pi',     'youngrok',     'PERSONAL',  'APPROVED', 'BSC1'),
    ('yea.pi',          'yea',          'EVENT',     'APPROVED', 'BSC2'),
    ('omok.pi',         'omok',         'GAME',      'APPROVED', 'BSC2'),
    ('sitemap.pi',      'sitemap',      'TOOL',      'APPROVED', 'VIP')
  ) AS v (site_dom_nm, site_nm, site_ctgr_cd, site_sts_cd, plan_cd)
 WHERE NOT EXISTS (
   SELECT 1 FROM site_mst m WHERE m.site_dom_nm = v.site_dom_nm AND m.del_yn = 'N'
 );

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT site_sts_cd, COUNT(*) FROM site_mst WHERE own_site_yn = 'Y' AND del_yn = 'N' GROUP BY site_sts_cd;
--   → APPROVED 19 (마스터 지시 2026-10-09 전부 노출)
-- SELECT plan_cd, COUNT(*) FROM site_mst WHERE del_yn = 'N' GROUP BY plan_cd;
--   → VIP 2·PRM3 2·PRM2 3·PRM1 4·BSC3 3·BSC2 2·BSC1 3
-- SELECT * FROM fn_sel_stat_site_chg(7);                                          -- 최근 7일 vs 직전 7일
-- SELECT site_ctgr_cd, COUNT(*) FROM site_mst WHERE del_yn = 'N' GROUP BY site_ctgr_cd ORDER BY 1;
--   → COMMUNITY 4·CONTENT 2·EDU 5·EVENT 1·GAME 1·PERSONAL 2·SHOP 3·TOOL 1
-- SELECT fn_inc_stat_site_dly(site_id, 'VIEW') FROM site_mst WHERE site_dom_nm = 'sitemap.pi';
-- SELECT * FROM stat_site_dly;                                                    -- view_cnt 1
-- EXPLAIN SELECT site_id FROM site_mst WHERE del_yn = 'N' AND site_nm ILIKE '%cafe%';  -- 소량 데이터에선 Seq Scan 정상
