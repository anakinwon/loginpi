-- 034_dbms_perf_qry_blks.sql — 쿼리 통계 dbm_prf_qry 에 블록 수 칼럼 3개 추가(느린 쿼리 '원인 진단' : 디스크 읽기·임시 파일 넘침 판정 근거, 2026-11-02)
-- DA-APPROVED: 2026-11-02 아소카(마스터 위임 NonStop) — dbm_prf_qry 칼럼 3개 추가, 이름은 031(dbm_mon_snap) blks_hit_cnt·blks_read_cnt 선례 + wrt = 쓰기(Write) — 공통표준단어 작성(WRT)과 같은 단어로 매핑(동음이의 방지), 누적 카운터 = _cnt BIGINT(§1-2·§3-6), 시스템 칼럼 맨 끝 유지(STD-05), 기존 행 NULL(034 이전 수집)
-- 선행 : 020(dbm_prf_qry)·032(usr_nm)·033(max_ms). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 값 = 수집 시점 pg_stat_statements 누적치(shared_blks_hit·shared_blks_read·temp_blks_written) 그대로 — 두 수집 사이 증감은 앱(src/lib/perf/calc.ts qryDelta, 호출 수와 같은 리셋 보정)
--  · 034 이전 수집 행은 NULL — 진단(src/lib/perf/diagnose.ts)이 디스크 읽기·임시 블록 규칙을 건너뜀
--  · 시스템 칼럼 맨 끝 유지 : 033 과 같은 방식(기존 4개 임시 이름 → 새 칸 → 시스템 칼럼 재추가 → 값 복사 → 임시 칸 삭제), 칼럼이 이미 있으면 건너뜀(재실행 안전)
BEGIN;

DO $$
DECLARE
  c TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'dbm_prf_qry' AND column_name = 'blks_hit_cnt'
  ) THEN
    FOREACH c IN ARRAY ARRAY['regr_id', 'reg_dtm', 'modr_id', 'mod_dtm'] LOOP
      EXECUTE format('ALTER TABLE dbm_prf_qry RENAME COLUMN %I TO %I', c, c || '_old');
    END LOOP;
    ALTER TABLE dbm_prf_qry
      ADD COLUMN blks_hit_cnt     BIGINT,
      ADD COLUMN blks_read_cnt    BIGINT,
      ADD COLUMN tmp_blks_wrt_cnt BIGINT,
      ADD COLUMN regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
      ADD COLUMN reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
      ADD COLUMN mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE dbm_prf_qry SET regr_id = regr_id_old, reg_dtm = reg_dtm_old, modr_id = modr_id_old, mod_dtm = mod_dtm_old;
    ALTER TABLE dbm_prf_qry DROP COLUMN regr_id_old, DROP COLUMN reg_dtm_old, DROP COLUMN modr_id_old, DROP COLUMN mod_dtm_old;
  END IF;
END;
$$;
COMMENT ON COLUMN dbm_prf_qry.blks_hit_cnt IS '캐시적중블록수(누적, pg_stat_statements.shared_blks_hit — 034 이전 수집 행은 NULL)';
COMMENT ON COLUMN dbm_prf_qry.blks_read_cnt IS '디스크읽기블록수(누적, pg_stat_statements.shared_blks_read — 034 이전 수집 행은 NULL)';
COMMENT ON COLUMN dbm_prf_qry.tmp_blks_wrt_cnt IS '임시블록쓰기수(누적, pg_stat_statements.temp_blks_written — 정렬·해시가 work_mem 을 넘어 임시 파일에 쓴 블록, 034 이전 수집 행은 NULL)';

COMMIT;
