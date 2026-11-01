-- 032_dbms_perf_qry_src.sql — 느린 쿼리 출처 표본 : 연결·접속·쿼리ID·계정·앱·마스킹주소별 관측 횟수(쿼리문·원 IP·행 데이터 없음 — 계약 A3) + dbm_prf_qry 계정명 칼럼
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 표본 집계 테이블 1개·병합 함수 1개, 시스템 칼럼 4·논리삭제, FK 없음(dbm_lnk 소유는 requireLink), dbm_prf_qry 칼럼 추가는 시스템 칼럼 맨 끝 유지(STD-05)
-- 선행 : packages/pi-db/sql/000_baseline.sql(fn_grant_svc_only)·004(dbm_lnk)·020(dbm_prf_qry). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 쓰기 = /api/monitor/board(fast 캐시 미스)·/api/perf/activity 가 이미 받은 activity 행을 after() 로 fn_dbm_prf_qry_src_merge 1회 호출(새 대상 DB 조회 없음)
--  · 키 = 출처 구성요소 전부(빈 값은 '' — NULL 유일키 회피). 분류(PROGRAM·BATCH·TOOL…)는 저장하지 않고 조회 때 규칙으로 판정(규칙 변경 소급, src/lib/perf/source.ts)
--  · clnt_addr_msk = IPv4 /24('a.b.c.0/24')·IPv6 /48·유닉스소켓 'local' — 앱이 마스킹한 값만 받는다(원주소 미저장). 보존 : 논리삭제, 물리 DELETE 없음
--  · 조회 (lnk_id, conn_id, qry_id IN (...)) 은 PK 접두가 받아 추가 인덱스 없음(R-P3)
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_prf_qry_src (
  lnk_id          UUID         NOT NULL,                                   -- 연결ID(dbm_lnk)
  conn_id         TEXT         NOT NULL,                                   -- 접속ID(schema.pi)
  qry_id          TEXT         NOT NULL,                                   -- 쿼리ID(pg_stat_activity.query_id = pg_stat_statements.queryid)
  usr_nm          TEXT         NOT NULL DEFAULT '',                        -- 계정명(usename)
  app_nm          TEXT         NOT NULL DEFAULT '',                        -- 앱명(application_name, 120자)
  clnt_addr_msk   TEXT         NOT NULL DEFAULT '',                        -- 마스킹접속주소(/24·/48·local)
  bknd_tp         TEXT,                                                    -- 백엔드유형(backend_type, 최근값)
  smp_cnt         BIGINT       NOT NULL DEFAULT 1,                         -- 표본수(관측 횟수)
  actv_smp_cnt    BIGINT       NOT NULL DEFAULT 0,                         -- 활성표본수(state=active 관측)
  fst_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 최초관측일시
  lst_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 최근관측일시
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm         TIMESTAMPTZ,                                             -- 삭제일시
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_dbm_prf_qry_src PRIMARY KEY (lnk_id, conn_id, qry_id, usr_nm, app_nm, clnt_addr_msk),
  CONSTRAINT dbm_prf_qry_src_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_prf_qry_src IS '느린 쿼리 출처 표본 — 쿼리ID별 계정·앱·마스킹주소 관측 횟수(쿼리문·원 IP·행 데이터 없음)';

SELECT fn_grant_svc_only('TABLE', 'dbm_prf_qry_src');

-- 수집 1회분 병합 : 같은 배치 안 중복 키를 먼저 합산(ON CONFLICT 가 같은 행을 두 번 못 건드리는 제약 회피) 후 upsert 카운터 증가
CREATE OR REPLACE FUNCTION fn_dbm_prf_qry_src_merge(p_rows JSONB, p_usr_id TEXT DEFAULT 'ADMIN')
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cnt INTEGER;
BEGIN
  WITH r AS (
    SELECT x.lnk_id, x.conn_id, x.qry_id,
           coalesce(x.usr_nm, '') AS usr_nm,
           left(coalesce(x.app_nm, ''), 120) AS app_nm,
           coalesce(x.clnt_addr_msk, '') AS clnt_addr_msk,
           max(x.bknd_tp) AS bknd_tp,
           count(*) AS smp_cnt,
           count(*) FILTER (WHERE x.actv_yn) AS actv_smp_cnt
    FROM jsonb_to_recordset(p_rows) AS x(lnk_id UUID, conn_id TEXT, qry_id TEXT, usr_nm TEXT, app_nm TEXT, clnt_addr_msk TEXT, bknd_tp TEXT, actv_yn BOOLEAN)
    WHERE x.lnk_id IS NOT NULL AND x.conn_id IS NOT NULL AND x.qry_id IS NOT NULL AND x.qry_id <> ''
    GROUP BY 1, 2, 3, 4, 5, 6
  ), u AS (
    INSERT INTO dbm_prf_qry_src (lnk_id, conn_id, qry_id, usr_nm, app_nm, clnt_addr_msk, bknd_tp, smp_cnt, actv_smp_cnt, regr_id, modr_id)
    SELECT lnk_id, conn_id, qry_id, usr_nm, app_nm, clnt_addr_msk, bknd_tp, smp_cnt, actv_smp_cnt, p_usr_id, p_usr_id FROM r
    ON CONFLICT ON CONSTRAINT pk_dbm_prf_qry_src DO UPDATE
      SET smp_cnt = dbm_prf_qry_src.smp_cnt + EXCLUDED.smp_cnt,
          actv_smp_cnt = dbm_prf_qry_src.actv_smp_cnt + EXCLUDED.actv_smp_cnt,
          bknd_tp = EXCLUDED.bknd_tp,
          lst_dtm = CURRENT_TIMESTAMP,
          del_yn = 'N',
          del_dtm = NULL,
          modr_id = p_usr_id
    RETURNING 1
  )
  SELECT count(*) INTO v_cnt FROM u;
  RETURN v_cnt;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_dbm_prf_qry_src_merge(jsonb, text)');

-- mod_dtm 자동 갱신(031 과 동일 방식)
CREATE OR REPLACE FUNCTION fn_upd_dbm_prf_qry_src_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_prf_qry_src_mod_dtm ON dbm_prf_qry_src;
CREATE TRIGGER trg_dbm_prf_qry_src_mod_dtm
  BEFORE UPDATE ON dbm_prf_qry_src
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_prf_qry_src_mod_dtm();

-- dbm_prf_qry 계정명(top_sql.usr_nm) — 같은 queryid 가 계정별로 갈라지므로 증감 키도 (qry_id, usr_nm). 기존 행은 NULL(calc.ts 가 qry_id 만으로 짝짓는 폴백)
-- 시스템 칼럼 맨 끝 유지(STD-05) : 기존 4개 임시 이름 → 새 칸 → 시스템 칼럼 다시 추가 → 값 복사 → 임시 칸 삭제(schema.pi sql/010 fn_add_cols_keep_sys 와 같은 방식)
--  dbm_prf_qry 에는 mod_dtm 트리거가 없어 정지 단계 없음. 칼럼이 이미 있으면 건너뜀(재실행 안전)
DO $$
DECLARE
  c TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'dbm_prf_qry' AND column_name = 'usr_nm'
  ) THEN
    FOREACH c IN ARRAY ARRAY['regr_id', 'reg_dtm', 'modr_id', 'mod_dtm'] LOOP
      EXECUTE format('ALTER TABLE dbm_prf_qry RENAME COLUMN %I TO %I', c, c || '_old');
    END LOOP;
    ALTER TABLE dbm_prf_qry
      ADD COLUMN usr_nm  TEXT,
      ADD COLUMN regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
      ADD COLUMN reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
      ADD COLUMN mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE dbm_prf_qry SET regr_id = regr_id_old, reg_dtm = reg_dtm_old, modr_id = modr_id_old, mod_dtm = mod_dtm_old;
    ALTER TABLE dbm_prf_qry DROP COLUMN regr_id_old, DROP COLUMN reg_dtm_old, DROP COLUMN modr_id_old, DROP COLUMN mod_dtm_old;
  END IF;
END;
$$;
COMMENT ON COLUMN dbm_prf_qry.usr_nm IS '계정명(pg_stat_statements userid → pg_get_userbyid, 032 이전 수집 행은 NULL)';

COMMIT;
