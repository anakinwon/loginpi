-- DA-APPROVED: 상품 개별 위치 컬럼 추가 (PRD_10_GPS §LBS-04) — mps_shop·usr_loc_hist의 lat/lng 명명 선례 준수
-- 상품 등록 시 판매자 현재 위치를 상품 단위로 저장 → 목록 거리 표시·주변순 정렬의 기준
-- (기존 mps_shop.lat/lng는 매장 좌표 폴백으로 유지)

ALTER TABLE public.mps_item
  ADD COLUMN IF NOT EXISTS lat DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS lng DECIMAL(11,8);

COMMENT ON COLUMN public.mps_item.lat IS 'WGS84 위도 — 상품 판매 위치 (등록 시 판매자 GPS, LBS 동의자만 저장)';
COMMENT ON COLUMN public.mps_item.lng IS 'WGS84 경도 — 상품 판매 위치 (등록 시 판매자 GPS, LBS 동의자만 저장)';

CREATE INDEX IF NOT EXISTS idx_mps_item_latng
  ON public.mps_item(lat, lng)
  WHERE del_yn = 'N' AND lat IS NOT NULL;

-- 백필: 이미 매장이 연결된 기존 상품은 매장 좌표를 상품 좌표로 복사
UPDATE public.mps_item i
SET lat = s.lat,
    lng = s.lng,
    modr_id = 'ADMIN',
    mod_dtm = CURRENT_TIMESTAMP
FROM public.mps_shop s
WHERE i.shop_id = s.shop_id
  AND i.lat IS NULL
  AND s.lat IS NOT NULL;
