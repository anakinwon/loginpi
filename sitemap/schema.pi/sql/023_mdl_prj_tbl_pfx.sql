-- 023_mdl_prj_tbl_pfx.sql : 프로젝트 스키마 접두사 — 핵심 엔터티 물리 테이블명 접두사(구 고정 TB_)를 프로젝트 생성 시 결정 (2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 지시 2026-10-17 — 테이블명 = <스키마 접두사>_ + 주제영역 약어 3자 + 단어 약어 + 엔터티 분류어 접미어. 단어의 테이블 접미어(std_dic.tbl_sfx_txt, sql/017)와 짝을 이루는 tbl_pfx_txt
-- 형식 : 영문 대문자 2~4자(CHECK), 기본 'TB'(기존 프로젝트·정의서 §8.5 기본 표기 그대로 유지). 물리 테이블명은 저장하지 않고 조회 시 계산하므로 접두사 변경 = 그 프로젝트 전 엔터티 즉시 반영
-- 추천 : 프로젝트 생성 화면의 AI 추천(POST /projects/ai-suggest)이 후보 제시, 같은 분류체계 다른 프로젝트가 쓰는 접두사는 후보에서 제외(유일 강제는 하지 않음)
BEGIN;

SELECT fn_add_cols_keep_sys('mdl_prj', $c$ADD COLUMN tbl_pfx_txt VARCHAR(4) NOT NULL DEFAULT 'TB'$c$);
COMMENT ON COLUMN mdl_prj.tbl_pfx_txt IS '스키마 접두사(테이블 접두어) — 영문 대문자 2~4자, 물리 테이블명 = 접두사_주제영역약어_단어약어[접미어]';
ALTER TABLE mdl_prj ADD CONSTRAINT mdl_prj_tbl_pfx_txt_check CHECK (tbl_pfx_txt ~ '^[A-Z]{2,4}$');

COMMIT;

NOTIFY pgrst, 'reload schema';
