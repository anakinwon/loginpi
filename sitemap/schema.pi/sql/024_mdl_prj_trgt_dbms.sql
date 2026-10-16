-- 024_mdl_prj_trgt_dbms.sql : 프로젝트 대상 DBMS(예정) — 2단계 결정(프로젝트 생성 시 예정 필수 선언 → 물리 모델 생성 시 확정) (2026-10-17 마스터 지시)
-- DA-APPROVED: 마스터 지시 2026-10-17 — 표준·개념·논리는 DBMS 무관(도메인 = 논리 데이터타입), 프로젝트는 대상 DBMS 를 미리 선언해 물리명 미리보기(대소문자·식별자 길이)를 그 DBMS 기준으로 보이고, 물리 모델(MD5)에서 프로젝트 × DBMS 로 확정
-- 기본 '0014'(PostgreSQL) : 기존 프로젝트 이관값. 지원 프로파일(1차) = 0001 ORACLE · 0013 TIBERO · 0014 PostgreSQL — 앱 검증(src/lib/modelpi/dbms.ts), DB 는 std_dbms FK 로 존재만 보장
-- 기준 데이터 보정 : 3종이 std_dbms 에 없으면 넣음(db:seed 전 환경·로컬 검증용, 운영은 이미 적재됨 → 변경 없음)
BEGIN;

INSERT INTO std_dbms (dbms_cd, dbms_nm) VALUES ('0001', 'ORACLE'), ('0013', 'TIBERO'), ('0014', 'PostgreSQL')
ON CONFLICT (dbms_cd) DO NOTHING;

SELECT fn_add_cols_keep_sys('mdl_prj', $c$ADD COLUMN trgt_dbms_cd VARCHAR(4) NOT NULL DEFAULT '0014'$c$);
COMMENT ON COLUMN mdl_prj.trgt_dbms_cd IS '대상DBMS코드(예정) — std_dbms, 물리명 미리보기 기준. 물리 모델 생성 시 프로젝트 × DBMS 로 확정(MD5)';
ALTER TABLE mdl_prj ADD CONSTRAINT mdl_prj_std_dbms_cd_fkey FOREIGN KEY (trgt_dbms_cd) REFERENCES std_dbms (dbms_cd);

COMMIT;

NOTIFY pgrst, 'reload schema';
