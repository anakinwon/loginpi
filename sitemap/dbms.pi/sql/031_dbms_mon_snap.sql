-- 031_dbms_mon_snap.sql — 모니터링 관문 보드 지표 스냅샷 : 연결·접속·분 단위 1행(통계 수치만, 쿼리문·행 데이터 없음 — 계약 A3)
-- DA-APPROVED: 2026-11-01 아소카(마스터 위임 NonStop) — dbm_ 접두 이력 테이블 1개, 시스템 칼럼 4·논리삭제, FK 없음(dbm_lnk 소유는 requireLink)
-- 선행 : 004(dbm_lnk). 적용 : node scripts/db-migrate.mjs --app dbms --tier prod
-- 설계 :
--  · 쓰기 = GET /api/monitor/board 성공 시 after() 비동기 upsert(ON CONFLICT DO NOTHING) — 분당 최대 1행, 자동 수집(cron) 없음
--  · 누적 칼럼(xact_*·blks_*·dlck_cnt·tmp_sz_byte)은 pg_stat_database 누적치 — Δ 계산은 앱(stat_reset_dtm 변경·음수 = 폐기)
--  · 조회 = (lnk_id, conn_id, bkt_dtm 범위) — PK 가 받아 추가 인덱스 없음. 보존 : 물리 DELETE 없음(DA 예외 전까지)
BEGIN;

CREATE TABLE IF NOT EXISTS dbm_mon_snap (
  lnk_id            UUID         NOT NULL,                                 -- 연결ID(dbm_lnk)
  conn_id           TEXT         NOT NULL,                                 -- 접속ID(schema.pi)
  bkt_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 구간일시(분 절삭)
  stat_reset_dtm    TIMESTAMPTZ,                                           -- 통계초기화일시(pg_stat_database.stats_reset)
  rsp_ms            INTEGER,                                               -- 응답시간ms(db_stats 조회)
  max_conn_cnt      INTEGER,                                               -- 최대연결수(max_connections)
  sess_cnt          INTEGER      NOT NULL DEFAULT 0,                       -- 세션수(client backend)
  actv_sess_cnt     INTEGER      NOT NULL DEFAULT 0,                       -- 활성세션수(active)
  idle_tx_sess_cnt  INTEGER      NOT NULL DEFAULT 0,                       -- 방치트랜잭션세션수(idle in transaction)
  lock_wait_cnt     INTEGER      NOT NULL DEFAULT 0,                       -- 락대기세션수(wait_event_type = Lock)
  long_qry_cnt      INTEGER      NOT NULL DEFAULT 0,                       -- 장기쿼리수(30초 초과 active)
  max_run_ms        BIGINT       NOT NULL DEFAULT 0,                       -- 최장실행ms(active)
  max_idle_tx_ms    BIGINT       NOT NULL DEFAULT 0,                       -- 최장방치ms(idle in transaction)
  xact_cmt_cnt      BIGINT,                                                -- 커밋수(누적)
  xact_rlbk_cnt     BIGINT,                                                -- 롤백수(누적)
  blks_hit_cnt      BIGINT,                                                -- 캐시적중블록수(누적)
  blks_read_cnt     BIGINT,                                                -- 디스크읽기블록수(누적)
  dlck_cnt          BIGINT,                                                -- 교착수(누적)
  tmp_sz_byte       BIGINT,                                                -- 임시파일크기(누적, 바이트)
  db_sz_byte        BIGINT,                                                -- DB크기(바이트)
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_dbm_mon_snap PRIMARY KEY (lnk_id, conn_id, bkt_dtm),
  CONSTRAINT dbm_mon_snap_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_mon_snap IS '모니터링 보드 스냅샷 — 연결·접속·분 단위 지표(통계 수치만, 보드를 볼 때만 기록)';

SELECT fn_grant_svc_only('TABLE', 'dbm_mon_snap');

-- mod_dtm 자동 갱신(DA 검토 m1 — 030 과 동일 방식)
CREATE OR REPLACE FUNCTION fn_upd_dbm_mon_snap_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_mon_snap_mod_dtm ON dbm_mon_snap;
CREATE TRIGGER trg_dbm_mon_snap_mod_dtm
  BEFORE UPDATE ON dbm_mon_snap
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_mon_snap_mod_dtm();

COMMIT;
