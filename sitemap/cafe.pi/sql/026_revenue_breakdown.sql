-- DA-APPROVED: 매출 통계 기타(UNKNOWN) 세분화 — PI_TIP·DIRECT_PAY·PRODUCT_ORDER 분류 코드 추가.
--               theme_cd는 msg_theme 외 시스템 분류 코드를 겸용하는 기존 설계(SUBSCRIPTION·UNKNOWN)를 따른다.
--
-- 변경 내용:
--   1. fn_build_daily_stats 재정의
--      - 경로 2(팁): msg_tip→room.theme_cd 귀속 → 'PI_TIP' 고정 코드로 분리
--        (소스도 pi_pymnt metadata.type='PI_TIP'로 통일 — 타 경로와 status 필터 일관성)
--      - 경로 5(type 미설정) 3분할:
--        · metadata에 productName 보유 → 'PRODUCT_ORDER' (상품 구매 데모)
--        · metadata에 requestedAt 보유 → 'DIRECT_PAY'   (직접 금액 지정 전송)
--        · 나머지                      → 'UNKNOWN'       (기타)
--   2. fn_top_revenue_themes — 신규 코드 한국어 이름·이모지 매핑
--   3. stat_revenue_dly.theme_cd COMMENT 갱신
--   4. 과거 데이터 백필 (pi_pymnt 최초 결제일 ~ 오늘 재집계)

-- ──────────────────────────────────────────────────────────────
-- 1. fn_build_daily_stats 재정의
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

  -- ─── 매출 집계 — 7경로 UNION ────────────────────────────────
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

    -- 경로 2: 팁 — 'PI_TIP' 고정 코드 (테마 매출에서 분리)
    SELECT
      'PI_TIP' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'PI_TIP'

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

    -- 경로 5: 상품 구매 — type 미설정 + productName metadata
    SELECT
      'PRODUCT_ORDER' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' IS NULL
      AND p.metadata ? 'productName'

    UNION ALL

    -- 경로 6: 직접 전송 — type 미설정 + requestedAt metadata (직접 금액 지정 결제)
    SELECT
      'DIRECT_PAY' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' IS NULL
      AND NOT (p.metadata ? 'productName')
      AND p.metadata ? 'requestedAt'

    UNION ALL

    -- 경로 7: 잔여 기타 — type 미설정 + 위 분류 모두 불일치 (스티커 결제 제외)
    SELECT
      'UNKNOWN' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' IS NULL
      AND NOT (p.metadata ? 'productName')
      AND NOT (p.metadata ? 'requestedAt')
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
-- 2. fn_top_revenue_themes 재정의 — 신규 코드 한국어 매핑
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
        WHEN 'SUBSCRIPTION'  THEN '구독'
        WHEN 'PI_TIP'        THEN '팁'
        WHEN 'DIRECT_PAY'    THEN '직접 전송'
        WHEN 'PRODUCT_ORDER' THEN '상품 구매'
        WHEN 'UNKNOWN'       THEN '기타'
        ELSE r.theme_cd
      END
    )::VARCHAR                             AS theme_nm,
    COALESCE(
      t.theme_emoji,
      CASE r.theme_cd
        WHEN 'SUBSCRIPTION'  THEN '💳'
        WHEN 'PI_TIP'        THEN '💰'
        WHEN 'DIRECT_PAY'    THEN '📤'
        WHEN 'PRODUCT_ORDER' THEN '🛒'
        WHEN 'UNKNOWN'       THEN '❓'
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

-- ──────────────────────────────────────────────────────────────
-- 3. 컬럼 코멘트 갱신
-- ──────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.stat_revenue_dly.theme_cd IS
  'msg_theme.theme_cd 또는 시스템 분류 코드: SUBSCRIPTION(구독) · PI_TIP(팁) · DIRECT_PAY(직접 전송) · PRODUCT_ORDER(상품 구매) · UNKNOWN(기타)';

-- ──────────────────────────────────────────────────────────────
-- 4. 과거 데이터 백필 — 최초 결제일 ~ 오늘 전체 재집계
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dt DATE;
BEGIN
  FOR v_dt IN
    SELECT generate_series(
      (SELECT MIN(reg_dtm)::date FROM public.pi_pymnt),
      CURRENT_DATE,
      '1 day'
    )::date
  LOOP
    PERFORM public.fn_build_daily_stats(v_dt);
  END LOOP;
END;
$$;
