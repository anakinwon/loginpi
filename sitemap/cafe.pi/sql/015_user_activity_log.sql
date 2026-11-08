-- DA-APPROVED: sys_user_actvty_log 신규 생성 — Phase 11 어드민 통계 대시보드 (TASK-080)
-- 사용자 활동 로그: DAU/WAU/MAU 집계 원천 데이터
-- UNIQUE(usr_id, actvty_dt) → 하루 1행 UPSERT 설계

CREATE TABLE IF NOT EXISTS public.sys_user_actvty_log (
  log_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id       UUID         NOT NULL REFERENCES public.sys_user(id),
  actvty_dt    DATE         NOT NULL DEFAULT CURRENT_DATE,
  actvty_tp_cd VARCHAR(20)  NOT NULL DEFAULT 'LOGIN',   -- LOGIN · CHAT · MSG · PAYMENT
  del_yn       CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_usr_actvty_dt UNIQUE (usr_id, actvty_dt)
);

COMMENT ON TABLE  public.sys_user_actvty_log              IS '사용자 활동 로그 (하루 1행 UPSERT — DAU/WAU/MAU 원천)';
COMMENT ON COLUMN public.sys_user_actvty_log.usr_id       IS '사용자 ID (sys_user.id FK)';
COMMENT ON COLUMN public.sys_user_actvty_log.actvty_dt    IS '활동 날짜 (CURRENT_DATE)';
COMMENT ON COLUMN public.sys_user_actvty_log.actvty_tp_cd IS '활동 유형 코드 — LOGIN · CHAT · MSG · PAYMENT';

-- ──────────────────────────────────────────
-- fn_record_activity: 하루 1회 활동 기록 (멱등 UPSERT)
-- 인자: p_usr_id UUID, p_type TEXT DEFAULT 'LOGIN'
-- 같은 날 재호출 → actvty_tp_cd · mod_dtm 만 갱신 (중복 행 없음)
-- ──────────────────────────────────────────
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
    (p_usr_id, CURRENT_DATE, p_type, p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (usr_id, actvty_dt)
  DO UPDATE SET
    actvty_tp_cd = EXCLUDED.actvty_tp_cd,
    modr_id      = EXCLUDED.modr_id,
    mod_dtm      = CURRENT_TIMESTAMP;
END;
$$;
