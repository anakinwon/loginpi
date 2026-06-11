-- TASK-050: PiCafé msg_* 테이블 13개 — DA 표준 시스템 컬럼 4개 전 테이블 필수
-- FK 의존성 순서: msg_theme → msg_stkr_pack → msg_stkr → msg_theme_stkr
--                → msg_room → msg_room_mbr → msg_msg → msg_msg_reac / msg_attch
--                → msg_subscr_plan → msg_subscr → msg_usr_stkr → msg_tip

-- ──────────────────────────────────────────
-- 1. msg_theme — 테마 마스터 (20개+ 테마 정의)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_theme (
  theme_cd    VARCHAR(20)  PRIMARY KEY,                                        -- 'GOLF', 'TRAVEL'
  theme_nm    VARCHAR(50)  NOT NULL,                                           -- '골프'
  theme_emoji VARCHAR(10)  NOT NULL,                                           -- '⛳'
  theme_desc  TEXT,
  theme_tp_cd VARCHAR(10)  NOT NULL CHECK (theme_tp_cd IN ('BASIC','PREMIUM')),
  sort_ord    INTEGER      NOT NULL DEFAULT 0,
  use_yn      CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  del_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 2. msg_subscr_plan — 구독 플랜 정의
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_subscr_plan (
  plan_cd     VARCHAR(30)   PRIMARY KEY,           -- 'FREE', 'PREMIUM_MONTHLY', 'BUSINESS_ANNUAL'
  plan_nm     VARCHAR(50)   NOT NULL,
  plan_desc   TEXT,
  plan_tp_cd  VARCHAR(10)   NOT NULL CHECK (plan_tp_cd IN ('FREE','PREMIUM','BUSINESS')),
  price_pi    DECIMAL(10,4) NOT NULL DEFAULT 0,
  mth_cnt     INTEGER       NOT NULL DEFAULT 0,    -- 구독 기간(월), 0 = 무기한(FREE)
  use_yn      CHAR(1)       NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  del_yn      CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 3. msg_stkr_pack — 스티커 팩
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_stkr_pack (
  pack_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_nm     VARCHAR(100)  NOT NULL,
  pack_desc   TEXT,
  theme_cd    VARCHAR(20)   REFERENCES public.msg_theme(theme_cd),
  price_pi    DECIMAL(10,4) NOT NULL DEFAULT 0,
  is_dflt_yn  CHAR(1)       NOT NULL DEFAULT 'N' CHECK (is_dflt_yn IN ('Y','N')), -- 테마 기본 스티커팩
  use_yn      CHAR(1)       NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  del_yn      CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 4. msg_stkr — 스티커 개별 항목
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_stkr (
  stkr_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id   UUID         NOT NULL REFERENCES public.msg_stkr_pack(pack_id),
  stkr_nm   VARCHAR(100) NOT NULL,
  stkr_url  TEXT         NOT NULL,  -- Supabase Storage URL
  sort_ord  INTEGER      NOT NULL DEFAULT 0,
  del_yn    CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm   TIMESTAMPTZ,
  regr_id   TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 5. msg_theme_stkr — 테마 기본 스티커팩 매핑
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_theme_stkr (
  theme_stkr_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_cd      VARCHAR(20) NOT NULL REFERENCES public.msg_theme(theme_cd),
  pack_id       UUID        NOT NULL REFERENCES public.msg_stkr_pack(pack_id),
  sort_ord      INTEGER     NOT NULL DEFAULT 0,
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (theme_cd, pack_id)
);

-- ──────────────────────────────────────────
-- 6. msg_room — 카페
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_room (
  room_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  room_nm          VARCHAR(100)  NOT NULL,
  room_desc        TEXT,
  theme_cd         VARCHAR(20)   NOT NULL REFERENCES public.msg_theme(theme_cd),
  room_tp_cd       CHAR(1)       NOT NULL CHECK (room_tp_cd IN ('D','G','E')), -- D=1:1 G=Group E=Event
  max_mbr_cnt      INTEGER       NOT NULL DEFAULT 50,
  is_public_yn     CHAR(1)       NOT NULL DEFAULT 'N' CHECK (is_public_yn IN ('Y','N')),
  entry_fee_pi     DECIMAL(10,4) NOT NULL DEFAULT 0,    -- 이벤트방 입장료 (Pi)
  entry_expire_dtm TIMESTAMPTZ,                         -- 이벤트방 종료 시각
  gate_min_pi      DECIMAL(10,4) NOT NULL DEFAULT 0,    -- Pi Gate 최소 잔액 조건
  pymnt_id         TEXT          REFERENCES public.pi_pymnt(payment_id),
  del_yn           CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm          TIMESTAMPTZ,
  regr_id          TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id          TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 7. msg_room_mbr — 카페 멤버
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_room_mbr (
  room_mbr_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES public.msg_room(room_id),
  usr_id          UUID        NOT NULL,              -- sys_user.id (app 레벨 FK)
  mbr_role_cd     VARCHAR(10) NOT NULL CHECK (mbr_role_cd IN ('OWNER','ADMIN','MEMBER','GUEST')),
  lst_read_msg_id UUID,                              -- 읽음 확인용 (app 레벨 FK)
  expire_dtm      TIMESTAMPTZ,                       -- GUEST 임시 입장 만료
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (room_id, usr_id)
);

-- ──────────────────────────────────────────
-- 8. msg_msg — 메시지
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_msg (
  msg_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID         NOT NULL REFERENCES public.msg_room(room_id),
  snd_usr_id UUID         NOT NULL,                 -- sys_user.id
  snd_usr_nm VARCHAR(100) NOT NULL,                 -- display_name 비정규화 (성능)
  msg_cont   TEXT,
  msg_tp_cd  VARCHAR(10)  NOT NULL DEFAULT 'TEXT'
             CHECK (msg_tp_cd IN ('TEXT','IMAGE','FILE','VOICE','STICKER','TIP_NOTI','SYSTEM')),
  attch_url  TEXT,                                  -- 이미지·파일·음성 오브젝트 URL
  stkr_id    UUID,                                  -- msg_stkr.stkr_id (app 레벨 FK)
  ref_msg_id UUID,                                  -- 답장 참조 (자기참조 cascade 회피를 위해 app 레벨 FK)
  del_yn     CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 9. msg_msg_reac — 메시지 이모지 반응
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_msg_reac (
  reac_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id     UUID        NOT NULL REFERENCES public.msg_msg(msg_id),
  usr_id     UUID        NOT NULL,
  reac_emoji VARCHAR(10) NOT NULL,
  del_yn     CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (msg_id, usr_id, reac_emoji)
);

-- ──────────────────────────────────────────
-- 10. msg_attch — 카페 첨부파일 (Supabase Storage)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_attch (
  attch_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id   UUID         NOT NULL REFERENCES public.msg_msg(msg_id),
  fl_nm    TEXT         NOT NULL,   -- 원본 파일명
  fl_pth   TEXT         NOT NULL,   -- Storage 경로 (chat-attachments/{msg_id}/{uuid}.ext)
  fl_url   TEXT         NOT NULL,   -- 접근 URL
  fl_sz    BIGINT       NOT NULL,   -- 파일 크기 (bytes)
  fl_tp    VARCHAR(100) NOT NULL,   -- MIME 타입
  del_yn   CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm  TIMESTAMPTZ,
  regr_id  TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id  TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 11. msg_subscr — 사용자 구독 현황
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_subscr (
  subscr_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id        UUID          NOT NULL UNIQUE,   -- sys_user.id
  plan_cd       VARCHAR(30)   NOT NULL REFERENCES public.msg_subscr_plan(plan_cd),
  pymnt_id      TEXT          REFERENCES public.pi_pymnt(payment_id),
  start_dtm     TIMESTAMPTZ   NOT NULL,
  expire_dtm    TIMESTAMPTZ   NOT NULL,
  auto_renew_yn CHAR(1)       NOT NULL DEFAULT 'Y' CHECK (auto_renew_yn IN ('Y','N')),
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 12. msg_usr_stkr — 사용자 보유 스티커팩
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_usr_stkr (
  usr_stkr_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id      UUID        NOT NULL,              -- sys_user.id
  pack_id     UUID        NOT NULL REFERENCES public.msg_stkr_pack(pack_id),
  pymnt_id    TEXT        REFERENCES public.pi_pymnt(payment_id),
  del_yn      CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usr_id, pack_id)
);

-- ──────────────────────────────────────────
-- 13. msg_tip — Pi Tip 내역
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msg_tip (
  tip_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID          NOT NULL REFERENCES public.msg_room(room_id),
  msg_id      UUID          REFERENCES public.msg_msg(msg_id),  -- TIP_NOTI 메시지 연결
  snd_usr_id  UUID          NOT NULL,    -- 송신자 sys_user.id
  rcvr_usr_id UUID          NOT NULL,    -- 수신자 sys_user.id
  tip_amt_pi  DECIMAL(10,4) NOT NULL CHECK (tip_amt_pi > 0),
  tip_cont    TEXT,                      -- 팁과 함께 전송한 메시지
  pymnt_id    TEXT          NOT NULL REFERENCES public.pi_pymnt(payment_id),
  del_yn      CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- 인덱스
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_msg_room_theme     ON public.msg_room     (theme_cd);
CREATE INDEX IF NOT EXISTS idx_msg_room_public    ON public.msg_room     (is_public_yn) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_room_mbr_usr   ON public.msg_room_mbr (usr_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_room_mbr_room  ON public.msg_room_mbr (room_id) WHERE del_yn = 'N';
-- cursor 기반 페이지네이션 (scroll-up 무한로드)
CREATE INDEX IF NOT EXISTS idx_msg_msg_room_dtm   ON public.msg_msg      (room_id, reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_msg_reac_msg   ON public.msg_msg_reac (msg_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_attch_msg      ON public.msg_attch    (msg_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_subscr_usr     ON public.msg_subscr   (usr_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_usr_stkr_usr   ON public.msg_usr_stkr (usr_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_tip_room       ON public.msg_tip      (room_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_tip_rcvr       ON public.msg_tip      (rcvr_usr_id);
CREATE INDEX IF NOT EXISTS idx_msg_stkr_pack      ON public.msg_stkr     (pack_id);

-- ──────────────────────────────────────────
-- Realtime RLS — msg_msg 카페 멤버만 구독 가능
-- service_role key는 RLS를 bypass하므로 서버 API는 영향 없음
-- anon key 기반 Realtime 구독 시에만 이 정책이 적용됨
-- ──────────────────────────────────────────
ALTER TABLE public.msg_msg ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msg_msg_member_read" ON public.msg_msg
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.msg_room_mbr mbr
      WHERE mbr.room_id = msg_msg.room_id
        AND mbr.usr_id  = auth.uid()
        AND mbr.del_yn  = 'N'
        AND (mbr.expire_dtm IS NULL OR mbr.expire_dtm > NOW())
    )
  );
