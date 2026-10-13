-- 013_sitemap_site_spk.sql — 반짝임 부가서비스(SPARKLE) : 신청·수정 시 선택, 사용료와 합산 결제 또는 사용 중 단독 추가 결제, 결제되면 메인 버블 반짝임 (마스터 지시 2026-10-13)
-- DA-APPROVED: 마스터 지시 2026-10-13 반짝임 부가서비스 — da-governance-expert 리뷰 조건부 승인(2026-10-13, P1 1건: fn_cmpl_site_spk_pymnt 권한 회수 반영 조건 → 반영, P2 4건 반영). 표준단어 SPK 확정(W20 조건부→확정), pymnt_tp_cd SITE_SPK·fee_tp_cd SPARKLE(plan_cd=NONE 공통 1행) 사전 등재.
--   fee_plan fee_tp_cd CHECK 에 SPARKLE 추가 + 공용 행 1건 + 의미 고정 CHECK(SPARKLE ⇒ plan_cd=NONE), site_mst 컬럼 3(spk_yn 신청여부 · spk_pymnt_id 결제ID FK pi_pymnt · spk_pay_dtm 결제완료일시, 동시 NULL CHECK),
--   RPC fn_cmpl_site_reg_pymnt 재정의(합산 결제 meta spk='Y' 반영)·fn_cmpl_site_spk_pymnt 신규(단독 결제, 서비스 전용 권한), pi_pymnt 부분 인덱스 1 (2026-10-13)
-- 선행 : 012. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 규칙 :
--  · 노출 = site_sts_cd='IN_USE' AND spk_yn='Y' AND (spk_pay_dtm IS NOT NULL OR own_site_yn='Y')  — 자사 사이트는 결제 없이 관리자가 spk_yn 으로 켠다
--  · 합산 결제 : 신청(APPLYING, 사용료 미결제) 시 spk_yn='Y' 면 prepare 가 사용료+부가서비스 단가를 합산, metadata.spk='Y'. complete RPC 가 spk_pymnt_id=같은 결제ID 로 기록
--  · 단독 결제 : 사용료 결제 뒤(APPLYING 결제완료·PAID·IN_USE) spk_yn='Y' 이고 spk_pymnt_id IS NULL 이면 pymnt_tp_cd='SITE_SPK' 결제 → fn_cmpl_site_spk_pymnt
--  · 재등록(USED·EXPIRED → 새 결제) 때 앱이 spk_pymnt_id·spk_pay_dtm 을 NULL 로 초기화(사용기간이 새로 시작되므로 부가서비스도 새 결제). spk_yn 은 선택값 유지
--  · 단가 : fee_plan SPK 행 pi_amt — [확인중 : 마스터 확정] 임시 5 Pi. UPDATE 로 변경(코드 변경 없음)
-- 롤백(참고) : DROP FUNCTION fn_cmpl_site_spk_pymnt(text,text,uuid); 012 판 fn_cmpl_site_reg_pymnt 재생성; DROP INDEX idx_pi_pymnt_meta_val_site_id_spk;
--   ALTER TABLE site_mst DROP CONSTRAINT site_mst_spk_pay_dtm_check, DROP COLUMN spk_pay_dtm, DROP COLUMN spk_pymnt_id, DROP COLUMN spk_yn;
--   UPDATE fee_plan SET del_yn='Y', del_dtm=now() WHERE fee_plan_cd='SPK'; fee_plan_fee_tp_cd_check 는 SPARKLE 을 남긴다(논리삭제 행이 CHECK 대상이라 ('REGISTER') 복귀 불가, 물리 DELETE 금지); DROP CONSTRAINT fee_plan_spk_plan_cd_check
--  · 무료 요금제(NONE)는 자사 전용(APPLY_PLAN_CD 가 NONE 제외)이라 외부 사이트의 반짝임 구매 자격은 항상 유료 요금제 — RPC 에 plan_cd 조건을 두지 않는다(DA P2-5)
BEGIN;

-- ------------------------------------------------------------
-- 1. fee_plan — 요금유형 SPARKLE 허용 + 공용 단가 행 (요금제와 무관한 단일 단가라 plan_cd='NONE' 을 "공통" 으로 쓴다)
-- ------------------------------------------------------------
ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_fee_tp_cd_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_fee_tp_cd_check CHECK (fee_tp_cd IN ('REGISTER', 'SPARKLE'));
COMMENT ON COLUMN fee_plan.fee_tp_cd IS '요금유형코드 : REGISTER(사용료 × 요금제) · SPARKLE(반짝임 부가서비스, plan_cd=NONE 공통 1행)';
-- SPARKLE 행의 plan_cd=NONE 은 "요금제 공통" — 코드값 의미를 제약으로 고정(DA P2-4). 요금제별 단가가 필요해지면 이 CHECK 를 풀고 요금제별 행으로
ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_spk_plan_cd_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_spk_plan_cd_check CHECK (fee_tp_cd <> 'SPARKLE' OR plan_cd = 'NONE');

INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, plan_cd, fee_plan_nm, pi_amt, sort_no, use_mon_cnt, mon_pi_amt) VALUES
  ('SPK', 'SPARKLE', 'NONE', '반짝임 부가서비스', 5, 10, NULL, 0)
ON CONFLICT (fee_plan_cd) DO NOTHING;

-- ------------------------------------------------------------
-- 2. site_mst — 부가서비스 신청·결제 참조
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS spk_yn       CHAR(1) NOT NULL DEFAULT 'N';  -- 반짝임신청여부 (폼 선택값, 관리자 수정 가능)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS spk_pymnt_id TEXT;                          -- 반짝임결제ID → pi_pymnt.pymnt_id (합산 결제면 pymnt_id 와 같은 값)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS spk_pay_dtm  TIMESTAMPTZ;                   -- 반짝임결제완료일시
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_spk_yn_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_spk_yn_check CHECK (spk_yn IN ('Y', 'N'));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_spk_pay_dtm_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_spk_pay_dtm_check CHECK ((spk_pymnt_id IS NULL) = (spk_pay_dtm IS NULL));
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_spk_pymnt_id_fkey;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_spk_pymnt_id_fkey FOREIGN KEY (spk_pymnt_id) REFERENCES pi_pymnt (pymnt_id);
COMMENT ON COLUMN site_mst.spk_yn       IS '반짝임 부가서비스 신청여부 — 노출은 spk_yn=Y AND (spk_pay_dtm NOT NULL OR own_site_yn=Y) AND IN_USE';
COMMENT ON COLUMN site_mst.spk_pymnt_id IS '반짝임 부가서비스 결제ID — fn_cmpl_site_reg_pymnt(합산, meta spk=Y)·fn_cmpl_site_spk_pymnt(단독) 만 기록';
COMMENT ON COLUMN site_mst.spk_pay_dtm  IS '반짝임 부가서비스 결제완료일시';

-- 단독 결제 이중 결제 가드 조회(hasOtherApprovedPayment, type SITE_SPK)
CREATE INDEX IF NOT EXISTS idx_pi_pymnt_meta_val_site_id_spk ON pi_pymnt ((meta_val ->> 'site_id')) WHERE del_yn = 'N' AND pymnt_tp_cd = 'SITE_SPK' AND pymnt_sts_cd = 'APPROVED';

-- ------------------------------------------------------------
-- 3. RPC — 사용료 결제 완료(012 판 + 합산 부가서비스 반영). meta_val.spk='Y' 면 같은 결제ID 로 spk_* 기록
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
           -- 합산 결제 : 이 결제에 부가서비스 값이 포함됐으므로 무조건 이 결제ID 로 기록(지난 주기 결제ID 잔존 방지, DA P2-3). 재시도는 같은 값이라 멱등
           spk_yn        = CASE WHEN v_spk THEN 'Y' ELSE spk_yn END,
           spk_pymnt_id  = CASE WHEN v_spk THEN p_pymnt_id ELSE spk_pymnt_id END,
           spk_pay_dtm   = CASE WHEN v_spk AND spk_pymnt_id IS DISTINCT FROM p_pymnt_id THEN CURRENT_TIMESTAMP ELSE spk_pay_dtm END,
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
-- 4. RPC — 부가서비스 단독 결제 완료(pymnt_tp_cd='SITE_SPK'). 사이트 상태는 바꾸지 않는다. 같은 결제ID 재시도는 멱등
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cmpl_site_spk_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
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
     AND pymnt_tp_cd = 'SITE_SPK'
     AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_spk_pymnt: 결제 없음·결제자 불일치·상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  v_site := (v_p.meta_val ->> 'site_id')::UUID;

  -- 멱등 : 같은 결제로 이미 기록된 사이트는 상태(USED·SUSPENDED 등으로 바뀌었어도) 와 무관하게 현재 행 반환(DA P2-2)
  SELECT * INTO v_s FROM site_mst
   WHERE site_id = v_site AND del_yn = 'N' AND ownr_usr_id = p_usr_id AND spk_pymnt_id = p_pymnt_id;
  IF FOUND THEN
    RETURN v_s;
  END IF;

  UPDATE site_mst
     SET spk_yn       = 'Y',
         spk_pymnt_id = p_pymnt_id,
         spk_pay_dtm  = COALESCE(spk_pay_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE site_id = v_site
     AND del_yn = 'N'
     AND ownr_usr_id = p_usr_id
     AND site_sts_cd IN ('APPLYING', 'PAID', 'IN_USE')
     AND (spk_pymnt_id IS NULL OR spk_pymnt_id = p_pymnt_id)
  RETURNING * INTO v_s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_spk_pymnt: 사이트 없음·소유자 불일치·결제 불가 상태·이미 다른 부가서비스 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

-- 신규 RPC 는 서비스 전용(anon 직접 호출 차단 — 002 원칙, DA P1-1). fn_cmpl_site_reg_pymnt 은 재정의라 기존 권한 유지
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_spk_pymnt(text, text, uuid)');

COMMIT;
