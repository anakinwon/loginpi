-- Pi Tip → Pi Bean 리브랜딩: 매출 통계 라벨·기존 결제 memo 데이터 변경
-- DA-APPROVED: 표시 라벨만 변경 — theme_cd 'PI_TIP' 식별자는 호환성 위해 유지. (2026-06-12)
-- src/lib/stats-labels.ts THEME_LABEL과 반드시 동기화 유지

-- [수리] pi_pymnt 구버전 트리거 — 003 리네임 이후 updated_at(미존재) 참조로 모든 UPDATE 실패
-- 시스템 컬럼 표준(mod_dtm) 갱신으로 교체
CREATE OR REPLACE FUNCTION public.update_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mod_dtm = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_top_revenue_themes(
  p_from  DATE,
  p_to    DATE DEFAULT CURRENT_DATE,
  p_limit INT  DEFAULT 3
)
RETURNS TABLE(
  theme_cd    VARCHAR,
  theme_nm    VARCHAR,
  theme_emoji VARCHAR,
  total_pi    DECIMAL,
  total_txn   BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.theme_cd,
    COALESCE(
      t.theme_nm,
      CASE r.theme_cd
        WHEN 'SUBSCRIPTION'  THEN '구독'
        WHEN 'PI_TIP'        THEN '빈(Bean)'
        WHEN 'DIRECT_PAY'    THEN '직접 전송'
        WHEN 'PRODUCT_ORDER' THEN '상품 구매'
        WHEN 'UNKNOWN'       THEN '기타'
        ELSE r.theme_cd
      END
    )::VARCHAR                             AS theme_nm,
    COALESCE(
      t.theme_emoji,
      CASE r.theme_cd
        WHEN 'SUBSCRIPTION'  THEN '💳'
        WHEN 'PI_TIP'        THEN '🫘'
        WHEN 'DIRECT_PAY'    THEN '📤'
        WHEN 'PRODUCT_ORDER' THEN '🛒'
        WHEN 'UNKNOWN'       THEN '❓'
        ELSE NULL
      END
    )::VARCHAR                             AS theme_emoji,
    SUM(r.rev_pi)::DECIMAL(12,4)           AS total_pi,
    SUM(r.txn_cnt)::BIGINT                 AS total_txn
  FROM public.stat_revenue_dly r
  LEFT JOIN public.msg_theme t ON t.theme_cd = r.theme_cd
  WHERE r.stat_dt BETWEEN p_from AND p_to
  GROUP BY r.theme_cd, t.theme_nm, t.theme_emoji
  ORDER BY total_pi DESC
  LIMIT p_limit;
$$;

COMMENT ON COLUMN public.stat_revenue_dly.theme_cd IS
  'msg_theme.theme_cd 또는 시스템 분류 코드: SUBSCRIPTION(구독) · PI_TIP(빈/Bean) · DIRECT_PAY(직접 전송) · PRODUCT_ORDER(상품 구매) · UNKNOWN(기타)';

-- 기존 결제 memo의 Tip 표기 일괄 변경 (관리자 결제내역·통계 표시용 텍스트)
UPDATE public.pi_pymnt
SET memo = replace(replace(memo, '💰', '🫘'), 'Pi Tip', 'Pi Bean'),
    modr_id = 'ADMIN',
    mod_dtm = CURRENT_TIMESTAMP
WHERE memo LIKE '%Pi Tip%';
