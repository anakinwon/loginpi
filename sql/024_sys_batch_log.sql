-- DA-APPROVED: sys_batch_log 신규 생성 — 배치(CRON·온디맨드·백필) 실행 이력
-- Phase 11 보완: /api/admin/stats/aggregate 실행 결과를 기록해 어드민 화면에서 확인

CREATE TABLE IF NOT EXISTS public.sys_batch_log (
  batch_log_id  BIGSERIAL    PRIMARY KEY,
  job_nm        TEXT         NOT NULL,                            -- 작업명 (stats_aggregate)
  trigger_cd    VARCHAR(10)  NOT NULL,                            -- CRON | MANUAL | BACKFILL
  from_dt       DATE,                                             -- 집계 대상 시작일
  to_dt         DATE,                                             -- 집계 대상 종료일
  start_dtm     TIMESTAMPTZ  NOT NULL,                            -- 작업 시작 일시
  end_dtm       TIMESTAMPTZ  NOT NULL,                            -- 작업 종료 일시
  success_yn    CHAR(1)      NOT NULL DEFAULT 'N',                -- 전체 성공 여부
  total_cnt     INTEGER      NOT NULL DEFAULT 0,                  -- 처리(재계산) 일수
  failed_cnt    INTEGER      NOT NULL DEFAULT 0,                  -- 실패 일수
  result_msg    TEXT,                                             -- 실패 날짜·오류 메시지
  del_yn        CHAR(1)      NOT NULL DEFAULT 'N',
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.sys_batch_log              IS '배치 작업 실행 이력 — CRON·온디맨드·백필 결과 기록';
COMMENT ON COLUMN public.sys_batch_log.job_nm       IS '작업명 (stats_aggregate 등)';
COMMENT ON COLUMN public.sys_batch_log.trigger_cd   IS '실행 주체: CRON(Vercel Cron) | MANUAL(어드민 수동) | BACKFILL(기간 백필)';
COMMENT ON COLUMN public.sys_batch_log.result_msg   IS '실패 날짜 목록 또는 오류 메시지';
COMMENT ON COLUMN public.sys_batch_log.regr_id      IS 'CRON 실행 시 SYSTEM, 수동 실행 시 실행한 어드민 식별자';

-- 이력 조회는 항상 최신순 — 부분 인덱스로 논리삭제 행 제외
CREATE INDEX IF NOT EXISTS idx_sys_batch_log_start_dtm
  ON public.sys_batch_log (start_dtm DESC) WHERE del_yn = 'N';
