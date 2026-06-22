-- DA-APPROVED: Bean 거래 유형별 분포 RPC에 기간(period) 필터 추가 (2026-06-22, 메인 대시보드 매출 분포 교체)
-- sql/092의 무인자 버전을 p_days 인자 버전으로 교체. 메인 대시보드 기간 필터(7/30/90일)와 연동.
--   p_days NULL → 전체 기간 (기존 092 동작과 동일)
--   p_days = N  → 최근 N일(reg_dtm 기준)만 집계
-- PostgREST 오버로딩 모호성 방지를 위해 무인자 버전을 DROP 후 단일 시그니처로 재생성한다.

DROP FUNCTION IF EXISTS public.fn_bean_txn_distribution();

CREATE OR REPLACE FUNCTION public.fn_bean_txn_distribution(p_days integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT txn_tp_cd, bean_amt, usr_id
    FROM public.bean_txn
    WHERE del_yn = 'N'
      AND (
        p_days IS NULL
        OR reg_dtm >= CURRENT_TIMESTAMP - make_interval(days => p_days)
      )
  )
  SELECT jsonb_build_object(
    -- 유형별 분포 (gross 내림차순)
    'by_type', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          txn_tp_cd,
          COUNT(*)               AS txn_cnt,
          SUM(ABS(bean_amt))     AS gross_bean,
          SUM(bean_amt)          AS net_bean,
          COUNT(DISTINCT usr_id) AS usr_cnt
        FROM base
        GROUP BY txn_tp_cd
        ORDER BY SUM(ABS(bean_amt)) DESC
      ) t
    ), '[]'::jsonb),
    'total_cnt', COALESCE((SELECT COUNT(*) FROM base), 0),
    'total_gross_bean', COALESCE((SELECT SUM(ABS(bean_amt)) FROM base), 0),
    'period_days', p_days
  );
$$;

COMMENT ON FUNCTION public.fn_bean_txn_distribution(integer) IS
  'Bean 거래 유형별 분포 — txn_tp_cd별 건수·총거래량(gross)·순증감(net)·참여자수. p_days로 최근 N일 필터(NULL=전체). 대시보드 매출 분포용';
