-- DA-APPROVED: 로그성 테이블 기간 기준 물리 DELETE — PURGEABLE 화이트리스트+최소 보존일(7일) 이중 가드, 회계 원장·감사 로그(bean_txn·mps_txn_hist·pi_pymnt·bean_audit_log)는 READONLY 원천 배제. 디스크 공간 회수 목적의 순수 운영/텔레메트리 로그 한정 (2026-06-23)
-- =============================================================================
-- 104: 로그성 테이블 모니터·정리(purge) 인프라 — 어드민 "로그 관리" 화면 백엔드
-- =============================================================================
-- 배경: 이 앱은 Vercel 서버리스 배포라 운영서버에 로그 '파일'이 쌓이지 않는다.
--       실제로 용량이 비대해지는 것은 DB의 append-only 로그성 테이블이다.
--       → 행수·용량을 모니터링하고, 순수 운영 로그만 기간 기준으로 물리 정리한다.
--
-- 물리 DELETE 예외 근거(프로젝트 원칙 "물리 DELETE 절대 금지"의 정당한 예외):
--   "물리삭제 금지"는 비즈니스 엔티티(회원·결제·원장) 대상이다. 본 함수의 DELETE는
--   (1) 디스크 공간 회수가 목적인 순수 운영/텔레메트리 로그에 한정하고,
--   (2) fn_log_catalog()의 PURGEABLE 화이트리스트 + 최소 보존일 가드로 이중 보호하며,
--   (3) 회계 원장(bean_txn·mps_txn_hist·pi_pymnt)·감사 로그(bean_audit_log)는 READONLY로
--       원천 배제해 어떤 입력으로도 삭제 대상이 될 수 없다.
-- =============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) fn_log_catalog — 로그성 테이블 단일 출처 카탈로그
--    통계(fn_log_table_stats)와 정리(fn_log_table_purge)가 공통 참조한다.
--    category: PURGEABLE(기간 정리 허용) | READONLY(조회 전용, 삭제 불가)
--    ts_col  : 정리·기간 산정 기준 시각 컬럼(테이블마다 다름)
--    def_days: 화면 기본 보존일(권장값) — READONLY는 NULL
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_catalog()
RETURNS TABLE(tbl text, ts_col text, category text, label text, def_days int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    -- 정리 가능 — 순수 운영/텔레메트리 로그
    ('msg_call_quality_stat', 'reg_dtm', 'PURGEABLE', '통화 품질 텔레메트리(RTT·패킷손실)',        90),
    ('msg_call_log',          'reg_dtm', 'PURGEABLE', '통화 이력',                                  180),
    ('std_audit_log',         'chg_dtm', 'PURGEABLE', '표준사전 변경 감사 로그',                     365),
    ('usr_loc_hist',          'reg_dtm', 'PURGEABLE', '사용자 위치 이력(개인정보 최소보존)',          180),
    ('sys_user_actvty_log',   'reg_dtm', 'PURGEABLE', '사용자 활동 로그(DAU/WAU/MAU 집계 원천)',      400),
    -- 조회 전용 — 회계 원장·감사 로그(삭제 금지)
    ('bean_txn',              'reg_dtm', 'READONLY',  'Bean 거래 원장(진실의 원천)',                 NULL),
    ('mps_txn_hist',          'txn_dtm', 'READONLY',  'MPS 거래 이력(정산·환불)',                    NULL),
    ('pi_pymnt',              'reg_dtm', 'READONLY',  'Pi 결제 내역',                                NULL),
    ('bean_audit_log',        'reg_dtm', 'READONLY',  'Bean 수동조정 감사(보존 의무)',               NULL)
  ) AS t(tbl, ts_col, category, label, def_days);
$$;

COMMENT ON FUNCTION public.fn_log_catalog() IS '로그성 테이블 카탈로그(단일 출처) — 통계·정리 함수 공통 참조';

-- ──────────────────────────────────────────────────────────────────────────
-- 2) fn_log_table_stats — 카탈로그 각 테이블의 행수·용량·기간 통계
--    없는 테이블은 exists_yn=false로 건너뛴다(환경별 일부 미생성 안전 대응).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_table_stats()
RETURNS TABLE(
  tbl text, label text, category text, ts_col text, def_days int,
  row_cnt bigint, total_bytes bigint, size_pretty text,
  oldest_dtm timestamptz, newest_dtm timestamptz, exists_yn boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  r        record;
  v_reg    regclass;
  v_cnt    bigint;
  v_oldest timestamptz;
  v_newest timestamptz;
BEGIN
  FOR r IN SELECT * FROM public.fn_log_catalog() LOOP
    v_reg := to_regclass('public.' || r.tbl);

    tbl := r.tbl; label := r.label; category := r.category;
    ts_col := r.ts_col; def_days := r.def_days;

    IF v_reg IS NULL THEN
      row_cnt := NULL; total_bytes := NULL; size_pretty := NULL;
      oldest_dtm := NULL; newest_dtm := NULL; exists_yn := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*), min(%I), max(%I) FROM public.%I',
      r.ts_col, r.ts_col, r.tbl
    ) INTO v_cnt, v_oldest, v_newest;

    row_cnt := v_cnt;
    total_bytes := pg_total_relation_size(v_reg);
    size_pretty := pg_size_pretty(pg_total_relation_size(v_reg));
    oldest_dtm := v_oldest; newest_dtm := v_newest; exists_yn := true;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_log_table_stats() IS '로그성 테이블 행수·용량·기간 통계 — 어드민 로그 모니터 화면';

-- ──────────────────────────────────────────────────────────────────────────
-- 3) fn_log_table_purge — 기간 기준 물리 정리(PURGEABLE 전용)
--    이중 안전장치: ① PURGEABLE 화이트리스트 검증  ② 최소 보존일(7일) 가드
--    반환: 삭제된 행 수
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_table_purge(
  p_tbl   text,
  p_days  int,
  p_actor text DEFAULT 'ADMIN'
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cat     record;
  v_reg     regclass;
  v_deleted bigint;
BEGIN
  -- ① 화이트리스트 검증 — PURGEABLE 카탈로그에 등재된 테이블만 허용
  SELECT * INTO v_cat
  FROM public.fn_log_catalog()
  WHERE tbl = p_tbl AND category = 'PURGEABLE';

  IF NOT FOUND THEN
    RAISE EXCEPTION '정리 대상이 아닌 테이블입니다(회계·감사 로그는 삭제 불가): %', p_tbl
      USING ERRCODE = '42501';
  END IF;

  -- ② 최소 보존일 가드 — 7일 미만은 거부(실수로 전체 삭제 방지)
  IF p_days IS NULL OR p_days < 7 THEN
    RAISE EXCEPTION '보존일은 최소 7일 이상이어야 합니다(요청: %)', p_days
      USING ERRCODE = '22023';
  END IF;

  v_reg := to_regclass('public.' || p_tbl);
  IF v_reg IS NULL THEN
    RAISE EXCEPTION '존재하지 않는 테이블: %', p_tbl;
  END IF;

  -- 기준 시각 컬럼이 보존일보다 오래된 행을 물리 삭제
  EXECUTE format(
    'DELETE FROM public.%I WHERE %I < now() - ($1 || '' days'')::interval',
    p_tbl, v_cat.ts_col
  ) USING p_days;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'log purge: % rows deleted from % (>% days) by %', v_deleted, p_tbl, p_days, p_actor;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.fn_log_table_purge(text, int, text) IS '로그성 테이블 기간 기준 물리 정리(PURGEABLE 화이트리스트 전용) — DA-APPROVED 예외';

COMMIT;
