-- DA-APPROVED: UI 테마 추가·활성화 — '따뜻한 카페' (globals.css 카페 팔레트와 일치)
-- 전체 사이트 리디자인의 기본 팔레트(크림·에스프레소 브라운·딥그린)를 테마로 저장하고 활성화.
-- 기존 활성 테마(파스텔 등)가 GLOBAL로 globals.css 기본을 덮어쓰므로, 카페를 활성화해 일치시킨다.

-- 1) 기존 활성 테마 비활성 (부분 유니크 uq_ui_theme_active 충돌 방지)
UPDATE public.ui_theme SET actv_yn = 'N', mod_dtm = CURRENT_TIMESTAMP
WHERE actv_yn = 'Y' AND del_yn = 'N';

-- 2) '따뜻한 카페' 추가(활성·GLOBAL). 이미 있으면 활성화만.
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '따뜻한 카페',
  '크림·우드톤 + 에스프레소 브라운·딥그린. 사이트 기본 카페 감성(globals.css와 일치).',
  'Y', 'N', 'GLOBAL', 5,
  '{
    "light": {
      "primary": "oklch(0.46 0.07 55)", "accent": "oklch(0.62 0.07 150)",
      "chart1": "oklch(0.58 0.1 55)", "chart2": "oklch(0.62 0.08 150)", "chart3": "oklch(0.7 0.1 80)", "chart4": "oklch(0.55 0.09 35)", "chart5": "oklch(0.5 0.06 120)",
      "kpi1": "#f3ede3", "kpi2": "#efe6d6", "kpi3": "#e8efe2", "kpi4": "#f5e9dd", "kpi5": "#ece4da"
    },
    "dark": {
      "primary": "oklch(0.74 0.11 70)", "accent": "oklch(0.6 0.07 150)",
      "chart1": "oklch(0.74 0.11 70)", "chart2": "oklch(0.65 0.09 150)", "chart3": "oklch(0.78 0.1 90)", "chart4": "oklch(0.62 0.1 35)", "chart5": "oklch(0.6 0.07 120)",
      "kpi1": "#2e2519", "kpi2": "#332a1c", "kpi3": "#2a2e22", "kpi4": "#38301f", "kpi5": "#2c2417"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '따뜻한 카페' AND del_yn = 'N'
);
