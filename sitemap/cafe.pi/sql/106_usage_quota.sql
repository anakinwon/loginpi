-- =============================================================================
-- 106: 인프라 사용량 할당(quota) 모니터 — 어드민 "로그 관리" 화면 도넛 그래프 백엔드
-- =============================================================================
-- 배경: Vercel 사용량(대역폭·함수 실행·이미지 등)은 API 토큰 없이는 코드로 조회 불가.
--       → 운영자가 Vercel 대시보드 수치를 수동 입력(한도·사용량)하면 도넛으로 시각화한다.
--       단, Supabase DB 용량은 pg_database_size()로 사용량을 자동 측정(한도만 수동).
--
-- ⚠️ Supabase 적용은 마스터가 수행(SQL은 git, 적용은 수동). 적용 후 /admin/logs 도넛 확인.
-- =============================================================================

BEGIN;

-- ── 1) sys_usage_quota — 리소스별 할당/사용량(수동 설정 + DB 자동) ──
CREATE TABLE IF NOT EXISTS public.sys_usage_quota (
  quota_id    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_cd VARCHAR(20)   NOT NULL UNIQUE,                 -- BANDWIDTH·FUNCTION·IMAGE_ETC·SUPABASE_DB
  resource_nm TEXT          NOT NULL,                        -- 표시명
  limit_amt   NUMERIC(18,3) NOT NULL DEFAULT 0,              -- 플랜 한도(임계치)
  used_amt    NUMERIC(18,3) NOT NULL DEFAULT 0,              -- 현재 사용량(수동; auto_yn='Y'는 조회 시 자동 덮어씀)
  unit_nm     VARCHAR(10)   NOT NULL DEFAULT 'GB',           -- 표시 단위
  auto_yn     CHAR(1)       NOT NULL DEFAULT 'N' CHECK (auto_yn IN ('Y','N')), -- Y=사용량 자동측정
  sort_ord    INT           NOT NULL DEFAULT 0,
  del_yn      CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm     TIMESTAMPTZ,
  regr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.sys_usage_quota             IS '인프라 사용량 할당 모니터 — Vercel(수동)·Supabase DB(자동) 한도 대비 사용량';
COMMENT ON COLUMN public.sys_usage_quota.auto_yn     IS 'Y=사용량 자동측정(SUPABASE_DB=pg_database_size)';

-- ── 2) 기본 시드 (Pro 플랜 예시 한도 — 운영자가 화면에서 조정) ──
INSERT INTO public.sys_usage_quota (resource_cd, resource_nm, limit_amt, used_amt, unit_nm, auto_yn, sort_ord) VALUES
  ('BANDWIDTH',   '대역폭 (Fast Data Transfer)', 1000, 0, 'GB',     'N', 10),
  ('FUNCTION',    '함수 실행 (Active CPU)',       1000, 0, 'CPU-Hr', 'N', 20),
  ('IMAGE_ETC',   '이미지 최적화·기타',            5,    0, 'K건',    'N', 30),
  ('SUPABASE_DB', 'Supabase DB 용량',             8,    0, 'GB',     'Y', 40)
ON CONFLICT (resource_cd) DO NOTHING;

-- ── 3) fn_usage_quota — 활성 할당 조회(자동 리소스는 사용량 실시간 측정) ──
CREATE OR REPLACE FUNCTION public.fn_usage_quota()
RETURNS TABLE(
  resource_cd text, resource_nm text, limit_amt numeric,
  used_amt numeric, unit_nm text, auto_yn text, sort_ord int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.resource_cd::text,
    q.resource_nm,
    q.limit_amt,
    CASE
      WHEN q.auto_yn = 'Y' AND q.resource_cd = 'SUPABASE_DB'
        THEN ROUND(pg_database_size(current_database())::numeric / (1024 * 1024 * 1024), 3)
      ELSE q.used_amt
    END AS used_amt,
    q.unit_nm::text,
    q.auto_yn::text,
    q.sort_ord
  FROM public.sys_usage_quota q
  WHERE q.del_yn = 'N'
  ORDER BY q.sort_ord;
END;
$$;

COMMENT ON FUNCTION public.fn_usage_quota() IS '인프라 사용량 할당 조회 — auto_yn=Y는 pg_database_size로 사용량 자동 측정';

-- ── 4) fn_usage_quota_set — 한도/사용량 수동 갱신 ──
CREATE OR REPLACE FUNCTION public.fn_usage_quota_set(
  p_cd    text,
  p_limit numeric,
  p_used  numeric,
  p_actor text DEFAULT 'ADMIN'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.sys_usage_quota
     SET limit_amt = GREATEST(0, p_limit),
         used_amt  = GREATEST(0, p_used),
         modr_id   = p_actor,
         mod_dtm   = CURRENT_TIMESTAMP
   WHERE resource_cd = p_cd AND del_yn = 'N';

  IF NOT FOUND THEN
    RAISE EXCEPTION '알 수 없는 리소스 코드: %', p_cd USING ERRCODE = '22023';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_usage_quota_set(text, numeric, numeric, text) IS '인프라 사용량 할당 수동 갱신(한도·사용량)';

COMMIT;
