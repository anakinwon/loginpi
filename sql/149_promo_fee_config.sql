-- DA-APPROVED: 오픈기념행사 기간한정 무료요금 정책 (PRD_26_OPEN_PROMO_FEE, 2026-06-30 v0.2)
--   단일 OneKey 토글로 모든 9개 요금 품목 무료화·정상요금 복귀 관리.
-- 설계: 프로모 ON → 모든 청구 경로 요금 0으로 오버라이드. 정상요금 정의(bean_fee_plan) 비파괴.
--   시간 기반 자동 OFF: promo_end_dtm 도달 시 fn_is_open_promo_active() FALSE 반환.
-- ⭐ DA 원칙: 시스템 컬럼 4개(regr_id·reg_dtm·modr_id·mod_dtm)는 audit 전용 —
--   업무 판정/정렬/필터에 절대 사용하지 않는다. 현재 프로모 상태는 단일 행(싱글톤,
--   부분 unique index)으로 관리하여 ORDER BY 없이 단건(LIMIT 1) 조회한다.
--   업무적으로 변경시각 등이 필요하면 시스템 컬럼을 전용하지 말고 별도 업무 _dtm 컬럼을
--   신설해 쓴다(예: promo_fee_audit.changed_at — 감사 시각을 위한 전용 업무 컬럼).
-- 멱등: IF NOT EXISTS · ALTER ADD COLUMN IF NOT EXISTS · INSERT WHERE NOT EXISTS · DROP IF EXISTS 선행.

