-- DA-APPROVED: 모니터링 계측 보존 정책(PRD_22 §9.3 확정 — 보존 7일). sys_metric_* 4종은
--   휘발성 관측 데이터(업무 데이터 아님)라 논리삭제로는 보존 정책의 목적(테이블 용량 상한)을
--   달성할 수 없어 물리 DELETE를 예외 승인한다 (2026-07-08). 업무 테이블 물리삭제 금지 원칙은 불변.
-- 실행: cron /api/cron/metric-purge (1일 1회) → fn_metric_purge(7)

-- 메트릭 보존 정리 — keep_days 이전 계측 행을 물리 삭제하고 테이블별 삭제 건수를 반환
CREATE OR REPLACE FUNCTION public.fn_metric_purge(p_keep_days INT DEFAULT 7)
RETURNS TABLE(tbl_nm TEXT, purged_cnt BIGINT) AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - MAKE_INTERVAL(days => GREATEST(p_keep_days, 1));
  v_cnt BIGINT;
BEGIN
  DELETE FROM public.sys_metric_req_perf WHERE reg_dtm < v_cutoff;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  tbl_nm := 'sys_metric_req_perf'; purged_cnt := v_cnt; RETURN NEXT;

  DELETE FROM public.sys_metric_req_ip WHERE reg_dtm < v_cutoff;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  tbl_nm := 'sys_metric_req_ip'; purged_cnt := v_cnt; RETURN NEXT;

  DELETE FROM public.sys_metric_auth WHERE reg_dtm < v_cutoff;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  tbl_nm := 'sys_metric_auth'; purged_cnt := v_cnt; RETURN NEXT;

  DELETE FROM public.sys_metric_conn WHERE reg_dtm < v_cutoff;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  tbl_nm := 'sys_metric_conn'; purged_cnt := v_cnt; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_metric_purge(INT) IS '모니터링 계측 보존 정리 — keep_days 이전 sys_metric_* 물리 삭제(PRD_22 보존 7일)';
