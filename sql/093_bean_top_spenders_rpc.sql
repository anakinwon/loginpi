-- DA-APPROVED: Bean 기간별 상위 지출자 랭킹 RPC (2026-06-22, 홈/통계 대시보드 'Top-3 지출자' Bean 전환)
-- 기존 fn_top_spenders(pi_pymnt 기준 Pi 결제 Top-N)의 Bean 짝.
--   거래 통화 라우팅(currency-routing-rule): 플랫폼↔사용자 소비는 Bean → 지출자 랭킹도 Bean이 정본.
--   소비(지출) = bean_txn 중 SPEND/SUBSCRIBE/FEE (음수 유출) → -SUM(bean_amt) = 양수 소비액.
--   기간 스코프 = reg_dtm::date BETWEEN p_from AND p_to (대시보드 7/30/90/365일 필터와 동일).
--   display_nm 은 fn_top_spenders 와 동일 우선순위(nick_nm→pi_username→google_email). 마스킹은 API 계층.

CREATE OR REPLACE FUNCTION public.fn_top_bean_spenders(
  p_from  DATE,
  p_to    DATE DEFAULT CURRENT_DATE,
  p_limit INT  DEFAULT 3
)
RETURNS TABLE(
  usr_id      TEXT,
  display_nm  TEXT,
  total_bean  BIGINT,
  txn_cnt     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    t.usr_id                                              AS usr_id,
    COALESCE(u.nick_nm, u.pi_username, u.google_email)    AS display_nm,
    (-SUM(t.bean_amt))::BIGINT                            AS total_bean,
    COUNT(*)::BIGINT                                      AS txn_cnt
  FROM public.bean_txn t
  LEFT JOIN public.sys_user u ON u.id::text = t.usr_id
  WHERE t.del_yn = 'N'
    AND t.txn_tp_cd IN ('SPEND', 'SUBSCRIBE', 'FEE')      -- 플랫폼 소비(P2P 선물 TRANSFER 제외)
    AND t.reg_dtm::date BETWEEN p_from AND p_to
  GROUP BY t.usr_id, u.nick_nm, u.pi_username, u.google_email
  HAVING -SUM(t.bean_amt) > 0
  ORDER BY total_bean DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.fn_top_bean_spenders IS
  'Bean 기간별 상위 지출자 — bean_txn SPEND/SUBSCRIBE/FEE 소비액 합 Top-N. fn_top_spenders(Pi)의 Bean 짝. 홈 대시보드용';
