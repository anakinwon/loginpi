-- 012_sitemap_site_use_sts.sql — 심사 폐지·사용료 전환 : 신청 상태(APPLYING·PAID·IN_USE·USED·EXPIRED·REJECTED) + 사용기간 + 운영 설정 (마스터 확정 2026-10-13 "권장대로", 정본 docs/PRD_USAGE_FEE_STATE.md v0.2c)
-- DA-APPROVED: 마스터 확정 2026-10-13(PRD_USAGE_FEE_STATE v0.2c) 심사 폐지·사용료 전환 — da-governance-expert 리뷰 승인(2026-10-13, P1 2건 반영 조건). sys_cfg 신규(sys_ 접두사·CFG·KEY·VAL 기등재, cfg_key TEXT·cfg_val JSONB), site_mst 컬럼 3(aply_dtm — 신규 표준단어 APLY=신청 등재, APL 은 적용(W10) 선점이라 동음이의 회피 4자 예외 / use_bgn_dtm·use_end_dtm — BGN·END 기등재), site_sts_cd 9종·rjct_rsn_cd PAY_TIMEOUT CHECK 교체, 점유·노출 인덱스 술어 교체, RPC fn_cmpl_site_reg_pymnt 재정의·fn_bgn_site_use 신규·fn_prcs_site_rpt 상태 리터럴 정정, site_sts_hist 트리거 스냅샷 확장, fee_plan 0 Pi 금지 (2026-10-13)
-- 선행 : 011. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
--  ⚠ prod 는 코드 승격과 한 창에서 적용(이행~승격 사이 공개 필터 0건·등록 경로 실패 — PRD_USAGE_FEE_STATE §9 P8). 운영 CRON_SECRET 은 이행 뒤 PAID 탭 검토 후 등록
--  ⚠ 이행 전 기록 : SELECT site_sts_cd, own_site_yn, count(*) FROM site_mst GROUP BY 1,2 (이력 기대 건수 = PENDING + APPROVED 건수)
-- 순서 : ① sys_cfg → ② site_mst 컬럼 → ③ hist CHECK 신·구 합집합(과거 행 보존) → ④ site_mst 제약·인덱스 해제 → ⑤ 사전 가드 + 코드 치환(del_yn 무관 전행)
--        → ⑥ 새 CHECK → ⑦ 인덱스 → ⑧ RPC 3 → ⑨ hist 트리거 스냅샷 확장 → ⑩ pi_pymnt 부분 인덱스 → ⑪ 표시명 개명. 트리거 trg_site_mst_sts_hist 가 이행 전이를 chgr_id=SYSTEM 으로 자동 기록
-- 상태 : DRAFT 작성중 · APPLYING 신청중 · PAID 결제완료 · IN_USE 사용중(유일한 공개 노출) · USED 사용완료(직전 신청인 재등록 창) · EXPIRED 사용종료(=신청가능, 점유 해제) · REJECTED 반려됨 · SUSPENDED 정지 · WITHDRAWN 철회
-- 자사 시드 규칙 : own_site_yn='Y' INSERT 는 site_sts_cd='IN_USE' 와 함께 aply_dtm·apv_dtm·use_bgn_dtm 을 CURRENT_TIMESTAMP 로 채울 것(⑥ CHECK). use_end_dtm 은 NULL(영구)
-- 롤백(참고, 별도 검증 전 실행 금지) — 순서 엄수, 한 트랜잭션 :
--  ① DROP CONSTRAINT site_mst_site_sts_cd_check·site_mst_aply_dtm_check·site_mst_apv_dtm_check·site_mst_use_bgn_dtm_check·site_mst_use_end_dtm_check·site_mst_rjct_rsn_cd_check
--     + DROP INDEX ux_site_mst_site_dom_nm_actv·idx_site_mst_apv_dtm·idx_site_mst_site_ctgr_cd·idx_site_mst_use_end_dtm
--  ② UPDATE site_mst SET site_sts_cd = CASE site_sts_cd WHEN 'APPLYING' THEN 'PENDING' WHEN 'PAID' THEN 'PENDING' WHEN 'IN_USE' THEN 'APPROVED' WHEN 'USED' THEN 'APPROVED' WHEN 'EXPIRED' THEN 'WITHDRAWN' ELSE site_sts_cd END,
--       rjct_rsn_cd = CASE WHEN rjct_rsn_cd = 'PAY_TIMEOUT' THEN 'ETC' ELSE rjct_rsn_cd END, modr_id = 'SYSTEM'
--     WHERE site_sts_cd IN ('APPLYING','PAID','IN_USE','USED','EXPIRED') OR rjct_rsn_cd = 'PAY_TIMEOUT';
--  ③ 001 의 site_sts_cd·apv_dtm·rjct_rsn_cd CHECK 와 인덱스 3종 재생성(site_mst_vrf_yn_apv_check 는 제외 — 소유 미확인 행 위반)
--  ④ 005 판 fn_cmpl_site_reg_pymnt·002 판 fn_prcs_site_rpt·002 판 fn_ins_site_sts_hist 재생성, DROP FUNCTION fn_bgn_site_use(uuid, text),
--     fee_plan_pi_amt_check 를 (pi_amt >= 0) 로. site_sts_hist CHECK 는 합집합 유지(롤백 이력 행 수용). sys_cfg·추가 컬럼은 남겨도 무해
BEGIN;

