-- DA-APPROVED: ui_theme 효과(fx) 레이어 — 색상과 별개로 '질감'(유리/클레이)을 관리자 화면에 입힘
-- 역할: theme_fx_cd 컬럼으로 글래스모피즘/뉴모피즘 효과 코드를 저장. 관리자 레이아웃이
--       <div data-admin-fx="glass|clay"> 로 주입 → globals.css 스코프 CSS가 질감 렌더.
--       색상 토큰(theme_tokens)·보안 sanitize는 불변. Pi 결제·인증 화면 완전 불변(관리자 스코프).
-- 표준단어: FX(효과) — 화면 표시 효과 코드. 기존 THEME/CD 재사용.
-- 값: NULL(효과 없음, 기존 테마 기본) / GLASS(유리) / CLAY(클레이·뉴모피즘)

-- ──────────────────────────────────────────────────────────────────────────────────
-- 1. theme_fx_cd 컬럼 추가 (nullable — 기존 테마는 효과 없음)
-- ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ui_theme
  ADD COLUMN IF NOT EXISTS theme_fx_cd VARCHAR(10)
  CHECK (theme_fx_cd IS NULL OR theme_fx_cd IN ('GLASS', 'CLAY'));

COMMENT ON COLUMN public.ui_theme.theme_fx_cd IS '효과 코드 — NULL(없음)/GLASS(유리)/CLAY(뉴모피즘). 색상과 별개 질감 레이어(관리자 스코프)';

-- ──────────────────────────────────────────────────────────────────────────────────
-- 2. 시드 — 프리즘 글래스 (글래스모피즘: 오렌지 primary + 무지개 차트 + 유리 질감)
--    유리가 비치려면 배경이 밝아야 하므로 background를 밝은 회백으로 세팅.
-- ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '프리즘 글래스',
  '글래스모피즘 — 반투명 유리 + 무지개빛 프리즘 테두리. 오렌지 primary·그린 accent.',
  'N', 'N', 'ADMIN', 'GLASS', 30,
  '{
    "light": {
      "background": "#eef0f4", "foreground": "#2b3440", "card": "#ffffff", "cardForeground": "#2b3440",
      "muted": "#e7eaf0", "mutedForeground": "#64748b", "secondary": "#e7eaf0", "border": "#dbe1ea",
      "primary": "#ff6a3d", "accent": "#22b184",
      "chart1": "#ff8a4d", "chart2": "#ffd23d", "chart3": "#3dd0ff", "chart4": "#9d6bff", "chart5": "#ff6b9d",
      "kpi1": "#fff1e6", "kpi2": "#e6f7ff", "kpi3": "#f3e8ff", "kpi4": "#ffe9ef", "kpi5": "#e8fff4"
    },
    "dark": {
      "background": "#0d0f14", "foreground": "#e6e9ef", "card": "#1a1d24", "cardForeground": "#e6e9ef",
      "muted": "#22262f", "mutedForeground": "#9aa4b2", "secondary": "#22262f", "border": "#2b303a",
      "primary": "#ff8a5d", "accent": "#3fe0a3",
      "chart1": "#ff8a4d", "chart2": "#ffd23d", "chart3": "#3dd0ff", "chart4": "#9d6bff", "chart5": "#ff6b9d",
      "kpi1": "#3a2c20", "kpi2": "#0e2836", "kpi3": "#2a1a3a", "kpi4": "#3a1f2a", "kpi5": "#12362a"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '프리즘 글래스' AND del_yn = 'N'
);

-- ──────────────────────────────────────────────────────────────────────────────────
-- 3. 시드 — 소프트 민트 클레이 (뉴모피즘: 세이지 그린 + 파스텔 옐로우 + 이중 그림자)
--    ⚠️ 뉴모피즘 필수 조건: background == card 동일 색이어야 그림자가 배경에 녹아든다.
-- ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '소프트 민트 클레이',
  '뉴모피즘 — 배경과 동화된 부드러운 이중 그림자 입체. 세이지 민트 + 파스텔 옐로우.',
  'N', 'N', 'ADMIN', 'CLAY', 40,
  '{
    "light": {
      "background": "#e6ebe8", "foreground": "#46564e", "card": "#e6ebe8", "cardForeground": "#46564e",
      "muted": "#dde3df", "mutedForeground": "#78877e", "secondary": "#dde3df", "border": "#d3dad5",
      "primary": "#6ba892", "accent": "#d8c877",
      "chart1": "#6ba892", "chart2": "#d8c877", "chart3": "#8fbfa8", "chart4": "#e0d08a", "chart5": "#a9d0bf",
      "kpi1": "#dfeae4", "kpi2": "#f3edd0", "kpi3": "#e4efe8", "kpi4": "#f5efd6", "kpi5": "#e9f2ec"
    },
    "dark": {
      "background": "#2a302d", "foreground": "#d8e0dc", "card": "#2a302d", "cardForeground": "#d8e0dc",
      "muted": "#333a36", "mutedForeground": "#9db0a6", "secondary": "#333a36", "border": "#3a423e",
      "primary": "#7db8a0", "accent": "#d8c877",
      "chart1": "#7db8a0", "chart2": "#d8c877", "chart3": "#8fbfa8", "chart4": "#e0d08a", "chart5": "#a9d0bf",
      "kpi1": "#26332c", "kpi2": "#33301e", "kpi3": "#28352e", "kpi4": "#34301c", "kpi5": "#2a352e"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '소프트 민트 클레이' AND del_yn = 'N'
);
