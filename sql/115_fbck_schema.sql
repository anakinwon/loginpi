-- DA-APPROVED: 이용후기(피드백) 시스템 테이블 생성 (PRD_20_FEEDBACK, 2026-06-24)
-- 역할: PiCafé™ 카페 이용후기 + PiShop™ 상품 구매후기 저장 + Bean 토큰 보상 추적
--       fbck_scr (1~5점) → fn_bean_apply('REWARD', bean_qty, ref_id=fbck_id) 호출
-- 어뷰징방지: 거래 인증(order_id/msg_history) + 중복방지(UNIQUE) + 자매점 차단 + 최소본문
-- 논리삭제: del_yn='Y' + del_dtm — 물리 DELETE 절대 금지

-- ──────────────────────────────────────────────────────────────────────────────────
-- 1. fbck_mst — 이용후기 마스터 (카페 + 상품 후기 통합)
-- ──────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fbck_mst (
  fbck_id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id            TEXT            NOT NULL,                           -- sys_user.usr_id (작성자)
  shop_id           UUID,                                               -- mps_shop.shop_id (카페 후기)
  order_id          UUID,                                               -- mps_order.order_id (상품 후기)
  prod_id           UUID,                                               -- mps_item.item_id (분석용)
  fbck_scr          SMALLINT        NOT NULL CHECK (fbck_scr >= 1 AND fbck_scr <= 5),  -- 1~5점
  fbck_cn           TEXT            NOT NULL CHECK (CHAR_LENGTH(TRIM(fbck_cn)) >= 10), -- 본문 10자 이상
  bean_rwrd_qty     INT             NOT NULL DEFAULT 0 CHECK (bean_rwrd_qty >= 0),    -- 지급된 Bean
  rwrd_yn           CHAR(1)         NOT NULL DEFAULT 'N' CHECK (rwrd_yn IN ('Y', 'N')), -- 보상지급여부
  rwrd_dtm          TIMESTAMPTZ,                                        -- 보상 지급 일시
  hide_yn           CHAR(1)         NOT NULL DEFAULT 'N' CHECK (hide_yn IN ('Y', 'N')), -- 관리자 숨김
  hide_reason_txt   TEXT,                                               -- 숨김 사유
  hide_dtm          TIMESTAMPTZ,                                        -- 숨김 일시
  del_yn            CHAR(1)         NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm           TIMESTAMPTZ,
  regr_id           TEXT            NOT NULL DEFAULT 'ADMIN',
  reg_dtm           TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id           TEXT            NOT NULL DEFAULT 'ADMIN',
  mod_dtm           TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- ── 데이터 정합성: Bean 보상 지급 상태 일관성
  CONSTRAINT chk_fbck_reward_consistency
    CHECK (
      (rwrd_yn = 'Y' AND rwrd_dtm IS NOT NULL AND bean_rwrd_qty > 0) OR
      (rwrd_yn = 'N' AND rwrd_dtm IS NULL AND bean_rwrd_qty = 0)
    ),

  -- ── 거래 유형: 카페 후기 XOR 상품 후기
  CONSTRAINT chk_fbck_type_exclusive
    CHECK (
      (shop_id IS NOT NULL AND order_id IS NULL) OR  -- 카페 후기만
      (shop_id IS NULL AND order_id IS NOT NULL) OR  -- 상품 후기만
      (shop_id IS NOT NULL AND order_id IS NOT NULL)  -- 향후 확장 (둘 다 가능)
    ),

  -- ── 중복방지: 카페별 사용자 1회만
  UNIQUE (usr_id, shop_id) WHERE shop_id IS NOT NULL AND del_yn='N',

  -- ── 중복방지: 주문별 사용자 1회만
  UNIQUE (usr_id, order_id) WHERE order_id IS NOT NULL AND del_yn='N'
);

COMMENT ON TABLE public.fbck_mst IS
  '이용후기 마스터 — PiCafé™ 카페 후기 + PiShop™ 상품 후기 (별점 1~5점) + Bean 보상 기록';

