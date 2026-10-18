-- 035_mdl_asst_nm.sql : 보조명(마스터 지시 2026-10-18 — DA# '개체명 보기옵션'의 보조명 보기, "보조명 칸 신설")
-- DA-APPROVED: 마스터 지시 2026-10-18 — mdl_ent·mdl_attr 칼럼 1개씩(fn_add_cols_keep_sys), 표준단어 보조 ASST(행안부 공통표준)·명 NM
-- 보조명 = 엔터티·속성의 별도 표시 이름(예 : 업무 약칭·영문명). 표준 검증 대상 아님(자유 입력, 200자), 비어 있으면 표시 안 함
BEGIN;

-- 칼럼 이동(시스템 컬럼 맨 끝 유지)은 행을 다시 쓰므로 작성완료 잠금 트리거(032)가 막음 → 이동 동안만 사용자 트리거 정지(033 선례, 값 변경 아님)
ALTER TABLE mdl_ent DISABLE TRIGGER USER;
ALTER TABLE mdl_attr DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_ent', $c$ADD COLUMN ent_asst_nm VARCHAR(200)$c$);
SELECT fn_add_cols_keep_sys('mdl_attr', $c$ADD COLUMN attr_asst_nm VARCHAR(200)$c$);
ALTER TABLE mdl_ent ENABLE TRIGGER USER;
ALTER TABLE mdl_attr ENABLE TRIGGER USER;
COMMENT ON COLUMN mdl_ent.ent_asst_nm IS '엔터티보조명 — ERD 개체명 보기옵션 보조명(자유 입력)';
COMMENT ON COLUMN mdl_attr.attr_asst_nm IS '속성보조명 — ERD 개체명 보기옵션 보조명(자유 입력)';

COMMIT;

NOTIFY pgrst, 'reload schema';
