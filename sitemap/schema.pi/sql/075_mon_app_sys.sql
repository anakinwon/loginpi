-- 075_mon_app_sys.sql : 애플리케이션 모니터링 다중 시스템(마스터 지시 2026-10-24 "현재의 모니터링 화면을 확장해서, cafe.pi와 sitemap.pi를 선택해서 모니터링")
--  mon_app_hist·mon_app_evt_hist 에 시스템코드(SCHEMA·CAFE·SITEMAP, 기존 행 = SCHEMA) — 다른 시스템 표본은 그 앱 서버가 비밀키로 /api/mon/ingest 에 전달
-- DA-APPROVED: 마스터 지시 2026-10-24 — 칼럼 1개 sys_cd(시스템코드, fn_add_cols_keep_sys 로 시스템 컬럼 맨 끝 유지) + PK 를 (sys_cd, bkt_dtm, route_txt) 로 재정의(이름 pk_mon_app_hist 유지) + 인덱스 x_mon_app_evt_hist_02, 기존 행 값 변경 없음(기본값 SCHEMA)
BEGIN;

SELECT fn_add_cols_keep_sys('mon_app_hist', $c$
  ADD COLUMN sys_cd VARCHAR(20) NOT NULL DEFAULT 'SCHEMA' CONSTRAINT mon_app_hist_sys_cd_check CHECK (sys_cd IN ('SCHEMA', 'CAFE', 'SITEMAP'))$c$);
SELECT fn_add_cols_keep_sys('mon_app_evt_hist', $c$
  ADD COLUMN sys_cd VARCHAR(20) NOT NULL DEFAULT 'SCHEMA' CONSTRAINT mon_app_evt_hist_sys_cd_check CHECK (sys_cd IN ('SCHEMA', 'CAFE', 'SITEMAP'))$c$);

-- 같은 분·같은 경로라도 시스템이 다르면 다른 행
ALTER TABLE mon_app_hist DROP CONSTRAINT pk_mon_app_hist;
ALTER TABLE mon_app_hist ADD CONSTRAINT pk_mon_app_hist PRIMARY KEY (sys_cd, bkt_dtm, route_txt);
CREATE INDEX IF NOT EXISTS x_mon_app_evt_hist_02 ON mon_app_evt_hist (sys_cd, occr_dtm);

-- 앱 지표 누적 — 행에 sys_cd 가 없으면 SCHEMA(기존 호출 호환)
CREATE OR REPLACE FUNCTION fn_mon_app_add(p_rows JSONB)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO mon_app_hist (sys_cd, bkt_dtm, route_txt, req_cnt, err_cnt, slow_cnt, rsp_sum_val, rsp_max_val)
  SELECT COALESCE(r.sys_cd, 'SCHEMA'), r.bkt_dtm, r.route_txt, r.req_cnt, r.err_cnt, r.slow_cnt, r.rsp_sum_val, r.rsp_max_val
  FROM jsonb_to_recordset(p_rows) AS r(sys_cd VARCHAR(20), bkt_dtm TIMESTAMPTZ, route_txt VARCHAR(200), req_cnt INT, err_cnt INT, slow_cnt INT, rsp_sum_val BIGINT, rsp_max_val INT)
  ON CONFLICT ON CONSTRAINT pk_mon_app_hist DO UPDATE SET
    req_cnt = mon_app_hist.req_cnt + EXCLUDED.req_cnt,
    err_cnt = mon_app_hist.err_cnt + EXCLUDED.err_cnt,
    slow_cnt = mon_app_hist.slow_cnt + EXCLUDED.slow_cnt,
    rsp_sum_val = mon_app_hist.rsp_sum_val + EXCLUDED.rsp_sum_val,
    rsp_max_val = GREATEST(mon_app_hist.rsp_max_val, EXCLUDED.rsp_max_val);
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_mon_app_add(jsonb)');

COMMENT ON TABLE mon_app_hist IS '애플리케이션 모니터링 이력 — 시스템(schema.pi·cafe.pi·sitemap.pi) API 분 × 경로 누적(브라우저 계측), 보관 7일';
COMMENT ON COLUMN mon_app_hist.sys_cd IS '시스템코드 : SCHEMA schema.pi · CAFE cafe.pi · SITEMAP sitemap.pi';
COMMENT ON COLUMN mon_app_evt_hist.sys_cd IS '시스템코드 : SCHEMA schema.pi · CAFE cafe.pi · SITEMAP sitemap.pi (다른 시스템은 usr_id 없음 — 사용자 체계가 다름)';
COMMENT ON INDEX x_mon_app_evt_hist_02 IS '시스템 × 시간 조회(화면 시스템 선택)';

COMMIT;

NOTIFY pgrst, 'reload schema';
