-- DA-APPROVED: 일별 거래 통계에 Pi 가치 컬럼 추가 — PI 모드 대시보드 Pi 표시 (PRD_24 §0, 2026-06-30)
--   기존 *_bean(Bean 집계)에 더해 *_pi(Pi 가치) 4종 추가. 차트가 활성 요금제 모드에 따라 선택 표시.
--   PI 모드 거래는 bean_amt=0·pi_amt=값(SUBSCR_PI·ROOM_CREATE_PI·STICKER_PACK_PI·FBCK_PI·TIP_PI 마커)이라
--   bean_amt 집계만으론 누락 → 통합 환산식으로 BEAN(bean_amt/100)·PI(pi_amt)를 모두 포함.
--   통합식: CASE WHEN bean_amt<>0 THEN bean_amt/100 ELSE COALESCE(pi_amt,0) END
--     · BEAN 거래: bean_amt/100 (충전처럼 pi_amt 동시 존재 시에도 bean_amt<>0이라 1:100 중복 없음)
--     · PI 마커 거래: bean_amt=0 → pi_amt
--   소비(spend)는 bean_amt가 음수라 -부호로 양수화(기존 spend_bean 부호 규약과 일치).

-- RETURNS TABLE 시그니처 변경(컬럼 추가) → DROP 후 재생성 필요. 의존=route rpc 호출뿐(안전).
DROP FUNCTION IF EXISTS public.fn_bean_daily_stats();

CREATE OR REPLACE FUNCTION public.fn_bean_daily_stats()
 RETURNS TABLE(
   stat_dt date,
   charge_bean bigint, spend_bean bigint, reward_bean bigint, refund_bean bigint, txn_cnt bigint,
   charge_pi numeric, spend_pi numeric, reward_pi numeric, refund_pi numeric
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH series AS (
    SELECT gs::date AS stat_dt
    FROM generate_series(
      (now() AT TIME ZONE 'Asia/Seoul')::date - 29,
      (now() AT TIME ZONE 'Asia/Seoul')::date,
      INTERVAL '1 day'
    ) gs
  ),
  agg AS (
    SELECT
      (reg_dtm AT TIME ZONE 'Asia/Seoul')::date                                   AS d,
      SUM(bean_amt)  FILTER (WHERE txn_tp_cd = 'CHARGE')                           AS charge_bean,
      -SUM(bean_amt) FILTER (WHERE txn_tp_cd IN ('SPEND','SUBSCRIBE','TIP','FEE')) AS spend_bean,
      SUM(bean_amt)  FILTER (WHERE txn_tp_cd = 'REWARD')                           AS reward_bean,
      SUM(bean_amt)  FILTER (WHERE txn_tp_cd = 'REFUND')                           AS refund_bean,
      COUNT(*)                                                                     AS txn_cnt,
      -- Pi 가치 (PI 거래 pi_amt 포함). 충전·보상·환불은 +, 소비는 부호 반전(-)으로 양수화.
      SUM(CASE WHEN bean_amt <> 0 THEN bean_amt/100.0 ELSE COALESCE(pi_amt,0) END)
        FILTER (WHERE txn_tp_cd = 'CHARGE')                                        AS charge_pi,
      SUM(CASE WHEN bean_amt <> 0 THEN -bean_amt/100.0 ELSE COALESCE(pi_amt,0) END)
        FILTER (WHERE txn_tp_cd IN ('SPEND','SUBSCRIBE','TIP','FEE'))              AS spend_pi,
      SUM(CASE WHEN bean_amt <> 0 THEN bean_amt/100.0 ELSE COALESCE(pi_amt,0) END)
        FILTER (WHERE txn_tp_cd = 'REWARD')                                        AS reward_pi,
      SUM(CASE WHEN bean_amt <> 0 THEN bean_amt/100.0 ELSE COALESCE(pi_amt,0) END)
        FILTER (WHERE txn_tp_cd = 'REFUND')                                        AS refund_pi
    FROM public.bean_txn
    WHERE del_yn = 'N'
      AND reg_dtm >= now() - INTERVAL '31 days'
    GROUP BY 1
  )
  SELECT
    s.stat_dt,
    COALESCE(a.charge_bean, 0)::bigint,
    COALESCE(a.spend_bean,  0)::bigint,
    COALESCE(a.reward_bean, 0)::bigint,
    COALESCE(a.refund_bean, 0)::bigint,
    COALESCE(a.txn_cnt,     0)::bigint,
    ROUND(COALESCE(a.charge_pi, 0), 4)::numeric,
    ROUND(COALESCE(a.spend_pi,  0), 4)::numeric,
    ROUND(COALESCE(a.reward_pi, 0), 4)::numeric,
    ROUND(COALESCE(a.refund_pi, 0), 4)::numeric
  FROM series s
  LEFT JOIN agg a ON a.d = s.stat_dt
  ORDER BY s.stat_dt;
$function$;

-- ── fn_bean_txn_distribution: 거래 유형별 분포에 Pi 가치(gross_pi/net_pi) 추가 ──────
--   동일 통합식으로 PI 거래(bean_amt=0·pi_amt=값)까지 포함. jsonb 반환이라 시그니처 불변(REPLACE).
CREATE OR REPLACE FUNCTION public.fn_bean_txn_distribution(p_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH base AS (
    SELECT
      txn_tp_cd,
      bean_amt,
      CASE WHEN bean_amt <> 0 THEN bean_amt/100.0 ELSE COALESCE(pi_amt,0) END AS pi_value,
      usr_id
    FROM public.bean_txn
    WHERE del_yn = 'N'
      AND (
        p_days IS NULL
        OR reg_dtm >= CURRENT_TIMESTAMP - make_interval(days => p_days)
      )
  )
  SELECT jsonb_build_object(
    'by_type', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          txn_tp_cd,
          COUNT(*)                        AS txn_cnt,
          SUM(ABS(bean_amt))              AS gross_bean,
          SUM(bean_amt)                   AS net_bean,
          ROUND(SUM(ABS(pi_value)), 4)    AS gross_pi,
          ROUND(SUM(pi_value), 4)         AS net_pi,
          COUNT(DISTINCT usr_id)          AS usr_cnt
        FROM base
        GROUP BY txn_tp_cd
        ORDER BY SUM(ABS(bean_amt)) DESC
      ) t
    ), '[]'::jsonb),
    'total_cnt', COALESCE((SELECT COUNT(*) FROM base), 0),
    'total_gross_bean', COALESCE((SELECT SUM(ABS(bean_amt)) FROM base), 0),
    'total_gross_pi', COALESCE((SELECT ROUND(SUM(ABS(pi_value)), 4) FROM base), 0),
    'period_days', p_days
  );
$function$;
