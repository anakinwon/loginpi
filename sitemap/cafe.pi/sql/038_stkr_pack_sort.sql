-- 스티커팩 노출 순서 컬럼 추가 — msg_stkr.sort_ord와 동일한 표준용어 사용
-- 피커·마켓 정렬 기준: sort_ord ASC → price_pi ASC (기본값 999 = 미지정 팩은 뒤로)

ALTER TABLE public.msg_stkr_pack
  ADD COLUMN IF NOT EXISTS sort_ord INTEGER NOT NULL DEFAULT 999;

COMMENT ON COLUMN public.msg_stkr_pack.sort_ord IS '노출 순서 (작을수록 앞, 기본 999)';

-- 골프 인사/응원팩을 최우선 노출
UPDATE public.msg_stkr_pack
SET sort_ord = 1,
    modr_id = 'ADMIN',
    mod_dtm = CURRENT_TIMESTAMP
WHERE pack_nm = '골프 인사/응원팩'
  AND del_yn = 'N';
