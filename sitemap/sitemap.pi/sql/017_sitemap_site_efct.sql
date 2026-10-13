-- 017_sitemap_site_efct.sql — 버블 이펙트 부가서비스(ORBIT 궤도·PULSE 펄스·COMET 혜성) : 반짝임과 같은 패턴(요금제별 단가 · 신청·수정 선택 · 합산/단독 결제 · 결제된 사이트만 노출), 요금제별 1종 선택 (마스터 지시 2026-10-13, 기획 PRD_01 §3-1)
-- DA-APPROVED: 마스터 지시 2026-10-13 버블 이펙트 부가서비스 — da-governance-expert 리뷰 조건부 승인(2026-10-13, P1 0건 · P2 3건 반영 조건: 사전 등재·rollback 013 판 정정·문구 확정). 표준단어 EFCT(효과, effect) 4자 예외 등재(3자 후보 EFT=전자자금이체·FX=외환·EFF=효율 동음이의), fee_tp_cd EFFECT(요금제별 5행 EFCT_<plan>, 사용료 15% [확인중 : 마스터])·pymnt_tp_cd SITE_EFCT 사전 등재. efct_cd 는 001 판정 3(코드 도메인=CHECK) 에 따라 NULL 허용 + CHECK 3종, 단독 RPC 는 014 원칙(상태 게이트 없음)·서비스 전용 권한.
--   site_mst 컬럼 3(efct_cd 효과코드 CHECK 3종 · efct_pymnt_id 결제ID FK pi_pymnt · efct_pay_dtm 결제완료일시, 동시 NULL CHECK), RPC fn_cmpl_site_reg_pymnt 재정의(합산 meta efct 반영)·fn_cmpl_site_efct_pymnt 신규(단독 결제, 서비스 전용 권한), pi_pymnt 부분 인덱스 1. ⚠ 효과 추가 시 efct_cd CHECK 와 fn_cmpl_site_efct_pymnt 의 코드 검증 2곳을 동시에 갱신(앱 EFCT_CD(src/lib/site.ts 단일 소스) 포함 3곳)
-- 선행 : 016. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 규칙(013 반짝임과 동일 구조) :
--  · 노출 = site_sts_cd='IN_USE' AND efct_cd IS NOT NULL AND (efct_pay_dtm IS NOT NULL OR own_site_yn='Y')  — 자사 사이트는 관리자 선택만으로 노출
--  · 합산 결제 : 신청(APPLYING, 사용료 미결제) 시 efct_cd 가 있으면 prepare 가 사용료+이펙트 단가를 합산, metadata.efct=<코드>. fn_cmpl_site_reg_pymnt 가 efct_pymnt_id=같은 결제ID
--  · 단독 결제 : 사용료 결제 뒤 efct_cd 선택·미결제면 pymnt_tp_cd='SITE_EFCT' 결제 → fn_cmpl_site_efct_pymnt(상태 불변)
--  · 재등록 시 앱이 efct_pymnt_id·efct_pay_dtm 초기화(새 주기 = 새 결제). 결제된 효과는 소유자가 바꿀 수 없다(앱 강제), 관리자 토글 가능
-- 롤백(참고) : DROP FUNCTION fn_cmpl_site_efct_pymnt(text,text,uuid); 013 판 fn_cmpl_site_reg_pymnt 재생성(efct 반영 제거); DROP INDEX idx_pi_pymnt_meta_val_site_id_efct;
--   ALTER TABLE site_mst DROP CONSTRAINT site_mst_efct_pay_dtm_check, DROP CONSTRAINT site_mst_efct_cd_check, DROP COLUMN efct_pay_dtm, DROP COLUMN efct_pymnt_id, DROP COLUMN efct_cd;
--   UPDATE fee_plan SET del_yn='Y', del_dtm=now(), use_yn='N' WHERE fee_tp_cd='EFFECT'; CHECK 의 EFFECT 는 남긴다(논리삭제 행이 CHECK 대상)
BEGIN;

