-- DA-APPROVED: 실시간 시스템 모니터링(PRD_22_MONITOR) — sys_ 도메인 접두사 적용. 기술 메트릭 컬럼명(endpoint·resp_time_ms·ip_addr 등)은 관용 영어 유지가 명확해 DA 승인 (2026-06-25)
-- 계측 테이블은 비블로킹 fire-and-forget 기록용(후속). RPC는 기존 데이터(pi_pymnt·mps_order) 기반 즉시 동작.
-- ⚠️ pi_pymnt.status는 소문자 'approved'/'completed'(실측), completed_at 없음→mod_dtm 사용. mps_order는 order_st_cd.
-- DA 표준: 시스템 컬럼 4개(DEFAULT 'ADMIN') + 논리삭제(del_yn/del_dtm).

-- 1. sys_metric_req_perf — API 응답 성능 (1차 계측)
CREATE TABLE IF NOT EXISTS public.sys_metric_req_perf (
  metric_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     TEXT        NOT NULL,
  http_mthd    VARCHAR(8)  NOT NULL,
  status_code  SMALLINT    NOT NULL,
  resp_time_ms INTEGER     NOT NULL,
  usr_id       UUID,
  ip_addr      INET,
  del_yn       CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sys_metric_perf_ep_time ON public.sys_metric_req_perf(endpoint, reg_dtm DESC) WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_sys_metric_perf_status_time ON public.sys_metric_req_perf(status_code, reg_dtm DESC) WHERE del_yn='N';

-- 2. sys_metric_req_ip — IP별 1분 집계 (DDoS 탐지)
CREATE TABLE IF NOT EXISTS public.sys_metric_req_ip (
  metric_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_addr       INET        NOT NULL,
  metric_minute TIMESTAMPTZ NOT NULL,
  req_cnt       INTEGER     NOT NULL DEFAULT 0,
  suspicious_yn CHAR(1)     NOT NULL DEFAULT 'N' CHECK (suspicious_yn IN ('Y','N')),
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_metric_ip ON public.sys_metric_req_ip(ip_addr, metric_minute) WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_sys_metric_ip_flag ON public.sys_metric_req_ip(suspicious_yn, metric_minute DESC) WHERE del_yn='N';

-- 3. sys_metric_auth — 인증 시도 (로그인 성공/실패)
CREATE TABLE IF NOT EXISTS public.sys_metric_auth (
  metric_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id      UUID,
  auth_tp_cd  VARCHAR(16) NOT NULL,
  success_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (success_yn IN ('Y','N')),
  fail_reason TEXT,
  ip_addr     INET,
  del_yn      CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sys_metric_auth_success_time ON public.sys_metric_auth(success_yn, reg_dtm DESC) WHERE del_yn='N';

-- 4. sys_metric_conn — 동시 접속 스냅샷 (1분 단위)
CREATE TABLE IF NOT EXISTS public.sys_metric_conn (
  metric_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id        UUID        NOT NULL,
  actn_cd       VARCHAR(16) NOT NULL,
  metric_minute TIMESTAMPTZ NOT NULL,
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sys_metric_conn_time ON public.sys_metric_conn(metric_minute DESC) WHERE del_yn='N';

COMMENT ON TABLE public.sys_metric_req_perf IS '모니터링 — API 응답 성능 계측(비블로킹)';
COMMENT ON TABLE public.sys_metric_req_ip   IS '모니터링 — IP별 1분 집계(DDoS 탐지)';
COMMENT ON TABLE public.sys_metric_auth     IS '모니터링 — 인증 시도 기록';
COMMENT ON TABLE public.sys_metric_conn     IS '모니터링 — 동시 접속 스냅샷';

-- RPC 1: fn_pi_payment_status — Pi 결제 상태(실측: status 'approved'/'completed', completed_at 없음→mod_dtm)
CREATE OR REPLACE FUNCTION public.fn_pi_payment_status()
RETURNS TABLE(completed_cnt INT, pending_cnt INT, stuck_cnt INT, success_rate NUMERIC, avg_dur_sec NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed')::INT,
    COUNT(*) FILTER (WHERE status = 'approved')::INT,
    COUNT(*) FILTER (WHERE status = 'approved' AND reg_dtm < NOW() - INTERVAL '5 min')::INT,
    CASE WHEN COUNT(*) FILTER (WHERE status IN ('approved','completed')) > 0
      THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*) FILTER (WHERE status IN ('approved','completed')), 1)
      ELSE 100 END,
    COALESCE(CEIL(AVG(EXTRACT(EPOCH FROM (mod_dtm - reg_dtm))) FILTER (WHERE status = 'completed')), 0)::NUMERIC
  FROM public.pi_pymnt
  WHERE reg_dtm > NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- RPC 2: fn_monitor_active_orders — MPS 주문 상태(실측: ORDERED/PENDING/DONE/BUYER_DONE/SELLER_DONE/CANCELLED)
CREATE OR REPLACE FUNCTION public.fn_monitor_active_orders()
RETURNS TABLE(waiting_cnt INT, processing_cnt INT, done_1h_cnt INT, cancelled_cnt INT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE order_st_cd IN ('ORDERED','PENDING'))::INT,
    COUNT(*) FILTER (WHERE order_st_cd IN ('SELLER_DONE','BUYER_DONE'))::INT,
    COUNT(*) FILTER (WHERE order_st_cd = 'DONE' AND mod_dtm > NOW() - INTERVAL '1 hour')::INT,
    COUNT(*) FILTER (WHERE order_st_cd = 'CANCELLED' AND mod_dtm > NOW() - INTERVAL '24 hours')::INT
  FROM public.mps_order WHERE del_yn = 'N';
END;
$$ LANGUAGE plpgsql;
