-- 068_mon.sql : 모니터링 4종(마스터 지시 2026-10-21 — WhaTap 의 애플리케이션·서버·데이터베이스·URL 모니터링을 심플하게) — 앱 경계상 dbms.pi 영역이나 마스터 선택으로 schema.pi 에 두고 dbms.pi 생기면 이전
-- DA-APPROVED: 마스터 지시 2026-10-21 — 신규 5테이블(mon_ 접두 = 모니터링 주제영역), 이력 4종은 _hist(추가 전용 로그 — del_yn 면제·보관 기간 지난 행 물리 삭제 허용, 정본 §4 예외), 시스템 컬럼 4개 맨 끝, service_role 전용
--   약어 MON(모니터링)·APP(애플리케이션)·SRV(서버)·BKT(구간)·RSP(응답)·SUM(합계)·MAX(최대)·ERR(오류)·SLOW(느림)·CPU·MEM(메모리)·DISK·TOT(전체)·USED(사용)·SESS(세션)·XACT(트랜잭션)·BLKS(블록)·TUP(행)·LOCK·WAIT·DLCK(교착)·TMP(임시)·CHK(점검)·STS(상태)
--   응답시간은 밀리초 숫자(…_val), 용량은 바이트(…_sz), 비율은 백분율(…_pct). FK 없음(RI 물리 미구현 결정 — 대상 삭제는 논리 삭제라 이력 보존)
-- 수집 : 앱 = 브라우저가 API 응답 시간을 묶어 보냄(fn_mon_app_add 로 분 단위 누적) / 서버 = 로컬 에이전트 폴링 본문의 호스트 지표(1분 1행) / DB = 모니터링 화면이 열린 동안 1분 1행 /
--        URL = 화면이 열린 동안 + 주기 수집(/api/mon/collect, CRON_SECRET) 1분 1행. 보관 7일(수집 때 지난 행 삭제)
BEGIN;

-- ① 애플리케이션(schema.pi API) — 분 × 경로 누적
CREATE TABLE IF NOT EXISTS mon_app_hist (
  bkt_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 구간일시(분 단위 시작)
  route_txt         VARCHAR(200) NOT NULL,                                 -- 경로(UUID·숫자 → :id 정규화, 질의 문자열 제외)
  req_cnt           INT          NOT NULL DEFAULT 0,                       -- 요청건수
  err_cnt           INT          NOT NULL DEFAULT 0,                       -- 오류건수(응답 4xx·5xx·네트워크 실패)
  slow_cnt          INT          NOT NULL DEFAULT 0,                       -- 느림건수(1초 이상)
  rsp_sum_val       BIGINT       NOT NULL DEFAULT 0,                       -- 응답합계값(밀리초)
  rsp_max_val       INT          NOT NULL DEFAULT 0,                       -- 응답최대값(밀리초)
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_app_hist PRIMARY KEY (bkt_dtm, route_txt)
);

