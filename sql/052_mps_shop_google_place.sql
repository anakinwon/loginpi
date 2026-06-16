-- mps_shop 구글 Place 정보 보관 — 매장 인증 등록 시 구글이 제공하는 모든 정보 저장
-- 하이브리드: 자주 쓰는 필드는 구조화 컬럼, 전체 원본은 google_place_json(JSONB)에 빠짐없이.
-- JSONB 선례: 009_std_audit_log.sql old_val/new_val. 평점값·영업시간·타입·plusCode 등은
-- 원본 JSON에서 조회(google_place_json->>'rating' 등).

ALTER TABLE public.mps_shop
  ADD COLUMN IF NOT EXISTS google_nm         VARCHAR(200),  -- 구글 매장명 (displayName)
  ADD COLUMN IF NOT EXISTS website_url       TEXT,          -- 웹사이트 (websiteUri)
  ADD COLUMN IF NOT EXISTS gmap_url          TEXT,          -- 구글지도 URL (googleMapsUri)
  ADD COLUMN IF NOT EXISTS biz_status_cd     VARCHAR(20),   -- 영업상태 (OPERATIONAL/CLOSED_*)
  ADD COLUMN IF NOT EXISTS rating_cnt        INT,           -- 평점 수 (userRatingCount)
  ADD COLUMN IF NOT EXISTS google_place_json JSONB;         -- 구글 Place Details 전체 원본

COMMENT ON COLUMN public.mps_shop.google_nm         IS '구글 매장명 (Place displayName) — 사용자 입력 shop_nm과 별개 권위값';
COMMENT ON COLUMN public.mps_shop.website_url       IS '매장 웹사이트 (Place websiteUri)';
COMMENT ON COLUMN public.mps_shop.gmap_url          IS '구글지도 매장 URL (Place googleMapsUri)';
COMMENT ON COLUMN public.mps_shop.biz_status_cd     IS '구글 영업상태: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY';
COMMENT ON COLUMN public.mps_shop.rating_cnt        IS '구글 평점 개수 (userRatingCount)';
COMMENT ON COLUMN public.mps_shop.google_place_json IS '구글 Place Details (New) 전체 원본 JSON — 평점·영업시간·타입·plusCode 등 모든 정보';
