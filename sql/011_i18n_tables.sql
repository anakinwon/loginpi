-- TASK-042: i18n 다국어 관리 테이블

-- 지원 언어 목록
CREATE TABLE IF NOT EXISTS public.i18n_locale (
  locale_cd    TEXT        PRIMARY KEY,
  locale_nm    TEXT        NOT NULL,
  flag_emoji   TEXT,
  is_active    CHAR(1)     NOT NULL DEFAULT 'Y' CHECK (is_active IN ('Y','N')),
  sort_ord     INT         NOT NULL DEFAULT 0,
  reg_dtm      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mod_dtm      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 번역 키-값 저장 (DB → JSON 동기화 원본)
CREATE TABLE IF NOT EXISTS public.i18n_message (
  msg_id       UUID        NOT NULL DEFAULT gen_random_uuid(),
  locale_cd    TEXT        NOT NULL REFERENCES public.i18n_locale(locale_cd),
  msg_key      TEXT        NOT NULL,  -- 'board.title', 'common.save'
  msg_val      TEXT,
  is_auto      CHAR(1)     NOT NULL DEFAULT 'N' CHECK (is_auto IN ('Y','N')),
  reg_dtm      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mod_dtm      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT i18n_message_pkey PRIMARY KEY (msg_id),
  CONSTRAINT i18n_message_uq   UNIQUE (locale_cd, msg_key)
);

-- 국가/통화 정보
CREATE TABLE IF NOT EXISTS public.i18n_country (
  country_cd       TEXT        PRIMARY KEY,
  country_nm       TEXT        NOT NULL,
  country_nm_local TEXT,
  locale_cd        TEXT        REFERENCES public.i18n_locale(locale_cd),
  currency_cd      TEXT,
  flag_emoji       TEXT,
  sort_ord         INT         NOT NULL DEFAULT 0,
  reg_dtm          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_i18n_message_locale ON public.i18n_message (locale_cd, msg_key);

-- 초기 언어 데이터 (15개)
INSERT INTO public.i18n_locale (locale_cd, locale_nm, flag_emoji, is_active, sort_ord) VALUES
  ('ko',  '한국어',           '🇰🇷', 'Y',  1),
  ('en',  'English',          '🇺🇸', 'Y',  2),
  ('zh',  '中文',             '🇨🇳', 'Y',  3),
  ('ja',  '日本語',           '🇯🇵', 'Y',  4),
  ('hi',  'हिन्दी',            '🇮🇳', 'Y',  5),
  ('vi',  'Tiếng Việt',       '🇻🇳', 'Y',  6),
  ('af',  'Afrikaans',        '🇿🇦', 'Y',  7),
  ('fil', 'Filipino',         '🇵🇭', 'Y',  8),
  ('th',  'ภาษาไทย',          '🇹🇭', 'Y',  9),
  ('id',  'Bahasa Indonesia',  '🇮🇩', 'Y', 10),
  ('ms',  'Bahasa Melayu',    '🇲🇾', 'Y', 11),
  ('es',  'Español',          '🇪🇸', 'Y', 12),
  ('fr',  'Français',         '🇫🇷', 'Y', 13),
  ('de',  'Deutsch',          '🇩🇪', 'Y', 14),
  ('it',  'Italiano',         '🇮🇹', 'Y', 15)
ON CONFLICT (locale_cd) DO NOTHING;
