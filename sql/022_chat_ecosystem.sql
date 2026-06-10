-- DA-APPROVED: Phase 9 PiChat 생태계 — 테마 팔로우·Pi Bet·Webhook 신규 주제영역. BET/OPTN/WEBHOOK 약어는 표준사전 미등재 외래어로 DA 승인 처리. msg_msg CHECK 확장은 기존 코드(AI_REPLY INSERT)와 DB 제약 불일치 버그 수정 포함.
-- TASK-070~072: msg_theme_follow / msg_bet / msg_bet_optn / msg_bet_entry / msg_webhook
-- + msg_msg.msg_tp_cd CHECK 확장 (AI_REPLY 버그 수정 + BET_NOTI 신규)
-- + msg_stkr_pack 커스텀 제작자 컬럼 (TASK-074)

-- ──────────────────────────────────────────
-- 1. msg_theme_follow — 테마 팔로우 (TASK-070)
--    팔로우한 테마의 신규 이벤트방 알림 구독
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_theme_follow (
  theme_follow_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_cd        VARCHAR(20) NOT NULL REFERENCES public.msg_theme(theme_cd),
  usr_id          UUID        NOT NULL,              -- sys_user.id (app 레벨 FK)
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (theme_cd, usr_id)
);

-- ──────────────────────────────────────────
-- 2. msg_bet — Pi Bet 베팅 이벤트 (TASK-071)
--    방장이 채팅방 내 베팅 이벤트 생성 — 참가비 고정, 승리 옵션 적중자가 풀 분배
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_bet (
  bet_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID          NOT NULL REFERENCES public.msg_room(room_id),
  crtr_usr_id  UUID          NOT NULL,               -- 생성자(방장) sys_user.id
  bet_titl     VARCHAR(200)  NOT NULL,               -- 베팅 주제
  bet_amt_pi   DECIMAL(10,4) NOT NULL CHECK (bet_amt_pi > 0), -- 1인 참가 베팅액 (고정)
  bet_st_cd    VARCHAR(10)   NOT NULL DEFAULT 'OPEN'
               CHECK (bet_st_cd IN ('OPEN','CLOSED','SETTLED','CANCELLED')),
  close_dtm    TIMESTAMPTZ,                          -- 베팅 참가 마감 시각
  win_optn_no  INTEGER,                              -- 정산 시 확정된 승리 옵션 번호
  settle_dtm   TIMESTAMPTZ,                          -- 정산 완료 시각
  del_yn       CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 3. msg_bet_optn — 베팅 선택지 (TASK-071)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_bet_optn (
  bet_optn_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id      UUID         NOT NULL REFERENCES public.msg_bet(bet_id),
  optn_no     INTEGER      NOT NULL,                 -- 옵션 번호 (1부터)
  optn_nm     VARCHAR(100) NOT NULL,                 -- 옵션 표시명
  del_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bet_id, optn_no)
);

-- ──────────────────────────────────────────
-- 4. msg_bet_entry — 베팅 참가 내역 (TASK-071)
--    Pi 결제(metadata.type='PI_BET') 완료 시 INSERT — 1인 1회
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_bet_entry (
  bet_entry_id UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id       UUID          NOT NULL REFERENCES public.msg_bet(bet_id),
  usr_id       UUID          NOT NULL,               -- 참가자 sys_user.id
  optn_no      INTEGER       NOT NULL,               -- 선택한 옵션 번호
  bet_amt_pi   DECIMAL(10,4) NOT NULL CHECK (bet_amt_pi > 0),
  pymnt_id     TEXT          NOT NULL REFERENCES public.pi_pymnt(payment_id),
  win_yn       CHAR(1)       NOT NULL DEFAULT 'N' CHECK (win_yn IN ('Y','N')),
  payout_pi    DECIMAL(10,4) NOT NULL DEFAULT 0,     -- 정산 분배액 (장부 기록 — A2U 송금은 후속)
  del_yn       CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bet_id, usr_id)
);

