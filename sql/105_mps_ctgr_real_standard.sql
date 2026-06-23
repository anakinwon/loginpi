-- sql/105_mps_ctgr_real_standard.sql
-- DA-APPROVED: mps_ 마켓 주제영역(029) 기존 승인 범위 내 DML — 스키마 변경 없음(기존 mps_ctgr 재귀 활용)
-- 목적: 샘플성 카테고리(039 중고편중 6대분류 · 053 카페) 전면 폐기 → 국내 E커머스 표준 17대분류 3단계로 교체.
--   정본 설계: docs/PRD_CATEGORY.md v1.0
--
-- 안전 절차(한 트랜잭션, 신규/기존 동일 테이블 공존 문제를 임시테이블로 해결):
--   ① 시드 직전 '기존 활성 카테고리 ID' 임시 캡처(_old_ctgr) — 이후 이것만 폐기 대상.
--   ② 신규 표준 카테고리 시드(대분류 17 + 중분류, parent_ctgr_id 재귀). '기타(999)' 안전망 포함.
--   ③ 기존 상품(mps_item.ctgr_id)이 폐기 대상을 가리키면 NULL(미분류) — 판매자가 신규 분류 재지정(오분류 방지).
--   ④ 기존 카테고리만 논리삭제(del_yn='Y', use_yn='N'). 물리 DELETE 금지.
-- 소분류(Depth3)는 시드하지 않고 운영(/admin CRUD)·후속 시드로 확장 — PRD_CATEGORY §4.
--
-- ⚠️ Supabase 적용은 마스터가 수행(직접 적용 금지). 적용 후 PiShop 상품 목록 카테고리 필터 확인.

BEGIN;

-- ── ① 시드 직전 기존 활성 카테고리 ID 캡처 (이후 이 집합만 폐기) ──
CREATE TEMP TABLE _old_ctgr ON COMMIT DROP AS
  SELECT ctgr_id FROM public.mps_ctgr WHERE del_yn = 'N';

-- ── ② 신규 표준 시드 (대분류 + 중분류) ──
DO $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('패션의류', 10) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'여성의류',10),(v_id,'남성의류',20),(v_id,'언더웨어/홈웨어',30),(v_id,'기타 패션의류',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('패션잡화', 20) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'신발',10),(v_id,'가방',20),(v_id,'시계/주얼리',30),(v_id,'패션소품',40),(v_id,'기타 패션잡화',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('뷰티', 30) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'스킨케어',10),(v_id,'메이크업',20),(v_id,'바디/헤어',30),(v_id,'향수/미용기기',40),(v_id,'기타 뷰티',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('출산/유아동', 40) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'유아동의류',10),(v_id,'완구/교육',20),(v_id,'수유/이유식',30),(v_id,'외출/안전',40),(v_id,'기타 출산/유아',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('식품', 50) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'신선식품',10),(v_id,'가공/간편식',20),(v_id,'건강식품',30),(v_id,'음료/커피',40),(v_id,'기타 식품',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('주방용품', 60) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'조리도구',10),(v_id,'식기/컵',20),(v_id,'주방가전',30),(v_id,'주방수납/일회용',40),(v_id,'기타 주방',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('생활/건강', 70) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'생활용품',10),(v_id,'욕실용품',20),(v_id,'헬스/건강',30),(v_id,'의료/위생',40),(v_id,'기타 생활/건강',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('홈/인테리어', 80) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'가구',10),(v_id,'침구/패브릭',20),(v_id,'인테리어소품',30),(v_id,'수납/정리',40),(v_id,'기타 홈/인테리어',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('가전/TV', 90) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'대형가전',10),(v_id,'계절가전',20),(v_id,'영상/음향',30),(v_id,'생활가전',40),(v_id,'기타 가전',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('컴퓨터/모바일', 100) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'컴퓨터',10),(v_id,'주변기기',20),(v_id,'스마트폰/태블릿',30),(v_id,'모바일 액세서리',40),(v_id,'기타 컴퓨터/모바일',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('스포츠/레저', 110) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'운동용품',10),(v_id,'아웃도어/캠핑',20),(v_id,'자전거/킥보드',30),(v_id,'스포츠의류',40),(v_id,'기타 스포츠/레저',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('자동차/공구', 120) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'차량용품',10),(v_id,'공구',20),(v_id,'산업/안전',30),(v_id,'기타 자동차/공구',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('도서/취미', 130) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'도서/음반',10),(v_id,'문구/사무',20),(v_id,'완구/수집',30),(v_id,'악기/취미',40),(v_id,'기타 도서/취미',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('반려동물', 140) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'강아지',10),(v_id,'고양이',20),(v_id,'기타 반려',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('핸드메이드', 150) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'수제 액세서리',10),(v_id,'수제 소품',20),(v_id,'수제 식품',30),(v_id,'기타 핸드메이드',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('카페/음료', 160) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'커피음료',10),(v_id,'디저트',20),(v_id,'베이커리',30),(v_id,'브런치',40),(v_id,'기타 메뉴',999);

  INSERT INTO public.mps_ctgr (ctgr_nm, sort_ord) VALUES ('기타', 999) RETURNING ctgr_id INTO v_id;
  INSERT INTO public.mps_ctgr (parent_ctgr_id, ctgr_nm, sort_ord) VALUES
    (v_id,'분류 미지정',10);
END $$;

-- ── ③ 기존 상품의 폐기 카테고리 참조 해제 → 미분류(NULL) ──
UPDATE public.mps_item
   SET ctgr_id = NULL, modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
 WHERE del_yn = 'N'
   AND ctgr_id IN (SELECT ctgr_id FROM _old_ctgr);

-- ── ④ 기존 카테고리만 논리삭제 ──
UPDATE public.mps_ctgr
   SET del_yn = 'Y', use_yn = 'N', del_dtm = CURRENT_TIMESTAMP,
       modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
 WHERE ctgr_id IN (SELECT ctgr_id FROM _old_ctgr);

COMMIT;

-- 검증:
--   SELECT ctgr_nm, sort_ord FROM mps_ctgr WHERE parent_ctgr_id IS NULL AND del_yn='N' ORDER BY sort_ord;  -- 신규 대분류 17개
--   SELECT count(*) FROM mps_ctgr WHERE del_yn='Y';  -- 폐기된 기존 수
--   SELECT count(*) FROM mps_item WHERE del_yn='N' AND ctgr_id IS NULL;  -- 재지정 대기 상품 수
