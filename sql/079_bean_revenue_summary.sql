-- DA-APPROVED: Bean 매출 항목별 집계 RPC (2026-06-21, 관리자 매출 대시보드)
-- 매출 2층위:
--   ① Pi 현금 매출 = 충전(CHARGE) 시 유입된 Pi 합 (유일한 외부 현금)
--   ② Bean 회수 매출 = 사용자 소비분이 거버넌스로 회수된 순액(항목별)
--      순매출 = -SUM(bean_amt) over (SPEND·SUBSCRIBE·REFUND)
--        SPEND/SUBSCRIBE(음수) → +매출, REFUND(양수) → -차감 = 순매출 자동 계산
--      항목 구분 = ref_tp_cd (SUBSCR/ROOM_CREATE/ROOM_ENTER/EVENT_ENTER/STICKER_PACK/BADGE_UPGRADE)
--      ※ TRANSFER(P2P 선물)·REWARD(보상지급)·CHARGE는 매출 집계에서 제외

CREATE OR REPLACE FUNCTION public.fn_bean_revenue_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    -- ① Pi 현금 매출 (충전)
    'pi_revenue', (
      SELECT jsonb_build_object(
        'total_pi',   COALESCE(SUM(pi_amt), 0),
        'total_bean', COALESCE(SUM(bean_amt), 0),
        'charge_cnt', COUNT(*)
      )
      FROM public.bean_txn
      WHERE txn_tp_cd = 'CHARGE' AND del_yn = 'N'
    ),
    -- ② Bean 회수 매출 — 항목별 순액
    'bean_by_item', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          COALESCE(ref_tp_cd, 'ETC') AS ref_tp_cd,
          COUNT(*)                   AS txn_cnt,
          -SUM(bean_amt)             AS net_bean
        FROM public.bean_txn
        WHERE del_yn = 'N'
          AND txn_tp_cd IN ('SPEND', 'SUBSCRIBE', 'REFUND')
        GROUP BY COALESCE(ref_tp_cd, 'ETC')
        ORDER BY -SUM(bean_amt) DESC
      ) t
    ), '[]'::jsonb),
    -- ② 합계
    'bean_total', COALESCE((
      SELECT -SUM(bean_amt)
      FROM public.bean_txn
      WHERE del_yn = 'N' AND txn_tp_cd IN ('SPEND', 'SUBSCRIBE', 'REFUND')
    ), 0)
  );
$$;

COMMENT ON FUNCTION public.fn_bean_revenue_summary IS
  'Bean 매출 집계 — ① Pi 현금매출(충전) ② Bean 회수매출 항목별 순액(ref_tp_cd 기준). 관리자 매출 대시보드용';