-- ── 1. 프로모션 설정 (싱글톤 — del_yn='N' 행 1개만) ───────────────────────
CREATE TABLE IF NOT EXISTS public.promo_fee_config (
  promo_fee_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key   CHAR(1)     NOT NULL DEFAULT 'X' CHECK (singleton_key = 'X'),
  promo_active_yn CHAR(1)     NOT NULL DEFAULT 'N' CHECK (promo_active_yn IN ('Y','N')),
  promo_start_dtm TIMESTAMPTZ,                           -- 프로모 시작 시각 (NULL = 즉시 활성)
  promo_end_dtm   TIMESTAMPTZ,                           -- 프로모 종료 시각 (NULL = 무제한, 수동 OFF까지)
  reason_memo     TEXT,                                  -- 활성화/변경 사유 (예: "오픈기념행사")
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 기존 테이블 대비 싱글톤 컬럼 보강 (멱등)
ALTER TABLE public.promo_fee_config
  ADD COLUMN IF NOT EXISTS singleton_key CHAR(1) NOT NULL DEFAULT 'X';

COMMENT ON TABLE  public.promo_fee_config                IS '오픈기념행사 무료요금 정책 (OneKey 토글) — PRD_26. 싱글톤(del_yn=N 1행)이 권위';
COMMENT ON COLUMN public.promo_fee_config.singleton_key  IS '싱글톤 강제용 고정값(X). del_yn=N 부분 unique로 활성 1행 보장 — 시스템 컬럼 정렬 불필요';
COMMENT ON COLUMN public.promo_fee_config.promo_active_yn IS 'Y=무료화 활성(모든 9개 품목 무료) / N=정상요금 적용';
COMMENT ON COLUMN public.promo_fee_config.promo_start_dtm IS '프로모 시작 시각. NULL=즉시 활성';
COMMENT ON COLUMN public.promo_fee_config.promo_end_dtm   IS '프로모 종료 시각. NULL=무제한. 도달 후 자동 OFF';

-- 싱글톤 강제: del_yn='N' 행은 항상 1개 (시스템 컬럼 정렬 없이 단건 조회 가능)
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_fee_singleton
  ON public.promo_fee_config(singleton_key) WHERE del_yn = 'N';

-- 구버전의 mod_dtm 정렬용 인덱스 제거 (시스템 컬럼 업무 사용 금지 — 싱글톤이라 불필요)
DROP INDEX IF EXISTS public.idx_promo_fee_config_active;

-- ── 2. 프로모션 변경 이력 (append-only, 감사) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_fee_audit (
  audit_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  old_active_yn  CHAR(1),                                -- 변경 전 활성 상태
  new_active_yn  CHAR(1)     NOT NULL,                  -- 변경 후 활성 상태
  old_start_dtm  TIMESTAMPTZ,                            -- 변경 전 시작시각
  new_start_dtm  TIMESTAMPTZ,                            -- 변경 후 시작시각
  old_end_dtm    TIMESTAMPTZ,                            -- 변경 전 종료시각
  new_end_dtm    TIMESTAMPTZ,                            -- 변경 후 종료시각
  changed_by     TEXT        NOT NULL,                  -- 변경 수행 관리자 (감사 업무 데이터)
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 변경 시각 (감사 업무 데이터 — 시스템 컬럼 아님)
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

-- changed_at = 감사 본연의 업무 데이터(변경 시각). 시스템 컬럼(reg_dtm 등)이 아니므로 정렬 허용.
CREATE INDEX IF NOT EXISTS idx_promo_fee_audit_changed
  ON public.promo_fee_audit(changed_at DESC) WHERE del_yn = 'N';

-- ── 3. 초기 데이터 (비활성, 멱등) ──────────────────────────────────────────
INSERT INTO public.promo_fee_config (promo_active_yn, reason_memo)
SELECT 'N', '초기 상태: 정상요금 적용'
WHERE NOT EXISTS (SELECT 1 FROM public.promo_fee_config WHERE del_yn = 'N');

-- ── 4. 프로모션 활성 여부 조회 (싱글톤 단건 — ORDER BY 없음) ──────────────
--   활성 플래그(Y) AND 시작시각(NULL이거나 현재 >= 시작) AND 종료시각(NULL이거나 현재 < 종료)
CREATE OR REPLACE FUNCTION public.fn_is_open_promo_active()
RETURNS BOOLEAN AS $$
  SELECT promo_active_yn = 'Y'
    AND (promo_start_dtm IS NULL OR CURRENT_TIMESTAMP >= promo_start_dtm)
    AND (promo_end_dtm IS NULL OR CURRENT_TIMESTAMP < promo_end_dtm)
  FROM public.promo_fee_config
  WHERE del_yn = 'N'
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.fn_is_open_promo_active()
  IS '프로모션 활성 여부 (활성플래그+시간범위) — PRD_26. 싱글톤 단건. true=무료 / false=정상요금';

-- ── 5. 프로모션 토글 (원자적 + 감사 기록) ─────────────────────────────────
--   시스템 컬럼(mod_dtm 등) 정렬/판정/반환 미사용. 싱글톤 1행을 UPDATE.
--   ⚠️ OUT 파라미터 변경(반환타입)은 CREATE OR REPLACE로 갱신 불가 → DROP 선행(멱등).
DROP FUNCTION IF EXISTS public.fn_toggle_open_promo(CHAR, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
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
  new_end_dtm    TIMESTAMPTZ
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
    RETURN QUERY SELECT false, 'INVALID_ACTIVE_YN: '||p_active_yn, NULL::CHAR(1), NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 싱글톤 단건 조회 (시스템 컬럼 정렬 없음 — del_yn='N' 1행 보장)
  SELECT promo_fee_id, promo_active_yn, promo_start_dtm, promo_end_dtm
  INTO v_id, v_old_active_yn, v_old_start_dtm, v_old_end_dtm
  FROM public.promo_fee_config
  WHERE del_yn = 'N'
  LIMIT 1;

  -- 없으면 생성 (초기 시드 부재 시)
  IF v_id IS NULL THEN
    INSERT INTO public.promo_fee_config (promo_active_yn, promo_start_dtm, promo_end_dtm, reason_memo, modr_id)
    VALUES (p_active_yn, p_start_dtm, p_end_dtm, p_reason_memo, p_changed_by)
    RETURNING promo_fee_id INTO v_id;
    v_old_active_yn := NULL;
  ELSE
    UPDATE public.promo_fee_config
    SET promo_active_yn = p_active_yn,
        promo_start_dtm = p_start_dtm,
        promo_end_dtm   = p_end_dtm,
        reason_memo     = p_reason_memo,
        modr_id         = p_changed_by,        -- 시스템 컬럼: audit 갱신(허용 용도)
        mod_dtm         = CURRENT_TIMESTAMP    -- 시스템 컬럼: audit 갱신(허용 용도)
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
    p_end_dtm;
END $$;

COMMENT ON FUNCTION public.fn_toggle_open_promo(CHAR, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT)
  IS '프로모션 토글 + 감사 (원자적) — PRD_26. p_active_yn=Y 활성화 / N 비활성화';

-- ── 6. 최근 변경 이력 뷰 (30일) ────────────────────────────────────────────
--   changed_at = 감사 본연의 업무 데이터(변경 시각). 시스템 컬럼 아님 — 정렬 허용.
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

-- ── 7. 현재 설정 뷰 (싱글톤 단건 — 시스템 컬럼 미노출) ────────────────────
--   ⚠️ 컬럼 구성 변경(mod_dtm 제거)은 CREATE OR REPLACE VIEW로 불가 → DROP 선행.
DROP VIEW IF EXISTS public.v_promo_fee_current;
CREATE VIEW public.v_promo_fee_current AS
SELECT
  promo_fee_id,
  promo_active_yn,
  promo_start_dtm,
  promo_end_dtm,
  reason_memo,
  -- 상태 해석 (시스템 컬럼 미사용)
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
LIMIT 1;

COMMENT ON VIEW public.v_promo_fee_current IS '현재 프로모션 설정 (상태 해석) — PRD_26. 싱글톤 단건';

-- ── 검증 ───────────────────────────────────────────────────────────────────
--   SELECT public.fn_is_open_promo_active();
--   SELECT * FROM public.v_promo_fee_current;
--   SELECT * FROM public.fn_toggle_open_promo('Y','2026-07-01T00:00:00Z','2026-07-31T23:59:59Z','admin','오픈기념행사');
--   SELECT * FROM public.fn_toggle_open_promo('N',NULL,NULL,'admin','원복');
--   SELECT * FROM public.v_promo_fee_recent_history;
