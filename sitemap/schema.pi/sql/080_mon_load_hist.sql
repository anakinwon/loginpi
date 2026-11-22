-- 080_mon_load_hist.sql : DBMS 초기 데이터 적재 진행 스냅숏(마스터 지시 2026-11-22 "진행상황 데이터를 DB화 하여 추가 배포없이 바로 확인할 수 있도록 데이터연동 페이지를 만들어줘, 그리고, 작업 5분단위로 데이터를 업데이트")
-- DA-APPROVED: 2026-11-22 da-governance-expert — 신규 1테이블 mon_load_hist(mon_ 접두, 시스템 컬럼 4개 맨 끝, del_yn·del_dtm 논리삭제, service_role 전용, mod_dtm 트리거), 행안부 공통표준 LOAD(적재)·MSRMT(측정)·FAIL(실패)·ELPS(경과)·CMPTN(완료)·GOAL(목표)·CRTR(기준)·STNG(설정)·END·UNIT·DTL, 신규 등재 REDO(DBMS 고유 용어, 068 CPU·DISK 선례), 실행 = EXEC(038 선례), 경과는 밀리초 _val(073 선례)·크기는 바이트 _sz(068 선례), TOT(전체)·ROW(행) = 068·045 선례. 조건부 지적 P2 7건(run·msr·sec·tgt·cmpl·bas·cfg) 반영
--  한 행 = (실행ID, 측정일시) 1회 측정. 쓰기 = 로컬 갱신기 pitel/bench/progress-push.mjs(5분 주기, service_role REST upsert) / 읽기 = 공개 API /api/mon/load → public/restore/dbms_load_live.html
--  크기는 바이트(…_sz), 경과는 밀리초(elps_val), 상세(dtl_val) = 주제영역별 완료 행·목표 행·크기, 대기 이벤트별 활성 세션 수. FK 없음(RI 물리 미구현 결정)
--  약어 : 행안부 공통표준 LOAD(적재)·MSRMT(측정)·FAIL(실패)·ELPS(경과)·CMPTN(완료)·GOAL(목표)·CRTR(기준)·STNG(설정)·END(종료)·UNIT(단위)·DTL(상세), 신규 REDO, 선례 MON·EXEC(실행)·TOT(전체)·ROW(행)
BEGIN;

CREATE TABLE IF NOT EXISTS mon_load_hist (
  exec_id             VARCHAR(100)  NOT NULL,                              -- 실행ID(예 ora_append_nolog_20261122)
  msrmt_dtm           TIMESTAMPTZ   NOT NULL,                              -- 측정일시
  dbms_nm             VARCHAR(50)   NOT NULL,                              -- DBMS명
  elps_val            BIGINT        NOT NULL DEFAULT 0,                    -- 경과값(밀리초, 적재 시작 ~ 측정)
  goal_row_cnt        BIGINT        NOT NULL DEFAULT 0,                    -- 목표행건수
  cmptn_row_cnt       BIGINT        NOT NULL DEFAULT 0,                    -- 완료행건수
  tot_unit_cnt        INT           NOT NULL DEFAULT 0,                    -- 전체단위건수
  cmptn_unit_cnt      INT           NOT NULL DEFAULT 0,                    -- 완료단위건수
  fail_cnt            INT           NOT NULL DEFAULT 0,                    -- 실패건수
  load_sz             BIGINT,                                              -- 적재크기(바이트, 세그먼트 합 + LOB)
  redo_sz             BIGINT,                                              -- redo크기(바이트, 시작 전 기준 대비 증가분)
  crtr_cmptn_row_cnt  BIGINT,                                              -- 기준완료행건수(기준 실행의 같은 경과 시점)
  end_yn              CHAR(1)       NOT NULL DEFAULT 'N',                  -- 종료여부(적재 끝 표시 또는 프로세스 없음)
  dtl_val             JSONB         NOT NULL DEFAULT '{}'::jsonb,          -- 상세값(주제영역별 완료 행·대기 이벤트별 세션 수)
  stng_txt            TEXT,                                                -- 설정텍스트(적재 로그 설정 줄)
  del_yn              CHAR(1)       NOT NULL DEFAULT 'N',                  -- 삭제여부
  del_dtm             TIMESTAMPTZ,                                         -- 삭제일시
  regr_id             TEXT          NOT NULL DEFAULT 'ADMIN',              -- 등록자ID
  reg_dtm             TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 등록일시
  modr_id             TEXT          NOT NULL DEFAULT 'ADMIN',              -- 변경자ID
  mod_dtm             TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 변경일시
  CONSTRAINT pk_mon_load_hist PRIMARY KEY (exec_id, msrmt_dtm),
  CONSTRAINT mon_load_hist_end_yn_check CHECK (end_yn IN ('Y', 'N')),
  CONSTRAINT mon_load_hist_del_yn_check CHECK (del_yn IN ('Y', 'N')),
  CONSTRAINT mon_load_hist_cnt_check CHECK (cmptn_row_cnt >= 0 AND goal_row_cnt >= 0 AND cmptn_unit_cnt >= 0 AND tot_unit_cnt >= 0 AND fail_cnt >= 0 AND elps_val >= 0 AND (load_sz IS NULL OR load_sz >= 0) AND (redo_sz IS NULL OR redo_sz >= 0))
);