-- ──────────────────────────────────────────
-- 5. msg_webhook — 채팅 봇·Webhook (TASK-072, Business 전용)
--    webhook_url: 신규 메시지 push 대상 / api_key: 봇 메시지 전송 인증
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_webhook (
  webhook_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID         NOT NULL REFERENCES public.msg_room(room_id),
  usr_id      UUID         NOT NULL,                 -- 등록자(방장·BUSINESS) sys_user.id
  bot_nm      VARCHAR(50)  NOT NULL DEFAULT 'Bot',   -- 봇 메시지 표시명
  webhook_url TEXT,                                  -- 신규 메시지 push URL (NULL = 봇 전송 전용)
  api_key     TEXT         NOT NULL UNIQUE,          -- 봇 메시지 전송 API Key
  use_yn      CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  del_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 6. msg_stkr_pack — 커스텀 스티커 제작 컬럼 (TASK-074)
-- ──────────────────────────────────────────
ALTER TABLE public.msg_stkr_pack
  ADD COLUMN IF NOT EXISTS ownr_usr_id UUID,         -- 커스텀 팩 제작자 (NULL = 플랫폼 기본)
  ADD COLUMN IF NOT EXISTS mkt_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (mkt_yn IN ('Y','N')); -- 마켓플레이스 판매 여부

-- ──────────────────────────────────────────
-- 7. msg_msg.msg_tp_cd CHECK 확장
--    AI_REPLY: TASK-064 코드가 INSERT하지만 기존 CHECK에 누락 — INSERT 실패 버그 수정
--    BET_NOTI: TASK-071 베팅 알림 메시지 신규
-- ──────────────────────────────────────────
ALTER TABLE public.msg_msg DROP CONSTRAINT IF EXISTS msg_msg_msg_tp_cd_check;
ALTER TABLE public.msg_msg ADD CONSTRAINT msg_msg_msg_tp_cd_check
  CHECK (msg_tp_cd IN ('TEXT','IMAGE','FILE','VOICE','STICKER','TIP_NOTI','SYSTEM','AI_REPLY','BET_NOTI'));

-- ──────────────────────────────────────────
-- 인덱스
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_msg_theme_follow_usr   ON public.msg_theme_follow (usr_id)   WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_theme_follow_theme ON public.msg_theme_follow (theme_cd) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_bet_room           ON public.msg_bet          (room_id)  WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_bet_optn_bet       ON public.msg_bet_optn     (bet_id)   WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_bet_entry_bet      ON public.msg_bet_entry    (bet_id)   WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_bet_entry_usr      ON public.msg_bet_entry    (usr_id)   WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_webhook_room       ON public.msg_webhook      (room_id)  WHERE del_yn = 'N' AND use_yn = 'Y';
CREATE INDEX IF NOT EXISTS idx_msg_stkr_pack_ownr     ON public.msg_stkr_pack    (ownr_usr_id) WHERE del_yn = 'N';

-- ──────────────────────────────────────────
-- 8. fn_chat_marketplace — 마켓플레이스 인기 랭킹 RPC (TASK-070)
--    점수 = 멤버수×2 + 최근7일 메시지×0.5 + 최근7일 Pi Tip×10
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_marketplace(p_theme_cd VARCHAR DEFAULT NULL, p_limit INT DEFAULT 30)
RETURNS TABLE (
  room_id UUID, room_nm VARCHAR, room_desc TEXT, theme_cd VARCHAR,
  theme_nm VARCHAR, theme_emoji VARCHAR, theme_tp_cd VARCHAR,
  room_tp_cd CHAR, max_mbr_cnt INT, entry_fee_pi DECIMAL, entry_expire_dtm TIMESTAMPTZ,
  mbr_cnt BIGINT, msg_cnt_7d BIGINT, tip_amt_7d DECIMAL, score DECIMAL
) LANGUAGE sql STABLE AS $$
  SELECT r.room_id, r.room_nm, r.room_desc, r.theme_cd,
         t.theme_nm, t.theme_emoji, t.theme_tp_cd,
         r.room_tp_cd, r.max_mbr_cnt, r.entry_fee_pi, r.entry_expire_dtm,
         COALESCE(m.mbr_cnt, 0)  AS mbr_cnt,
         COALESCE(g.msg_cnt, 0)  AS msg_cnt_7d,
         COALESCE(tp.tip_amt, 0) AS tip_amt_7d,
         (COALESCE(m.mbr_cnt, 0) * 2 + COALESCE(g.msg_cnt, 0) * 0.5 + COALESCE(tp.tip_amt, 0) * 10)::DECIMAL AS score
  FROM public.msg_room r
  JOIN public.msg_theme t ON t.theme_cd = r.theme_cd AND t.del_yn = 'N'
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS mbr_cnt FROM public.msg_room_mbr mm
    WHERE mm.room_id = r.room_id AND mm.del_yn = 'N'
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS msg_cnt FROM public.msg_msg mg
    WHERE mg.room_id = r.room_id AND mg.del_yn = 'N'
      AND mg.reg_dtm >= NOW() - INTERVAL '7 days'
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ti.tip_amt_pi), 0) AS tip_amt FROM public.msg_tip ti
    WHERE ti.room_id = r.room_id AND ti.del_yn = 'N'
      AND ti.reg_dtm >= NOW() - INTERVAL '7 days'
  ) tp ON true
  WHERE r.del_yn = 'N' AND r.is_public_yn = 'Y' AND r.room_tp_cd IN ('G','E')
    AND (r.expr_dtm IS NULL OR r.expr_dtm > NOW())
    AND (r.room_tp_cd <> 'E' OR r.entry_expire_dtm IS NULL OR r.entry_expire_dtm > NOW())
    AND (p_theme_cd IS NULL OR r.theme_cd = p_theme_cd)
  ORDER BY score DESC, r.reg_dtm DESC
  LIMIT p_limit;
