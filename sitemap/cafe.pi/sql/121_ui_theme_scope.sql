-- DA-APPROVED: ui_theme 적용 범위 컬럼 — 활성 테마를 관리자(/admin)만 vs 전체 페이지에 적용
-- ADMIN: [data-admin-theme] 스코프 (관리자 화면만), GLOBAL: :root (전체 페이지)
ALTER TABLE public.ui_theme
  ADD COLUMN IF NOT EXISTS apply_scope_cd VARCHAR(8) NOT NULL DEFAULT 'ADMIN'
  CHECK (apply_scope_cd IN ('ADMIN', 'GLOBAL'));

COMMENT ON COLUMN public.ui_theme.apply_scope_cd IS '적용 범위 — ADMIN(관리자만)/GLOBAL(전체)';
