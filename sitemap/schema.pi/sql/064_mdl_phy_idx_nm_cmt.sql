-- 064_mdl_phy_idx_nm_cmt.sql : 물리 인덱스 이름 규칙 교정에 맞춰 설명(COMMENT) 갱신 — IX_<테이블>_NN → X_<테이블>_NN(마스터 지시 2026-10-20)
-- DA-APPROVED: 마스터 지시 2026-10-20 "인덱스 명명규칙은 X_테이블명_01" — 칼럼·테이블 구조 변경 없음, 063 의 COMMENT 문구만 교정(적용된 063 은 수정 금지라 새 번호)
BEGIN;

COMMENT ON TABLE mdl_phy_idx IS '물리 인덱스 — 물리 테이블별 일반·유일 인덱스(칼럼 구성 = 물리칼럼ID 배열, 이름 X_<테이블>_NN)';
COMMENT ON COLUMN mdl_phy_idx.idx_nm IS '인덱스명(서버 생성 X_<테이블명>_NN, 대문자 저장)';

COMMIT;