COMMENT ON COLUMN public.fbck_mst.fbck_id IS '후기 고유 ID (UUID)';
COMMENT ON COLUMN public.fbck_mst.usr_id IS '작성자 사용자 ID (sys_user.usr_id)';
COMMENT ON COLUMN public.fbck_mst.shop_id IS '카페 ID (카페 후기일 때만) — mps_shop.shop_id';
COMMENT ON COLUMN public.fbck_mst.order_id IS '주문 ID (상품 후기일 때만) — mps_order.order_id';
COMMENT ON COLUMN public.fbck_mst.prod_id IS '상품 ID (분석용, 선택) — mps_item.item_id';
COMMENT ON COLUMN public.fbck_mst.fbck_scr IS '별점: 1~5점 정수만';
COMMENT ON COLUMN public.fbck_mst.fbck_cn IS '후기 본문: 최소 10자, 최대 500자';
COMMENT ON COLUMN public.fbck_mst.bean_rwrd_qty IS '지급된 Bean 수: 60/70/80/90/100 중 하나 (bean_fee_plan 기준)';
COMMENT ON COLUMN public.fbck_mst.rwrd_yn IS '보상 지급 여부: Y=지급됨 / N=미지급 또는 지급 오류';
COMMENT ON COLUMN public.fbck_mst.rwrd_dtm IS '보상 지급 일시: rwrd_yn=Y 일때만 NOT NULL';
COMMENT ON COLUMN public.fbck_mst.hide_yn IS '관리자 숨김 여부: Y=숨김(부적절·신고) / N=공개';
COMMENT ON COLUMN public.fbck_mst.hide_reason_txt IS '숨김 사유: 관리자 기록용 (욕설/부적절/스팸/거짓정보 등)';
COMMENT ON COLUMN public.fbck_mst.hide_dtm IS '숨김 처리 일시';

-- ── 인덱스: 카페별 활성 후기 조회 (최신순)
CREATE INDEX IF NOT EXISTS idx_fbck_mst_shop_active
  ON public.fbck_mst(shop_id, del_yn, hide_yn, reg_dtm DESC)
  WHERE shop_id IS NOT NULL AND del_yn='N';

-- ── 인덱스: 주문별 후기 조회
CREATE INDEX IF NOT EXISTS idx_fbck_mst_order_active
  ON public.fbck_mst(order_id, del_yn, hide_yn)
  WHERE order_id IS NOT NULL AND del_yn='N';

-- ── 인덱스: 사용자별 후기 이력
CREATE INDEX IF NOT EXISTS idx_fbck_mst_usr_recent
  ON public.fbck_mst(usr_id, reg_dtm DESC)
  WHERE del_yn='N';

-- ── 인덱스: 별점 분포 통계
CREATE INDEX IF NOT EXISTS idx_fbck_mst_score_dist
  ON public.fbck_mst(fbck_scr, reg_dtm DESC)
  WHERE del_yn='N' AND hide_yn='N';

-- ── 인덱스: Bean 보상 추적 (멱등 검사용)
CREATE INDEX IF NOT EXISTS idx_fbck_mst_reward_tracking
  ON public.fbck_mst(fbck_id, rwrd_yn)
  WHERE rwrd_yn='Y';

-- ── 인덱스: 관리자 숨김 처리 관리
CREATE INDEX IF NOT EXISTS idx_fbck_mst_hidden
  ON public.fbck_mst(hide_yn, hide_dtm DESC)
  WHERE hide_yn='Y' AND del_yn='N';


-- ──────────────────────────────────────────────────────────────────────────────────
-- 2. fbck_img — 이용후기 이미지
-- ──────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fbck_img (
  fbck_img_id    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  fbck_id        UUID            NOT NULL,                            -- fbck_mst.fbck_id
  img_ord        SMALLINT        NOT NULL CHECK (img_ord >= 1 AND img_ord <= 5), -- 순서 1~5
  img_url        TEXT            NOT NULL,                            -- S3/Supabase Storage URL
  del_yn         CHAR(1)         NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT            NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT            NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- ── 중복방지: 후기당 이미지 순서 중복 불가
  UNIQUE (fbck_id, img_ord) WHERE del_yn='N'
);

