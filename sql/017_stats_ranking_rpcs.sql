-- DA-APPROVED: 통계 랭킹 조회 RPC 3종 — Phase 11 어드민 통계 대시보드 (TASK-084)
-- fn_top_active_users  : 기간 내 활동일수 Top-N 사용자
-- fn_top_revenue_themes: 기간 내 테마별 매출 Top-N
-- fn_top_spenders      : 기간 내 결제금액 Top-N 사용자

-- ──────────────────────────────────────────────────────────────
-- 1. fn_top_active_users
--    sys_user_actvty_log + sys_user JOIN
--    display_nm: COALESCE(nick_nm, pi_username, google_email)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_top_active_users(
  p_from  DATE,
  p_to    DATE DEFAULT CURRENT_DATE,
  p_limit INT  DEFAULT 3
)
RETURNS TABLE(
  usr_id        UUID,
  display_nm    TEXT,
  activity_days BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id                                                   AS usr_id,
    COALESCE(u.nick_nm, u.pi_username, u.google_email)     AS display_nm,
    COUNT(DISTINCT l.actvty_dt)                            AS activity_days
  FROM public.sys_user_actvty_log l
  JOIN public.sys_user u ON u.id = l.usr_id
  WHERE l.actvty_dt BETWEEN p_from AND p_to
    AND l.del_yn = 'N'
  GROUP BY u.id, u.nick_nm, u.pi_username, u.google_email
  ORDER BY activity_days DESC
  LIMIT p_limit;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. fn_top_revenue_themes
--    stat_revenue_dly + msg_theme LEFT JOIN (테마명·이모지 포함)
--    SUBSCRIPTION·UNKNOWN 등 msg_theme 미등록 theme_cd 포함
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_top_revenue_themes(
  p_from  DATE,
  p_to    DATE DEFAULT CURRENT_DATE,
  p_limit INT  DEFAULT 3
)
RETURNS TABLE(
  theme_cd    VARCHAR,
  theme_nm    VARCHAR,
  theme_emoji VARCHAR,
  total_pi    DECIMAL,
  total_txn   BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.theme_cd,
    t.theme_nm,
    t.theme_emoji,
    SUM(r.rev_pi)::DECIMAL(12,4)  AS total_pi,
    SUM(r.txn_cnt)::BIGINT        AS total_txn
  FROM public.stat_revenue_dly r
  LEFT JOIN public.msg_theme t ON t.theme_cd = r.theme_cd
  WHERE r.stat_dt BETWEEN p_from AND p_to
  GROUP BY r.theme_cd, t.theme_nm, t.theme_emoji
  ORDER BY total_pi DESC
  LIMIT p_limit;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. fn_top_spenders
--    pi_pymnt + sys_user JOIN
--    status IN ('completed', 'approved') — approved = Pi Wallet 서명 완료 실매출
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_top_spenders(
  p_from  DATE,
  p_to    DATE DEFAULT CURRENT_DATE,
  p_limit INT  DEFAULT 3
)
RETURNS TABLE(
  usr_id     UUID,
  display_nm TEXT,
  total_pi   DECIMAL,
  txn_cnt    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.id                                                   AS usr_id,
    COALESCE(u.nick_nm, u.pi_username, u.google_email)     AS display_nm,
    SUM(p.amount)::DECIMAL(12,4)                           AS total_pi,
    COUNT(*)::BIGINT                                       AS txn_cnt
  FROM public.pi_pymnt p
  JOIN public.sys_user u ON u.id = p.user_id
  WHERE p.reg_dtm::date BETWEEN p_from AND p_to
    AND p.status IN ('completed', 'approved')
  GROUP BY u.id, u.nick_nm, u.pi_username, u.google_email
  ORDER BY total_pi DESC
  LIMIT p_limit;
$$;
