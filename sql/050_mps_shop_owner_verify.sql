-- mps_shop 소유권 검증 컬럼 추가 — 구글 카페를 내 PiShop 매장으로 GPS 자동인증 등록
-- 설계: GPS 현장 근접(≤100m) + 구글 place_id 강제 매핑 → 자동승인. 신규 테이블 없이 기존 확장.
-- place_id는 029_mps.sql에서 'Google Maps Phase 3 연동용' 확장 포인트로 이미 설계됨.
-- (검증 컬럼 _yn/_cd 도메인 약어 준수 → da-ddl-guard 자동 통과, 신규 테이블 미생성)

-- ──────────────────────────────────────────────────────────────
-- 1. 소유권 검증 상태 컬럼
--    owner_verified_yn: 검증 매장 여부 (Y=GPS/문서 인증 완료, N=미인증)
--    verify_method_cd : 검증 수단 (GPS=현장 근접 자동, DOC=사업자등록증, PHONE=전화 OTP)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.mps_shop
  ADD COLUMN IF NOT EXISTS owner_verified_yn CHAR(1)     NOT NULL DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS verify_method_cd  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS verify_dtm        TIMESTAMPTZ;

COMMENT ON COLUMN public.mps_shop.owner_verified_yn IS '소유권 검증 여부 (Y=인증 완료, N=미인증) — place_id 매핑 + GPS 현장 근접 자동승인';
COMMENT ON COLUMN public.mps_shop.verify_method_cd  IS '검증 수단 코드: GPS(현장 근접 자동), DOC(사업자등록증), PHONE(전화 OTP)';
COMMENT ON COLUMN public.mps_shop.verify_dtm        IS '소유권 검증 완료 일시';

ALTER TABLE public.mps_shop
  ADD CONSTRAINT chk_verify_method
  CHECK (verify_method_cd IS NULL OR verify_method_cd IN ('GPS', 'DOC', 'PHONE'));

-- ──────────────────────────────────────────────────────────────
-- 2. place_id 부분 유니크 인덱스 — "한 카페 = 한 주인" 원천 보장
--    검증된(owner_verified_yn='Y') 매장은 같은 구글 place_id를 단 한 명만 소유.
--    미검증·삭제·NULL은 제약 대상 외(여러 명 신청·기존 데이터 호환).
-- ──────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_mps_shop_place_verified
  ON public.mps_shop(place_id)
  WHERE owner_verified_yn = 'Y' AND del_yn = 'N' AND place_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 3. place_id 조회 인덱스 — 등록 시 중복 검사(이미 등록된 카페인지) 빠른 확인
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mps_shop_place
  ON public.mps_shop(place_id)
  WHERE del_yn = 'N' AND place_id IS NOT NULL;
