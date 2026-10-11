-- 005_sitemap_reg_fee_fix.sql — 등록 심사비 결제 RPC 보강 (적대적 검증 2026-10-11 : 소유자 인자·사이트 상태 조건)
-- DA-APPROVED: 마스터 지시 2026-10-11 승인 전 결제 후속 — 함수 시그니처 변경(p_usr_id 추가)·WHERE 보강만, 테이블 변경 없음. DA 사후 리뷰 대상 (2026-10-11)
-- 선행 : 004_sitemap_reg_fee.sql. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 변경 :
--  · fn_cmpl_site_reg_pymnt(p_pymnt_id, p_tx_id, p_usr_id) — 호출자(세션 사용자)가 결제자와 같을 때만 갱신(타인 paymentId·txid 재생 차단)
--  · site_mst 갱신 조건에 site_sts_cd IN ('DRAFT','PENDING','REJECTED') — 결제 중 철회(WITHDRAWN)·정지 사이트에 결제 기록 금지
--  · 구 2인자 함수 제거(단일 경로 유지)
BEGIN;

DROP FUNCTION IF EXISTS fn_cmpl_site_reg_pymnt(TEXT, TEXT);

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

  -- 멱등 : 같은 결제로 재호출은 통과. 다른 결제가 이미 기록된 사이트·결제 불가 상태(WITHDRAWN 등)는 거부
  UPDATE site_mst
     SET pymnt_id = p_pymnt_id,
         pay_dtm  = COALESCE(pay_dtm, CURRENT_TIMESTAMP),
         plan_cd  = COALESCE(NULLIF(v_p.meta_val ->> 'plan_cd', ''), plan_cd),
         modr_id  = p_usr_id::TEXT
   WHERE site_id = v_site
     AND del_yn = 'N'
     AND ownr_usr_id = p_usr_id
     AND site_sts_cd IN ('DRAFT', 'PENDING', 'REJECTED')
     AND (pymnt_id IS NULL OR pymnt_id = p_pymnt_id)
  RETURNING * INTO v_s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 사이트 없음·소유자 불일치·결제 불가 상태·이미 다른 결제 (%)', v_site USING ERRCODE = 'P0003';
  END IF;

  RETURN v_s;
END;
$$;

SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_reg_pymnt(text, text, uuid)');

COMMIT;
