-- 036_mdl_phy_tbl_auto_inc.sql : 단일 PK 자동 증가 = 테이블별 옵션(마스터 지시 2026-10-18 "목록 다중 처리가 아니라 개별 테이블별 옵션")
-- DA-APPROVED: 마스터 지시 2026-10-18 — mdl_phy_tbl 칼럼 1개(fn_add_cols_keep_sys), 표준단어 자동 AUTO·증가 INC [확인중 : 행안부 표준단어 대조]·여부 YN
-- 의미 : Y = DDL 생성 때 단일 정수 PK 를 자동 증가로(PostgreSQL·Oracle IDENTITY, Tibero SEQUENCE). 대상 판정(단일·정수·상속 아님)은 앱(ddl.ts autoIncCol)
-- 주의 : mdl_phy_tbl 에는 작성완료 잠금 트리거(032)가 있어 칼럼 이동(행 재작성) 동안만 사용자 트리거 정지 — 이후 칼럼 추가도 같은 방식(035 운영 실패 교훈)
BEGIN;

ALTER TABLE mdl_phy_tbl DISABLE TRIGGER USER;
SELECT fn_add_cols_keep_sys('mdl_phy_tbl', $c$ADD COLUMN auto_inc_yn CHAR(1) NOT NULL DEFAULT 'N'$c$);
ALTER TABLE mdl_phy_tbl ENABLE TRIGGER USER;
ALTER TABLE mdl_phy_tbl ADD CONSTRAINT mdl_phy_tbl_auto_inc_yn_check CHECK (auto_inc_yn IN ('Y','N'));
COMMENT ON COLUMN mdl_phy_tbl.auto_inc_yn IS '자동증가여부 — Y = DDL 생성 때 단일 정수 PK 자동 증가(IDENTITY·SEQUENCE)';

COMMIT;

NOTIFY pgrst, 'reload schema';
