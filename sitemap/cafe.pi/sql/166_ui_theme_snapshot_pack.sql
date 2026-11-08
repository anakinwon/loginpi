-- DA-APPROVED: UI 테마 11종 일괄 추가 — 마스터 제공 스냅샷(newdesign00002~00012.png) 팔레트 기반.
--   JSONB theme_tokens 내 카멜케이스(cardForeground 등)는 SQL 식별자가 아닌 색상 토큰 키
--   (기존 sql/119~124·153·154·165 동일 패턴) (2026-07-07)
-- 질감은 기존 theme_fx_cd(CLAY/GLASS/NULL) 재사용 → 인프라 변경 없음.
-- ⚠️ 뉴모피즘(CLAY) 필수 조건: background == card 동일 색이어야 그림자가 배경에 녹아든다.
-- 멱등: 동일 테마명 활성 행 존재 시 건너뜀 (WHERE NOT EXISTS).

-- ── 애스트로 팝 (newdesign00002.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '애스트로 팝',
  '뉴모피즘 — 클린 화이트 + 로열 블루·비비드 옐로 팝. 우주비행사 스티커 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 61,
  '{
  "light": {
    "background": "#eef0f4",
    "foreground": "#363a45",
    "card": "#eef0f4",
    "cardForeground": "#363a45",
    "muted": "#e4e7ee",
    "mutedForeground": "#7c828f",
    "secondary": "#e4e7ee",
    "border": "#d9dde6",
    "primary": "#4550c8",
    "accent": "#f0cc45",
    "chart1": "#4550c8",
    "chart2": "#f0cc45",
    "chart3": "#8891e8",
    "chart4": "#f5e18e",
    "chart5": "#9aa3b8",
    "kpi1": "#e7e9fa",
    "kpi2": "#fbf4d8",
    "kpi3": "#edeffc",
    "kpi4": "#fdf8e6",
    "kpi5": "#eef1f6"
  },
  "dark": {
    "background": "#22242e",
    "foreground": "#e0e3ec",
    "card": "#22242e",
    "cardForeground": "#e0e3ec",
    "muted": "#2b2e3a",
    "mutedForeground": "#9ba1b2",
    "secondary": "#2b2e3a",
    "border": "#343846",
    "primary": "#6b76e8",
    "accent": "#f0cc45",
    "chart1": "#6b76e8",
    "chart2": "#f0cc45",
    "chart3": "#8891e8",
    "chart4": "#e6d98a",
    "chart5": "#8a93a8",
    "kpi1": "#262a40",
    "kpi2": "#3a3520",
    "kpi3": "#2a2d44",
    "kpi4": "#38341f",
    "kpi5": "#2a2d36"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '애스트로 팝' AND del_yn = 'N'
);

-- ── 스페이스 스케치 (newdesign00003.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '스페이스 스케치',
  '웜 페이퍼 크림 + 브라운 라인아트·파스텔 배지 포인트. 빈티지 우주 다이어리 감성.',
  'N', 'N', 'ADMIN', NULL, 62,
  '{
  "light": {
    "background": "#efe9dc",
    "foreground": "#4a4136",
    "card": "#f8f4ea",
    "cardForeground": "#4a4136",
    "muted": "#e6dfcf",
    "mutedForeground": "#8f8674",
    "secondary": "#e6dfcf",
    "border": "#d9d0bc",
    "primary": "#9c7a5a",
    "accent": "#94b4c8",
    "chart1": "#dfa3a3",
    "chart2": "#94b4c8",
    "chart3": "#e2ca88",
    "chart4": "#a3c096",
    "chart5": "#b08e6a",
    "kpi1": "#f5e6e0",
    "kpi2": "#e7eff3",
    "kpi3": "#f6efd9",
    "kpi4": "#e9f1e3",
    "kpi5": "#f2ebdd"
  },
  "dark": {
    "background": "#2b2822",
    "foreground": "#e5dfd2",
    "card": "#343028",
    "cardForeground": "#e5dfd2",
    "muted": "#3d382e",
    "mutedForeground": "#a89f8d",
    "secondary": "#3d382e",
    "border": "#454034",
    "primary": "#b8926e",
    "accent": "#8aabc0",
    "chart1": "#cf9898",
    "chart2": "#8aabc0",
    "chart3": "#d4bc7e",
    "chart4": "#98b48c",
    "chart5": "#a8865e",
    "kpi1": "#362b28",
    "kpi2": "#26323a",
    "kpi3": "#37321f",
    "kpi4": "#2a3426",
    "kpi5": "#332d22"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '스페이스 스케치' AND del_yn = 'N'
);

-- ── 판다 밀크 (newdesign00004.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '판다 밀크',
  '뉴모피즘 — 밀크 화이트 + 민트·블러시 핑크 파스텔. 몽글몽글 판다 위젯 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 63,
  '{
  "light": {
    "background": "#f2f0ea",
    "foreground": "#565248",
    "card": "#f2f0ea",
    "cardForeground": "#565248",
    "muted": "#e8e5dc",
    "mutedForeground": "#928d80",
    "secondary": "#e8e5dc",
    "border": "#ddd9cd",
    "primary": "#9cc4aa",
    "accent": "#eec0c8",
    "chart1": "#9cc4aa",
    "chart2": "#eec0c8",
    "chart3": "#e8d8a4",
    "chart4": "#b2c8e0",
    "chart5": "#c8bede",
    "kpi1": "#e8f2ea",
    "kpi2": "#faeaed",
    "kpi3": "#f7f1dd",
    "kpi4": "#e9eff7",
    "kpi5": "#efecf6"
  },
  "dark": {
    "background": "#292b27",
    "foreground": "#dfe2da",
    "card": "#292b27",
    "cardForeground": "#dfe2da",
    "muted": "#323430",
    "mutedForeground": "#9ca698",
    "secondary": "#323430",
    "border": "#3b3e39",
    "primary": "#8cba9c",
    "accent": "#d8a8b2",
    "chart1": "#8cba9c",
    "chart2": "#d8a8b2",
    "chart3": "#d4c58e",
    "chart4": "#a0b8d4",
    "chart5": "#b4a8cc",
    "kpi1": "#263229",
    "kpi2": "#362a2d",
    "kpi3": "#35321f",
    "kpi4": "#28303a",
    "kpi5": "#2e2a38"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '판다 밀크' AND del_yn = 'N'
);

-- ── 판다 스카이 (newdesign00005.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '판다 스카이',
  '스카이 블루 배경 + 크림 카드·인디고 포인트. 맑은 하늘 아래 판다 감성.',
  'N', 'N', 'ADMIN', NULL, 64,
  '{
  "light": {
    "background": "#a9cbec",
    "foreground": "#333c66",
    "card": "#f7f1de",
    "cardForeground": "#3a4056",
    "muted": "#c3daf2",
    "mutedForeground": "#5f6f9a",
    "secondary": "#c3daf2",
    "border": "#8fb4dc",
    "primary": "#4d5aac",
    "accent": "#e08878",
    "chart1": "#4d5aac",
    "chart2": "#e08878",
    "chart3": "#e8d490",
    "chart4": "#8cba8c",
    "chart5": "#6a9ad6",
    "kpi1": "#e6ecf8",
    "kpi2": "#fbeae6",
    "kpi3": "#f9f3dc",
    "kpi4": "#e9f3e9",
    "kpi5": "#e4eefa"
  },
  "dark": {
    "background": "#212840",
    "foreground": "#dde2f2",
    "card": "#2a3252",
    "cardForeground": "#dde2f2",
    "muted": "#293050",
    "mutedForeground": "#99a2c4",
    "secondary": "#293050",
    "border": "#343c60",
    "primary": "#7d8ad8",
    "accent": "#e09888",
    "chart1": "#7d8ad8",
    "chart2": "#e09888",
    "chart3": "#d8c488",
    "chart4": "#94c094",
    "chart5": "#7aa8e0",
    "kpi1": "#262c48",
    "kpi2": "#3a2c28",
    "kpi3": "#36321e",
    "kpi4": "#28342a",
    "kpi5": "#243046"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '판다 스카이' AND del_yn = 'N'
);

-- ── 서머 비치 (newdesign00006.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '서머 비치',
  '페일 아쿠아 + 오션 블루·팜 그린·수박 포인트. 여름 해변 강아지 감성.',
  'N', 'N', 'ADMIN', NULL, 65,
  '{
  "light": {
    "background": "#e2efe4",
    "foreground": "#3d5650",
    "card": "#f6faf0",
    "cardForeground": "#3d5650",
    "muted": "#d5e6d8",
    "mutedForeground": "#77938a",
    "secondary": "#d5e6d8",
    "border": "#c6dcca",
    "primary": "#6d9ed8",
    "accent": "#64ba80",
    "chart1": "#6d9ed8",
    "chart2": "#64ba80",
    "chart3": "#e88a8a",
    "chart4": "#ecd88e",
    "chart5": "#7accc4",
    "kpi1": "#e7eef9",
    "kpi2": "#e6f5ea",
    "kpi3": "#fbeaea",
    "kpi4": "#f9f4dd",
    "kpi5": "#e6f6f4"
  },
  "dark": {
    "background": "#232e2a",
    "foreground": "#d9e4de",
    "card": "#2b3833",
    "cardForeground": "#d9e4de",
    "muted": "#32403a",
    "mutedForeground": "#93aca2",
    "secondary": "#32403a",
    "border": "#3b4a43",
    "primary": "#7dabde",
    "accent": "#74c890",
    "chart1": "#7dabde",
    "chart2": "#74c890",
    "chart3": "#d89090",
    "chart4": "#d8c684",
    "chart5": "#84ccc4",
    "kpi1": "#26303c",
    "kpi2": "#263626",
    "kpi3": "#382a2a",
    "kpi4": "#37331e",
    "kpi5": "#264038"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '서머 비치' AND del_yn = 'N'
);

-- ── 빈티지 클레이 (newdesign00007.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '빈티지 클레이',
  '뉴모피즘 — 블러시 베이지 + 더스티 로즈·세이지. 빈티지 소품 클레이 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 66,
  '{
  "light": {
    "background": "#ecdad2",
    "foreground": "#4e4038",
    "card": "#ecdad2",
    "cardForeground": "#4e4038",
    "muted": "#e2cec4",
    "mutedForeground": "#957f76",
    "secondary": "#e2cec4",
    "border": "#d6c0b5",
    "primary": "#ca97a1",
    "accent": "#a2b489",
    "chart1": "#ca97a1",
    "chart2": "#a2b489",
    "chart3": "#e0cda6",
    "chart4": "#8a6e5e",
    "chart5": "#a9c3d9",
    "kpi1": "#f6e5e8",
    "kpi2": "#eaf0e0",
    "kpi3": "#f5eedc",
    "kpi4": "#ead8ce",
    "kpi5": "#e5edf4"
  },
  "dark": {
    "background": "#2e2823",
    "foreground": "#e4dcd4",
    "card": "#2e2823",
    "cardForeground": "#e4dcd4",
    "muted": "#382f2a",
    "mutedForeground": "#a3958c",
    "secondary": "#382f2a",
    "border": "#423830",
    "primary": "#c08e98",
    "accent": "#98ab80",
    "chart1": "#c08e98",
    "chart2": "#98ab80",
    "chart3": "#d0bc94",
    "chart4": "#9a7a68",
    "chart5": "#98b2c8",
    "kpi1": "#362a2e",
    "kpi2": "#2c3324",
    "kpi3": "#35301e",
    "kpi4": "#332a22",
    "kpi5": "#283038"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '빈티지 클레이' AND del_yn = 'N'
);

-- ── 레인보우 퍼프 (newdesign00008.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '레인보우 퍼프',
  '뉴모피즘 — 웜 아이보리 + 라벤더·로즈·민트 퍼프 파스텔. 몽글몽글 3D 아이콘 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 67,
  '{
  "light": {
    "background": "#ebe4d6",
    "foreground": "#5a5348",
    "card": "#ebe4d6",
    "cardForeground": "#5a5348",
    "muted": "#e1d9c9",
    "mutedForeground": "#948b7d",
    "secondary": "#e1d9c9",
    "border": "#d5cbb9",
    "primary": "#ac9cce",
    "accent": "#c98f96",
    "chart1": "#ac9cce",
    "chart2": "#c98f96",
    "chart3": "#9cc4ae",
    "chart4": "#a3b8dc",
    "chart5": "#e0cf9a",
    "kpi1": "#eee9f6",
    "kpi2": "#f6e6e8",
    "kpi3": "#e8f2ec",
    "kpi4": "#e8eef8",
    "kpi5": "#f6f0dc"
  },
  "dark": {
    "background": "#2a2822",
    "foreground": "#e2ddd2",
    "card": "#2a2822",
    "cardForeground": "#e2ddd2",
    "muted": "#34312a",
    "mutedForeground": "#a29a8a",
    "secondary": "#34312a",
    "border": "#3d3a32",
    "primary": "#a696ca",
    "accent": "#c08a92",
    "chart1": "#a696ca",
    "chart2": "#c08a92",
    "chart3": "#8cba9e",
    "chart4": "#94aad4",
    "chart5": "#d0be88",
    "kpi1": "#2c2a3a",
    "kpi2": "#362a2c",
    "kpi3": "#263228",
    "kpi4": "#282e3a",
    "kpi5": "#343020"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '레인보우 퍼프' AND del_yn = 'N'
);

-- ── 마시멜로 3D (newdesign00009.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '마시멜로 3D',
  '뉴모피즘 — 핑크 라벤더 + 페리윙클·민트 마시멜로 파스텔. 소프트 3D 렌더 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 68,
  '{
  "light": {
    "background": "#f1e3e8",
    "foreground": "#55516a",
    "card": "#f1e3e8",
    "cardForeground": "#55516a",
    "muted": "#e7d6dd",
    "mutedForeground": "#93889e",
    "secondary": "#e7d6dd",
    "border": "#dcc9d2",
    "primary": "#8b93d6",
    "accent": "#8fd0c0",
    "chart1": "#8b93d6",
    "chart2": "#8fd0c0",
    "chart3": "#e08a9a",
    "chart4": "#b8a8e0",
    "chart5": "#dcc79e",
    "kpi1": "#e9ebf8",
    "kpi2": "#e5f5f1",
    "kpi3": "#f9e6ea",
    "kpi4": "#efe9f8",
    "kpi5": "#f7f0e0"
  },
  "dark": {
    "background": "#2b2730",
    "foreground": "#e2dee8",
    "card": "#2b2730",
    "cardForeground": "#e2dee8",
    "muted": "#35303c",
    "mutedForeground": "#a49cae",
    "secondary": "#35303c",
    "border": "#3e3846",
    "primary": "#969ede",
    "accent": "#84c4b4",
    "chart1": "#969ede",
    "chart2": "#84c4b4",
    "chart3": "#d08292",
    "chart4": "#ac9cd4",
    "chart5": "#ccb890",
    "kpi1": "#282a40",
    "kpi2": "#243632",
    "kpi3": "#382830",
    "kpi4": "#2e2a3c",
    "kpi5": "#34301e"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '마시멜로 3D' AND del_yn = 'N'
);

-- ── 코지 윈터 (newdesign00010.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '코지 윈터',
  '뉴모피즘 — 웜 리넨 + 모스 그린·러스트 브라운. 포근한 겨울 펠트 감성.',
  'N', 'N', 'ADMIN', 'CLAY', 69,
  '{
  "light": {
    "background": "#eae5da",
    "foreground": "#3e3a32",
    "card": "#eae5da",
    "cardForeground": "#3e3a32",
    "muted": "#dfd9cb",
    "mutedForeground": "#8a8474",
    "secondary": "#dfd9cb",
    "border": "#d2cbba",
    "primary": "#7a8c60",
    "accent": "#b07a4e",
    "chart1": "#7a8c60",
    "chart2": "#b07a4e",
    "chart3": "#55684a",
    "chart4": "#b5b0a4",
    "chart5": "#4c483e",
    "kpi1": "#e9efe0",
    "kpi2": "#f3e7db",
    "kpi3": "#e2e9dc",
    "kpi4": "#eeece5",
    "kpi5": "#e7e5de"
  },
  "dark": {
    "background": "#262822",
    "foreground": "#ddd9cc",
    "card": "#262822",
    "cardForeground": "#ddd9cc",
    "muted": "#2f322a",
    "mutedForeground": "#9c9784",
    "secondary": "#2f322a",
    "border": "#383c32",
    "primary": "#8ca070",
    "accent": "#c08c5c",
    "chart1": "#8ca070",
    "chart2": "#c08c5c",
    "chart3": "#6a8060",
    "chart4": "#a8a294",
    "chart5": "#7c7668",
    "kpi1": "#283023",
    "kpi2": "#342b20",
    "kpi3": "#242e24",
    "kpi4": "#2e2d26",
    "kpi5": "#2b2a24"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '코지 윈터' AND del_yn = 'N'
);

-- ── 홀로그램 글래스 (newdesign00011.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '홀로그램 글래스',
  '글래스모피즘 — 라일락 베이스 + 홀로그램 무지개 그래디언트 포인트. 영롱한 유리 질감.',
  'N', 'N', 'ADMIN', 'GLASS', 70,
  '{
  "light": {
    "background": "#e6dcee",
    "foreground": "#48405a",
    "card": "#fbf9fd",
    "cardForeground": "#48405a",
    "muted": "#dcd0e6",
    "mutedForeground": "#8b809e",
    "secondary": "#dcd0e6",
    "border": "#cfc2dc",
    "primary": "#a86ed4",
    "accent": "#58aee0",
    "chart1": "#e87ab0",
    "chart2": "#58aee0",
    "chart3": "#a678e0",
    "chart4": "#ecc45e",
    "chart5": "#6ed8bc",
    "kpi1": "#f8e9f2",
    "kpi2": "#e6f2fa",
    "kpi3": "#f0e8fa",
    "kpi4": "#faf2dc",
    "kpi5": "#e6f8f2"
  },
  "dark": {
    "background": "#1c1826",
    "foreground": "#e6e0f0",
    "card": "#292434",
    "cardForeground": "#e6e0f0",
    "muted": "#322c40",
    "mutedForeground": "#a89cbc",
    "secondary": "#322c40",
    "border": "#3c3550",
    "primary": "#b888e0",
    "accent": "#6cb8e8",
    "chart1": "#e88ab8",
    "chart2": "#6cb8e8",
    "chart3": "#b088e8",
    "chart4": "#ecc878",
    "chart5": "#7ce0c8",
    "kpi1": "#382640",
    "kpi2": "#1e3240",
    "kpi3": "#2e2444",
    "kpi4": "#383018",
    "kpi5": "#1e3c34"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '홀로그램 글래스' AND del_yn = 'N'
);

-- ── 세이지 스튜디오 (newdesign00012.png) ──
INSERT INTO public.ui_theme (theme_nm, theme_desc, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord, theme_tokens, regr_id, modr_id)
SELECT
  '세이지 스튜디오',
  '뮤트 그레이 + 세이지 그린·페일 라벤더. 차분하고 정제된 스튜디오 UI 킷 감성.',
  'N', 'N', 'ADMIN', NULL, 71,
  '{
  "light": {
    "background": "#dcdbd6",
    "foreground": "#43463e",
    "card": "#f5f4f0",
    "cardForeground": "#43463e",
    "muted": "#d1d0ca",
    "mutedForeground": "#7f8278",
    "secondary": "#d1d0ca",
    "border": "#c5c4bc",
    "primary": "#86987e",
    "accent": "#ac9fd2",
    "chart1": "#86987e",
    "chart2": "#ac9fd2",
    "chart3": "#a9aaa0",
    "chart4": "#67785e",
    "chart5": "#c7bcd8",
    "kpi1": "#e9eee4",
    "kpi2": "#edeaf6",
    "kpi3": "#ecece6",
    "kpi4": "#e2e8dc",
    "kpi5": "#f0edf6"
  },
  "dark": {
    "background": "#242621",
    "foreground": "#dbded4",
    "card": "#2d302a",
    "cardForeground": "#dbded4",
    "muted": "#343730",
    "mutedForeground": "#999e90",
    "secondary": "#343730",
    "border": "#3d4038",
    "primary": "#94a88a",
    "accent": "#a89ccc",
    "chart1": "#94a88a",
    "chart2": "#a89ccc",
    "chart3": "#8e9086",
    "chart4": "#75886a",
    "chart5": "#b0a4cc",
    "kpi1": "#283026",
    "kpi2": "#2c2838",
    "kpi3": "#2c2e28",
    "kpi4": "#243020",
    "kpi5": "#302c3a"
  }
}'::jsonb,
  'ADMIN', 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ui_theme WHERE theme_nm = '세이지 스튜디오' AND del_yn = 'N'
);
