-- 021_msg_usr_badge.sql — 테마 활동 배지 (TASK-062 Trigger 7)
-- 테마 방에서 30일 활동 시 자동 수여 → 배지 강화(0.1 Pi, BADGE_UPGRADE)로 특별 표시
-- 의존성: msg_theme, msg_room, msg_msg, sys_user

-- ============================================================
-- 1. msg_usr_badge — 사용자 테마 활동 배지
-- ============================================================
CREATE TABLE IF NOT EXISTS public.msg_usr_badge (
  badge_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),              -- 배지 식별자
  usr_id    UUID         NOT NULL REFERENCES public.sys_user(id),            -- 사용자 식별자
  theme_cd  VARCHAR(20)  NOT NULL REFERENCES public.msg_theme(theme_cd),     -- 테마 코드
  upgr_yn   CHAR(1)      NOT NULL DEFAULT 'N',                               -- 강화 여부 (0.1 Pi 결제)
  upgr_dtm  TIMESTAMPTZ,                                                     -- 강화 일시
  pymnt_id  TEXT,                                                            -- 강화 결제 식별자
  noti_yn   CHAR(1)      NOT NULL DEFAULT 'N',                               -- 수여 팝업 통지 여부
  regr_id   TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn    CHAR(1)      NOT NULL DEFAULT 'N',
  del_dtm   TIMESTAMPTZ,
  CONSTRAINT uq_msg_usr_badge UNIQUE (usr_id, theme_cd)
);

COMMENT ON TABLE  public.msg_usr_badge          IS '사용자 테마 활동 배지 — 30일 활동 자동 수여 + 0.1 Pi 강화';
COMMENT ON COLUMN public.msg_usr_badge.upgr_yn  IS '강화 여부 — BADGE_UPGRADE 0.1 Pi 결제 시 Y';
COMMENT ON COLUMN public.msg_usr_badge.noti_yn  IS '수여 축하 팝업(Trigger 7) 통지 여부';

CREATE INDEX IF NOT EXISTS ix_msg_usr_badge_usr ON public.msg_usr_badge (usr_id) WHERE del_yn = 'N';

-- ============================================================
-- 2. fn_award_theme_badge — 활동일수 체크 + 배지 수여 (원자 처리)
--    메시지 전송 후 after()에서 호출. 이미 보유 시 즉시 NULL 반환(저비용).
--    수여 조건: 해당 테마 방들에서 서로 다른 날짜 p_min_days일 이상 메시지 전송
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_award_theme_badge(
  p_usr_id   UUID,
  p_room_id  UUID,
  p_min_days INT DEFAULT 30
)
RETURNS TABLE (
  badge_id  UUID,
  theme_cd  VARCHAR(20),
  theme_nm  VARCHAR(50),
  theme_emoji VARCHAR(10)
)
LANGUAGE plpgsql
AS $$
-- RETURNS TABLE의 OUT 변수(theme_cd 등)와 테이블 컬럼명 충돌 해소 — 컬럼 우선
#variable_conflict use_column
DECLARE
  v_theme_cd VARCHAR(20);
  v_days     INT;
BEGIN
  -- 방의 테마 조회
  SELECT r.theme_cd INTO v_theme_cd
  FROM public.msg_room r
  WHERE r.room_id = p_room_id AND r.del_yn = 'N';

  IF v_theme_cd IS NULL THEN RETURN; END IF;

  -- 이미 보유한 배지면 종료 (인덱스 조회 — 매 메시지 호출 비용 최소화)
  IF EXISTS (
    SELECT 1 FROM public.msg_usr_badge b
    WHERE b.usr_id = p_usr_id AND b.theme_cd = v_theme_cd AND b.del_yn = 'N'
  ) THEN RETURN; END IF;

  -- 해당 테마 방들에서의 고유 활동일수 (시스템·팁·AI 메시지 제외)
  SELECT COUNT(DISTINCT DATE(m.reg_dtm)) INTO v_days
  FROM public.msg_msg m
  JOIN public.msg_room r ON r.room_id = m.room_id
  WHERE m.snd_usr_id = p_usr_id
    AND r.theme_cd   = v_theme_cd
    AND m.del_yn     = 'N'
    AND m.msg_tp_cd NOT IN ('SYSTEM', 'TIP_NOTI', 'AI_REPLY');

  IF v_days < p_min_days THEN RETURN; END IF;

  -- 수여 (동시 호출 안전 — UNIQUE 충돌 시 무시)
  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.msg_usr_badge (usr_id, theme_cd, regr_id, modr_id)
    VALUES (p_usr_id, v_theme_cd, 'SYSTEM', 'SYSTEM')
    ON CONFLICT (usr_id, theme_cd) DO NOTHING
    RETURNING msg_usr_badge.badge_id, msg_usr_badge.theme_cd
  )
  SELECT i.badge_id, i.theme_cd, t.theme_nm, t.theme_emoji
  FROM ins i
  JOIN public.msg_theme t ON t.theme_cd = i.theme_cd;
END;
$$;
