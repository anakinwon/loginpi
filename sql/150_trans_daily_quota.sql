-- DA-APPROVED: 번역 일일 무료 한도 (PRD_26 연계, 2026-06-30 v0.1)
--   비구독자의 무료 자동번역을 하루 N건으로 제약(과도/남용 방지 — Gemini API 비용 통제).
--   신규 번역(캐시 미스)만 차감, 캐시 재표시는 무차감. KST 자정 리셋. 구독자는 미적용(무제한).
-- ⭐ DA 원칙: 사용일(use_dt)은 업무 날짜 컬럼(별도 신설) — 시스템 컬럼(reg_dtm 등) 전용 금지.
-- 멱등: IF NOT EXISTS · CREATE OR REPLACE.

-- ── 1. 일일 사용량 카운터 (usr × 사용일) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trans_daily_usage (
  usage_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id     TEXT        NOT NULL,                       -- 사용자 식별자(sys_user.id)
  use_dt     DATE        NOT NULL,                       -- 사용일(KST 기준 업무 날짜 — 시스템 컬럼 아님)
  use_cnt    INTEGER     NOT NULL DEFAULT 0,             -- 당일 신규 번역 사용 건수
  del_yn     CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_trans_daily_usage UNIQUE (usr_id, use_dt)
);

COMMENT ON TABLE  public.trans_daily_usage         IS '번역 일일 무료 한도 카운터 (usr×사용일) — PRD_26. 비구독자 남용 방지';
COMMENT ON COLUMN public.trans_daily_usage.use_dt  IS '사용일(KST 기준 업무 날짜). 시스템 컬럼 미사용 — 한도 판정 전용 컬럼';
COMMENT ON COLUMN public.trans_daily_usage.use_cnt IS '당일 신규 번역(캐시 미스) 누적 건수. 캐시 재표시는 미집계';

CREATE INDEX IF NOT EXISTS idx_trans_daily_usage_lookup
  ON public.trans_daily_usage(usr_id, use_dt) WHERE del_yn = 'N';

-- ── 2. 한도 소비 RPC (원자적: 확인 + 증가) ────────────────────────────────
--   p_n건 소비 시도 → 잔여 한도 내에서 granted건만 승인(use_cnt += granted).
--   granted < p_n 이면 한도 소진(부분 승인). granted=0 이면 전량 차단.
--   FOR UPDATE 락으로 동시 요청에도 정확. KST 자정 기준 use_dt 자동 분리.
CREATE OR REPLACE FUNCTION public.fn_trans_quota_consume(
  p_usr_id TEXT,
  p_limit  INTEGER,
  p_n      INTEGER DEFAULT 1
)
RETURNS TABLE (
  granted  INTEGER,
  used     INTEGER,
  quota    INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
  v_today   DATE;
  v_cur     INTEGER;
  v_granted INTEGER;
BEGIN
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date;

  -- 오늘 행 보장(없으면 0으로 생성)
  INSERT INTO public.trans_daily_usage (usr_id, use_dt, use_cnt)
  VALUES (p_usr_id, v_today, 0)
  ON CONFLICT (usr_id, use_dt) DO NOTHING;

  -- 행 락 후 현재값 조회(원자적 확인+증가)
  SELECT use_cnt INTO v_cur
  FROM public.trans_daily_usage
  WHERE usr_id = p_usr_id AND use_dt = v_today
  FOR UPDATE;

  v_granted := GREATEST(0, LEAST(COALESCE(p_n, 1), p_limit - v_cur));

  IF v_granted > 0 THEN
    UPDATE public.trans_daily_usage
    SET use_cnt = use_cnt + v_granted,
        mod_dtm = CURRENT_TIMESTAMP
    WHERE usr_id = p_usr_id AND use_dt = v_today;
  END IF;

  RETURN QUERY SELECT v_granted, v_cur + v_granted, p_limit;
END $$;

COMMENT ON FUNCTION public.fn_trans_quota_consume(TEXT, INTEGER, INTEGER)
  IS '번역 일일 무료 한도 소비(원자적) — PRD_26. granted=승인 건수, used=소비 후 누적, quota=한도';

-- ── 검증 ───────────────────────────────────────────────────────────────────
--   SELECT * FROM public.fn_trans_quota_consume('test-usr', 10, 3);  -- granted=3 used=3
--   SELECT * FROM public.fn_trans_quota_consume('test-usr', 10, 9);  -- granted=7 used=10 (소진)
--   SELECT * FROM public.fn_trans_quota_consume('test-usr', 10, 1);  -- granted=0 used=10 (차단)
--   SELECT * FROM public.trans_daily_usage WHERE usr_id='test-usr';
