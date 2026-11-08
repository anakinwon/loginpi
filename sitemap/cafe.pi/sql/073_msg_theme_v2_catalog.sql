-- 073_msg_theme_v2_catalog.sql
-- PRD_17 v2.0 — 카페 테마 체계 전면 재정의 (마스터 확정 2026-06-20)
--   일반(BASIC) 8개   : 범용·일상 테마
--   프리미엄(PREMIUM) 12개 : 상업·글로벌 스포츠 IP 테마
-- 기존 관심사 테마(FITNESS/GOLF/CODING 등)는 논리삭제(del_yn='Y'), 기존 카페는 존속.
-- DML 전용(데이터 시드) — 테이블 구조 변경 없음. msg_theme 스키마는 sql/012 참조.
-- ⚠️ 운영 데이터 변경 — 적용 전 마스터 확인 필수. 테마는 관리자 화면(/admin/themes)에서 상시 수정.

BEGIN;

-- 1) 신규 카탈로그 upsert (동일 코드 존재 시 갱신 + 과거 논리삭제분 복원)
INSERT INTO public.msg_theme
  (theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord, use_yn, del_yn, del_dtm)
VALUES
  -- GENERAL (BASIC) — 범용·일상
  ('MY_TOWN',           '우리동네',     '🏘️', '#동네 #이웃 #지역생활',      'BASIC', 1, 'Y', 'N', NULL),
  ('WEATHER',           '날씨',         '🌤️', '#날씨 #기상 #미세먼지',      'BASIC', 2, 'Y', 'N', NULL),
  ('TRAVEL',            '여행',         '✈️', '#여행 #국내여행 #해외여행',  'BASIC', 3, 'Y', 'N', NULL),
  ('FOOD_SPOTS',        '맛집',         '🍽️', '#맛집 #먹거리 #카페투어',    'BASIC', 4, 'Y', 'N', NULL),
  ('DAILY_CHAT',        '일상수다',     '💬', '#일상 #수다 #잡담',          'BASIC', 5, 'Y', 'N', NULL),
  ('INFO_SHARE',        '정보공유',     '📢', '#정보 #꿀팁 #생활정보',      'BASIC', 6, 'Y', 'N', NULL),
  ('SECONDHAND',        '중고나눔',     '♻️', '#중고 #나눔 #직거래',        'BASIC', 7, 'Y', 'N', NULL),
  ('HOBBY_GROUP',       '취미',         '🎯', '#취미 #동호회 #모임',        'BASIC', 8, 'Y', 'N', NULL),
  -- PREMIUM — 상업·글로벌 스포츠 IP
  ('WORLD_CUP',         '월드컵',       '🏆', '#월드컵 #국가대표 #축구',    'PREMIUM', 1, 'Y', 'N', NULL),
  ('EPL',               '프리미어리그', '🦁', '#EPL #프리미어리그 #축구',   'PREMIUM', 2, 'Y', 'N', NULL),
  ('MLB',               '메이저리그',   '⚾', '#MLB #메이저리그 #야구',     'PREMIUM', 3, 'Y', 'N', NULL),
  ('ESPORTS',           'e스포츠',      '🎮', '#e스포츠 #LoL #게임',        'PREMIUM', 4, 'Y', 'N', NULL),
  ('NBA',               'NBA',          '🏀', '#NBA #농구 #바스켓볼',       'PREMIUM', 5, 'Y', 'N', NULL),
  ('UCL',               '챔피언스리그', '⭐', '#UCL #챔스 #축구',           'PREMIUM', 6, 'Y', 'N', NULL),
  ('F1',                '포뮬러1',      '🏎️', '#F1 #포뮬러원 #모터스포츠',  'PREMIUM', 7, 'Y', 'N', NULL),
  ('UFC_MMA',           '격투기',       '🥊', '#UFC #MMA #격투기',          'PREMIUM', 8, 'Y', 'N', NULL),
  ('K_LEAGUE',          'K리그',        '⚽', '#K리그 #국내축구 #축구',     'PREMIUM', 9, 'Y', 'N', NULL),
  ('PGA_GOLF',          'PGA투어',      '⛳', '#PGA #골프 #투어',           'PREMIUM', 10, 'Y', 'N', NULL),
  ('TENNIS_GRAND_SLAM', '테니스',       '🎾', '#테니스 #그랜드슬램 #ATP',   'PREMIUM', 11, 'Y', 'N', NULL),
  ('CRYPTO_TRADING',    'Pi투자',       '💰', '#Pi #투자 #시세분석',        'PREMIUM', 12, 'Y', 'N', NULL)
ON CONFLICT (theme_cd) DO UPDATE SET
  theme_nm    = EXCLUDED.theme_nm,
  theme_emoji = EXCLUDED.theme_emoji,
  theme_desc  = EXCLUDED.theme_desc,
  theme_tp_cd = EXCLUDED.theme_tp_cd,
  sort_ord    = EXCLUDED.sort_ord,
  use_yn      = 'Y',
  del_yn      = 'N',
  del_dtm     = NULL,
  mod_dtm     = CURRENT_TIMESTAMP,
  modr_id     = 'ADMIN';

-- 2) 신규 20개 코드에 없는 기존 활성 테마 → 논리삭제 (물리 DELETE 금지)
--    기존 카페(msg_room.theme_cd)는 그대로 존속, 신규 카페 생성에서만 제외.
UPDATE public.msg_theme
SET del_yn  = 'Y',
    del_dtm = CURRENT_TIMESTAMP,
    mod_dtm = CURRENT_TIMESTAMP,
    modr_id = 'ADMIN'
WHERE del_yn = 'N'
  AND theme_cd NOT IN (
    'MY_TOWN','WEATHER','TRAVEL','FOOD_SPOTS','DAILY_CHAT','INFO_SHARE','SECONDHAND','HOBBY_GROUP',
    'WORLD_CUP','EPL','MLB','ESPORTS','NBA','UCL','F1','UFC_MMA','K_LEAGUE','PGA_GOLF','TENNIS_GRAND_SLAM','CRYPTO_TRADING'
  );

COMMIT;

-- 적용 확인 쿼리:
--   SELECT theme_tp_cd, theme_cd, theme_nm, theme_emoji, sort_ord
--   FROM public.msg_theme WHERE del_yn='N' ORDER BY theme_tp_cd, sort_ord;
