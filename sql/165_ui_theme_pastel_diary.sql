-- DA-APPROVED: UI 테마 '파스텔 다이어리' 추가 — 뉴모피즘(CLAY) 질감 재사용 + 웜 크림 캔디 파스텔.
--   JSONB theme_tokens 내 카멜케이스(cardForeground 등)는 SQL 식별자가 아닌 색상 토큰 키
--   (기존 sql/119~124·153·154 동일 패턴) (2026-07-07)
-- 질감은 기존 theme_fx_cd='CLAY'(이중 그림자 뉴모피즘) 재사용 → 인프라 변경 없음.
-- ⚠️ 뉴모피즘 필수 조건: background == card 동일 색이어야 그림자가 배경에 녹아든다.
-- 팔레트: 마스터 제공 스냅샷(newdesign00001.png) 기반 — 따뜻한 크림 아이보리 베이스
--   + 베이비핑크·베이비블루·파스텔옐로·파스텔그린·라벤더 5색 캔디 파스텔(다이어리 위젯 감성).
--   기존 '드리미 파스텔'(쿨톤 블루그레이 베이스)과 달리 웜톤 크림 베이스로 차별화.

INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '파스텔 다이어리',
  '뉴모피즘 — 웜 크림 아이보리 베이스 + 베이비핑크·블루·옐로·그린·라벤더 캔디 파스텔. 다이어리 위젯 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 60,
  '{
    "light": {
      "background": "#f0ebe4", "foreground": "#5c554c", "card": "#f0ebe4", "cardForeground": "#5c554c",
      "muted": "#e7e1d8", "mutedForeground": "#948c80", "secondary": "#e7e1d8", "border": "#ddd5ca",
      "primary": "#e3a7a7", "accent": "#a5c8e8",
      "chart1": "#e3a7a7", "chart2": "#a5c8e8", "chart3": "#eed48e", "chart4": "#b3d6ab", "chart5": "#c7b6e2",
      "kpi1": "#f6e3e1", "kpi2": "#e3edf7", "kpi3": "#f7efd6", "kpi4": "#e6f2e2", "kpi5": "#eee8f6"
    },
    "dark": {
      "background": "#2e2b27", "foreground": "#e3ddd4", "card": "#2e2b27", "cardForeground": "#e3ddd4",
      "muted": "#38342f", "mutedForeground": "#a59d92", "secondary": "#38342f", "border": "#403c36",
      "primary": "#d49a9a", "accent": "#9dbcd8",
      "chart1": "#d49a9a", "chart2": "#9dbcd8", "chart3": "#d8c17e", "chart4": "#a2c69a", "chart5": "#b5a4d4",
      "kpi1": "#362b2a", "kpi2": "#28323c", "kpi3": "#37321f", "kpi4": "#2a3428", "kpi5": "#302a3a"
    }
  }'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '파스텔 다이어리' AND del_yn = 'N'
);
