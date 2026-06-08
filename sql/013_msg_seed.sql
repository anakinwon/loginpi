-- TASK-051: PiChat 마스터 데이터 세팅
-- msg_theme 20개 · msg_subscr_plan 5개 · msg_stkr_pack 60개 · msg_theme_stkr 60개

-- ──────────────────────────────────────────
-- 1. 테마 마스터 20개
--    BASIC(sort_ord 1~6) → PREMIUM(sort_ord 7~20) 순 정렬
-- ──────────────────────────────────────────
INSERT INTO public.msg_theme
  (theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord)
VALUES
  -- BASIC 6개
  ('FITNESS',  'PT/피트니스',     '💪', '#PT #헬스 #식단',             'BASIC',    1),
  ('TRAVEL',   '여행',            '✈️', '#여행 #해외 #숙소',            'BASIC',    2),
  ('MUKBANG',  '먹방',            '🍜', '#먹방 #맛집 #리뷰',            'BASIC',    3),
  ('PHOTO',    '사진/카메라',     '📸', '#사진 #카메라 #감성',          'BASIC',    4),
  ('READING',  '독서/스터디',     '📚', '#독서 #스터디 #북클럽',        'BASIC',    5),
  ('CODING',   '코딩/IT',         '💻', '#개발 #코딩 #AI',              'BASIC',    6),
  -- PREMIUM 14개
  ('GOLF',     '골프',            '⛳', '#골프 #필드 #스윙',            'PREMIUM',  7),
  ('SWIMMING', '수영',            '🏊', '#수영 #수영장 #다이빙',        'PREMIUM',  8),
  ('SURFING',  '서핑',            '🏄', '#서핑 #파도 #바다',            'PREMIUM',  9),
  ('YOGA',     '요가/명상',       '🧘', '#요가 #명상 #마음챙김',        'PREMIUM', 10),
  ('AVIATION', '항공/마일리지',   '🛫', '#마일리지 #비즈니스석',        'PREMIUM', 11),
  ('COOKING',  '요리',            '🍳', '#요리 #레시피 #홈쿡',          'PREMIUM', 12),
  ('PET',      '반려동물',        '🐕', '#강아지 #고양이 #펫',          'PREMIUM', 13),
  ('BEAUTY',   '뷰티/패션',       '💄', '#뷰티 #패션 #코디',            'PREMIUM', 14),
  ('FINANCE',  '재테크/투자',     '💰', '#재테크 #주식 #Pi투자',        'PREMIUM', 15),
  ('GAME',     '게임',            '🎮', '#게임 #롤 #PS5',               'PREMIUM', 16),
  ('MUSIC',    '음악',            '🎵', '#음악 #밴드 #작곡',            'PREMIUM', 17),
  ('ART',      '아트/DIY',        '🎨', '#그림 #공예 #DIY',             'PREMIUM', 18),
  ('ECO',      '환경/제로웨이스트','🌱','#환경 #비건 #제로웨이스트',    'PREMIUM', 19),
  ('CAR',      '드라이브/차',     '🚗', '#자동차 #드라이브 #캠핑',      'PREMIUM', 20)
ON CONFLICT (theme_cd) DO NOTHING;

-- ──────────────────────────────────────────
-- 2. 구독 플랜 5개
-- ──────────────────────────────────────────
INSERT INTO public.msg_subscr_plan
  (plan_cd, plan_nm, plan_desc, plan_tp_cd, price_pi, mth_cnt)
VALUES
  ('FREE',              'Pi Explorer',    '기본 무료 플랜 — BASIC 테마 5개, 1:1 채팅 무제한',           'FREE',     0,    0),
  ('PREMIUM_MONTHLY',   'Pi Creator 월간', 'PREMIUM 전체 테마 · 월 3개 그룹방 · Pi Tip · AI 10회/월',  'PREMIUM',  1,    1),
  ('PREMIUM_ANNUAL',    'Pi Creator 연간', 'PREMIUM 월간 × 12개월 — 2개월 무료',                       'PREMIUM', 10,   12),
  ('BUSINESS_MONTHLY',  'Pi Host 월간',   '무제한 그룹방 · 이벤트방 · 분석 대시보드 · Webhook',        'BUSINESS', 5,    1),
  ('BUSINESS_ANNUAL',   'Pi Host 연간',   'BUSINESS 월간 × 12개월 — 2개월 무료',                      'BUSINESS', 50,  12)
ON CONFLICT (plan_cd) DO NOTHING;

-- ──────────────────────────────────────────
-- 3. 테마별 기본 스티커팩 3개씩 + msg_theme_stkr 매핑
--    팩 종류: 이모지팩(sort 1) · 일러스트팩(sort 2) · 인사/응원팩(sort 3)
-- ──────────────────────────────────────────
DO $$
DECLARE
  r        RECORD;
  v_pack_id UUID;
  pack_types TEXT[]  := ARRAY['이모지팩', '일러스트팩', '인사/응원팩'];
  i        INTEGER;
BEGIN
  FOR r IN
    SELECT theme_cd, theme_nm FROM public.msg_theme WHERE del_yn = 'N' ORDER BY sort_ord
  LOOP
    FOR i IN 1..3 LOOP
      INSERT INTO public.msg_stkr_pack
        (pack_nm, pack_desc, theme_cd, price_pi, is_dflt_yn, regr_id)
      VALUES (
        r.theme_nm || ' ' || pack_types[i],
        r.theme_nm || ' 테마 기본 제공 스티커팩 (' || pack_types[i] || ')',
        r.theme_cd,
        0,
        'Y',
        'ADMIN'
      )
      RETURNING pack_id INTO v_pack_id;

      INSERT INTO public.msg_theme_stkr
        (theme_cd, pack_id, sort_ord, regr_id)
      VALUES (r.theme_cd, v_pack_id, i, 'ADMIN');
    END LOOP;
  END LOOP;
END;
$$;
