-- 014_sitemap_fee_plan_v3.sql — 요금제·부가서비스 요금 재편 (마스터 확정 2026-10-13, 표 그림) : 약정기간 1·3·6·12·24개월, 사용료 10·20·30·60·120 Pi, 반짝임 부가서비스 2·4·6·12·24 Pi(요금제별)
-- DA-APPROVED: 마스터 확정 2026-10-13 — fee_plan 데이터 UPDATE 5행(REGISTER pi_amt·use_mon_cnt·mon_pi_amt) + SPARKLE 요금제별 5행 INSERT + 013 공통 행(SPK) 논리삭제.
--   DDL 은 013 의 의미 고정 CHECK(fee_plan_spk_plan_cd_check, SPARKLE ⇒ plan_cd=NONE) 1건 DROP — 반짝임 단가가 요금제별로 확정돼 013 P2-4 전제("요금제별 단가가 필요해지면 CHECK 를 풀고 요금제별 행으로")가 발동. ux_fee_plan_fee_tp_plan_actv(fee_tp_cd, plan_cd) 가 요금제별 활성 1행을 보장.
--   + RPC fn_cmpl_site_spk_pymnt 재정의(상태 게이트 제거 — 적대적 리뷰 HIGH, 시그니처·권한 동일) (2026-10-13)
-- 선행 : 013. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 산식 : mon_pi_amt = 10 Pi(1개월 기준 단가) → 할인율 표시(regFeeDiscountPct) BSC1 0%(미표시)·BSC2 33%·PRM1 50%·PRM2 50%·VIP 50%
--  | 요금제 | 약정기간 | 사용료 | 부가서비스 |
--  | BSC1  |  1개월  |  10 |  2 |
--  | BSC2  |  3개월  |  20 |  4 |
--  | PRM1  |  6개월  |  30 |  6 |
--  | PRM2  | 12개월  |  60 | 12 |
--  | VIP   | 24개월  | 120 | 24 |
-- 코드 : getSpkFee(planCd) 가 요금제별 SPARKLE 행을 읽는다(013 의 공통 행은 del_yn='Y' 로 남김 — 물리 DELETE 금지)
BEGIN;

ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_spk_plan_cd_check;
COMMENT ON COLUMN fee_plan.fee_tp_cd IS '요금유형코드 : REGISTER(사용료 × 요금제) · SPARKLE(반짝임 부가서비스 × 요금제, 014 부터 요금제별 행)';

UPDATE fee_plan SET pi_amt = 10,  use_mon_cnt = 1,  mon_pi_amt = 10 WHERE fee_plan_cd = 'REG_BSC1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 20,  use_mon_cnt = 3,  mon_pi_amt = 10 WHERE fee_plan_cd = 'REG_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 30,  use_mon_cnt = 6,  mon_pi_amt = 10 WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 60,  use_mon_cnt = 12, mon_pi_amt = 10 WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET pi_amt = 120, use_mon_cnt = 24, mon_pi_amt = 10 WHERE fee_plan_cd = 'REG_VIP'  AND del_yn = 'N';

-- 013 공통 행 폐기(논리삭제) → 요금제별 5행
UPDATE fee_plan SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP, use_yn = 'N' WHERE fee_plan_cd = 'SPK' AND del_yn = 'N';
INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, plan_cd, fee_plan_nm, pi_amt, sort_no, use_mon_cnt, mon_pi_amt) VALUES
  ('SPK_VIP',  'SPARKLE', 'VIP',  '반짝임 부가서비스 — VIP 요금제',  24, 11, NULL, 0),
  ('SPK_PRM2', 'SPARKLE', 'PRM2', '반짝임 부가서비스 — 프리미엄 2', 12, 12, NULL, 0),
  ('SPK_PRM1', 'SPARKLE', 'PRM1', '반짝임 부가서비스 — 프리미엄 1',  6, 13, NULL, 0),
  ('SPK_BSC2', 'SPARKLE', 'BSC2', '반짝임 부가서비스 — 기본 2',      4, 14, NULL, 0),
  ('SPK_BSC1', 'SPARKLE', 'BSC1', '반짝임 부가서비스 — 기본 1',      2, 15, NULL, 0)
ON CONFLICT (fee_plan_cd) DO UPDATE SET pi_amt = EXCLUDED.pi_amt, use_yn = 'Y', del_yn = 'N', del_dtm = NULL, modr_id = 'ADMIN';

-- ------------------------------------------------------------
-- RPC — 반짝임 단독 결제 완료 재정의(013 → 상태 게이트 제거, 적대적 리뷰 HIGH 2026-10-13) : 상태 검증은 prepare·approve 가 이미 했고,
--   서명·complete 사이에 사이트가 철회·정지로 상태를 벗어나도 돈은 이미 나갔으므로 기록은 반드시 남긴다(P0003 롤백 = 원장 APPROVED 좀비)
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

  -- 멱등 : 같은 결제로 이미 기록된 사이트는 현재 행 반환
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
     AND spk_pymnt_id IS NULL
  RETURNING * INTO v_s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_spk_pymnt: 사이트 없음·소유자 불일치·이미 다른 부가서비스 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;
  RETURN v_s;
END; $$;

COMMIT;
