-- DA-APPROVED: fn_top_active_users 가중치 종합 점수제 개편 — 반환 타입 변경으로 DROP 후 재생성
-- 활성 사용자 Top-N 산정 공식 (가중치 점수 합산 방식):
--   score = 활동일수 × p_w_visit + 콘텐츠활동 × p_w_content + 핵심액션 × p_w_action
--
--   A 방문 빈도   (기본 0.2): sys_user_actvty_log 기간 내 고유 활동일수
--   B 콘텐츠 활동 (기본 0.3): 채팅 메시지(TEXT) + 게시글 + 댓글
--   C 핵심 액션   (기본 0.5): Pi 결제 건수 (방 생성·팁·스티커·구독 — completed/approved)
--
-- 어뷰징 필터링:
--   · 채팅 메시지는 사용자당 하루 50건까지만 점수 반영 (도배 방지)
--   · TIP_NOTI 등 시스템 메시지 제외 (msg_tp_cd = 'TEXT'만 인정)
--   · del_yn = 'Y' 삭제 데이터 제외
--   · 팁은 pi_pymnt 경유 결제이므로 msg_tip을 별도 합산하지 않음 (이중 계산 방지)

DROP FUNCTION IF EXISTS public.fn_top_active_users(date, date, int);

CREATE FUNCTION public.fn_top_active_users(
  p_from      DATE,
  p_to        DATE    DEFAULT CURRENT_DATE,
  p_limit     INT     DEFAULT 3,
  p_w_visit   NUMERIC DEFAULT 0.2,
  p_w_content NUMERIC DEFAULT 0.3,
  p_w_action  NUMERIC DEFAULT 0.5
)
RETURNS TABLE(
  usr_id        UUID,
  display_nm    TEXT,
  activity_days BIGINT,
  content_cnt   BIGINT,
  action_cnt    BIGINT,
  score         NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH visit AS (
    -- A. 방문 빈도: 기간 내 고유 활동일수
    SELECT l.usr_id, COUNT(DISTINCT l.actvty_dt) AS days
    FROM public.sys_user_actvty_log l
    WHERE l.actvty_dt BETWEEN p_from AND p_to
      AND l.del_yn = 'N'
    GROUP BY l.usr_id
  ),
  chat AS (
    -- B-1. 채팅 메시지 — 도배 방지: 하루 50건 상한
    SELECT d.usr_id, SUM(LEAST(d.cnt, 50)) AS cnt
    FROM (
      SELECT m.snd_usr_id AS usr_id, m.reg_dtm::date AS dt, COUNT(*) AS cnt
      FROM public.msg_msg m
      WHERE m.reg_dtm::date BETWEEN p_from AND p_to
        AND m.del_yn = 'N'
        AND m.msg_tp_cd = 'TEXT'
        AND m.snd_usr_id IS NOT NULL
      GROUP BY m.snd_usr_id, m.reg_dtm::date
    ) d
    GROUP BY d.usr_id
  ),
  board AS (
    -- B-2. 게시판 활동: 게시글 + 댓글
    SELECT b.usr_id, COUNT(*) AS cnt
    FROM (
      SELECT p.rgst_usr_id AS usr_id
      FROM public.brd_post p
      WHERE p.reg_dtm::date BETWEEN p_from AND p_to
        AND p.del_yn = 'N'
      UNION ALL
      SELECT c.rgst_usr_id
      FROM public.brd_cmnt c
      WHERE c.reg_dtm::date BETWEEN p_from AND p_to
        AND c.del_yn = 'N'
    ) b
    WHERE b.usr_id IS NOT NULL
    GROUP BY b.usr_id
  ),
  pay AS (
    -- C. 핵심 액션: Pi 결제 건수 (approved = Pi Wallet 서명 완료 실거래)
    SELECT p.user_id AS usr_id, COUNT(*) AS cnt
    FROM public.pi_pymnt p
    WHERE p.reg_dtm::date BETWEEN p_from AND p_to
      AND p.status IN ('completed', 'approved')
    GROUP BY p.user_id
  ),
  merged AS (
    SELECT x.usr_id,
           SUM(x.days)    AS activity_days,
           SUM(x.content) AS content_cnt,
           SUM(x.action)  AS action_cnt
    FROM (
      SELECT v.usr_id, v.days, 0 AS content, 0 AS action FROM visit v
      UNION ALL
      SELECT c.usr_id, 0, c.cnt, 0 FROM chat c
      UNION ALL
      SELECT b.usr_id, 0, b.cnt, 0 FROM board b
      UNION ALL
      SELECT y.usr_id, 0, 0, y.cnt FROM pay y
    ) x
    GROUP BY x.usr_id
  )
  SELECT
    u.id                                                AS usr_id,
    COALESCE(u.nick_nm, u.pi_username, u.google_email)  AS display_nm,
    m.activity_days::BIGINT,
    m.content_cnt::BIGINT,
    m.action_cnt::BIGINT,
    ROUND(
      m.activity_days * p_w_visit
      + m.content_cnt * p_w_content
      + m.action_cnt  * p_w_action
    , 1)                                                AS score
  FROM merged m
  JOIN public.sys_user u ON u.id = m.usr_id
  ORDER BY score DESC, m.activity_days DESC
  LIMIT p_limit;
$$;