-- ② 서버(로컬 에이전트 호스트) — 에이전트 × 분
CREATE TABLE IF NOT EXISTS mon_srv_hist (
  agt_id            UUID         NOT NULL,                                 -- 에이전트ID
  bkt_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 구간일시(분)
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  host_nm           VARCHAR(200),                                          -- 호스트명
  os_nm             VARCHAR(100),                                          -- 운영체제명
  core_cnt          INT,                                                   -- 코어건수
  cpu_pct           NUMERIC(5,2),                                          -- CPU사용률(%)
  mem_tot_sz        BIGINT,                                                -- 메모리전체크기(바이트)
  mem_used_sz       BIGINT,                                                -- 메모리사용크기(바이트)
  disk_tot_sz       BIGINT,                                                -- 디스크전체크기(바이트)
  disk_used_sz      BIGINT,                                                -- 디스크사용크기(바이트)
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_srv_hist PRIMARY KEY (agt_id, bkt_dtm),
  CONSTRAINT mon_srv_hist_cpu_pct_check CHECK (cpu_pct IS NULL OR cpu_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS x_mon_srv_hist_01 ON mon_srv_hist (area_id, bkt_dtm);

-- ③ 데이터베이스(등록 접속, PostgreSQL) — 접속 × 분, 누적 카운터는 그대로(화면이 구간 차이로 초당 값 계산)
CREATE TABLE IF NOT EXISTS mon_db_hist (
  conn_id           UUID         NOT NULL,                                 -- 접속ID
  bkt_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 구간일시(분)
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  sess_cnt          INT,                                                   -- 활성세션건수
  conn_cnt          INT,                                                   -- 접속건수
  lock_wait_cnt     INT,                                                   -- 락대기건수
  xact_cnt          BIGINT,                                                -- 트랜잭션건수(누적 commit + rollback)
  blks_hit_cnt      BIGINT,                                                -- 블록적중건수(누적)
  blks_read_cnt     BIGINT,                                                -- 블록읽기건수(누적)
  tup_cnt           BIGINT,                                                -- 변경행건수(누적 insert + update + delete)
  dlck_cnt          BIGINT,                                                -- 교착건수(누적)
  tmp_sz            BIGINT,                                                -- 임시파일크기(누적 바이트)
  db_sz             BIGINT,                                                -- 데이터베이스크기(바이트)
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_db_hist PRIMARY KEY (conn_id, bkt_dtm)
);
CREATE INDEX IF NOT EXISTS x_mon_db_hist_01 ON mon_db_hist (area_id, bkt_dtm);

-- ④ URL — 등록 대상(분류체계별) + 점검 이력
CREATE TABLE IF NOT EXISTS mon_url (
  url_id            UUID         NOT NULL DEFAULT gen_random_uuid(),       -- URL ID
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  url_nm            VARCHAR(100) NOT NULL,                                 -- URL명
  chk_url           VARCHAR(2000) NOT NULL,                                -- 점검URL(http·https)
  use_yn            CHAR(1)      NOT NULL DEFAULT 'Y',                     -- 사용여부(주기 수집 대상)
  ver_no            INT          NOT NULL DEFAULT 1,                       -- 버전번호
  del_yn            CHAR(1)      NOT NULL DEFAULT 'N',                     -- 삭제여부
  del_dtm           TIMESTAMPTZ,                                           -- 삭제일시
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_url PRIMARY KEY (url_id),
  CONSTRAINT mon_url_yn_check CHECK (use_yn IN ('Y','N') AND del_yn IN ('Y','N')),
  CONSTRAINT mon_url_chk_url_check CHECK (chk_url ~* '^https?://')
);
CREATE INDEX IF NOT EXISTS x_mon_url_01 ON mon_url (area_id) WHERE del_yn = 'N';

CREATE TABLE IF NOT EXISTS mon_url_hist (
  url_id            UUID         NOT NULL,                                 -- URL ID
  bkt_dtm           TIMESTAMPTZ  NOT NULL,                                 -- 구간일시(분)
  area_id           UUID         NOT NULL,                                 -- 분류체계ID
  sts_no            INT          NOT NULL,                                 -- 상태번호(HTTP 상태, 0 = 접속 실패·시간 초과·차단)
  rsp_val           INT          NOT NULL,                                 -- 응답값(밀리초)
  err_txt           VARCHAR(200),                                          -- 오류내용(실패 사유 요약)
  regr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 등록자ID
  reg_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 등록일시
  modr_id           TEXT         NOT NULL DEFAULT 'ADMIN',                 -- 변경자ID
  mod_dtm           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- 변경일시
  CONSTRAINT pk_mon_url_hist PRIMARY KEY (url_id, bkt_dtm)
);
CREATE INDEX IF NOT EXISTS x_mon_url_hist_01 ON mon_url_hist (area_id, bkt_dtm);

SELECT fn_add_mod_dtm_trg('mon_app_hist'), fn_add_mod_dtm_trg('mon_srv_hist'), fn_add_mod_dtm_trg('mon_db_hist'), fn_add_mod_dtm_trg('mon_url'), fn_add_mod_dtm_trg('mon_url_hist');
SELECT fn_grant_svc_only('TABLE', 'mon_app_hist'), fn_grant_svc_only('TABLE', 'mon_srv_hist'), fn_grant_svc_only('TABLE', 'mon_db_hist'), fn_grant_svc_only('TABLE', 'mon_url'), fn_grant_svc_only('TABLE', 'mon_url_hist');

-- 앱 지표 누적(브라우저 묶음 → 분 × 경로) — 동시 요청이 같은 행을 더해도 잃지 않게 한 문장 UPSERT
CREATE OR REPLACE FUNCTION fn_mon_app_add(p_rows JSONB)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO mon_app_hist (bkt_dtm, route_txt, req_cnt, err_cnt, slow_cnt, rsp_sum_val, rsp_max_val)
  SELECT r.bkt_dtm, r.route_txt, r.req_cnt, r.err_cnt, r.slow_cnt, r.rsp_sum_val, r.rsp_max_val
  FROM jsonb_to_recordset(p_rows) AS r(bkt_dtm TIMESTAMPTZ, route_txt VARCHAR(200), req_cnt INT, err_cnt INT, slow_cnt INT, rsp_sum_val BIGINT, rsp_max_val INT)
  ON CONFLICT ON CONSTRAINT pk_mon_app_hist DO UPDATE SET
    req_cnt = mon_app_hist.req_cnt + EXCLUDED.req_cnt,
    err_cnt = mon_app_hist.err_cnt + EXCLUDED.err_cnt,
    slow_cnt = mon_app_hist.slow_cnt + EXCLUDED.slow_cnt,
    rsp_sum_val = mon_app_hist.rsp_sum_val + EXCLUDED.rsp_sum_val,
    rsp_max_val = GREATEST(mon_app_hist.rsp_max_val, EXCLUDED.rsp_max_val);
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_mon_app_add(jsonb)');

COMMENT ON TABLE mon_app_hist IS '애플리케이션 모니터링 이력 — schema.pi API 분 × 경로 누적(브라우저 계측), 보관 7일';
COMMENT ON TABLE mon_srv_hist IS '서버 모니터링 이력 — 로컬 에이전트 호스트 CPU·메모리·디스크(1분 1행), 보관 7일';
COMMENT ON TABLE mon_db_hist IS '데이터베이스 모니터링 이력 — 등록 접속(PostgreSQL) 세션·트랜잭션·블록·락(1분 1행, 누적 카운터), 보관 7일';
COMMENT ON TABLE mon_url IS 'URL 모니터링 대상 — 분류체계별 점검 URL';
COMMENT ON TABLE mon_url_hist IS 'URL 모니터링 이력 — 상태번호·응답값(1분 1행), 보관 7일';
COMMENT ON INDEX x_mon_srv_hist_01 IS '분류체계 × 시간 조회(서버 목록·차트)';
COMMENT ON INDEX x_mon_db_hist_01 IS '분류체계 × 시간 조회';
COMMENT ON INDEX x_mon_url_01 IS '분류체계별 활성 URL';
COMMENT ON INDEX x_mon_url_hist_01 IS '분류체계 × 시간 조회(보관 기간 정리 포함)';

COMMIT;

NOTIFY pgrst, 'reload schema';
