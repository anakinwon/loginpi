-- 022_mdl_indstry.sql : 모델 프로젝트 업종(Industry) — 공통코드 INDSTRY 8종 + mdl_prj.indstry_cd (MASTER_ROADMAP §6, ModelPi 반자동 추천 1단계, 2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 지시 2026-10-17 — 반자동 모델링(프로젝트 생성 시 Industry 추천). 기존 테이블 칸 추가는 fn_add_cols_keep_sys(시스템 컬럼 맨 뒤 유지), 코드 정의는 std_cmn_cd(sql/012 패턴)
-- 업종별 추천 근거(주제영역·핵심 엔터티·속성·관계·물리 권고)는 앱 템플릿 src/data/industry/<cd>.json(같은 코드), 추천은 저장하지 않고 사용자가 고른 것만 기존 등록 API 로 저장
-- 선택 칸(NULL = 업종 미지정 : 기존 프로젝트 그대로). 코드 추가 = 공통코드 INSERT + CHECK 재정의 + 템플릿 파일
BEGIN;

INSERT INTO std_cmn_cd (grp_cd, cd, cd_nm, cd_desc, sort_seq) VALUES
  ('INDSTRY', 'ECOM', '이커머스',       '온라인 상거래 : 고객·상품·주문·결제·배송·클레임', 1),
  ('INDSTRY', 'FIN',  '금융',           '은행·보험 : 고객·계좌·상품·거래·계약·보험금', 2),
  ('INDSTRY', 'MFG',  '제조',           '생산 : 품목·BOM·공정·작업지시·설비·품질', 3),
  ('INDSTRY', 'LOG',  '유통·물류',      '유통·물류 : 거래처·입고·재고·출고·운송·창고', 4),
  ('INDSTRY', 'PUB',  '공공행정',       '공공 : 민원·인허가·기관·사업·예산', 5),
  ('INDSTRY', 'MED',  '의료',           '병원 : 환자·진료·처방·검사·입원·수납', 6),
  ('INDSTRY', 'TEL',  '통신',           '통신 : 가입자·회선·요금제·사용량·청구', 7),
  ('INDSTRY', 'EDU',  '교육',           '학사 : 학생·교과·강좌·수강·성적·교원', 8)
ON CONFLICT (grp_cd, cd) DO NOTHING;

SELECT fn_add_cols_keep_sys('mdl_prj', $c$ADD COLUMN indstry_cd VARCHAR(20)$c$);
COMMENT ON COLUMN mdl_prj.indstry_cd IS '업종코드(std_cmn_cd INDSTRY, NULL = 미지정) — 주제영역·엔터티 추천 근거';
ALTER TABLE mdl_prj ADD CONSTRAINT mdl_prj_indstry_cd_check CHECK (indstry_cd IS NULL OR indstry_cd IN ('ECOM','FIN','MFG','LOG','PUB','MED','TEL','EDU'));

COMMIT;

NOTIFY pgrst, 'reload schema';
