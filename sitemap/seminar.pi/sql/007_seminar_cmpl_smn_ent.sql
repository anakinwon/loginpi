-- 007_seminar_cmpl_smn_ent.sql — 입장 결제 완료 원자 처리 함수 fn_cmpl_smn_ent(원장 COMPLETED + 참가 등록 한 트랜잭션, 보안 검토 S1 2026-10-27)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-26) — 함수 1개(fn_cmpl_smn_ent) 신규만, 테이블·인덱스 무변경. DA 사후 리뷰 대상
-- 선행 : 004·005·006. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
--
-- 문제 : complete 라우트가 원장 COMPLETED(@pi/payments markPaymentCompleted)와 참가 등록(fn_join_smn)을 따로 호출해,
--   둘 사이 실패(연결 끊김·타임아웃) 시 "돈은 나갔는데 참가 없음" 으로 갈라질 수 있었다
-- 수정 : @pi/payments completePayment({ finalize }) 의 finalize 로 이 함수를 부른다 — 세미나 행 잠금 아래 원장 갱신 + fn_join_smn 을 한 트랜잭션으로
--   · 원장은 본인·SMN_ENT·APPROVED(또는 같은 tx_id 의 COMPLETED — 재호출 멱등)만 COMPLETED 로. 아니면 PAY_INVALID(아무것도 바꾸지 않음)
--   · 참가 판정은 fn_join_smn 그대로(같은 트랜잭션이라 방금 COMPLETED 가 보인다, 세미나 행 잠금은 재진입)
--   · 등록 거부(CLOSED·NOT_FOUND 등)여도 원장 COMPLETED 는 남긴다 — Pi 에서 돈이 이미 나갔으므로 원장이 사실을 따른다(수동 환불 대상, D-7)
--   · 잠금 순서 = 세미나 행 → 결제 행(fn_join_smn·fn_chk_smn_cap 와 같은 순서, 교착 방지)
-- 반환 = fn_join_smn 과 같은 (rslt_cd, ptc_id)
BEGIN;

CREATE OR REPLACE FUNCTION fn_cmpl_smn_ent(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS TABLE (rslt_cd TEXT, ptc_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta TEXT;
  v_smn_id UUID;
BEGIN
  SELECT y.meta_val ->> 'smn_id' INTO v_meta FROM pi_pymnt y
   WHERE y.pymnt_id = p_pymnt_id AND y.usr_id = p_usr_id AND y.del_yn = 'N' AND y.pymnt_tp_cd = 'SMN_ENT';
  IF v_meta IS NULL OR v_meta !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'PAY_INVALID'::TEXT, NULL::UUID; RETURN;
  END IF;
  v_smn_id := v_meta::UUID;

  -- 세미나 행 먼저 잠근다(없거나 삭제돼도 원장 완료는 진행 — 등록 판정은 fn_join_smn 이 NOT_FOUND)
  PERFORM 1 FROM smn_mst s WHERE s.smn_id = v_smn_id FOR UPDATE;

  UPDATE pi_pymnt y
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(y.tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(y.cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE y.pymnt_id = p_pymnt_id
     AND y.usr_id = p_usr_id
     AND y.del_yn = 'N'
     AND y.pymnt_tp_cd = 'SMN_ENT'
     AND (y.pymnt_sts_cd = 'APPROVED' OR (y.pymnt_sts_cd = 'COMPLETED' AND y.tx_id = p_tx_id));
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'PAY_INVALID'::TEXT, NULL::UUID; RETURN;
  END IF;

  RETURN QUERY SELECT j.rslt_cd, j.ptc_id FROM fn_join_smn(v_smn_id, p_usr_id, p_pymnt_id) j;
END;
$$;
COMMENT ON FUNCTION fn_cmpl_smn_ent(TEXT, TEXT, UUID) IS '세미나 입장 결제 완료 — 세미나 행 잠금 아래 원장 COMPLETED(본인·SMN_ENT·APPROVED 또는 같은 tx 재호출) + fn_join_smn 한 트랜잭션. rslt_cd = fn_join_smn 결과 또는 PAY_INVALID';

DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_cmpl_smn_ent(TEXT, TEXT, UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_smn_ent(TEXT, TEXT, UUID)');

COMMIT;

-- 검증 (적용 후 수동 실행)
-- SELECT * FROM fn_cmpl_smn_ent('no-such', 'tx', gen_random_uuid());      → PAY_INVALID
-- SELECT proconfig FROM pg_proc WHERE proname = 'fn_cmpl_smn_ent';        → {search_path=<스키마>, pg_temp}
