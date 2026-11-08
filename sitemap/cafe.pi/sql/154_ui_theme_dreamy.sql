-- DA-APPROVED: UI 테마 '드리미 파스텔' 추가 — 뉴모피즘(CLAY) 질감 재사용 + 파스텔 색상.
--   JSONB theme_tokens 내 카멜케이스(cardForeground 등)는 SQL 식별자가 아닌 색상 토큰 키
--   (기존 sql/119~124·153 동일 패턴) (2026-07-01)
-- 질감은 기존 theme_fx_cd='CLAY'(이중 그림자 뉴모피즘) 재사용 → 인프라 변경 없음.
-- ⚠️ 뉴모피즘 필수 조건: background == card 동일 색이어야 그림자가 배경에 녹아든다.
-- 팔레트: 베이비 블루 + 더스티 핑크 + 라벤더 몽환 파스텔.

INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '드리미 파스텔',
  '뉴모피즘 — 베이비 블루 + 더스티 핑크 + 라벤더 몽환 파스텔. 부드러운 이중 그림자 입체.',
  'N', 'N', 'ADMIN', 'CLAY', 50,
  '{
    "light": {
      "background": "#e4e6ef", "foreground": "#5a5a6e", "card": "#e4e6ef", "cardForeground": "#5a5a6e",
      "muted": "#dcdee9", "mutedForeground": "#8a8a9e", "secondary": "#dcdee9", "border": "#d2d4e2",
      "primary": "#e0a8b0", "accent": "#a8c4e0",
      "chart1": "#e0a8b0", "chart2": "#a8c4e0", "chart3": "#c8b0e0", "chart4": "#e8c0a8", "chart5": "#a8d0c8",
      "kpi1": "#f3e6ea", "kpi2": "#e6eef5", "kpi3": "#ece6f3", "kpi4": "#f5ece4", "kpi5": "#e6f2ee"
    },
    "dark": {
      "background": "#2c2a34", "foreground": "#dcd8e4", "card": "#2c2a34", "cardForeground": "#dcd8e4",
      "muted": "#35333f", "mutedForeground": "#a09eae", "secondary": "#35333f", "border": "#3c3a46",
      "primary": "#d0a0a8", "accent": "#a0bcd8",
      "chart1": "#d0a0a8", "chart2": "#a0bcd8", "chart3": "#bca8d4", "chart4": "#d8b4a0", "chart5": "#a0c4bc",
      "kpi1": "#34282e", "kpi2": "#28303a", "kpi3": "#302a3a", "kpi4": "#342c26", "kpi5": "#26342e"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '드리미 파스텔' AND del_yn = 'N'
);