-- ------------------------------------------------------------
-- 1. fee_plan — 요금유형 EFFECT × 요금제 5행 (단가 = 사용료 15%, PRD_01 §4 제안값)
-- ------------------------------------------------------------
ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_fee_tp_cd_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_fee_tp_cd_check CHECK (fee_tp_cd IN ('REGISTER', 'SPARKLE', 'EFFECT'));
COMMENT ON COLUMN fee_plan.fee_tp_cd IS '요금유형코드 : REGISTER(사용료 × 요금제) · SPARKLE(반짝임 × 요금제) · EFFECT(버블 이펙트 궤도/펄스/혜성 × 요금제, 1종 선택 공통 단가)';

INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, plan_cd, fee_plan_nm, pi_amt, sort_no, use_mon_cnt, mon_pi_amt) VALUES
  ('EFCT_VIP',  'EFFECT', 'VIP',  '버블 이펙트 부가서비스 — VIP요금',    19.5, 21, NULL, 0),
  ('EFCT_PRM2', 'EFFECT', 'PRM2', '버블 이펙트 부가서비스 — 플래티넘요금', 12,  22, NULL, 0),
  ('EFCT_PRM1', 'EFFECT', 'PRM1', '버블 이펙트 부가서비스 — 프리미엄요금',  6.75, 23, NULL, 0),
  ('EFCT_BSC2', 'EFFECT', 'BSC2', '버블 이펙트 부가서비스 — 골드요금',      3.75, 24, NULL, 0),
  ('EFCT_BSC1', 'EFFECT', 'BSC1', '버블 이펙트 부가서비스 — 기본요금',      1.5,  25, NULL, 0)
ON CONFLICT (fee_plan_cd) DO UPDATE SET pi_amt = EXCLUDED.pi_amt, use_yn = 'Y', del_yn = 'N', del_dtm = NULL, modr_id = 'ADMIN';

-- ------------------------------------------------------------
-- 2. site_mst — 이펙트 선택·결제 참조
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS efct_cd       VARCHAR(10);   -- 효과코드 (ORBIT·PULSE·COMET, NULL = 없음)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS efct_pymnt_id TEXT;          -- 효과결제ID → pi_pymnt.pymnt_id (합산 결제면 pymnt_id 와 같은 값)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS efct_pay_dtm  TIMESTAMPTZ;   -- 효과결제완료일시
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_efct_cd_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_efct_cd_check CHECK (efct_cd IS NULL OR efct_cd IN ('ORBIT', 'PULSE', 'COMET'));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_efct_pay_dtm_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_efct_pay_dtm_check CHECK ((efct_pymnt_id IS NULL) = (efct_pay_dtm IS NULL));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_efct_pymnt_id_fkey;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_efct_pymnt_id_fkey FOREIGN KEY (efct_pymnt_id) REFERENCES pi_pymnt (pymnt_id);
COMMENT ON COLUMN site_mst.efct_cd       IS '버블 이펙트 부가서비스 효과코드(ORBIT 궤도·PULSE 펄스·COMET 혜성) — 노출은 efct_cd 있음 AND (efct_pay_dtm NOT NULL OR own_site_yn=Y) AND IN_USE';
COMMENT ON COLUMN site_mst.efct_pymnt_id IS '버블 이펙트 결제ID — fn_cmpl_site_reg_pymnt(합산, meta efct)·fn_cmpl_site_efct_pymnt(단독) 만 기록';
COMMENT ON COLUMN site_mst.efct_pay_dtm  IS '버블 이펙트 결제완료일시';

CREATE INDEX IF NOT EXISTS idx_pi_pymnt_meta_val_site_id_efct ON pi_pymnt ((meta_val ->> 'site_id')) WHERE del_yn = 'N' AND pymnt_tp_cd = 'SITE_EFCT' AND pymnt_sts_cd = 'APPROVED';

