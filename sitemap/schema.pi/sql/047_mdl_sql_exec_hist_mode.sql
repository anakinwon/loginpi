-- 047_mdl_sql_exec_hist_mode.sql : SQL 편집기 실행 방식 AUTO | MANUAL(마스터 지시 2026-10-18) — 이력 실행방식코드에 TRY·CMIT 추가
-- DA-APPROVED: 마스터 결정 2026-10-18 'MANUAL = 미리 실행 + Commit 때 재실행' — mdl_sql_exec_hist.exec_mode_cd 허용 값 확장(칼럼 변경 없음)
-- TRY = MANUAL 미리 실행(대기 문장 재실행 후 항상 되돌림, 반영 없음) / CMIT = MANUAL Commit(대기 문장 한 트랜잭션 실행·커밋)
BEGIN;

ALTER TABLE mdl_sql_exec_hist DROP CONSTRAINT IF EXISTS mdl_sql_exec_hist_mode_check;
ALTER TABLE mdl_sql_exec_hist ADD CONSTRAINT mdl_sql_exec_hist_mode_check CHECK (exec_mode_cd IN ('READ','WRITE','TRY','CMIT'));
COMMENT ON COLUMN mdl_sql_exec_hist.exec_mode_cd IS '실행방식코드 : READ 조회 전용 / WRITE 쓰기(AUTO 커밋) / TRY MANUAL 미리 실행(반영 없음) / CMIT MANUAL 커밋';

COMMIT;

NOTIFY pgrst, 'reload schema';
