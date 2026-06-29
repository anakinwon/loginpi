-- DA-APPROVED: 오픈기념행사 기간한정 무료요금 정책 (PRD_26_OPEN_PROMO_FEE, 2026-06-30 v0.1)
--   단일 OneKey 토글로 모든 9개 요금 품목 무료화·정상요금 복귀 관리.
-- 설계: 프로모 ON → 모든 청구 경로 요금 0으로 오버라이드. 정상요금 정의(bean_fee_plan) 비파괴.
--   시간 기반 자동 OFF: promo_end_dtm 도달 시 fn_is_open_promo_active() FALSE 반환.
-- 멱등: IF NOT EXISTS · 초기 데이터 INSERT...WHERE NOT EXISTS.

-- ── 1. 프로모션 설정 (단일 활성 행, 최신 mod_dtm 기준) ─────────────────────
CREATE TABLE IF NOT EXISTS public.promo_fee_config (
  promo_fee_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_active_yn CHAR(1)     NOT NULL DEFAULT 'N' CHECK (promo_active_yn IN ('Y','N')),
  promo_start_dtm TIMESTAMPTZ,                           -- 프로모 시작 시각 (NULL = 지정 안 됨, 즉시 활성)
  promo_end_dtm   TIMESTAMPTZ,                           -- 프로모 종료 시각 (NULL = 무제한, 수동 OFF까지)
  reason_memo     TEXT,                                  -- 활성화/변경 사유 (예: "오픈기념행사")
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.promo_fee_config              IS '오픈기념행사 무료요금 정책 (OneKey 토글) — PRD_26. 최신 mod_dtm 1행이 권위';
COMMENT ON COLUMN public.promo_fee_config.promo_active_yn IS 'Y=무료화 활성(모든 9개 품목 무료) / N=정상요금 적용';
COMMENT ON COLUMN public.promo_fee_config.promo_start_dtm IS '프로모 시작 시각 (TIMESTAMPTZ). NULL=지정 안 됨·즉시 활성(활성 플래그만 참고)';
COMMENT ON COLUMN public.promo_fee_config.promo_end_dtm   IS '프로모 종료 시각 (TIMESTAMPTZ). NULL=무제한·수동 OFF까지. 도달 후 자동 OFF';

-- 활성 상태 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_promo_fee_config_active
  ON public.promo_fee_config(promo_active_yn, mod_dtm DESC) WHERE del_yn = 'N';

-- ── 2. 프로모션 변경 이력 (append-only, 감사) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_fee_audit (
  audit_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  old_active_yn  CHAR(1),                                -- 변경 전 활성 상태
  new_active_yn  CHAR(1)     NOT NULL,                  -- 변경 후 활성 상태
  old_start_dtm  TIMESTAMPTZ,                            -- 변경 전 시작시각
  new_start_dtm  TIMESTAMPTZ,                            -- 변경 후 시작시각
  old_end_dtm    TIMESTAMPTZ,                            -- 변경 전 종료시각
  new_end_dtm    TIMESTAMPTZ,                            -- 변경 후 종료시각
  changed_by     TEXT        NOT NULL,                  -- 변경 수행 관리자
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_memo    TEXT,                                  -- 변경 사유
  promo_fee_id   UUID,                                  -- promo_fee_config 참조 (FK 제약 없음 — 관례)
  del_yn         CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.promo_fee_audit IS '프로모션 설정 변경 이력 (감사·추적, append-only) — PRD_26';

CREATE INDEX IF NOT EXISTS idx_promo_fee_audit_changed
  ON public.promo_fee_audit(changed_at DESC) WHERE del_yn = 'N';

-- ── 3. 초기 데이터 (비활성 상태, 멱등) ──────────────────────────────────
INSERT INTO public.promo_fee_config (promo_active_yn, reason_memo)
SELECT 'N', '초기 상태: 정상요금 적용'
WHERE NOT EXISTS (SELECT 1 FROM public.promo_fee_config WHERE del_yn = 'N');

-- ── 4. 프로모션 활성 여부 조회 ────────────────────────────────────────────
--   활성 플래그(Y) AND 시작시각(NULL이거나 현재 >= 시작) AND 종료시각(NULL이거나 현재 < 종료)
--   → true면 모든 요금 0으로 오버라이드, false면 정상요금 적용
CREATE OR REPLACE FUNCTION public.fn_is_open_promo_active()
RETURNS BOOLEAN AS $$
  SELECT promo_active_yn = 'Y'
    AND (promo_start_dtm IS NULL OR CURRENT_TIMESTAMP >= promo_start_dtm)
    AND (promo_end_dtm IS NULL OR CURRENT_TIMESTAMP < promo_end_dtm)
  FROM public.promo_fee_config
  WHERE del_yn = 'N'
  ORDER BY mod_dtm DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.fn_is_open_promo_active()
  IS '오픈기념행사 프로모션 활성 여부 (활성플래그 + 시간범위 판정) — PRD_26. true=모든 요금 무료 / false=정상요금';

-- ── 5. 프로모션 활성화·비활성화 (원자적 토글 + 감사 기록) ────────────────
CREATE OR REPLACE FUNCTION public.fn_toggle_open_promo(
  p_active_yn   CHAR(1),
  p_start_dtm   TIMESTAMPTZ DEFAULT NULL,
  p_end_dtm     TIMESTAMPTZ DEFAULT NULL,
  p_changed_by  TEXT        DEFAULT 'ADMIN',
  p_reason_memo TEXT        DEFAULT NULL
)
RETURNS TABLE (
  ok             BOOLEAN,
  message        TEXT,
  new_active_yn  CHAR(1),
  new_start_dtm  TIMESTAMPTZ,
  new_end_dtm    TIMESTAMPTZ,
  mod_dtm        TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
DECLARE
  v_id              UUID;
  v_old_active_yn   CHAR(1);
  v_old_start_dtm   TIMESTAMPTZ;
  v_old_end_dtm     TIMESTAMPTZ;
BEGIN
  -- 입력 검증
  IF p_active_yn NOT IN ('Y', 'N') THEN
    RETURN QUERY SELECT false, 'INVALID_ACTIVE_YN: '||p_active_yn, NULL::CHAR(1), NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, CURRENT_TIMESTAMP;
    RETURN;
  END IF;

  -- 현재 활성 행 조회
  SELECT promo_fee_id, promo_active_yn, promo_start_dtm, promo_end_dtm
  INTO v_id, v_old_active_yn, v_old_start_dtm, v_old_end_dtm
  FROM public.promo_fee_config
  WHERE del_yn = 'N'
  ORDER BY mod_dtm DESC
  LIMIT 1;

  -- 없으면 생성
  IF v_id IS NULL THEN
    INSERT INTO public.promo_fee_config (promo_active_yn, promo_start_dtm, promo_end_dtm, reason_memo, modr_id)
    VALUES (p_active_yn, p_start_dtm, p_end_dtm, p_reason_memo, p_changed_by)
    RETURNING promo_fee_id INTO v_id;
    v_old_active_yn := NULL;
  ELSE
    -- 업데이트
    UPDATE public.promo_fee_config
    SET promo_active_yn = p_active_yn,
        promo_start_dtm = p_start_dtm,
        promo_end_dtm   = p_end_dtm,
        reason_memo     = p_reason_memo,
        modr_id         = p_changed_by,
        mod_dtm         = CURRENT_TIMESTAMP
    WHERE promo_fee_id = v_id;
  END IF;

  -- 감사 기록
  INSERT INTO public.promo_fee_audit (
    old_active_yn, new_active_yn,
    old_start_dtm, new_start_dtm,
    old_end_dtm,   new_end_dtm,
    changed_by, reason_memo, promo_fee_id, regr_id, modr_id
  )
  VALUES (
    v_old_active_yn, p_active_yn,
    v_old_start_dtm, p_start_dtm,
    v_old_end_dtm,   p_end_dtm,
    p_changed_by, p_reason_memo, v_id, p_changed_by, p_changed_by
  );

  RETURN QUERY
  SELECT
    true,
    CASE WHEN v_old_active_yn IS NULL THEN 'CREATED' ELSE 'UPDATED' END,
    p_active_yn,
    p_start_dtm,
    p_end_dtm,
    CURRENT_TIMESTAMP;
END $$;

COMMENT ON FUNCTION public.fn_toggle_open_promo(CHAR, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT)
  IS '프로모션 토글 + 감사 기록 (원자적) — PRD_26. p_active_yn=Y 활성화 / N 비활성화';

-- ── 6. 최근 변경 이력 뷰 (30일) ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_promo_fee_recent_history AS
SELECT
  audit_id,
  old_active_yn, new_active_yn,
  old_start_dtm, new_start_dtm,
  old_end_dtm, new_end_dtm,
  changed_by, changed_at, reason_memo
FROM public.promo_fee_audit
WHERE del_yn = 'N' AND changed_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
ORDER BY changed_at DESC;

COMMENT ON VIEW public.v_promo_fee_recent_history IS '최근 30일 프로모션 변경 이력 (최신순) — PRD_26';

-- ── 7. 현재 설정 뷰 (관리자 대시보드용) ──────────────────────────────────
CREATE OR REPLACE VIEW public.v_promo_fee_current AS
SELECT
  promo_fee_id,
  promo_active_yn,
  promo_start_dtm,
  promo_end_dtm,
  reason_memo,
  mod_dtm,
  -- 상태 해석
  CASE
    WHEN promo_active_yn = 'N' THEN '비활성(정상요금)'
    WHEN promo_end_dtm IS NULL THEN '활성(무제한)'
    WHEN CURRENT_TIMESTAMP >= promo_end_dtm THEN '종료됨(자동 OFF)'
    WHEN promo_start_dtm IS NOT NULL AND CURRENT_TIMESTAMP < promo_start_dtm THEN '대기중(미시작)'
    ELSE '활성(진행중)'
  END AS status_label,
  fn_is_open_promo_active() AS is_active_now
FROM public.promo_fee_config
WHERE del_yn = 'N'
ORDER BY mod_dtm DESC
LIMIT 1;

COMMENT ON VIEW public.v_promo_fee_current IS '현재 프로모션 설정 (상태 해석 포함) — PRD_26';

-- ── 검증 쿼리 ────────────────────────────────────────────────────────────
--   SELECT public.fn_is_open_promo_active();
--   SELECT * FROM public.v_promo_fee_current;
--   SELECT * FROM public.fn_toggle_open_promo('Y', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'admin', '오픈기념행사');
--   SELECT * FROM public.v_promo_fee_recent_history;
