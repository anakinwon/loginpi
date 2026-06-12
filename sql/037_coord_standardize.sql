-- DA-APPROVED: 위경도 컬럼 표준화 — 표준사전 정식 등록 완료 후 표준용어 적용 (2026-06-12)
--   · 표준단어: 위도=LATD, 경도=LNGT, 좌표값=CRD (std_dic 등재)
--   · 표준도메인: CRD = NUMERIC(11,8) WGS84 좌표값 (std_dom 등재)
--   · 표준용어: latd_crd, lngt_crd (std_term 등재 — 도메인 CRD로 종료, §1-3 준수)
-- 기존 lat/lng는 표준단어·도메인·용어 3대 미준수(§1-2·§1-3 위반)였으며, 029·033·036의
-- 무근거 명명을 본 마이그레이션으로 일괄 정정한다. (rename = 데이터 보존, 무손실)

-- 1) 컬럼 rename: lat → latd_crd, lng → lngt_crd (3개 테이블)
ALTER TABLE public.usr_loc_hist RENAME COLUMN lat TO latd_crd;
ALTER TABLE public.usr_loc_hist RENAME COLUMN lng TO lngt_crd;
ALTER TABLE public.mps_shop     RENAME COLUMN lat TO latd_crd;
ALTER TABLE public.mps_shop     RENAME COLUMN lng TO lngt_crd;
ALTER TABLE public.mps_item     RENAME COLUMN lat TO latd_crd;
ALTER TABLE public.mps_item     RENAME COLUMN lng TO lngt_crd;

-- 2) 타입 통일 NUMERIC(11,8) — 표준도메인 CRD 정의에 정렬
--    mps_shop: (9,6)/(10,6) → (11,8) 승격 (소수 6→8자리, 무손실)
ALTER TABLE public.mps_shop
  ALTER COLUMN latd_crd TYPE NUMERIC(11,8),
  ALTER COLUMN lngt_crd TYPE NUMERIC(11,8);
--    usr_loc_hist·mps_item: DECIMAL(10,8)/(11,8) → NUMERIC(11,8) 표기 통일 (DECIMAL=NUMERIC 동의어)
ALTER TABLE public.usr_loc_hist
  ALTER COLUMN latd_crd TYPE NUMERIC(11,8),
  ALTER COLUMN lngt_crd TYPE NUMERIC(11,8);
ALTER TABLE public.mps_item
  ALTER COLUMN latd_crd TYPE NUMERIC(11,8),
  ALTER COLUMN lngt_crd TYPE NUMERIC(11,8);

-- 3) 인덱스 재생성 (컬럼명 변경 반영, 명명 idx_<테이블>_coord)
DROP INDEX IF EXISTS public.idx_usr_loc_hist_latng;
CREATE INDEX IF NOT EXISTS idx_usr_loc_hist_coord
  ON public.usr_loc_hist(latd_crd, lngt_crd) WHERE del_yn = 'N';
DROP INDEX IF EXISTS public.idx_mps_item_latng;
CREATE INDEX IF NOT EXISTS idx_mps_item_coord
  ON public.mps_item(latd_crd, lngt_crd) WHERE del_yn = 'N' AND latd_crd IS NOT NULL;

-- 4) 컬럼 COMMENT 갱신
COMMENT ON COLUMN public.usr_loc_hist.latd_crd IS 'WGS84 위도좌표값 (표준용어 latd_crd, NUMERIC(11,8))';
COMMENT ON COLUMN public.usr_loc_hist.lngt_crd IS 'WGS84 경도좌표값 (표준용어 lngt_crd, NUMERIC(11,8))';
COMMENT ON COLUMN public.mps_shop.latd_crd     IS 'WGS84 위도좌표값 — 매장 위치 (표준용어 latd_crd)';
COMMENT ON COLUMN public.mps_shop.lngt_crd     IS 'WGS84 경도좌표값 — 매장 위치 (표준용어 lngt_crd)';
COMMENT ON COLUMN public.mps_item.latd_crd     IS 'WGS84 위도좌표값 — 상품 판매 위치 (표준용어 latd_crd)';
COMMENT ON COLUMN public.mps_item.lngt_crd     IS 'WGS84 경도좌표값 — 상품 판매 위치 (표준용어 lngt_crd)';

-- fn_haversine_km: 파라미터명(lat1/lng1)은 컬럼이 아닌 함수 인자 → 표준 대상 외, 유지
