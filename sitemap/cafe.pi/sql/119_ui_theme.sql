-- DA-APPROVED: UI 색상 테마 — 색상 토큰 묶음 JSONB 저장 (관리자 대시보드 스코프 적용)
-- 역할: 관리자(/admin) 화면에만 적용되는 색상 테마를 DB에 저장하고 런타임 전환.
--       색상은 theme_tokens JSONB에 { "light": {...}, "dark": {...} } 형태로 보관.
-- 토큰 키: primary, accent, chart1~5, kpi1~5 (핵심 색상만)
-- 논리삭제: del_yn='Y' + del_dtm — 물리 DELETE 절대 금지

-- ──────────────────────────────────────────────────────────────────────────────────
-- 1. ui_theme — UI 색상 테마 정의
-- ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ui_theme (
  theme_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_nm     VARCHAR(50)  NOT NULL,                     -- 테마명 (표시용)
  theme_desc   TEXT,                                      -- 테마 설명 (선택)
  theme_tokens JSONB        NOT NULL,                     -- { "light": {...}, "dark": {...} }
  actv_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (actv_yn IN ('Y','N')),  -- 활성 여부
  lock_yn      CHAR(1)      NOT NULL DEFAULT 'N' CHECK (lock_yn IN ('Y','N')),  -- 삭제 잠금(시드 기본 테마)
  sort_ord     SMALLINT     NOT NULL DEFAULT 0,           -- 표시 순서
  del_yn       CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.ui_theme              IS 'UI 색상 테마 — 관리자 대시보드 스코프 색상 토큰(JSONB)';
COMMENT ON COLUMN public.ui_theme.theme_tokens IS '색상 토큰 {light:{primary,accent,chart1~5,kpi1~5}, dark:{...}}';
COMMENT ON COLUMN public.ui_theme.actv_yn      IS '활성 여부 — 활성 테마는 1개만(부분 유니크)';
COMMENT ON COLUMN public.ui_theme.lock_yn      IS '삭제 잠금 — 시드 기본 테마 보호';

-- 활성 테마는 1개만 (부분 유니크 인덱스)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ui_theme_active
  ON public.ui_theme(actv_yn) WHERE actv_yn = 'Y' AND del_yn = 'N';

-- 정렬 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_ui_theme_sort
  ON public.ui_theme(sort_ord) WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────────────────────────
-- 2. 시드 — 기본(그린) + 파스텔 대시보드
--    기본 테마: 현재 globals.css 값을 그대로 토큰화 (활성화 시 현재와 동일)
-- ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, sort_ord, theme_tokens, regr_id, modr_id)
VALUES
(
  '기본 (그린)',
  'cafe-pi 기본 색상 — 그린 primary + 보라 차트. 원복 기준 테마.',
  'Y', 'Y', 10,
  '{
    "light": {
      "primary": "oklch(0.841 0.238 128.85)",
      "accent": "oklch(0.967 0.001 286.375)",
      "chart1": "oklch(0.785 0.115 274.713)",
      "chart2": "oklch(0.585 0.233 277.117)",
      "chart3": "oklch(0.511 0.262 276.966)",
      "chart4": "oklch(0.457 0.24 277.023)",
      "chart5": "oklch(0.398 0.195 277.366)",
      "kpi1": "#eef2ff",
      "kpi2": "#fff1e6",
      "kpi3": "#fefce8",
      "kpi4": "#eff6ff",
      "kpi5": "#fdf2f8"
    },
    "dark": {
      "primary": "oklch(0.768 0.233 130.85)",
      "accent": "oklch(0.274 0.006 286.033)",
      "chart1": "oklch(0.785 0.115 274.713)",
      "chart2": "oklch(0.585 0.233 277.117)",
      "chart3": "oklch(0.511 0.262 276.966)",
      "chart4": "oklch(0.457 0.24 277.023)",
      "chart5": "oklch(0.398 0.195 277.366)",
      "kpi1": "#312e5b",
      "kpi2": "#3a2c20",
      "kpi3": "#3a3417",
      "kpi4": "#1e2f48",
      "kpi5": "#3a1f33"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
),
(
  '파스텔 대시보드',
  'Pinterest 영감 — 파스텔 KPI 카드 + 다채색 차트.',
  'N', 'N', 20,
  '{
    "light": {
      "primary": "#a78bfa",
      "accent": "#f0abfc",
      "chart1": "#a78bfa",
      "chart2": "#60a5fa",
      "chart3": "#34d399",
      "chart4": "#fbbf24",
      "chart5": "#f472b6",
      "kpi1": "#ede9fe",
      "kpi2": "#ffedd5",
      "kpi3": "#fef9c3",
      "kpi4": "#e0f2fe",
      "kpi5": "#fce7f3"
    },
    "dark": {
      "primary": "#c4b5fd",
      "accent": "#f5d0fe",
      "chart1": "#c4b5fd",
      "chart2": "#93c5fd",
      "chart3": "#6ee7b7",
      "chart4": "#fcd34d",
      "chart5": "#f9a8d4",
      "kpi1": "#2e2a4a",
      "kpi2": "#3a2c1e",
      "kpi3": "#39341a",
      "kpi4": "#1e3048",
      "kpi5": "#3a2030"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
)
ON CONFLICT DO NOTHING;
