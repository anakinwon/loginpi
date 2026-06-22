-- DA-APPROVED: Bean 거래 유형별 분포 집계 RPC (2026-06-22, 관리자 Bean 대시보드)
-- 기존 fn_bean_revenue_summary 는 '회수 매출'(SPEND/SUBSCRIBE/REFUND 부분집합)만 다룬다.
-- 이 RPC 는 bean_txn 전체를 txn_tp_cd(CHARGE/SPEND/REWARD/REFUND/TRANSFER…)별로 집계해
-- Bean 경제 '활동 전반'의 분포를 보여준다. (CHARGE·REWARD·TRANSFER 포함 — 매출 집계엔 없던 유형)
--   txn_cnt    = 거래 건수
--   gross_bean = SUM(ABS(bean_amt)) — 유형별로 움직인 Bean 총량 (분포 비율의 기준)
--   net_bean   = SUM(bean_amt)      — 사용자 지갑 기준 순증감 (부호 유지: 충전/보상/환불 +, 사용 -)
--   usr_cnt    = 거래에 참여한 고유 사용자 수
-- txn_tp_cd 는 CHECK 제약이 없는 VARCHAR(10) 자유값이라 GROUP BY 로 실제 존재값을 동적 집계한다.

CREATE OR REPLACE FUNCTION public.fn_bean_txn_distribution()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
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
        FROM public.bean_txn
        WHERE del_yn = 'N'
        GROUP BY txn_tp_cd
        ORDER BY SUM(ABS(bean_amt)) DESC
      ) t
    ), '[]'::jsonb),
    -- 전체 합계 (분포 비율 분모)
    'total_cnt', COALESCE((
      SELECT COUNT(*) FROM public.bean_txn WHERE del_yn = 'N'
    ), 0),
    'total_gross_bean', COALESCE((
      SELECT SUM(ABS(bean_amt)) FROM public.bean_txn WHERE del_yn = 'N'
    ), 0)
  );
$$;

COMMENT ON FUNCTION public.fn_bean_txn_distribution IS
  'Bean 거래 유형별 분포 — txn_tp_cd 기준 건수·총거래량(gross)·순증감(net)·참여자수. 관리자 Bean 대시보드용';
