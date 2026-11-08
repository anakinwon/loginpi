-- DA-APPROVED: 시드 데이터만 (DDL 없음) — 카페/음료 카테고리 추가
-- 스타벅스 커피매장 기준 커피음료·디저트 중분류. cafe.pi O2O 중심성 반영해 sort 5(최상단).
-- 멱등: 고정 UUID PK + ON CONFLICT DO NOTHING (재실행 안전, 039 시드 패턴 준수)

-- 대분류: 카페/음료 (parent_ctgr_id = NULL)
INSERT INTO public.mps_ctgr (ctgr_id, parent_ctgr_id, ctgr_nm, ctgr_desc, sort_ord) VALUES
  ('a0000000-0000-4000-8000-000000000006', NULL, '카페/음료', '커피·음료·디저트 등 카페 메뉴', 5)
ON CONFLICT (ctgr_id) DO NOTHING;

-- 중분류: 커피음료 · 디저트 (parent_ctgr_id = 카페/음료)
INSERT INTO public.mps_ctgr (ctgr_id, parent_ctgr_id, ctgr_nm, ctgr_desc, sort_ord) VALUES
  ('b0000000-0000-4000-8000-000000000601', 'a0000000-0000-4000-8000-000000000006', '커피음료', '에스프레소·아메리카노·라떼·콜드브루·프라푸치노 등', 10),
  ('b0000000-0000-4000-8000-000000000602', 'a0000000-0000-4000-8000-000000000006', '디저트',   '케이크·쿠키·베이커리·샌드위치 등',                 20)
ON CONFLICT (ctgr_id) DO NOTHING;
