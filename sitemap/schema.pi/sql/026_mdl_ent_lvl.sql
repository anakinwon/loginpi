-- 026_mdl_ent_lvl.sql : 엔터티 모델 단계 — 개념 모델 핵심 엔터티(CNCP) / 논리 모델에서 추가한 엔터티(LGCL) 구분 (2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 지시 2026-10-17 — 논리 모델 편집(엔터티 등록·수정)에서 "단계 구분 칸 추가" 확정. 기존 엔터티는 모두 핵심(CNCP), 논리 엔터티는 핵심으로 승격 가능
-- 개념 화면은 기본 CNCP 만(토글로 전체), 논리 화면은 전체를 배지로 구분. 시스템 컬럼 4개는 맨 끝 유지(fn_add_cols_keep_sys)
BEGIN;

SELECT fn_add_cols_keep_sys('mdl_ent', $c$
  ADD COLUMN mdl_lvl_cd VARCHAR(4) NOT NULL DEFAULT 'CNCP' CONSTRAINT mdl_ent_lvl_check CHECK (mdl_lvl_cd IN ('CNCP','LGCL'))$c$);
COMMENT ON COLUMN mdl_ent.mdl_lvl_cd IS '모델단계코드 — CNCP 개념 핵심 엔터티 / LGCL 논리 모델 추가 엔터티';

COMMIT;

NOTIFY pgrst, 'reload schema';