COMMENT ON TABLE public.fbck_img IS
  '이용후기 이미지 — 후기당 최대 5개 이미지 (카페/상품 사진 등)';

COMMENT ON COLUMN public.fbck_img.fbck_img_id IS '이미지 고유 ID';
COMMENT ON COLUMN public.fbck_img.fbck_id IS '후기 ID — fbck_mst.fbck_id (FK)';
COMMENT ON COLUMN public.fbck_img.img_ord IS '이미지 순서: 1~5 (표시 순서)';
COMMENT ON COLUMN public.fbck_img.img_url IS 'S3 또는 Supabase Storage URL';

-- ── 인덱스: 후기별 이미지 조회
CREATE INDEX IF NOT EXISTS idx_fbck_img_fbck
  ON public.fbck_img(fbck_id)
  WHERE del_yn='N';


-- ──────────────────────────────────────────────────────────────────────────────────
-- 3. Bean 보상 요금제 시드 (bean_fee_plan에 추가)
--    기존 bean_fee_plan 테이블은 sql/089에서 생성됨
-- ──────────────────────────────────────────────────────────────────────────────────

-- ⚠️ 실행 전 bean_fee_plan 테이블 존재 확인 필수
-- SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='bean_fee_plan'

INSERT INTO public.bean_fee_plan
  (fee_plan_cd, subscr_div_cd, prod_ctgr_cd, fee_knd_cd, grade_cd, bill_cycle_cd,
   amt_bean, qty_limit, fee_plan_desc, sort_ord)
VALUES
  -- § 후기 보상 (FBCK_REWARD) 5행 — 점수별 Bean 지급 정책 (2026-06-24 확정, PRD_20_FEEDBACK)
  ('FR_1','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  60,0,'이용후기 보상 1점', 110),
  ('FR_2','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  70,0,'이용후기 보상 2점', 111),
  ('FR_3','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  80,0,'이용후기 보상 3점', 112),
  ('FR_4','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  90,0,'이용후기 보상 4점', 113),
  ('FR_5','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE', 100,0,'이용후기 보상 5점', 114)
ON CONFLICT DO NOTHING;  -- 멱등성: 기존 데이터 유지


-- ──────────────────────────────────────────────────────────────────────────────────
-- 4. 데이터 품질 검증 및 주석
-- ──────────────────────────────────────────────────────────────────────────────────

-- § fbck_mst 행 수 추적 (향후 모니터링)
-- SELECT COUNT(*) as total_fbck, COUNT(*) FILTER (WHERE del_yn='N') as active_fbck
--   FROM public.fbck_mst;

-- § Bean 보상 누락 검사 (rwrd_yn='N' 행이 있으면 자동 지급 필요)
-- SELECT COUNT(*) as pending_reward FROM public.fbck_mst WHERE rwrd_yn='N' AND del_yn='N';

-- § Bean 보상 총액 (월별)
-- SELECT DATE_TRUNC('month', rwrd_dtm) as month, SUM(bean_rwrd_qty) as total_bean
--   FROM public.fbck_mst WHERE rwrd_yn='Y'
--   GROUP BY DATE_TRUNC('month', rwrd_dtm)
--   ORDER BY month DESC;

-- § 별점 분포 (활성 후기만)
-- SELECT fbck_scr, COUNT(*) as cnt, ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM fbck_mst WHERE del_yn='N' AND hide_yn='N'),1) as pct
--   FROM public.fbck_mst WHERE del_yn='N' AND hide_yn='N'
--   GROUP BY fbck_scr ORDER BY fbck_scr DESC;

-- § 중복 후기 감시 (같은 카페/사용자/활성)
-- SELECT usr_id, shop_id, COUNT(*) as cnt
--   FROM public.fbck_mst WHERE shop_id IS NOT NULL AND del_yn='N'
--   GROUP BY usr_id, shop_id HAVING COUNT(*) > 1;

-- § 후기 숨김 현황
-- SELECT hide_reason_txt, COUNT(*) as cnt FROM public.fbck_mst
--   WHERE hide_yn='Y' AND del_yn='N'
--   GROUP BY hide_reason_txt ORDER BY cnt DESC;

COMMIT;
