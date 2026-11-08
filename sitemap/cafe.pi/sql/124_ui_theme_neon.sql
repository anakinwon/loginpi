-- DA-APPROVED: UI 테마 '디지털 네온' 추가 — DIGITAL + AI 미래 테크 무드
-- 딥 네이비 + 일렉트릭 시안·바이올렛 네온. 다크 모드에서 강렬, 라이트는 클린 테크.
-- 배경 세트 포함(무드 완전 전환). 활성화는 사용자 선택(actv_yn='N').

INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '디지털 네온',
  '딥 네이비 + 일렉트릭 시안·바이올렛 네온. 미래적 테크·AI 느낌(다크 모드에서 강렬).',
  'N', 'N', 'GLOBAL', 18,
  '{
    "light": {
      "background": "#f8fafc", "foreground": "#0f172a", "card": "#ffffff", "cardForeground": "#0f172a",
      "muted": "#eef2f7", "mutedForeground": "#64748b", "secondary": "#eef2f7", "border": "#dbe4ee",
      "primary": "#4f46e5", "accent": "#a855f7",
      "chart1": "#06b6d4", "chart2": "#6366f1", "chart3": "#a855f7", "chart4": "#3b82f6", "chart5": "#ec4899",
      "kpi1": "#eef2ff", "kpi2": "#ecfeff", "kpi3": "#f5f3ff", "kpi4": "#eff6ff", "kpi5": "#fdf2f8"
    },
    "dark": {
      "background": "#0a0e1a", "foreground": "#e2e8f0", "card": "#111729", "cardForeground": "#e2e8f0",
      "muted": "#1a2235", "mutedForeground": "#94a3b8", "secondary": "#1a2235", "border": "#233049",
      "primary": "#818cf8", "accent": "#c084fc",
      "chart1": "#22d3ee", "chart2": "#818cf8", "chart3": "#c084fc", "chart4": "#60a5fa", "chart5": "#f472b6",
      "kpi1": "#131b30", "kpi2": "#0e2030", "kpi3": "#1a1430", "kpi4": "#122038", "kpi5": "#2a1428"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '디지털 네온' AND del_yn = 'N'
);
