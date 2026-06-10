-- DA-APPROVED: msg_trans 신규 생성 + msg_msg.src_lang_cd / sys_user.display_locale_cd 컬럼 추가 — Phase 12 PiTranslate™ (TASK-090)
-- 메시지 번역 캐시: 같은 (msg_id, locale_cd) 조합은 1회만 번역 (Gemini 2.0 Flash → Claude Haiku fallback)
-- ※ ROADMAP의 sql/018 번호는 018_fix_stats_theme_mapping.sql이 선점하여 020으로 조정

CREATE TABLE IF NOT EXISTS public.msg_trans (
  trans_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id      UUID         NOT NULL REFERENCES public.msg_msg(msg_id),
  locale_cd   VARCHAR(20)  NOT NULL,                -- 번역 대상 locale (예: 'ko', 'ja', 'pt-BR')
  trans_cont  TEXT         NOT NULL,                -- 번역된 텍스트
  model_ver   VARCHAR(50),                          -- 번역에 사용된 모델 ID (버전 추적)
  del_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_msg_trans_msg_locale UNIQUE (msg_id, locale_cd)
);

CREATE INDEX IF NOT EXISTS idx_msg_trans_msg_id ON public.msg_trans(msg_id);
CREATE INDEX IF NOT EXISTS idx_msg_trans_locale ON public.msg_trans(locale_cd);

COMMENT ON TABLE  public.msg_trans            IS '메시지 번역 캐시 (PiTranslate™ — 동일 메시지·언어 1회만 번역)';
COMMENT ON COLUMN public.msg_trans.msg_id     IS '원본 메시지 ID (msg_msg.msg_id FK)';
COMMENT ON COLUMN public.msg_trans.locale_cd  IS '번역 대상 locale 코드';
COMMENT ON COLUMN public.msg_trans.trans_cont IS '번역된 텍스트';
COMMENT ON COLUMN public.msg_trans.model_ver  IS '번역 모델 ID (gemini-2.0-flash / claude-haiku 등)';

-- 원본 언어 코드 (첫 번역 시 Gemini Flash가 감지하여 기록)
ALTER TABLE public.msg_msg
  ADD COLUMN IF NOT EXISTS src_lang_cd VARCHAR(20);

COMMENT ON COLUMN public.msg_msg.src_lang_cd IS '원본 언어 코드 (ISO 639-1 — PiTranslate™ 자동 감지)';

-- 사용자 표시 언어 (서버 번역 큐가 방 참가자 locale 목록 조회에 사용 — TASK-096 선반영)
ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS display_locale_cd VARCHAR(20);

COMMENT ON COLUMN public.sys_user.display_locale_cd IS '사용자 표시 언어 locale 코드 (PiTranslate™ 번역 대상)';
