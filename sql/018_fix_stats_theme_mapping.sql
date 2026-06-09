-- DA-APPROVED: UNKNOWN·SUBSCRIPTION 테마 매핑 수정 (TASK-086)
-- fn_build_daily_stats  경로 1 — msg_room LEFT JOIN으로 metadata.theme_cd NULL 보완
-- fn_top_revenue_themes — SUBSCRIPTION·UNKNOWN 한국어 이름 매핑 추가

-- ──────────────────────────────────────────────────────────────
-- 1. fn_build_daily_stats 재정의
--    변경: 경로 1에 LEFT JOIN msg_room r ON r.pymnt_id = p.payment_id 추가
--          COALESCE(p.metadata->>'theme_cd', r.theme_cd) — msg_room 폴백
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_build_daily_stats(
  p_dt DATE DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dau INTEGER;
  v_wau INTEGER;
  v_mau INTEGER;
BEGIN
  -- ─── 활동 집계 ─────────────────────────────────────────────
  SELECT COUNT(DISTINCT usr_id) INTO v_dau
    FROM public.sys_user_actvty_log
   WHERE actvty_dt = p_dt
     AND del_yn = 'N';

  SELECT COUNT(DISTINCT usr_id) INTO v_wau
    FROM public.sys_user_actvty_log
   WHERE actvty_dt BETWEEN (p_dt - INTERVAL '6 days')::date AND p_dt
     AND del_yn = 'N';

  SELECT COUNT(DISTINCT usr_id) INTO v_mau
    FROM public.sys_user_actvty_log
   WHERE actvty_dt BETWEEN (p_dt - INTERVAL '29 days')::date AND p_dt
     AND del_yn = 'N';

  INSERT INTO public.stat_actvty_dly (stat_dt, dau_cnt, wau_cnt, mau_cnt)
  VALUES (p_dt, v_dau, v_wau, v_mau)
  ON CONFLICT (stat_dt)
  DO UPDATE SET
    dau_cnt = EXCLUDED.dau_cnt,
    wau_cnt = EXCLUDED.wau_cnt,
    mau_cnt = EXCLUDED.mau_cnt,
    modr_id = 'SYSTEM',
    mod_dtm = CURRENT_TIMESTAMP;

  -- ─── 매출 집계 — 5경로 UNION ────────────────────────────────
  DELETE FROM public.stat_revenue_dly WHERE stat_dt = p_dt;

  INSERT INTO public.stat_revenue_dly (stat_dt, theme_cd, rev_pi, txn_cnt)
  SELECT
    p_dt                                   AS stat_dt,
    COALESCE(theme_cd, 'UNKNOWN')          AS theme_cd,
    SUM(amount)::DECIMAL(12,4)             AS rev_pi,
    COUNT(*)                               AS txn_cnt
  FROM (
    -- 경로 1: 방 생성 결제 — msg_room LEFT JOIN으로 metadata.theme_cd NULL 보완
    SELECT
      COALESCE(p.metadata->>'theme_cd', r.theme_cd) AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    LEFT JOIN public.msg_room r ON r.pymnt_id = p.payment_id
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_ROOM_CREATE'

    UNION ALL

    -- 경로 2: 팁
    SELECT
      r.theme_cd,
      t.tip_amt_pi AS amount
    FROM public.msg_tip t
    JOIN public.msg_room r ON r.room_id = t.room_id
    WHERE t.reg_dtm::date = p_dt
      AND t.del_yn = 'N'

    UNION ALL

    -- 경로 3: 스티커팩 구매
    SELECT
      sp.theme_cd,
      p.amount
    FROM public.msg_usr_stkr us
    JOIN public.msg_stkr_pack sp ON sp.pack_id = us.pack_id
    JOIN public.pi_pymnt p       ON p.payment_id = us.pymnt_id
    WHERE us.reg_dtm::date = p_dt
      AND us.del_yn = 'N'
      AND p.status IN ('completed', 'approved')

    UNION ALL

    -- 경로 4: 구독 — 'SUBSCRIPTION' 고정
    SELECT
      'SUBSCRIPTION' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_SUBSCR'

    UNION ALL

    -- 경로 5: type 미설정 기타 결제
    SELECT
      'UNKNOWN' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.msg_usr_stkr us
        WHERE us.pymnt_id = p.payment_id
          AND us.del_yn = 'N'
      )
  ) revenue
  GROUP BY theme_cd;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. fn_top_revenue_themes 재정의
--    변경: COALESCE(t.theme_nm, CASE r.theme_cd ...) — 미등록 코드 한국어 매핑
--           SUBSCRIPTION → '구독' / UNKNOWN → '기타'
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
    COALESCE(
      t.theme_nm,
      CASE r.theme_cd
        WHEN 'SUBSCRIPTION' THEN '구독'
        WHEN 'UNKNOWN'      THEN '기타'
        ELSE r.theme_cd
      END
    )::VARCHAR                             AS theme_nm,
    COALESCE(
      t.theme_emoji,
      CASE r.theme_cd
        WHEN 'SUBSCRIPTION' THEN '💳'
        WHEN 'UNKNOWN'      THEN '❓'
        ELSE NULL
      END
    )::VARCHAR                             AS theme_emoji,
    SUM(r.rev_pi)::DECIMAL(12,4)           AS total_pi,
    SUM(r.txn_cnt)::BIGINT                 AS total_txn
  FROM public.stat_revenue_dly r
  LEFT JOIN public.msg_theme t ON t.theme_cd = r.theme_cd
  WHERE r.stat_dt BETWEEN p_from AND p_to
  GROUP BY r.theme_cd, t.theme_nm, t.theme_emoji
  ORDER BY total_pi DESC
  LIMIT p_limit;
$$;
