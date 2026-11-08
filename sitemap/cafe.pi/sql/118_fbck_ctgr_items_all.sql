-- sql/118_fbck_ctgr_items_all.sql
-- DA-APPROVED: 시드 DML (fbck_ctgr_item) — 스키마 변경 없음, sql/116 생성 테이블 활용
-- 목적: mps_ctgr 93개 카테고리(대분류 17 + 중분류 76) 전체에 카테고리별 후기 평가항목 5개씩 자동 등록
-- 패턴: ctgr_nm 런타임 조회 → ON CONFLICT DO NOTHING (멱등, 재실행 안전)
-- 카페/음료 > 커피음료: sql/116 기존 시드와 중복 → ON CONFLICT DO NOTHING으로 자동 스킵

DO $$
DECLARE
  v UUID;
BEGIN

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 1. 패션의류
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '패션의류' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 봉제 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','핏/사이즈','착용감 및 사이즈 정확도',20,'ADMIN','ADMIN'),
      (v,'COLOR','색상','색상 표현 및 선명도',30,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',40,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 질감 및 특성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '여성의류' AND p.ctgr_nm = '패션의류' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 봉제 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','핏','체형별 핏 적합성',20,'ADMIN','ADMIN'),
      (v,'COLOR','색상','트렌드 색상 표현',30,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',40,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 질감 및 특성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '남성의류' AND p.ctgr_nm = '패션의류' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 봉제 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','핏/사이즈','착용감 및 사이즈 정확도',20,'ADMIN','ADMIN'),
      (v,'COLOR','색상','색상 표현',30,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',40,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 질감 및 특성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '언더웨어/홈웨어' AND p.ctgr_nm = '패션의류' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 제품 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','착용감','신체 밀착감 및 편안함',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','피부 친화적 소재 여부',30,'ADMIN','ADMIN'),
      (v,'COMFORT','편안함','일상 착용 편안함',40,'ADMIN','ADMIN'),
      (v,'LASTING','내구성','세탁 후 형태 유지',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 패션의류' AND p.ctgr_nm = '패션의류' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','핏','착용감 및 핏',20,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',30,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 특성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 2. 패션잡화
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '패션잡화' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 제품 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 질감 및 특성',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 견고함',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '신발' AND p.ctgr_nm = '패션잡화' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 제작 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','사이즈','사이즈 정확도 및 발볼',20,'ADMIN','ADMIN'),
      (v,'COMFORT','편안함','장시간 착용 편안함',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','밑창 및 갑피 내구성',40,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '가방' AND p.ctgr_nm = '패션잡화' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 봉제 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 질감 및 내구성',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','지퍼·스트랩 내구성',40,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','수납 공간 및 편의성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '시계/주얼리' AND p.ctgr_nm = '패션잡화' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','마감 및 제작 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인 및 미감',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','금속·보석 소재 품질',30,'ADMIN','ADMIN'),
      (v,'LASTING','착용 후 상태','변색·스크래치 저항성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '패션소품' AND p.ctgr_nm = '패션잡화' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 특성',30,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','실용적 기능',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 패션잡화' AND p.ctgr_nm = '패션잡화' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 특성',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 견고함',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 3. 뷰티
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '뷰티' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'EFFECT','효과','사용 후 피부·외관 개선 효과',10,'ADMIN','ADMIN'),
      (v,'TEXTURE','질감','발림성 및 텍스처',20,'ADMIN','ADMIN'),
      (v,'SCENT','향','향기 강도 및 품질',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','패키지','포장 디자인 및 편의성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량 대비 가격 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '스킨케어' AND p.ctgr_nm = '뷰티' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'EFFECT','효과','보습·진정·개선 효과',10,'ADMIN','ADMIN'),
      (v,'TEXTURE','질감','발림성 및 흡수력',20,'ADMIN','ADMIN'),
      (v,'SCENT','향','향기 자극 여부',30,'ADMIN','ADMIN'),
      (v,'LASTING','지속력','효과 지속 시간',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','패키지','포장 편의성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '메이크업' AND p.ctgr_nm = '뷰티' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'EFFECT','발색','색상 표현력 및 발색',10,'ADMIN','ADMIN'),
      (v,'TEXTURE','질감','바르는 느낌 및 밀착력',20,'ADMIN','ADMIN'),
      (v,'LASTING','지속력','메이크업 유지 시간',30,'ADMIN','ADMIN'),
      (v,'COLOR','색상','색상 다양성 및 정확도',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','패키지','용기 편의성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '바디/헤어' AND p.ctgr_nm = '뷰티' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'EFFECT','효과','세정·보습·두피 개선 효과',10,'ADMIN','ADMIN'),
      (v,'SCENT','향','향기 품질 및 지속력',20,'ADMIN','ADMIN'),
      (v,'TEXTURE','질감','사용감 및 거품력',30,'ADMIN','ADMIN'),
      (v,'LASTING','지속력','향 및 효과 지속시간',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량 대비 가격',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '향수/미용기기' AND p.ctgr_nm = '뷰티' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SCENT','향','향기 품질 및 개성',10,'ADMIN','ADMIN'),
      (v,'LASTING','지속력','향 지속 시간',20,'ADMIN','ADMIN'),
      (v,'EFFECT','효과','사용 후 개선 효과',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','패키지','포장 및 용기 디자인',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 뷰티' AND p.ctgr_nm = '뷰티' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'EFFECT','효과','사용 후 효과',10,'ADMIN','ADMIN'),
      (v,'TEXTURE','질감','발림성 및 사용감',20,'ADMIN','ADMIN'),
      (v,'SCENT','향','향기 품질',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','패키지','포장 편의성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 4. 출산/유아동
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '출산/유아동' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 제품 완성도',10,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','KC 인증 및 유해물질 없음',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 견고함',40,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','실용적 기능',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '유아동의류' AND p.ctgr_nm = '출산/유아동' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 봉제 완성도',10,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','유해물질 없음·KC 인증',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','피부 자극 없는 소재',30,'ADMIN','ADMIN'),
      (v,'FIT','착용감','아이 체형 맞춤',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','세탁 견고함',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '완구/교육' AND p.ctgr_nm = '출산/유아동' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SAFETY','안전성','KC 인증 및 안전 소재',10,'ADMIN','ADMIN'),
      (v,'FUN','재미','아이 흥미 유발',20,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','제품 완성도',30,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','교육·발달 기능',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '수유/이유식' AND p.ctgr_nm = '출산/유아동' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SAFETY','안전성','BPA프리 및 식품안전인증',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','제품 완성도',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','세척 및 조작 편의',30,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','수유·이유식 기능',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '외출/안전' AND p.ctgr_nm = '출산/유아동' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SAFETY','안전성','안전기준 충족 여부',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','제품 완성도',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조립·접이 편의성',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 견고함',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 출산/유아' AND p.ctgr_nm = '출산/유아동' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SAFETY','안전성','안전기준 충족',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','제품 완성도',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','실용적 기능',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 5. 식품
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '식품' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','전반적인 맛',10,'ADMIN','ADMIN'),
      (v,'FRESHNESS','신선도','재료의 신선함',20,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 상태 및 밀봉',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량 대비 가격',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','배송 상태 및 포장',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '신선식품' AND p.ctgr_nm = '식품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'FRESHNESS','신선도','수령 시 신선함',10,'ADMIN','ADMIN'),
      (v,'TASTE','맛','전반적인 맛',20,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','원물 품질 및 등급',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','냉장·냉동 포장 상태',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','빠른 배송 및 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '가공/간편식' AND p.ctgr_nm = '식품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','전반적인 맛',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','재료 품질',20,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 및 밀봉',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량·맛 대비 가격',40,'ADMIN','ADMIN'),
      (v,'PORTION','양','제품 용량',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '건강식품' AND p.ctgr_nm = '식품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'EFFECT','효과','건강 개선 효과',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','원료 품질 및 함량',20,'ADMIN','ADMIN'),
      (v,'TASTE','맛','복용 시 맛',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 및 보관 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량·효과 대비 가격',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '음료/커피' AND p.ctgr_nm = '식품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','풍미 및 맛',10,'ADMIN','ADMIN'),
      (v,'AROMA','향','향기 품질',20,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','원두·원료 품질',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 및 밀봉 상태',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량 대비 가격',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 식품' AND p.ctgr_nm = '식품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','전반적인 맛',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','재료 품질',20,'ADMIN','ADMIN'),
      (v,'FRESHNESS','신선도','신선함 및 유통기한',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 상태',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','용량 대비 가격',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 6. 주방용품
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '주방용품' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','조리·요리 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 및 세척 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 견고함',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '조리도구' AND p.ctgr_nm = '주방용품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','조리 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','그립감 및 조작',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','열·마모 내구성',40,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','식품 안전 소재',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '식기/컵' AND p.ctgr_nm = '주방용품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 마감',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인 및 색상',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','안전 소재 여부',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','깨짐·긁힘 저항',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '주방가전' AND p.ctgr_nm = '주방용품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'FUNCTION','기능성','조리 기능 다양성',10,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','화력·파워 등 성능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의성',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '주방수납/일회용' AND p.ctgr_nm = '주방용품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','수납·보관 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 및 사용 편의',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 주방' AND p.ctgr_nm = '주방용품' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 7. 생활/건강
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '생활/건강' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','일상 기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '생활용품' AND p.ctgr_nm = '생활/건강' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','일상 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '욕실용품' AND p.ctgr_nm = '생활/건강' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','욕실 기능',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','방수·항균 소재',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','설치·사용 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '헬스/건강' AND p.ctgr_nm = '생활/건강' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'FUNCTION','기능성','운동·건강 기능',10,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','측정·운동 성능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '의료/위생' AND p.ctgr_nm = '생활/건강' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SAFETY','안전성','의료 안전기준 충족',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','소재 및 완성도',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','위생·의료 기능',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 생활/건강' AND p.ctgr_nm = '생활/건강' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 8. 홈/인테리어
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '홈/인테리어' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','인테리어 디자인',20,'ADMIN','ADMIN'),
      (v,'EASE','조립 편의성','조립·설치 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '가구' AND p.ctgr_nm = '홈/인테리어' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 마감',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','스타일 및 디자인',20,'ADMIN','ADMIN'),
      (v,'ASSEMBLY','조립','조립 난이도 및 설명서',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','하중·마모 내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '침구/패브릭' AND p.ctgr_nm = '홈/인테리어' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','원단 및 완성도',10,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 질감 및 촉감',20,'ADMIN','ADMIN'),
      (v,'COMFORT','편안함','수면·생활 편안함',30,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','색상 및 패턴',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '인테리어소품' AND p.ctgr_nm = '홈/인테리어' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','인테리어 감성',20,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 특성',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '수납/정리' AND p.ctgr_nm = '홈/인테리어' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','수납 공간 활용',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조립·사용 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','하중 내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 홈/인테리어' AND p.ctgr_nm = '홈/인테리어' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 9. 가전/TV
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '가전/TV' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','가전 핵심 성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능 다양성',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','장기 사용 내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '대형가전' AND p.ctgr_nm = '가전/TV' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','핵심 성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','스마트 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','설치·조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '계절가전' AND p.ctgr_nm = '가전/TV' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','냉난방 성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능 다양성',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '영상/음향' AND p.ctgr_nm = '가전/TV' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','화질·음질 성능',10,'ADMIN','ADMIN'),
      (v,'SOUND','음질','음향 품질',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','스마트·연결 기능',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '생활가전' AND p.ctgr_nm = '가전/TV' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','핵심 성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','생활 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 가전' AND p.ctgr_nm = '가전/TV' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 10. 컴퓨터/모바일
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '컴퓨터/모바일' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','처리 속도 및 성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능 다양성',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '컴퓨터' AND p.ctgr_nm = '컴퓨터/모바일' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','CPU·GPU 성능',10,'ADMIN','ADMIN'),
      (v,'SPEED','속도','부팅·처리 속도',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능 다양성',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','설정·사용 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 성능',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '주변기기' AND p.ctgr_nm = '컴퓨터/모바일' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'FUNCTION','기능성','기능성',10,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','응답속도·정밀도',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','설정·연결 편의',30,'ADMIN','ADMIN'),
      (v,'CONNECT','연결성','유무선 연결 안정성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '스마트폰/태블릿' AND p.ctgr_nm = '컴퓨터/모바일' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','처리 속도 및 반응성',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','카메라·배터리 기능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','UI·설정 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 성능',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '모바일 액세서리' AND p.ctgr_nm = '컴퓨터/모바일' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','보호·기능',20,'ADMIN','ADMIN'),
      (v,'FIT','호환성','기기 호환 정확도',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 컴퓨터/모바일' AND p.ctgr_nm = '컴퓨터/모바일' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','성능',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 11. 스포츠/레저
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '스포츠/레저' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','운동·레저 기능',20,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','사용 성능',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '운동용품' AND p.ctgr_nm = '스포츠/레저' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','운동 기능',20,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','사용 성능',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '아웃도어/캠핑' AND p.ctgr_nm = '스포츠/레저' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','아웃도어 기능',20,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','방수·내마모 내구성',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','설치·휴대 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '자전거/킥보드' AND p.ctgr_nm = '스포츠/레저' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'PERFORMANCE','성능','주행 성능',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','소재 및 완성도',20,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','브레이크·안전 기능',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','접이·조작 편의',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '스포츠의류' AND p.ctgr_nm = '스포츠/레저' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 봉제 완성도',10,'ADMIN','ADMIN'),
      (v,'FIT','착용감','운동 시 착용감',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','흡습·속건 기능',30,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','기능성 소재 특성',40,'ADMIN','ADMIN'),
      (v,'COMFORT','편안함','운동 중 편안함',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 스포츠/레저' AND p.ctgr_nm = '스포츠/레저' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','성능',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 12. 자동차/공구
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '자동차/공구' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',30,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '차량용품' AND p.ctgr_nm = '자동차/공구' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','차량 기능 개선',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','설치·조작 편의',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '공구' AND p.ctgr_nm = '자동차/공구' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','작업 기능',20,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','작업 성능',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','그립·조작 편의',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '산업/안전' AND p.ctgr_nm = '자동차/공구' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'SAFETY','안전성','안전인증 충족',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','소재 및 완성도',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','산업 기능',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 자동차/공구' AND p.ctgr_nm = '자동차/공구' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',40,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 13. 도서/취미
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '도서/취미' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'CONTENT','내용','콘텐츠 품질',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','제품 완성도',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'CONDITION','상태','수령 시 상태',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','배송 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '도서/음반' AND p.ctgr_nm = '도서/취미' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'CONTENT','내용','도서·음반 내용 품질',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','인쇄·제본 품질',20,'ADMIN','ADMIN'),
      (v,'CONDITION','상태','수령 시 상태',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','배송 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '문구/사무' AND p.ctgr_nm = '도서/취미' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','필기·사무 기능',20,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','사용 편의',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '완구/수집' AND p.ctgr_nm = '도서/취미' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'DETAIL','디테일','도색·마감 디테일',20,'ADMIN','ADMIN'),
      (v,'CONDITION','상태','수령 시 상태',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 안전성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '악기/취미' AND p.ctgr_nm = '도서/취미' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'PERFORMANCE','성능','음향·기능 성능',20,'ADMIN','ADMIN'),
      (v,'EASE','사용 편의성','연주·조작 편의',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'DURABILITY','내구성','내구성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 도서/취미' AND p.ctgr_nm = '도서/취미' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'CONTENT','내용','콘텐츠·내용 품질',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'CONDITION','상태','수령 시 상태',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','배송 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 14. 반려동물
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '반려동물' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','반려동물 안전 소재',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PALATABILITY','기호성','반려동물 선호도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '강아지' AND p.ctgr_nm = '반려동물' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','강아지 안전 소재',20,'ADMIN','ADMIN'),
      (v,'PALATABILITY','기호성','강아지 선호도',30,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '고양이' AND p.ctgr_nm = '반려동물' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','고양이 안전 소재',20,'ADMIN','ADMIN'),
      (v,'PALATABILITY','기호성','고양이 선호도',30,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 반려' AND p.ctgr_nm = '반려동물' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'SAFETY','안전성','안전 소재',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PALATABILITY','기호성','반려동물 선호도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 15. 핸드메이드
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '핸드메이드' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'CRAFT','제작 완성도','수작업 정교함',20,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인 및 미감',30,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 상태',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '수제 액세서리' AND p.ctgr_nm = '핸드메이드' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'CRAFT','제작 완성도','수작업 정교함',20,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인 및 미감',30,'ADMIN','ADMIN'),
      (v,'MATERIAL','소재','소재 특성',40,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '수제 소품' AND p.ctgr_nm = '핸드메이드' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'CRAFT','제작 완성도','수작업 정교함',20,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인 및 미감',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '수제 식품' AND p.ctgr_nm = '핸드메이드' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','수제 맛 품질',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','재료 및 완성도',20,'ADMIN','ADMIN'),
      (v,'CRAFT','제작 완성도','수작업 정성',30,'ADMIN','ADMIN'),
      (v,'FRESHNESS','신선도','신선함',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 핸드메이드' AND p.ctgr_nm = '핸드메이드' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'CRAFT','제작 완성도','수작업 정교함',20,'ADMIN','ADMIN'),
      (v,'DESIGN','디자인','디자인',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PACKAGING','포장','포장 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 16. 카페/음료
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '카페/음료' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','전반적인 맛',10,'ADMIN','ADMIN'),
      (v,'AROMA','향','향기 품질',20,'ADMIN','ADMIN'),
      (v,'TEMP','온도','적정 온도 유지',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'SERVICE','서비스','직원 서비스',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 커피음료: sql/116 기존 시드 있음 → ON CONFLICT DO NOTHING으로 스킵
  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '커피음료' AND p.ctgr_nm = '카페/음료' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','커피·음료의 전반적인 맛',10,'ADMIN','ADMIN'),
      (v,'AROMA','향','향기와 풍미',20,'ADMIN','ADMIN'),
      (v,'TEMP','온도','적정 온도',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'SERVICE','서비스','직원 친절도',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '디저트' AND p.ctgr_nm = '카페/음료' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','달콤함 및 풍미',10,'ADMIN','ADMIN'),
      (v,'PRESENTATION','플레이팅','비주얼 및 플레이팅',20,'ADMIN','ADMIN'),
      (v,'FRESHNESS','신선도','재료 신선함',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PORTION','양','양 적절성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '베이커리' AND p.ctgr_nm = '카페/음료' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','맛과 풍미',10,'ADMIN','ADMIN'),
      (v,'FRESHNESS','신선도','갓구운 신선함',20,'ADMIN','ADMIN'),
      (v,'INGREDIENTS','재료','재료 품질',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PRESENTATION','비주얼','외형 및 비주얼',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '브런치' AND p.ctgr_nm = '카페/음료' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','맛과 풍미',10,'ADMIN','ADMIN'),
      (v,'PRESENTATION','플레이팅','플레이팅 및 비주얼',20,'ADMIN','ADMIN'),
      (v,'FRESHNESS','신선도','재료 신선함',30,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',40,'ADMIN','ADMIN'),
      (v,'PORTION','양','양 적절성',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '기타 메뉴' AND p.ctgr_nm = '카페/음료' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'TASTE','맛','맛',10,'ADMIN','ADMIN'),
      (v,'QUALITY','품질','품질',20,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',30,'ADMIN','ADMIN'),
      (v,'SERVICE','서비스','서비스',40,'ADMIN','ADMIN'),
      (v,'PRESENTATION','비주얼','비주얼',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 17. 기타
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT ctgr_id INTO v FROM public.mps_ctgr
  WHERE ctgr_nm = '기타' AND parent_ctgr_id IS NULL AND del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',30,'ADMIN','ADMIN'),
      (v,'SELLER','판매자 응대','판매자 친절도·소통',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','배송 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT c.ctgr_id INTO v FROM public.mps_ctgr c
  JOIN public.mps_ctgr p ON c.parent_ctgr_id = p.ctgr_id
  WHERE c.ctgr_nm = '분류 미지정' AND p.ctgr_nm = '기타' AND c.del_yn = 'N';
  IF v IS NOT NULL THEN
    INSERT INTO public.fbck_ctgr_item (ctgr_id,item_cd,item_nm,item_desc,sort_ord,regr_id,modr_id) VALUES
      (v,'QUALITY','품질','소재 및 완성도',10,'ADMIN','ADMIN'),
      (v,'VALUE','가성비','가격 대비 만족도',20,'ADMIN','ADMIN'),
      (v,'FUNCTION','기능성','기능',30,'ADMIN','ADMIN'),
      (v,'SELLER','판매자 응대','판매자 친절도·소통',40,'ADMIN','ADMIN'),
      (v,'DELIVERY','배송','배송 상태',50,'ADMIN','ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- 검증:
--   SELECT COUNT(*) FROM public.fbck_ctgr_item WHERE del_yn='N';  -- 465개 이상 (93개×5, sql/116 중복 제외)
--   SELECT c.ctgr_nm, COUNT(i.item_id) cnt
--     FROM public.mps_ctgr c
--     LEFT JOIN public.fbck_ctgr_item i ON i.ctgr_id=c.ctgr_id AND i.del_yn='N'
--    WHERE c.del_yn='N'
--    GROUP BY c.ctgr_nm ORDER BY cnt, c.ctgr_nm;  -- 모든 카테고리 5건 확인
