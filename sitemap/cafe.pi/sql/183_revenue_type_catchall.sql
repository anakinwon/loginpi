-- DA-APPROVED: 매출 일집계 결제 type 총망라(catch-all) 복원 — 신종 type 누락 근본 해소
-- ─────────────────────────────────────────────────────────────────────────────
-- 배경(2026-07-17 운영 실측): stat_revenue_dly 0행인데 pi_pymnt 완결 39건·171.3π 실재.
--   sql/043(KST 개편)이 sql/026의 세분화(경로 5~7: PRODUCT_ORDER·DIRECT_PAY·잔여 UNKNOWN)를
--   유실 회귀 → "type IS NULL"만 기타로 수용. 이후 등장한 신종 type(MPS_ESCROW·FBCK_BOND·
--   ADMIN_REFUND)이 어떤 경로에도 불일치 → 매일 배치 성공(Y)인데 0건 집계(조용한 누락).
--   Top 3 구매왕(fn_top_spenders)은 type 무관 합산이라 표시됨 → "구매왕은 있는데 매출 0" 증상.
--
-- 수정 원칙:
--   ① catch-all 복원+확장: 명시 분류에 안 잡히는 완결 결제는 type 유무와 무관하게 'UNKNOWN'
--      수용 — 미래의 새 결제 type이 추가돼도 총매출에서 다시는 조용히 빠지지 않는다.
--   ② MPS_ESCROW → 'PRODUCT_ORDER' 명시 분류 (기존 시스템 코드·i18n '상품 구매' 재사용).
--   ③ ADMIN_REFUND(환불 A2U 유출)는 매출·구매왕 양쪽에서 명시 제외 — 유입이 아니다.
--   ④ KST 날짜 기준(043)·멱등(DELETE 후 재삽입)·기존 경로 1~4는 그대로 유지.
-- 적용: staging + 운영. 적용 후 pi_pymnt 최초일부터 백필 필수(하단 참고 주석).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. fn_build_daily_stats — 매출 경로 총망라 재정의 ─────────────────────────
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
  -- 활동 집계 — reg_dtm의 KST 날짜 기준 (043 유지)
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

  -- 매출 집계 — KST 날짜 기준, 멱등(해당 일자 DELETE 후 재삽입)
  DELETE FROM public.stat_revenue_dly WHERE stat_dt = p_dt;

  INSERT INTO public.stat_revenue_dly (stat_dt, theme_cd, rev_pi, txn_cnt)
  SELECT
    p_dt,
    COALESCE(theme_cd, 'UNKNOWN'),
    SUM(amount)::DECIMAL(12,4),
    COUNT(*)
  FROM (
    -- 경로 1: 방 생성 결제 → 카페 테마 귀속
    SELECT (p.metadata->>'theme_cd') AS theme_cd, p.amount
    FROM public.pi_pymnt p
    WHERE (p.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_ROOM_CREATE'

    UNION ALL

    -- 경로 2: 팁(레거시 msg_tip 원장) → 방 테마 귀속
    SELECT r.theme_cd, t.tip_amt_pi AS amount
    FROM public.msg_tip t
    JOIN public.msg_room r ON r.room_id = t.room_id
    WHERE (t.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND t.del_yn = 'N'

    UNION ALL

    -- 경로 3: 스티커팩 구매 → 팩 테마 귀속
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

    -- 경로 5(신설): PyShop 주문(에스크로 입금) → 'PRODUCT_ORDER' (기존 시스템 코드 재사용)
    SELECT 'PRODUCT_ORDER' AS theme_cd, p.amount
    FROM public.pi_pymnt p
    WHERE (p.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'MPS_ESCROW'

    UNION ALL

    -- 경로 6(catch-all 확장): 위 명시 분류·환불 외 "type 있는" 완결 결제 전부 → 'UNKNOWN'
    --   (FBCK_BOND 등 현존 + 미래 신종 type 총수용 — 총매출 조용한 누락 재발 방지 핵심)
    SELECT 'UNKNOWN' AS theme_cd, p.amount
    FROM public.pi_pymnt p
    WHERE (p.reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' IS NOT NULL
      AND p.metadata->>'type' NOT IN
          ('CHAT_ROOM_CREATE', 'CHAT_SUBSCR', 'MPS_ESCROW', 'ADMIN_REFUND')

    UNION ALL

    -- 경로 7: type 미설정 기타 결제 (스티커팩 중복 제외 — 기존 유지)
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

-- ── 2. fn_top_spenders — 환불(ADMIN_REFUND)을 '구매'에서 제외 ──────────────────
--    (환불 A2U가 구매왕 순위에 합산되던 결함 — 유출은 구매가 아니다)
CREATE OR REPLACE FUNCTION public.fn_top_spenders(
  p_from  DATE,
  p_to    DATE DEFAULT CURRENT_DATE,
  p_limit INT  DEFAULT 3
)
RETURNS TABLE(
  usr_id     UUID,
  display_nm TEXT,
  total_pi   DECIMAL(12,4),
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
    AND COALESCE(p.metadata->>'type', '') <> 'ADMIN_REFUND'
  GROUP BY u.id, u.nick_nm, u.pi_username, u.google_email
  ORDER BY total_pi DESC
  LIMIT p_limit;
$$;

-- ── 3. 백필 (적용 직후 실행 — 멱등이라 재실행 안전) ───────────────────────────
-- 운영: pi_pymnt 최초 결제일(2026-07-01)부터 오늘까지 재계산
-- SELECT public.fn_build_daily_stats(d::date)
--   FROM generate_series('2026-07-01'::date, (now() AT TIME ZONE 'Asia/Seoul')::date, '1 day') AS d;
