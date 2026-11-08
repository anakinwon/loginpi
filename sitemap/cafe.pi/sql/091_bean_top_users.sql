-- DA-APPROVED: Bean 상위 사용자 랭킹 집계 RPC (2026-06-22, 관리자 분석 대시보드)
-- 목적: 지갑 화면(현재 잔액 정렬)을 넘어, Bean 경제를 이끄는 핵심 사용자를 다차원으로 식별.
--   ① 현재 잔액(balance)        — bean_token_wallet (USER) 캐시
--   ② 누적 충전(charge)         — CHARGE: Pi 현금을 투입한 페잉 사용자 (Pi 매출 기여)
--   ③ 누적 사용(spend)          — SPEND/SUBSCRIBE/FEE: 활동량 (북극성: 활성 사용자)
--   ④ 누적 보상(reward)         — REWARD: 캠페인·이벤트로 받은 Bean
--   ⑤ 선물 송/수신(tip)         — TRANSFER: P2P 선물 (양수 수신 / 음수 송신)
--   ⑥ 총 거래 건수(txn_cnt)     — 전체 활동 빈도
-- 잔액은 wallet, 누적은 원장(bean_txn) — usr_id로 합산. 사용자 표시정보는 API에서 병합.

CREATE OR REPLACE FUNCTION public.fn_bean_top_users(
  p_metric TEXT DEFAULT 'balance',  -- balance|charge|spend|reward|tip_in|txn_cnt
  p_limit  INT  DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH ledger AS (
    -- 사용자별 원장 누적 집계
    SELECT
      usr_id,
      COALESCE(SUM(bean_amt) FILTER (WHERE txn_tp_cd = 'CHARGE'), 0)                AS charge_bean,
      COALESCE(SUM(pi_amt)   FILTER (WHERE txn_tp_cd = 'CHARGE'), 0)                AS charge_pi,
      COUNT(*)               FILTER (WHERE txn_tp_cd = 'CHARGE')                    AS charge_cnt,
      -COALESCE(SUM(bean_amt) FILTER (WHERE txn_tp_cd IN ('SPEND','SUBSCRIBE','FEE')), 0) AS spend_bean,
      COUNT(*)               FILTER (WHERE txn_tp_cd IN ('SPEND','SUBSCRIBE','FEE')) AS spend_cnt,
      COALESCE(SUM(bean_amt) FILTER (WHERE txn_tp_cd = 'REWARD'), 0)                AS reward_bean,
      COALESCE(SUM(bean_amt) FILTER (WHERE txn_tp_cd = 'TRANSFER' AND bean_amt > 0), 0)  AS tip_in_bean,
      -COALESCE(SUM(bean_amt) FILTER (WHERE txn_tp_cd = 'TRANSFER' AND bean_amt < 0), 0) AS tip_out_bean,
      COUNT(*)                                                                       AS txn_cnt
    FROM public.bean_txn
    WHERE del_yn = 'N'
    GROUP BY usr_id
  ),
  -- 원장에 있거나 지갑이 있는 모든 USER (지갑만 있고 거래 0인 경우 포함)
  usr_set AS (
    SELECT usr_id FROM ledger
    UNION
    SELECT usr_id FROM public.bean_token_wallet
     WHERE wallet_type = 'USER' AND del_yn = 'N' AND usr_id IS NOT NULL
  ),
  merged AS (
    SELECT
      u.usr_id,
      COALESCE(w.bean_amt, 0)        AS balance,
      COALESCE(l.charge_bean, 0)     AS charge_bean,
      COALESCE(l.charge_pi, 0)       AS charge_pi,
      COALESCE(l.charge_cnt, 0)      AS charge_cnt,
      COALESCE(l.spend_bean, 0)      AS spend_bean,
      COALESCE(l.spend_cnt, 0)       AS spend_cnt,
      COALESCE(l.reward_bean, 0)     AS reward_bean,
      COALESCE(l.tip_in_bean, 0)     AS tip_in_bean,
      COALESCE(l.tip_out_bean, 0)    AS tip_out_bean,
      COALESCE(l.txn_cnt, 0)         AS txn_cnt
    FROM usr_set u
    LEFT JOIN ledger l ON l.usr_id = u.usr_id
    LEFT JOIN public.bean_token_wallet w
           ON w.usr_id = u.usr_id AND w.wallet_type = 'USER' AND w.del_yn = 'N'
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT *
    FROM merged
    ORDER BY
      CASE p_metric
        WHEN 'charge'  THEN charge_bean
        WHEN 'spend'   THEN spend_bean
        WHEN 'reward'  THEN reward_bean
        WHEN 'tip_in'  THEN tip_in_bean
        WHEN 'txn_cnt' THEN txn_cnt
        ELSE balance
      END DESC NULLS LAST,
      balance DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) t;
$$;

COMMENT ON FUNCTION public.fn_bean_top_users IS
  'Bean 상위 사용자 랭킹 — metric별 정렬(balance/charge/spend/reward/tip_in/txn_cnt). 잔액=wallet, 누적=bean_txn 원장. 관리자 분석 대시보드용';
