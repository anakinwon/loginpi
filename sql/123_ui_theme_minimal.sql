-- DA-APPROVED: UI 테마 '모던 미니멀' 추가 + 무드 순서 정렬(모던>다크>비비드)
-- 모던 미니멀: 화이트·차분한 무채색(잉크 슬레이트)·넓은 여백. 신규 생성·활성화.
-- 다크 프리미엄=기존 '골드 럭셔리', 비비드 모던=기존 '파스텔 대시보드' → sort_ord만 조정.

-- 1) 기존 활성 비활성 (부분 유니크 충돌 방지)
UPDATE public.ui_theme SET actv_yn = 'N', mod_dtm = CURRENT_TIMESTAMP
WHERE actv_yn = 'Y' AND del_yn = 'N';

-- 2) 무드 순서 정렬: 모던(15) > 다크 프리미엄/골드(16) > 비비드/파스텔(17)
UPDATE public.ui_theme SET sort_ord = 16, mod_dtm = CURRENT_TIMESTAMP
WHERE theme_nm = '골드 럭셔리' AND del_yn = 'N';
UPDATE public.ui_theme SET sort_ord = 17, mod_dtm = CURRENT_TIMESTAMP
WHERE theme_nm = '파스텔 대시보드' AND del_yn = 'N';

-- 3) '모던 미니멀' 추가(활성·GLOBAL)
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '모던 미니멀',
  '화이트 + 차분한 무채색(잉크 슬레이트) + 넓은 여백. 토스·리니어풍 깔끔함.',
  'Y', 'N', 'GLOBAL', 15,
  '{
    "light": {
      "primary": "oklch(0.35 0.02 255)", "accent": "oklch(0.55 0.07 250)",
      "chart1": "oklch(0.4 0.02 255)", "chart2": "oklch(0.55 0.04 250)", "chart3": "oklch(0.68 0.03 245)", "chart4": "oklch(0.6 0.06 220)", "chart5": "oklch(0.48 0.04 280)",
      "kpi1": "#f4f4f5", "kpi2": "#f1f1f3", "kpi3": "#eeeef0", "kpi4": "#f3f3f5", "kpi5": "#ededf0"
    },
    "dark": {
      "primary": "oklch(0.86 0.015 250)", "accent": "oklch(0.7 0.07 250)",
      "chart1": "oklch(0.86 0.015 250)", "chart2": "oklch(0.7 0.04 250)", "chart3": "oklch(0.6 0.03 245)", "chart4": "oklch(0.65 0.06 220)", "chart5": "oklch(0.55 0.05 280)",
      "kpi1": "#1f1f23", "kpi2": "#242428", "kpi3": "#1c1c20", "kpi4": "#26262a", "kpi5": "#202024"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '모던 미니멀' AND del_yn = 'N'
);
