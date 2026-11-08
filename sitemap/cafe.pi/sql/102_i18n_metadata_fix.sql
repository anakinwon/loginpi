-- DA 중간점검 P1 조치: i18n 테이블 시스템 컬럼 4종 + 논리삭제 추가
-- 2026-06-23 | refs: docs/da/reports/2026-06-23_DA중간점검보고서.md
-- DA-APPROVED: 마스터 데이터 테이블도 시스템 컬럼 4종·논리삭제 패턴 필수 적용
--   i18n_locale / i18n_message / i18n_country 에 regr_id·modr_id·del_yn·del_dtm 누락

BEGIN;

-- ── i18n_locale ──────────────────────────────────────────────────────────────
-- 누락: regr_id, modr_id, del_yn, del_dtm

ALTER TABLE public.i18n_locale
  ADD COLUMN IF NOT EXISTS regr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS modr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS del_yn   CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  ADD COLUMN IF NOT EXISTS del_dtm  TIMESTAMPTZ;

-- ── i18n_message ─────────────────────────────────────────────────────────────
-- 누락: regr_id, modr_id, del_yn, del_dtm

ALTER TABLE public.i18n_message
  ADD COLUMN IF NOT EXISTS regr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS modr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS del_yn   CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  ADD COLUMN IF NOT EXISTS del_dtm  TIMESTAMPTZ;

-- ── i18n_country ─────────────────────────────────────────────────────────────
-- 누락: mod_dtm, regr_id, modr_id, del_yn, del_dtm

ALTER TABLE public.i18n_country
  ADD COLUMN IF NOT EXISTS mod_dtm  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS regr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS modr_id  TEXT        NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS del_yn   CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  ADD COLUMN IF NOT EXISTS del_dtm  TIMESTAMPTZ;

COMMIT;
