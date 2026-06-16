-- mps_shop 반자동 half-인증 — 구글 정보 재입력 매칭(무승인 탈중앙화) 보강
-- 050에서 추가한 owner_verified_yn/verify_method_cd/verify_dtm 위에,
-- 대표자명(신고 항목)과 'MATCH'(구글 정보 대조) 검증수단을 추가한다.
--
-- 설계: 사용자가 전화번호·대표자명·이메일을 재입력 → 서버가 place_id로 구글 Place
-- Details를 조회해 "구글이 가진 필드(전화번호 등)만 대조". 일치 시 무승인 자동 등록.
-- 대표자명·이메일은 구글이 보유하지 않아 대조 불가 → 신고 항목으로 저장(책임소재·회수 근거).

-- 1. 대표자명(신고 항목) — 구글 대조 불가, 분쟁/회수 근거용 (contact_tel·contact_email은 기존 컬럼 재사용)
ALTER TABLE public.mps_shop
  ADD COLUMN IF NOT EXISTS owner_nm VARCHAR(100);

COMMENT ON COLUMN public.mps_shop.owner_nm IS '대표자명(신고 항목) — 구글 미보유로 자동대조 불가, 분쟁·회수 책임소재 근거';

-- 2. verify_method_cd CHECK 확장: 'MATCH'(구글 정보 재입력 대조) 추가
ALTER TABLE public.mps_shop
  DROP CONSTRAINT IF EXISTS chk_verify_method;
ALTER TABLE public.mps_shop
  ADD CONSTRAINT chk_verify_method
  CHECK (verify_method_cd IS NULL OR verify_method_cd IN ('GPS', 'DOC', 'PHONE', 'MATCH'));

COMMENT ON COLUMN public.mps_shop.verify_method_cd IS '검증 수단: GPS(현장 근접), DOC(사업자등록증), PHONE(전화 OTP), MATCH(구글 정보 재입력 대조)';
