-- DA-APPROVED: stat_actvty_dly · stat_revenue_dly 신규 생성 + fn_build_daily_stats RPC (TASK-082)
-- Phase 11: 어드민 통계 대시보드 — 일별 집계 롤업 테이블

-- ──────────────────────────────────────────────────────────────
-- 1. stat_actvty_dly — 일별 활동 집계 (DAU/WAU/MAU)
--    PK: stat_dt (날짜 1행)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stat_actvty_dly (
  stat_dt   DATE         PRIMARY KEY,
  dau_cnt   INTEGER      NOT NULL DEFAULT 0,  -- 해당 날짜 활성 사용자 수
  wau_cnt   INTEGER      NOT NULL DEFAULT 0,  -- 해당 날짜 기준 최근 7일 활성 사용자 수
  mau_cnt   INTEGER      NOT NULL DEFAULT 0,  -- 해당 날짜 기준 최근 30일 활성 사용자 수
  regr_id   TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.stat_actvty_dly         IS '일별 사용자 활동 집계 (DAU/WAU/MAU) — fn_build_daily_stats 롤업';
COMMENT ON COLUMN public.stat_actvty_dly.dau_cnt IS 'Daily Active Users: actvty_dt = stat_dt';
COMMENT ON COLUMN public.stat_actvty_dly.wau_cnt IS 'Weekly Active Users: actvty_dt BETWEEN stat_dt-6 AND stat_dt';
COMMENT ON COLUMN public.stat_actvty_dly.mau_cnt IS 'Monthly Active Users: actvty_dt BETWEEN stat_dt-29 AND stat_dt';

-- ──────────────────────────────────────────────────────────────
-- 2. stat_revenue_dly — 일별 × 테마별 매출 집계
--    PK: (stat_dt, theme_cd)
--    theme_cd: msg_theme.theme_cd 값 또는 'SUBSCRIPTION'(구독)·'UNKNOWN'(팩 미분류)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stat_revenue_dly (
  stat_dt   DATE          NOT NULL,
  theme_cd  VARCHAR(20)   NOT NULL,
  rev_pi    DECIMAL(12,4) NOT NULL DEFAULT 0,
  txn_cnt   INTEGER       NOT NULL DEFAULT 0,
  regr_id   TEXT          NOT NULL DEFAULT 'SYSTEM',
  reg_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT          NOT NULL DEFAULT 'SYSTEM',
  mod_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_stat_revenue_dly PRIMARY KEY (stat_dt, theme_cd)
);

COMMENT ON TABLE  public.stat_revenue_dly          IS '일별 × 테마별 매출 집계 — fn_build_daily_stats 롤업';
COMMENT ON COLUMN public.stat_revenue_dly.theme_cd IS 'msg_theme.theme_cd 또는 SUBSCRIPTION(구독) · UNKNOWN(팩 미분류)';
COMMENT ON COLUMN public.stat_revenue_dly.rev_pi   IS '총 매출 (Pi 단위, 4경로 합산)';
COMMENT ON COLUMN public.stat_revenue_dly.txn_cnt  IS '거래 건수';

-- ──────────────────────────────────────────────────────────────
-- 인덱스 — 집계 쿼리 및 cron 백필 성능 지원
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_actvty_log_dt
  ON public.sys_user_actvty_log (actvty_dt) WHERE del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_pi_pymnt_reg_dtm_status
  ON public.pi_pymnt (reg_dtm) WHERE status IN ('completed', 'approved');

CREATE INDEX IF NOT EXISTS idx_msg_tip_reg_dtm
  ON public.msg_tip (reg_dtm) WHERE del_yn = 'N';

CREATE INDEX IF NOT EXISTS idx_msg_usr_stkr_reg_dtm
  ON public.msg_usr_stkr (reg_dtm) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────
-- 3. fn_build_daily_stats — 멱등 일별 집계 RPC
-- ──────────────────────────────────────────────────────────────
-- 재실행 안전:
--   stat_actvty_dly — ON CONFLICT DO UPDATE (3개 카운터 덮어쓰기)
--   stat_revenue_dly — DELETE + INSERT (해당 날짜 전체 재계산, 트랜잭션 내 원자적)
-- 매출 4경로 UNION:
--   1. 방 생성 — pi_pymnt WHERE metadata->>'type' = 'CHAT_ROOM_CREATE'
--   2. 팁    — msg_tip JOIN msg_room (theme_cd 귀속)
--   3. 스티커 — msg_usr_stkr JOIN msg_stkr_pack JOIN pi_pymnt
--   4. 구독  — pi_pymnt WHERE metadata->>'type' = 'CHAT_SUBSCR' → theme_cd = 'SUBSCRIPTION'
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

  -- INTERVAL '6 days' → p_dt 포함 7개 날짜 (D-6 ~ D)
  SELECT COUNT(DISTINCT usr_id) INTO v_wau
    FROM public.sys_user_actvty_log
   WHERE actvty_dt BETWEEN (p_dt - INTERVAL '6 days')::date AND p_dt
     AND del_yn = 'N';

  -- INTERVAL '29 days' → p_dt 포함 30개 날짜 (D-29 ~ D)
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
  -- p_dt 행 전체 삭제 후 재삽입 → 누락·중복 없는 멱등 보장
  DELETE FROM public.stat_revenue_dly WHERE stat_dt = p_dt;

  INSERT INTO public.stat_revenue_dly (stat_dt, theme_cd, rev_pi, txn_cnt)
  SELECT
    p_dt                                   AS stat_dt,
    COALESCE(theme_cd, 'UNKNOWN')          AS theme_cd,
    SUM(amount)::DECIMAL(12,4)             AS rev_pi,
    COUNT(*)                               AS txn_cnt
  FROM (
    -- 경로 1: 방 생성 결제
    SELECT
      (p.metadata->>'theme_cd') AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_ROOM_CREATE'

    UNION ALL

    -- 경로 2: 팁 — msg_tip.tip_amt_pi가 서버 검증 금액
    SELECT
      r.theme_cd,
      t.tip_amt_pi AS amount
    FROM public.msg_tip t
    JOIN public.msg_room r ON r.room_id = t.room_id
    WHERE t.reg_dtm::date = p_dt
      AND t.del_yn = 'N'

    UNION ALL

    -- 경로 3: 스티커팩 구매 — msg_usr_stkr.reg_dtm 기준
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

    -- 경로 4: 구독 — 테마 미분류, 'SUBSCRIPTION' 고정
    SELECT
      'SUBSCRIPTION' AS theme_cd,
      p.amount
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date = p_dt
      AND p.status IN ('completed', 'approved')
      AND p.metadata->>'type' = 'CHAT_SUBSCR'

    UNION ALL

    -- 경로 5: type 미설정 기타 결제 — 스티커팩(경로 3)과 중복 제외
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