-- ------------------------------------------------------------
-- 1. sys_cfg — 운영 설정 키-값 (PRD §7 '운영 설정 단일 출처, 코드 상수 금지'. 사전 승인형 : cfg_key TEXT UPPER_SNAKE · cfg_val JSONB)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_cfg (
  cfg_key   TEXT          NOT NULL,                                   -- 설정키 (UPPER_SNAKE, 예: SITE_PAY_TIMEOUT_HOUR)
  cfg_val   JSONB         NOT NULL,                                   -- 설정값 (시간 단위 값은 hour 숫자, 소수 허용)
  cfg_desc  TEXT,                                                     -- 설정설명
  del_yn    CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm   TIMESTAMPTZ,                                              -- 삭제일시
  regr_id   TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sys_cfg_pkey PRIMARY KEY (cfg_key),
  CONSTRAINT sys_cfg_cfg_key_check CHECK (cfg_key ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT sys_cfg_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE sys_cfg IS '운영 설정 키-값 — 관리자 화면(/api/admin/cfg)에서 변경. 크론·안내 문구가 회차마다 읽는다. 앱은 Number(cfg_val) 로 읽음. 변경 감사(sys_cfg_chg_hist)는 P4 에서';

CREATE OR REPLACE FUNCTION fn_upd_sys_cfg_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sys_cfg_mod_dtm ON sys_cfg;
CREATE TRIGGER trg_sys_cfg_mod_dtm BEFORE UPDATE ON sys_cfg
  FOR EACH ROW EXECUTE FUNCTION fn_upd_sys_cfg_mod_dtm();

INSERT INTO sys_cfg (cfg_key, cfg_val, cfg_desc) VALUES
  ('SITE_PAY_TIMEOUT_HOUR',   '1'::jsonb,  '신청중(APPLYING) 결제를 시작하지 않으면 자동 반려까지 시간'),
  ('SITE_USE_BGN_DELAY_HOUR', '1'::jsonb,  '결제완료(PAID) → 사용중(IN_USE) 자동 전이 지연 시간(관리자 "사용 시작"으로 앞당김 가능)'),
  ('SITE_REAPLY_WINDOW_HOUR', '12'::jsonb, '사용완료(USED) 후 직전 신청인 재등록 우선 창 시간')
ON CONFLICT (cfg_key) DO NOTHING;
SELECT fn_grant_svc_only('TABLE', 'sys_cfg');

-- ------------------------------------------------------------
-- 2. site_mst 컬럼
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS aply_dtm    TIMESTAMPTZ;   -- 신청일시 (APPLYING 진입, 미결제 타이머 기준)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS use_bgn_dtm TIMESTAMPTZ;   -- 사용시작일시
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS use_end_dtm TIMESTAMPTZ;   -- 사용종료일시 (NULL = 자사 영구)
COMMENT ON COLUMN site_mst.aply_dtm     IS '신청일시 — APPLYING 진입 시각. 수정해도 리셋하지 않음(미결제 타이머 기준)';
COMMENT ON COLUMN site_mst.use_bgn_dtm  IS '사용시작일시 — fn_bgn_site_use 가 기록';
COMMENT ON COLUMN site_mst.use_end_dtm  IS '사용종료일시 — use_bgn_dtm + fee_plan.use_mon_cnt 개월. NULL = 자사(own_site_yn=Y) 영구';
COMMENT ON COLUMN site_mst.site_sts_cd  IS 'DRAFT 작성중·APPLYING 신청중·PAID 결제완료·IN_USE 사용중(공개)·USED 사용완료(재등록 창)·EXPIRED 사용종료(신청가능)·REJECTED 반려됨·SUSPENDED 정지·WITHDRAWN 철회';
COMMENT ON COLUMN site_mst.apv_dtm      IS '최초 노출 개시일시(구 승인일시, 의미 변경 2026-10-13) — IN_USE 최초 진입 시 기록, 일반 순위 기본 정렬';
COMMENT ON COLUMN site_mst.pymnt_id     IS '사용료 결제ID — fn_cmpl_site_reg_pymnt 만 기록(APPLYING→PAID)';
COMMENT ON COLUMN site_mst.pvt_cntc_txt IS '운영 연락처 — 비공개(공개 API 응답 제외 필수)';
COMMENT ON COLUMN site_sts_hist.chg_rsn_cont IS '반려·정지 안내 문구 / PAID→IN_USE 전이 시 pymnt_id·사용기간 스냅샷';

-- ------------------------------------------------------------
-- 3. 이력 CHECK — 신·구 합집합 (append-only, 과거 PENDING·APPROVED 행 재작성 금지)
-- ------------------------------------------------------------
ALTER TABLE site_sts_hist DROP CONSTRAINT IF EXISTS site_sts_hist_old_sts_cd_check;
ALTER TABLE site_sts_hist ADD  CONSTRAINT site_sts_hist_old_sts_cd_check CHECK (old_sts_cd IS NULL OR old_sts_cd IN
  ('DRAFT','APPLYING','PAID','IN_USE','USED','EXPIRED','REJECTED','SUSPENDED','WITHDRAWN','PENDING','APPROVED'));
ALTER TABLE site_sts_hist DROP CONSTRAINT IF EXISTS site_sts_hist_new_sts_cd_check;
ALTER TABLE site_sts_hist ADD  CONSTRAINT site_sts_hist_new_sts_cd_check CHECK (new_sts_cd IN
  ('DRAFT','APPLYING','PAID','IN_USE','USED','EXPIRED','REJECTED','SUSPENDED','WITHDRAWN','PENDING','APPROVED'));
ALTER TABLE site_sts_hist DROP CONSTRAINT IF EXISTS site_sts_hist_chg_rsn_cd_check;
ALTER TABLE site_sts_hist ADD  CONSTRAINT site_sts_hist_chg_rsn_cd_check CHECK (chg_rsn_cd IS NULL OR chg_rsn_cd IN
  ('GAMBLING','NON_PI_PYMNT','GIFT_CARD','INVEST','ADULT','PII_COLLECT','PI_BRAND','OWNERSHIP','ETC','PAY_TIMEOUT','RPT_ACCEPT'));

-- ------------------------------------------------------------
-- 4. site_mst 제약·인덱스 해제 (심사 폐지 : 소유 확인 CHECK 제거 — 토큰·vrf_* 는 선택 배지용 유지). 재실행 멱등을 위해 신규 제약도 DROP
-- ------------------------------------------------------------
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_site_sts_cd_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_apv_dtm_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_vrf_yn_apv_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_rjct_rsn_cd_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_aply_dtm_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_use_bgn_dtm_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_use_end_dtm_check;
DROP INDEX IF EXISTS ux_site_mst_site_dom_nm_actv;
DROP INDEX IF EXISTS idx_site_mst_apv_dtm;
DROP INDEX IF EXISTS idx_site_mst_site_ctgr_cd;

-- ------------------------------------------------------------
-- 5. 사전 가드 + 데이터 이행 (del_yn 무관 전행 — 새 CHECK 위반 방지)
-- ------------------------------------------------------------
DO $$
DECLARE v_no_term INTEGER; v_own_pend INTEGER;
BEGIN
  SELECT count(*) INTO v_no_term FROM site_mst m
   WHERE m.site_sts_cd IN ('APPROVED', 'SUSPENDED') AND m.own_site_yn = 'N'
     AND NOT EXISTS (SELECT 1 FROM fee_plan f WHERE f.fee_tp_cd = 'REGISTER' AND f.plan_cd = m.plan_cd
                       AND f.del_yn = 'N' AND f.use_mon_cnt IS NOT NULL);
  SELECT count(*) INTO v_own_pend FROM site_mst WHERE site_sts_cd = 'PENDING' AND own_site_yn = 'Y';
  IF v_no_term > 0 OR v_own_pend > 0 THEN
    RAISE EXCEPTION '012 이행 중단: 기간 없는 외부 노출·정지 % 건, 자사 PENDING % 건 — 수동 정리 후 재실행', v_no_term, v_own_pend;
  END IF;
END $$;

UPDATE site_mst SET site_sts_cd = 'APPLYING', aply_dtm = CURRENT_TIMESTAMP, modr_id = 'SYSTEM'
 WHERE site_sts_cd = 'PENDING' AND pymnt_id IS NULL;                     -- 이행 시각부터 설정값(1h) 유예
UPDATE site_mst SET site_sts_cd = 'PAID', aply_dtm = COALESCE(pay_dtm, reg_dtm), modr_id = 'SYSTEM'
 WHERE site_sts_cd = 'PENDING' AND pymnt_id IS NOT NULL;                 -- 첫 크론(운영 CRON_SECRET 등록 뒤)에서 IN_USE
UPDATE site_mst m
   SET site_sts_cd = CASE WHEN m.site_sts_cd = 'APPROVED' THEN 'IN_USE' ELSE m.site_sts_cd END,
       aply_dtm    = COALESCE(m.aply_dtm, m.pay_dtm, m.apv_dtm, m.reg_dtm),
       use_bgn_dtm = COALESCE(m.apv_dtm, m.pay_dtm, m.reg_dtm),
       use_end_dtm = CASE WHEN m.own_site_yn = 'Y' THEN NULL ELSE (
                       SELECT COALESCE(m.apv_dtm, m.pay_dtm, m.reg_dtm) + make_interval(months => f.use_mon_cnt)
                         FROM fee_plan f WHERE f.fee_tp_cd = 'REGISTER' AND f.plan_cd = m.plan_cd AND f.del_yn = 'N') END,
       modr_id     = 'SYSTEM'
 WHERE m.site_sts_cd IN ('APPROVED', 'SUSPENDED') AND m.use_bgn_dtm IS NULL;   -- 재실행 시 이미 계산된 기간은 덮지 않음

-- ------------------------------------------------------------
-- 6. 새 CHECK — 외부 사이트 IN_USE 이후 상태는 use_end_dtm 필수(요금제 결측·0 Pi 로 영구 무료 노출 차단)
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD CONSTRAINT site_mst_site_sts_cd_check CHECK (site_sts_cd IN
  ('DRAFT','APPLYING','PAID','IN_USE','USED','EXPIRED','REJECTED','SUSPENDED','WITHDRAWN'));
ALTER TABLE site_mst ADD CONSTRAINT site_mst_rjct_rsn_cd_check CHECK (rjct_rsn_cd IS NULL OR rjct_rsn_cd IN
  ('GAMBLING','NON_PI_PYMNT','GIFT_CARD','INVEST','ADULT','PII_COLLECT','PI_BRAND','OWNERSHIP','ETC','PAY_TIMEOUT'));
ALTER TABLE site_mst ADD CONSTRAINT site_mst_aply_dtm_check    CHECK (site_sts_cd NOT IN ('APPLYING','PAID','IN_USE','USED','EXPIRED','SUSPENDED') OR aply_dtm IS NOT NULL);
ALTER TABLE site_mst ADD CONSTRAINT site_mst_apv_dtm_check     CHECK (site_sts_cd NOT IN ('IN_USE','USED','EXPIRED','SUSPENDED') OR apv_dtm IS NOT NULL);
ALTER TABLE site_mst ADD CONSTRAINT site_mst_use_bgn_dtm_check CHECK (site_sts_cd NOT IN ('IN_USE','USED','EXPIRED','SUSPENDED') OR use_bgn_dtm IS NOT NULL);
ALTER TABLE site_mst ADD CONSTRAINT site_mst_use_end_dtm_check CHECK (own_site_yn = 'Y' OR site_sts_cd NOT IN ('IN_USE','USED','EXPIRED','SUSPENDED') OR use_end_dtm IS NOT NULL);
-- 0 Pi 요금제 금지(마스터 D4) — 단가 0 행은 미사용(use_yn=N) 만 허용, 음수 금지 유지
ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_pi_amt_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_pi_amt_check CHECK (pi_amt >= 0 AND (pi_amt > 0 OR use_yn = 'N'));

-- ------------------------------------------------------------
-- 7. 인덱스 — 점유(USED 포함 : 재등록 창 DB 강제)·노출(IN_USE)·크론 후보(use_end_dtm <= now() - interval 형태로 조회해야 인덱스 사용)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_mst_site_dom_nm_actv ON site_mst (site_dom_nm)
  WHERE del_yn = 'N' AND site_sts_cd IN ('APPLYING','PAID','IN_USE','USED','SUSPENDED');
CREATE INDEX IF NOT EXISTS idx_site_mst_apv_dtm      ON site_mst (apv_dtm DESC, site_id)                 WHERE del_yn = 'N' AND site_sts_cd = 'IN_USE';
CREATE INDEX IF NOT EXISTS idx_site_mst_site_ctgr_cd ON site_mst (site_ctgr_cd, apv_dtm DESC, site_id) WHERE del_yn = 'N' AND site_sts_cd = 'IN_USE';
CREATE INDEX IF NOT EXISTS idx_site_mst_use_end_dtm  ON site_mst (site_sts_cd, use_end_dtm)             WHERE del_yn = 'N' AND site_sts_cd IN ('IN_USE','USED','SUSPENDED');

-- ------------------------------------------------------------
-- 8. RPC — 결제 완료 = APPLYING→PAID (한 트랜잭션). 늦은 결제(PAY_TIMEOUT 반려 직후 complete) 구제, 사용 단계 진입 뒤 재시도는 멱등
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cmpl_site_reg_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS site_mst
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_p    pi_pymnt;
  v_s    site_mst;
  v_site UUID;
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE pymnt_id = p_pymnt_id
     AND usr_id = p_usr_id
     AND del_yn = 'N'
     AND pymnt_tp_cd = 'SITE_REG'
     AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 결제 없음·결제자 불일치·상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  v_site := (v_p.meta_val ->> 'site_id')::UUID;

  -- 멱등 : 같은 결제로 이미 사용 단계에 들어간 사이트는 상태를 되돌리지 않고 현재 행 반환
  SELECT * INTO v_s FROM site_mst
   WHERE site_id = v_site AND del_yn = 'N' AND ownr_usr_id = p_usr_id AND pymnt_id = p_pymnt_id
     AND site_sts_cd IN ('IN_USE', 'USED', 'SUSPENDED', 'EXPIRED');
  IF FOUND THEN
    RETURN v_s;
  END IF;

  BEGIN
    UPDATE site_mst
       SET site_sts_cd   = 'PAID',
           pymnt_id      = p_pymnt_id,
           pay_dtm       = COALESCE(pay_dtm, CURRENT_TIMESTAMP),
           aply_dtm      = COALESCE(aply_dtm, CURRENT_TIMESTAMP),
           plan_cd       = COALESCE(NULLIF(v_p.meta_val ->> 'plan_cd', ''), plan_cd),
           rjct_rsn_cd   = NULL,
           rjct_rsn_cont = NULL,
           modr_id       = p_usr_id::TEXT
     WHERE site_id = v_site
       AND del_yn = 'N'
       AND ownr_usr_id = p_usr_id
       AND (site_sts_cd IN ('APPLYING', 'PAID') OR (site_sts_cd = 'REJECTED' AND rjct_rsn_cd = 'PAY_TIMEOUT'))
       AND (pymnt_id IS NULL OR pymnt_id = p_pymnt_id)
    RETURNING * INTO v_s;
  EXCEPTION WHEN unique_violation THEN
    -- 늦은 결제 구제 중 도메인이 다른 신청에 점유됨 → 앱 기존 매핑(P0003 = 운영자 확인·환불 대상)으로 수렴
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 도메인이 이미 다른 신청에 점유됨 — 운영자 환불 확인 (%)', v_site USING ERRCODE = 'P0003';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 사이트 없음·소유자 불일치·결제 불가 상태·이미 다른 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

-- 8b. 신고 처리 RPC — 정지 대상 상태 APPROVED → IN_USE (전이 #10)
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
    PERFORM set_config('sitemap.chg_rsn_cd', 'RPT_ACCEPT', true);
    UPDATE site_mst
       SET site_sts_cd   = 'SUSPENDED',
           rjct_rsn_cont = p_prcs_cont,
           modr_id       = p_prcs_usr_id::TEXT
     WHERE site_id = v_rpt.site_id
       AND del_yn = 'N'
       AND site_sts_cd = 'IN_USE';
    PERFORM set_config('sitemap.chg_rsn_cd', '', true);
  END IF;

  RETURN v_rpt;
END;
$$;

-- 8c. RPC — 사용 시작(PAID→IN_USE). 크론·관리자 "사용 시작" 공용, 기간 계산 단일 장소. 외부 사이트 요금제 결측은 RAISE(P0004 — 앱 매핑 필요, ASSERT 미사용)
CREATE OR REPLACE FUNCTION fn_bgn_site_use(p_site_id UUID, p_actor TEXT)
RETURNS site_mst
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_s   site_mst;
  v_mon INTEGER;
BEGIN
  SELECT * INTO v_s FROM site_mst WHERE site_id = p_site_id AND del_yn = 'N' AND site_sts_cd = 'PAID' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- 대상 아님(멱등)

  IF v_s.own_site_yn = 'N' THEN
    SELECT f.use_mon_cnt INTO v_mon FROM fee_plan f
     WHERE f.fee_tp_cd = 'REGISTER' AND f.plan_cd = v_s.plan_cd AND f.del_yn = 'N';   -- use_yn 무관(판매 중지 요금제도 기간은 보장)
    IF v_mon IS NULL THEN
      RAISE EXCEPTION 'fn_bgn_site_use: 요금제 사용기간 없음 (site %, plan %)', p_site_id, v_s.plan_cd USING ERRCODE = 'P0004';
    END IF;
  END IF;

  UPDATE site_mst m
     SET site_sts_cd = 'IN_USE',
         use_bgn_dtm = CURRENT_TIMESTAMP,
         use_end_dtm = CASE WHEN m.own_site_yn = 'Y' THEN NULL ELSE CURRENT_TIMESTAMP + make_interval(months => v_mon) END,
         apv_dtm     = COALESCE(m.apv_dtm, CURRENT_TIMESTAMP),
         modr_id     = p_actor
   WHERE m.site_id = p_site_id
  RETURNING * INTO v_s;
  RETURN v_s;
END; $$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_reg_pymnt(text, text, uuid)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_prcs_site_rpt(uuid, text, text, uuid)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_bgn_site_use(uuid, text)');

-- ------------------------------------------------------------
-- 9. 이력 트리거 — 002 원문 유지 + PAID→IN_USE 전이에 결제·사용기간 스냅샷(감사 : 재등록 시 site_mst 의 결제 컬럼이 초기화되므로)
-- ------------------------------------------------------------
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
    CASE WHEN NEW.site_sts_cd IN ('REJECTED', 'SUSPENDED') THEN NEW.rjct_rsn_cont
         WHEN NEW.site_sts_cd = 'IN_USE' AND (TG_OP = 'INSERT' OR OLD.site_sts_cd = 'PAID')
           THEN 'pymnt_id=' || COALESCE(NEW.pymnt_id, '-') || ' use=' || COALESCE(NEW.use_bgn_dtm::TEXT, '-') || '~' || COALESCE(NEW.use_end_dtm::TEXT, 'PERMANENT')
    END,
    NEW.site_dom_nm,
    NEW.modr_id,
    NEW.modr_id,
    NEW.modr_id
  );
  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- 10. pi_pymnt — 사이트별 진행 중 결제 조회(크론·반려 가드) 부분 인덱스 (sitemap DB 전용 인덱스 — pi_pymnt 는 @pi/db baseline 테이블) / 표시명 개명
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pi_pymnt_meta_val_site_id ON pi_pymnt ((meta_val ->> 'site_id'))
  WHERE del_yn = 'N' AND pymnt_tp_cd = 'SITE_REG' AND pymnt_sts_cd = 'APPROVED';
UPDATE fee_plan SET fee_plan_nm = replace(fee_plan_nm, '등록 심사비', '사용료'), modr_id = 'SYSTEM'
 WHERE fee_plan_nm LIKE '등록 심사비%';
COMMENT ON TABLE fee_plan IS '요금표 — REGISTER(사용료) × 사이트 요금제. 단가 변경은 UPDATE, 0 Pi 는 use_yn=N 만 허용';

COMMIT;
-- 검증 :
--  SELECT site_sts_cd, own_site_yn, count(*) FROM site_mst GROUP BY 1,2 ORDER BY 1,2;                         -- PENDING·APPROVED 0
--  SELECT count(*) FROM site_sts_hist WHERE chgr_id = 'SYSTEM' AND chg_dtm > now() - interval '5 min';      -- = 이행 전 PENDING + APPROVED 건수(SUSPENDED 는 이력 없음)
--  SELECT count(*) FROM site_mst WHERE site_sts_cd = 'IN_USE' AND own_site_yn = 'N' AND use_end_dtm IS NULL; -- 0
--  SELECT count(*) FROM site_mst WHERE site_sts_cd IN ('IN_USE','SUSPENDED') AND own_site_yn='N' AND use_end_dtm <= now();  -- 첫 크론에서 USED 로 가는 행(영향 보고)
--  SELECT site_sts_cd, count(*) FROM site_mst WHERE pymnt_id IS NOT NULL AND site_sts_cd IN ('DRAFT','REJECTED','WITHDRAWN') GROUP BY 1;  -- 결제 잔존 고아 행(환불 검토)
