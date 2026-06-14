-- DA-APPROVED: 통계 집계 시간대 UTC→KST(Asia/Seoul) 통일 + stat_revenue_dly 멱등 재계산 DELETE (016 계승, 2026-06-14)
-- 문제: fn_record_activity·fn_build_daily_stats가 CURRENT_DATE(UTC) 기준이라
--   KST 00:00~09:00 접속(=UTC 전일)이 "어제"로 집계 → 한국 사용자 체감 "오늘"과 9h 어긋남.
-- 조치:
--   1) fn_record_activity: actvty_dt = KST 날짜로 기록 (앞으로 KST 하루 1행)
--   2) fn_build_daily_stats: 활동·매출 모두 reg_dtm의 KST 날짜 기준으로 집계.
--      활동은 actvty_dt(과거 UTC 기록) 대신 reg_dtm KST로 집계 → 과거 행 보정 없이 정확.
--      p_dt 기본값도 KST 오늘.
--   * 백필(전체 날짜 재집계)은 별도 실행.

-- ── 1. fn_record_activity — actvty_dt를 KST 날짜로 ──────────────────
CREATE OR REPLACE FUNCTION public.fn_record_activity(
  p_usr_id UUID,
  p_type   TEXT DEFAULT 'LOGIN'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.sys_user_actvty_log
    (usr_id, actvty_dt, actvty_tp_cd, regr_id, modr_id)
  VALUES
    (p_usr_id, (now() AT TIME ZONE 'Asia/Seoul')::date, p_type,
     p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (usr_id, actvty_dt)
  DO UPDATE SET
    actvty_tp_cd = EXCLUDED.actvty_tp_cd,
    modr_id      = EXCLUDED.modr_id,
    mod_dtm      = CURRENT_TIMESTAMP;
END;
$$;

-- ── 2. fn_build_daily_stats — KST 기준 집계 ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_build_daily_stats(
  p_dt DATE DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
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
  -- 활동 집계 — reg_dtm의 KST 날짜 기준 (actvty_dt는 과거 UTC 기록이라 reg_dtm으로 정확 집계)
  SELECT COUNT(DISTINCT usr_id) INTO v_dau
    FROM public.sys_user_actvty_log
   WHERE (reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
     AND del_yn = 'N';

  SELECT COUNT(DISTINCT usr_id) INTO v_wau
    FROM public.sys_user_actvty_log
   WHERE (reg_dtm AT TIME ZONE 'Asia/Seoul')::date
         BETWEEN (p_dt - INTERVAL '6 days')::date AND p_dt
     AND del_yn = 'N';

  SELECT COUNT(DISTINCT usr_id) INTO v_mau
    FROM public.sys_user_actvty_log
   WHERE (reg_dtm AT TIME ZONE 'Asia/Seoul')::date
         BETWEEN (p_dt - INTERVAL '29 days')::date AND p_dt
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

  -- 매출 집계 — 모든 경로 reg_dtm의 KST 날짜 기준 (멱등: 해당 일자 DELETE 후 재삽입)
  DELETE FROM public.stat_revenue_dly WHERE stat_dt = p_dt;

  INSERT INTO public.stat_revenue_dly (stat_dt, theme_cd, rev_pi, txn_cnt)
  SELECT
    p_dt,
    COALESCE(theme_cd, 'UNKNOWN'),
    SUM(amount)::DECIMAL(12,4),
    COUNT(*)
  FROM (
    -- 경로 1: 방 생성 결제
    SELECT (p.metadata->>'theme_cd') AS theme_cd, p.amount
    FROM public.pi_pymnt p
    WHERE (p.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_ROOM_CREATE'

    UNION ALL

    -- 경로 2: 팁
    SELECT r.theme_cd, t.tip_amt_pi AS amount
    FROM public.msg_tip t
    JOIN public.msg_room r ON r.room_id = t.room_id
    WHERE (t.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND t.del_yn = 'N'

    UNION ALL

    -- 경로 3: 스티커팩 구매
    SELECT sp.theme_cd, p.amount
    FROM public.msg_usr_stkr us
    JOIN public.msg_stkr_pack sp ON sp.pack_id = us.pack_id
    JOIN public.pi_pymnt p       ON p.payment_id = us.pymnt_id
    WHERE (us.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND us.del_yn = 'N'
      AND p.status IN ('completed', 'approved')

    UNION ALL

    -- 경로 4: 구독
    SELECT 'SUBSCRIPTION' AS theme_cd, p.amount
    FROM public.pi_pymnt p
    WHERE (p.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_SUBSCR'

    UNION ALL

    -- 경로 5: type 미설정 기타 결제 (스티커팩 중복 제외)
    SELECT 'UNKNOWN' AS theme_cd, p.amount
    FROM public.pi_pymnt p
    WHERE (p.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.msg_usr_stkr us
        WHERE us.pymnt_id = p.payment_id AND us.del_yn = 'N'
      )
  ) revenue
  GROUP BY theme_cd;
END;
$$;
