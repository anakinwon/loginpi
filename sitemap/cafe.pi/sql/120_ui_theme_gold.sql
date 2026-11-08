-- DA-APPROVED: UI 테마 추가 — '골드 럭셔리' (세피아·골드, HR 대시보드 핀 영감)
-- 다크 모드에서 핀처럼 럭셔리하게 보이도록 설계 (라이트=샴페인 베이지, 다크=세피아).
-- StatsCard 텍스트색(text-slate-900 dark:text-slate-50)과 정합되게
--   라이트 KPI=밝은 베이지(진한 글자 가독), 다크 KPI=어두운 세피아(흰 글자 가독).

INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '골드 럭셔리',
  '세피아·골드 럭셔리 — 다크 모드에서 가장 빛납니다 (HR 대시보드 영감).',
  'N', 'N', 30,
  '{
    "light": {
      "primary": "#b8860b",
      "accent": "#d4af37",
      "chart1": "#b8860b",
      "chart2": "#cd853f",
      "chart3": "#daa520",
      "chart4": "#deb887",
      "chart5": "#a0772b",
      "kpi1": "#f5ecd2",
      "kpi2": "#f0e2c0",
      "kpi3": "#ece3cb",
      "kpi4": "#f3e8c8",
      "kpi5": "#e8dcc0"
    },
    "dark": {
      "primary": "#e0b94e",
      "accent": "#d4af37",
      "chart1": "#e0b94e",
      "chart2": "#cd853f",
      "chart3": "#f0d77b",
      "chart4": "#b8860b",
      "chart5": "#deb887",
      "kpi1": "#2e2519",
      "kpi2": "#332a1c",
      "kpi3": "#2a2418",
      "kpi4": "#38301f",
      "kpi5": "#2c2417"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '골드 럭셔리' AND del_yn = 'N'
);