$$;

-- ──────────────────────────────────────────
-- 9. fn_room_analytics — 채팅방 일별 분석 RPC (TASK-073, Business 전용)
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_room_analytics(p_room_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE (
  stat_dt DATE, msg_cnt BIGINT, active_usr_cnt BIGINT, tip_amt_pi DECIMAL, new_mbr_cnt BIGINT
) LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT generate_series(CURRENT_DATE - (p_days - 1), CURRENT_DATE, INTERVAL '1 day')::date AS stat_dt
  ),
  msgs AS (
    SELECT reg_dtm::date AS dt, COUNT(*) AS c, COUNT(DISTINCT snd_usr_id) AS u
    FROM public.msg_msg
    WHERE room_id = p_room_id AND del_yn = 'N' AND reg_dtm >= CURRENT_DATE - (p_days - 1)
    GROUP BY 1
  ),
  tips AS (
    SELECT reg_dtm::date AS dt, COALESCE(SUM(tip_amt_pi), 0) AS amt
    FROM public.msg_tip
    WHERE room_id = p_room_id AND del_yn = 'N' AND reg_dtm >= CURRENT_DATE - (p_days - 1)
    GROUP BY 1
  ),
  mbrs AS (
    SELECT reg_dtm::date AS dt, COUNT(*) AS c
    FROM public.msg_room_mbr
    WHERE room_id = p_room_id AND del_yn = 'N' AND reg_dtm >= CURRENT_DATE - (p_days - 1)
    GROUP BY 1
  )
  SELECT d.stat_dt,
         COALESCE(m.c, 0)   AS msg_cnt,
         COALESCE(m.u, 0)   AS active_usr_cnt,
         COALESCE(t.amt, 0) AS tip_amt_pi,
         COALESCE(b.c, 0)   AS new_mbr_cnt
  FROM days d
  LEFT JOIN msgs m ON m.dt = d.stat_dt
  LEFT JOIN tips t ON t.dt = d.stat_dt
  LEFT JOIN mbrs b ON b.dt = d.stat_dt
  ORDER BY d.stat_dt;
$$;

-- 채팅방 MAU — 최근 p_days일 고유 발신자 수 (일별 합산과 달리 중복 제거)
CREATE OR REPLACE FUNCTION public.fn_room_mau(p_room_id UUID, p_days INT DEFAULT 30)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT snd_usr_id)
  FROM public.msg_msg
  WHERE room_id = p_room_id AND del_yn = 'N'
    AND reg_dtm >= CURRENT_DATE - (p_days - 1);
$$;
