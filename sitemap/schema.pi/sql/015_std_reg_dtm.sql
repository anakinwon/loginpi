-- 015_std_reg_dtm.sql : 표준 데이터 등록일시(최초 등록 시각) — 2026-10-16 마스터 지시(시스템 컬럼과 별도 업무 칸, 목록 기본 정렬 = 등록일시 내림차순)
-- 값 : 신청(최초 등록) 시각, 새 행은 DEFAULT 로 채움(등록 함수 변경 없음), 수정·승인에서 바꾸지 않음. 기존 행은 reg_dtm 으로 채움
-- 시스템 컬럼 4개 맨 뒤 유지(sql/010 fn_add_cols_keep_sys), 채움 UPDATE 는 mod_dtm 트리거 정지 상태에서 실행
BEGIN;

SELECT fn_add_cols_keep_sys('std_dic',  $c$ADD COLUMN std_reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP$c$);
SELECT fn_add_cols_keep_sys('std_dom',  $c$ADD COLUMN std_reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP$c$);
SELECT fn_add_cols_keep_sys('std_term', $c$ADD COLUMN std_reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP$c$);

ALTER TABLE std_dic  DISABLE TRIGGER trg_std_dic_mod_dtm;
ALTER TABLE std_dom  DISABLE TRIGGER trg_std_dom_mod_dtm;
ALTER TABLE std_term DISABLE TRIGGER trg_std_term_mod_dtm;
UPDATE std_dic  SET std_reg_dtm = reg_dtm;
UPDATE std_dom  SET std_reg_dtm = reg_dtm;
UPDATE std_term SET std_reg_dtm = reg_dtm;
ALTER TABLE std_dic  ENABLE TRIGGER trg_std_dic_mod_dtm;
ALTER TABLE std_dom  ENABLE TRIGGER trg_std_dom_mod_dtm;
ALTER TABLE std_term ENABLE TRIGGER trg_std_term_mod_dtm;

COMMENT ON COLUMN std_dic.std_reg_dtm  IS '등록일시(최초 등록 시각)';
COMMENT ON COLUMN std_dom.std_reg_dtm  IS '등록일시(최초 등록 시각)';
COMMENT ON COLUMN std_term.std_reg_dtm IS '등록일시(최초 등록 시각)';

-- 목록 기본 정렬(분류체계별 등록일시 내림차순) 인덱스, 활성 행만
CREATE INDEX IF NOT EXISTS ix_std_dic_area_reg_actv  ON std_dic  (area_id, std_reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_std_dom_area_reg_actv  ON std_dom  (area_id, std_reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS ix_std_term_area_reg_actv ON std_term (area_id, std_reg_dtm DESC) WHERE del_yn = 'N';

COMMIT;

NOTIFY pgrst, 'reload schema';
