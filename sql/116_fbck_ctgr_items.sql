-- DA-APPROVED: 카테고리별 이용후기 항목 + 항목별 점수 테이블 (PRD_20_FEEDBACK 확장)
-- 역할: 상품 카테고리별 다른 평가 항목 정의(fbck_ctgr_item) + 항목별 점수 저장(fbck_item_scr)
-- 논리삭제: del_yn='Y' + del_dtm — 물리 DELETE 절대 금지

-- ──────────────────────────────────────────────────────────────────────────────────
-- 1. fbck_ctgr_item — 카테고리별 이용후기 평가 항목 정의
-- ──────────────────────────────────────────────────────────────────────────────────
-- ctgr_id: mps_ctgr.ctgr_id UUID (FK 제약 없음 — 코드베이스 정책)
-- item_cd: 항목 코드 (TASTE/AROMA/TEMP/VALUE/SERVICE 등)

CREATE TABLE IF NOT EXISTS public.fbck_ctgr_item (
  item_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ctgr_id    UUID         NOT NULL,                           -- mps_ctgr.ctgr_id (카테고리)
  item_cd    VARCHAR(16)  NOT NULL,                           -- 항목 코드 (영문대문자)
  item_nm    VARCHAR(50)  NOT NULL,                           -- 항목명 (표시용)
  item_desc  TEXT,                                            -- 항목 설명 (선택)
  sort_ord   SMALLINT     NOT NULL DEFAULT 0,                 -- 표시 순서 (오름차순)
  del_yn     CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm    TIMESTAMPTZ,
  regr_id    TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fbck_ctgr_item                IS '이용후기 카테고리 평가항목 — 카테고리별 항목 정의';
COMMENT ON COLUMN public.fbck_ctgr_item.ctgr_id        IS 'mps_ctgr.ctgr_id (UUID, FK 없음)';
COMMENT ON COLUMN public.fbck_ctgr_item.item_cd        IS '항목코드 (TASTE/AROMA/TEMP/VALUE/SERVICE 등)';
COMMENT ON COLUMN public.fbck_ctgr_item.item_nm        IS '항목명 표시용 (예: 맛, 향, 온도)';
COMMENT ON COLUMN public.fbck_ctgr_item.sort_ord       IS '표시 순서 — 오름차순';

-- 카테고리별 항목코드 유니크 (동일 카테고리에 동일 항목코드 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fbck_ctgr_item_ctgr_cd
  ON public.fbck_ctgr_item(ctgr_id, item_cd)
  WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────────────────────────
-- 2. fbck_item_scr — 이용후기 항목별 점수 (fbck_mst 1건당 N개 항목 점수)
-- ──────────────────────────────────────────────────────────────────────────────────
-- fbck_id: fbck_mst.fbck_id (FK 없음 — 코드베이스 정책)

CREATE TABLE IF NOT EXISTS public.fbck_item_scr (
  scr_id    UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  fbck_id   UUID       NOT NULL,                             -- fbck_mst.fbck_id (후기 마스터)
  item_cd   VARCHAR(16) NOT NULL,                            -- fbck_ctgr_item.item_cd
  item_scr  SMALLINT   NOT NULL CHECK (item_scr >= 1 AND item_scr <= 5),  -- 1~5점
  del_yn    CHAR(1)    NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm   TIMESTAMPTZ,
  regr_id   TEXT       NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT       NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fbck_item_scr           IS '이용후기 항목별 점수 — fbck_mst 1건당 N개 항목';
COMMENT ON COLUMN public.fbck_item_scr.fbck_id   IS 'fbck_mst.fbck_id (FK 없음)';
COMMENT ON COLUMN public.fbck_item_scr.item_cd   IS 'fbck_ctgr_item.item_cd (항목 코드)';
COMMENT ON COLUMN public.fbck_item_scr.item_scr  IS '항목 점수 1~5';

-- 동일 후기에 동일 항목 점수 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS uq_fbck_item_scr_fbck_item
  ON public.fbck_item_scr(fbck_id, item_cd)
  WHERE del_yn = 'N';

-- 후기 기준 항목 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_fbck_item_scr_fbck_id
  ON public.fbck_item_scr(fbck_id)
  WHERE del_yn = 'N';

-- ──────────────────────────────────────────────────────────────────────────────────
-- 3. 시드 — 커피음료(b0000000-0000-4000-8000-000000000601) 평가항목 5개
--    ctgr_id는 sql/053_mps_ctgr_cafe.sql에서 삽입된 UUID
-- ──────────────────────────────────────────────────────────────────────────────────

INSERT INTO public.fbck_ctgr_item
  (ctgr_id, item_cd, item_nm, item_desc, sort_ord, regr_id, modr_id)
VALUES
  ('b0000000-0000-4000-8000-000000000601', 'TASTE',   '맛',        '음료 맛의 만족도',         10, 'ADMIN', 'ADMIN'),
  ('b0000000-0000-4000-8000-000000000601', 'AROMA',   '향',        '커피 향의 풍미와 강도',     20, 'ADMIN', 'ADMIN'),
  ('b0000000-0000-4000-8000-000000000601', 'TEMP',    '온도',      '적정 온도 유지 여부',       30, 'ADMIN', 'ADMIN'),
  ('b0000000-0000-4000-8000-000000000601', 'VALUE',   '양·가성비', '음료 양 대비 가격 만족도',  40, 'ADMIN', 'ADMIN'),
  ('b0000000-0000-4000-8000-000000000601', 'SERVICE', '서비스',    '직원 친절도 및 응대 수준',  50, 'ADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────────
-- 4. fbck_mst.prod_id 인덱스 — 상품 상세 페이지 후기 조회 성능
--    prod_id = mps_item.item_id : 상품 후기 목록 조회 시 사용
-- ──────────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fbck_mst_prod_id
  ON public.fbck_mst(prod_id, reg_dtm DESC)
  WHERE prod_id IS NOT NULL AND del_yn = 'N';
