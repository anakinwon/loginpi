-- 033_dbms_perf_qry_max.sql — 쿼리 통계 dbm_prf_qry 에 1회 최고 수행시간 max_ms 칼럼 추가(느린 SQL 판정 = max_exec_time 만, 마스터 2026-11-02)
-- DA-APPROVED: 2026-11-02 아소카(마스터 위임 NonStop) — dbm_prf_qry 칼럼 1개 추가, 형식은 tot_ms·avg_ms 와 같은 NUMERIC(20,3), 시스템 칼럼 맨 끝 유지(STD-05), 기존 행 NULL(033 이전 수집)
-- 선행 : 020(dbm_prf_qry)·032(usr_nm). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · max_ms = 수집 시점의 pg_stat_statements.max_exec_time(통계 리셋 이후 최고치) 그대로 — 누적 최고치는 두 수집 사이 증감을 계산할 수 없어 현재 값 저장
--  · 033 이전 수집 행은 NULL — 조회(/api/perf/top)가 정렬 맨 뒤·화면 '—'
--  · 시스템 칼럼 맨 끝 유지 : 032 와 같은 방식(기존 4개 임시 이름 → 새 칸 → 시스템 칼럼 재추가 → 값 복사 → 임시 칸 삭제), 칼럼이 이미 있으면 건너뜀(재실행 안전)
BEGIN;

DO $$
DECLARE
  c TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'dbm_prf_qry' AND column_name = 'max_ms'
  ) THEN
    FOREACH c IN ARRAY ARRAY['regr_id', 'reg_dtm', 'modr_id', 'mod_dtm'] LOOP
      EXECUTE format('ALTER TABLE dbm_prf_qry RENAME COLUMN %I TO %I', c, c || '_old');
    END LOOP;
    ALTER TABLE dbm_prf_qry
      ADD COLUMN max_ms  NUMERIC(20,3),
      ADD COLUMN regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
      ADD COLUMN reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
      ADD COLUMN mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE dbm_prf_qry SET regr_id = regr_id_old, reg_dtm = reg_dtm_old, modr_id = modr_id_old, mod_dtm = mod_dtm_old;
    ALTER TABLE dbm_prf_qry DROP COLUMN regr_id_old, DROP COLUMN reg_dtm_old, DROP COLUMN modr_id_old, DROP COLUMN mod_dtm_old;
  END IF;
END;
$$;
COMMENT ON COLUMN dbm_prf_qry.max_ms IS '최고수행시간ms(1회 최고, pg_stat_statements.max_exec_time 통계 리셋 이후 값 그대로 — 033 이전 수집 행은 NULL)';

COMMIT;
