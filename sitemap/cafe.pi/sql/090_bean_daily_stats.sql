-- DA-APPROVED: Bean 일별 시계열 집계 RPC (2026-06-22, 관리자 Bean 경제 대시보드)
-- 기존 stats route(`/api/admin/token/stats`)가 호출하던 fn_bean_daily_stats의 정본 정의.
-- (git 미보관 상태였음 → 계약 확정. 유일 소비처가 미렌더 trends라 재정의 안전)
--
-- 설계 원칙:
--   ① 연속 30일 0-채움 — 거래 없는 날도 행을 만들어 시계열 x축 왜곡 방지(generate_series)
--   ② 부호 정합성 — bean_amt는 부호 있음(충전/보상/환불 +, 소비 −). 소비는 -SUM으로 양수화
--      → fn_bean_revenue_summary의 회수매출 규약과 동일(두 화면 숫자 일치 보장)
--   ③ TRANSFER(P2P 선물) 제외 — 사용자↔사용자 이동은 플랫폼 발행/소비 흐름 아님(이중계상 방지)
--   ④ 일 경계 = Asia/Seoul(KST) — 운영 어드민 기준 현지 일자

-- 반환 시그니처가 바뀔 수 있어 먼저 DROP (유일 소비처 trends는 현재 미렌더 → 안전)
DROP FUNCTION IF EXISTS public.fn_bean_daily_stats();

CREATE FUNCTION public.fn_bean_daily_stats()
RETURNS TABLE (
  stat_dt     date,    -- 집계 일자 (KST)
  charge_bean bigint,  -- 충전 발행 (+)
  spend_bean  bigint,  -- 소비 (SPEND·SUBSCRIBE·TIP·FEE, 양수 표시)
  reward_bean bigint,  -- 보상 지급 (+)
  refund_bean bigint,  -- 환불 (+)
  txn_cnt     bigint   -- 당일 거래 건수
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH series AS (
    -- 최근 30일(오늘 포함) 연속 일자 — KST 기준
    SELECT gs::date AS stat_dt
    FROM generate_series(
      (now() AT TIME ZONE 'Asia/Seoul')::date - 29,
      (now() AT TIME ZONE 'Asia/Seoul')::date,
      INTERVAL '1 day'
    ) gs
  ),
  agg AS (
    SELECT
      (reg_dtm AT TIME ZONE 'Asia/Seoul')::date                                   AS d,
      SUM(bean_amt)  FILTER (WHERE txn_tp_cd = 'CHARGE')                           AS charge_bean,
      -SUM(bean_amt) FILTER (WHERE txn_tp_cd IN ('SPEND','SUBSCRIBE','TIP','FEE')) AS spend_bean,
      SUM(bean_amt)  FILTER (WHERE txn_tp_cd = 'REWARD')                           AS reward_bean,
      SUM(bean_amt)  FILTER (WHERE txn_tp_cd = 'REFUND')                           AS refund_bean,
      COUNT(*)                                                                     AS txn_cnt
    FROM public.bean_txn
    WHERE del_yn = 'N'
      -- KST 30일 창을 모두 덮도록 여유 있게 31일 전부터 스캔(인덱스 reg_dtm 활용)
      AND reg_dtm >= now() - INTERVAL '31 days'
    GROUP BY 1
  )
  SELECT
    s.stat_dt,
    COALESCE(a.charge_bean, 0)::bigint,
    COALESCE(a.spend_bean,  0)::bigint,
    COALESCE(a.reward_bean, 0)::bigint,
    COALESCE(a.refund_bean, 0)::bigint,
    COALESCE(a.txn_cnt,     0)::bigint
  FROM series s
  LEFT JOIN agg a ON a.d = s.stat_dt
  ORDER BY s.stat_dt;
$$;

COMMENT ON FUNCTION public.fn_bean_daily_stats IS
  'Bean 일별 시계열 — 최근 30일(KST) 충전·소비·보상·환불 일별 집계(0-채움, TRANSFER 제외). 관리자 Bean 대시보드용';
