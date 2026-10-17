-- 027_mdl_rel_self_opt_attr_src.sql : PRD_PiErd S0 결함 수정 — D2 자기참조 관계 부모 선택 강제, D3 역할명 상속 원천 속성 (2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 확정 2026-10-17(docs/PRD_PiErd.md S0) — D2 : 부모 필수 자기참조는 최상위 행을 넣을 수 없는 모델(DA# 매뉴얼 p82 Optional 강제)이므로 CHECK 로 차단(활성 위반 0건, 논리 삭제된 과거 행은 제외)
--   D3 : 같은 부모를 역할명으로 두 번 상속(예 발신·수신 고객번호)할 때 각 상속 속성이 부모의 어느 식별자에서 왔는지 기록 — mdl_attr.src_attr_id(원천속성ID, 일반 속성은 NULL). 시스템 컬럼 4개는 맨 끝 유지(fn_add_cols_keep_sys)
BEGIN;

ALTER TABLE mdl_rel ADD CONSTRAINT mdl_rel_self_opt_check CHECK (del_yn = 'Y' OR prnt_ent_id <> chld_ent_id OR prnt_opt_yn = 'Y'); -- 자기참조는 부모 선택(논리 삭제된 과거 행 제외)

SELECT fn_add_cols_keep_sys('mdl_attr', $c$
  ADD COLUMN src_attr_id UUID$c$);
COMMENT ON COLUMN mdl_attr.src_attr_id IS '원천속성ID — 관계로 상속한 속성의 부모 식별자 속성(역할명 상속 포함), 일반 속성은 NULL';
ALTER TABLE mdl_attr ADD CONSTRAINT mdl_attr_src_attr_id_fkey FOREIGN KEY (src_attr_id) REFERENCES mdl_attr (attr_id);
ALTER TABLE mdl_attr ADD CONSTRAINT mdl_attr_src_fk_check CHECK (src_attr_id IS NULL OR fk_rel_id IS NOT NULL); -- 원천은 상속 속성만
CREATE INDEX IF NOT EXISTS ix_mdl_attr_src ON mdl_attr (src_attr_id) WHERE del_yn = 'N' AND src_attr_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