SELECT fn_add_mod_dtm_trg('mon_load_hist');
SELECT fn_grant_svc_only('TABLE', 'mon_load_hist');

COMMENT ON TABLE mon_load_hist IS 'DBMS 적재 진행 스냅숏 — (실행ID, 측정일시) 1회 측정 1행, 로컬 갱신기 5분 주기 upsert, 공개 현황판 조회';
COMMENT ON COLUMN mon_load_hist.exec_id IS '실행ID';
COMMENT ON COLUMN mon_load_hist.msrmt_dtm IS '측정일시';
COMMENT ON COLUMN mon_load_hist.dbms_nm IS 'DBMS명';
COMMENT ON COLUMN mon_load_hist.elps_val IS '경과값(밀리초, 적재 시작 ~ 측정)';
COMMENT ON COLUMN mon_load_hist.goal_row_cnt IS '목표행건수';
COMMENT ON COLUMN mon_load_hist.cmptn_row_cnt IS '완료행건수';
COMMENT ON COLUMN mon_load_hist.tot_unit_cnt IS '전체단위건수';
COMMENT ON COLUMN mon_load_hist.cmptn_unit_cnt IS '완료단위건수';
COMMENT ON COLUMN mon_load_hist.fail_cnt IS '실패건수';
COMMENT ON COLUMN mon_load_hist.load_sz IS '적재크기(바이트, 세그먼트 합 + LOB)';
COMMENT ON COLUMN mon_load_hist.redo_sz IS 'redo크기(바이트, 시작 전 기준 대비 증가분)';
COMMENT ON COLUMN mon_load_hist.crtr_cmptn_row_cnt IS '기준완료행건수(기준 실행의 같은 경과 시점)';
COMMENT ON COLUMN mon_load_hist.end_yn IS '종료여부';
COMMENT ON COLUMN mon_load_hist.dtl_val IS '상세값(주제영역별 완료 행·목표 행·크기, 대기 이벤트별 활성 세션 수)';
COMMENT ON COLUMN mon_load_hist.stng_txt IS '설정텍스트(적재 로그 설정 줄)';
COMMENT ON COLUMN mon_load_hist.del_yn IS '삭제여부';
COMMENT ON COLUMN mon_load_hist.del_dtm IS '삭제일시';
COMMENT ON COLUMN mon_load_hist.regr_id IS '등록자ID';
COMMENT ON COLUMN mon_load_hist.reg_dtm IS '등록일시';
COMMENT ON COLUMN mon_load_hist.modr_id IS '변경자ID';
COMMENT ON COLUMN mon_load_hist.mod_dtm IS '변경일시';

COMMIT;

NOTIFY pgrst, 'reload schema';