-- ------------------------------------------------------------
-- 3. RPC — 사용료 결제 완료(013 판 + 합산 이펙트 반영). meta_val.spk='Y' / meta_val.efct=<코드> 면 같은 결제ID 로 기록
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
  v_spk  BOOLEAN;
  v_efct TEXT;
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
  v_spk  := COALESCE(v_p.meta_val ->> 'spk', 'N') = 'Y';
  v_efct := NULLIF(v_p.meta_val ->> 'efct', '');
  IF v_efct IS NOT NULL AND v_efct NOT IN ('ORBIT', 'PULSE', 'COMET') THEN
    v_efct := NULL;
  END IF;

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
           spk_yn        = CASE WHEN v_spk THEN 'Y' ELSE spk_yn END,
           spk_pymnt_id  = CASE WHEN v_spk THEN p_pymnt_id ELSE spk_pymnt_id END,
           spk_pay_dtm   = CASE WHEN v_spk AND spk_pymnt_id IS DISTINCT FROM p_pymnt_id THEN CURRENT_TIMESTAMP ELSE spk_pay_dtm END,
           -- 합산 이펙트 : 이 결제에 효과 단가가 포함됐으므로 같은 결제ID 로 기록(재시도 멱등)
           efct_cd       = CASE WHEN v_efct IS NOT NULL THEN v_efct ELSE efct_cd END,
           efct_pymnt_id = CASE WHEN v_efct IS NOT NULL THEN p_pymnt_id ELSE efct_pymnt_id END,
           efct_pay_dtm  = CASE WHEN v_efct IS NOT NULL AND efct_pymnt_id IS DISTINCT FROM p_pymnt_id THEN CURRENT_TIMESTAMP ELSE efct_pay_dtm END,
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
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 도메인이 이미 다른 신청에 점유됨 — 운영자 환불 확인 (%)', v_site USING ERRCODE = 'P0003';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 사이트 없음·소유자 불일치·결제 불가 상태·이미 다른 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

-- ------------------------------------------------------------
-- 4. RPC — 이펙트 단독 결제 완료(pymnt_tp_cd='SITE_EFCT'). 사이트 상태는 바꾸지 않고 상태 게이트도 두지 않는다(014 반짝임과 동일 — 돈이 들어온 결제는 반드시 기록). meta_val.efct 가 효과코드
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cmpl_site_efct_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS site_mst
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_p    pi_pymnt;
  v_s    site_mst;
  v_site UUID;
  v_efct TEXT;
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE pymnt_id = p_pymnt_id
     AND usr_id = p_usr_id
     AND del_yn = 'N'
     AND pymnt_tp_cd = 'SITE_EFCT'
     AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_efct_pymnt: 결제 없음·결제자 불일치·상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  v_site := (v_p.meta_val ->> 'site_id')::UUID;
  v_efct := NULLIF(v_p.meta_val ->> 'efct', '');
  IF v_efct IS NULL OR v_efct NOT IN ('ORBIT', 'PULSE', 'COMET') THEN
    RAISE EXCEPTION 'fn_cmpl_site_efct_pymnt: 효과코드 없음 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  -- 멱등 : 같은 결제로 이미 기록된 사이트는 현재 행 반환
  SELECT * INTO v_s FROM site_mst
   WHERE site_id = v_site AND del_yn = 'N' AND ownr_usr_id = p_usr_id AND efct_pymnt_id = p_pymnt_id;
  IF FOUND THEN
    RETURN v_s;
  END IF;

  UPDATE site_mst
     SET efct_cd       = v_efct,
         efct_pymnt_id = p_pymnt_id,
         efct_pay_dtm  = COALESCE(efct_pay_dtm, CURRENT_TIMESTAMP),
         modr_id       = p_usr_id::TEXT
   WHERE site_id = v_site
     AND del_yn = 'N'
     AND ownr_usr_id = p_usr_id
     AND efct_pymnt_id IS NULL
  RETURNING * INTO v_s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_efct_pymnt: 사이트 없음·소유자 불일치·이미 다른 이펙트 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

-- 신규 RPC 는 서비스 전용(anon 직접 호출 차단 — 002 원칙). fn_cmpl_site_reg_pymnt 은 재정의라 기존 권한 유지
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_efct_pymnt(text, text, uuid)');

COMMIT;
