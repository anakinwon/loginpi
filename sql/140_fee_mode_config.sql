-- DA-APPROVED: 이중 요금제 전환 메커니즘 (PRD_24_FEES_STRATAGE §6, 2026-06-29)
-- 역할: Bean Token ↔ Pi Coin 요금제 런타임 전환 (메인넷 등재 대응)
-- 요점: 단일 플래그 (BEAN|PI) 기반으로 모든 요금 차감값 즉시 변경 · 코드 재배포 0

-- ── 1. 요금제 모드 설정 ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fee_mode_config (
  fee_mode_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  active_mode   VARCHAR(10) NOT NULL DEFAULT 'BEAN'
                  CHECK (active_mode IN ('BEAN', 'PI')),
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_memo   TEXT,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fee_mode_config IS '활성 요금제 세트 관리 (BEAN|PI) — PRD_24_FEES_STRATAGE';
COMMENT ON COLUMN public.fee_mode_config.fee_mode_id IS '설정 ID';
COMMENT ON COLUMN public.fee_mode_config.active_mode IS 'BEAN=Bean Token 요금제 / PI=Pi Coin 요금제';
COMMENT ON COLUMN public.fee_mode_config.activated_at IS '전환 시각';
COMMENT ON COLUMN public.fee_mode_config.reason_memo IS '전환 사유 (메인넷 신청 준비, Bean 발행 후 복귀 등)';
COMMENT ON COLUMN public.fee_mode_config.regr_id IS '초기 설정자';
COMMENT ON COLUMN public.fee_mode_config.reg_dtm IS '초기 설정일시';
COMMENT ON COLUMN public.fee_mode_config.modr_id IS '마지막 변경자';
COMMENT ON COLUMN public.fee_mode_config.mod_dtm IS '마지막 변경일시';

CREATE INDEX IF NOT EXISTS idx_fee_mode_config_active
  ON public.fee_mode_config(active_mode DESC, mod_dtm DESC);

CREATE INDEX IF NOT EXISTS idx_fee_mode_config_mode_mode
  ON public.fee_mode_config(active_mode);

-- ── 2. 요금제 전환 감시 이력 ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fee_mode_audit (
  audit_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  old_mode      VARCHAR(10) NOT NULL,
  new_mode      VARCHAR(10) NOT NULL,
  changed_by    TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_memo   TEXT,
  fee_mode_id   UUID        NOT NULL REFERENCES public.fee_mode_config(fee_mode_id) ON DELETE CASCADE,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fee_mode_audit IS '요금제 전환 이력 (감시·복구용) — PRD_24_FEES_STRATAGE §6-2';
COMMENT ON COLUMN public.fee_mode_audit.audit_id IS '감시 레코드 ID';
COMMENT ON COLUMN public.fee_mode_audit.old_mode IS '이전 모드';
COMMENT ON COLUMN public.fee_mode_audit.new_mode IS '새 모드';
COMMENT ON COLUMN public.fee_mode_audit.changed_by IS '전환 수행자 (관리자 ID)';
COMMENT ON COLUMN public.fee_mode_audit.changed_at IS '전환 시각';
COMMENT ON COLUMN public.fee_mode_audit.reason_memo IS '전환 사유';
COMMENT ON COLUMN public.fee_mode_audit.fee_mode_id IS 'fee_mode_config 외래키';

CREATE INDEX IF NOT EXISTS idx_fee_mode_audit_changed_at
  ON public.fee_mode_audit(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fee_mode_audit_by_mode
  ON public.fee_mode_audit(old_mode, new_mode, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fee_mode_audit_by_admin
  ON public.fee_mode_audit(changed_by, changed_at DESC);

-- ── 3. 초기 데이터 ─────────────────────────────────────────────────────────────

-- fee_mode_config에 현재 모드 'BEAN'으로 초기화
INSERT INTO public.fee_mode_config (active_mode, reason_memo)
VALUES ('BEAN', '평상시 운영 — Bean Token 요금제')
ON CONFLICT DO NOTHING;  -- idempotent: 이미 있으면 무시

-- ── 4. 헬퍼 함수 (선택) ────────────────────────────────────────────────────────
-- 목적: 현재 활성 모드 조회 (빈번한 호출 → 캐싱 권장)

CREATE OR REPLACE FUNCTION public.fn_get_active_fee_mode()
RETURNS VARCHAR(10) AS $$
  SELECT active_mode
  FROM public.fee_mode_config
  ORDER BY mod_dtm DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.fn_get_active_fee_mode() IS '현재 활성 요금제 모드 조회 (BEAN|PI)';

-- ── 5. RPC 함수 (선택): 요금제 전환 + 감시 기록 ──────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_switch_fee_mode(
  p_new_mode    VARCHAR(10),
  p_changed_by  TEXT,
  p_reason_memo TEXT
)
RETURNS TABLE (
  ok              BOOLEAN,
  message         TEXT,
  old_mode        VARCHAR(10),
  new_mode        VARCHAR(10),
  changed_at      TIMESTAMPTZ
) AS $$
DECLARE
  v_current_mode  VARCHAR(10);
  v_fee_mode_id   UUID;
BEGIN
  -- 1. 현재 모드 조회
  SELECT active_mode INTO v_current_mode
  FROM public.fee_mode_config
  ORDER BY mod_dtm DESC
  LIMIT 1;

  -- 2. 동일 모드면 무시
  IF v_current_mode = p_new_mode THEN
    RETURN QUERY SELECT true, 'Mode unchanged', v_current_mode, p_new_mode, CURRENT_TIMESTAMP;
    RETURN;
  END IF;

  -- 3. 유효성 검증
  IF p_new_mode NOT IN ('BEAN', 'PI') THEN
    RETURN QUERY SELECT false, 'Invalid mode: ' || p_new_mode, v_current_mode, p_new_mode, CURRENT_TIMESTAMP;
    RETURN;
  END IF;

  -- 4. 새 모드로 fee_mode_config 업데이트
  UPDATE public.fee_mode_config
  SET
    active_mode = p_new_mode,
    activated_at = CURRENT_TIMESTAMP,
    reason_memo = p_reason_memo,
    modr_id = p_changed_by,
    mod_dtm = CURRENT_TIMESTAMP
  WHERE fee_mode_id = (
    SELECT fee_mode_id FROM public.fee_mode_config
    ORDER BY mod_dtm DESC LIMIT 1
  )
  RETURNING fee_mode_id INTO v_fee_mode_id;

  -- 5. 감시 이력 기록
  INSERT INTO public.fee_mode_audit (
    old_mode,
    new_mode,
    changed_by,
    reason_memo,
    fee_mode_id
  ) VALUES (
    v_current_mode,
    p_new_mode,
    p_changed_by,
    p_reason_memo,
    v_fee_mode_id
  );

  RETURN QUERY SELECT true, 'Mode switched successfully', v_current_mode, p_new_mode, CURRENT_TIMESTAMP;
END;
$$ LANGUAGE PLPGSQL;

COMMENT ON FUNCTION public.fn_switch_fee_mode(VARCHAR, TEXT, TEXT) IS '요금제 모드 전환 + 감시 기록 (RPC) — PRD_24_FEES_STRATAGE §6';

-- ── 6. 조회 뷰 (선택): 최신 전환 이력 ───────────────────────────────────────

CREATE OR REPLACE VIEW public.v_fee_mode_recent_history AS
SELECT
  fa.audit_id,
  fa.old_mode,
  fa.new_mode,
  fa.changed_by,
  fa.changed_at,
  fa.reason_memo,
  ROW_NUMBER() OVER (ORDER BY fa.changed_at DESC) AS seq_num
FROM public.fee_mode_audit fa
WHERE fa.changed_at >= (CURRENT_TIMESTAMP - INTERVAL '90 days');

COMMENT ON VIEW public.v_fee_mode_recent_history IS '최근 90일 요금제 전환 이력 (최신순)';

-- ── 7. 데이터 품질 검증 ────────────────────────────────────────────────────────

-- 정책: fee_mode_config는 항상 최소 1행 유지 (현재 모드)
-- → 정상 상태: 1행 (또는 히스토리 추적 중 최대 2행)
-- → 비정상: 0행 → API는 기본값 'BEAN' 사용 (fallback)

-- ── 8. 마이그레이션 완료 ────────────────────────────────────────────────────

-- 정책: 이 마이그레이션은 멱등 (재실행 안전)
--  · fee_mode_config / fee_mode_audit 테이블: IF NOT EXISTS
--  · 초기 데이터: ON CONFLICT DO NOTHING
--  · 함수/뷰: OR REPLACE (변경 없으면 스킵)

-- 검증 명령어 (수동 실행, 선택):
-- SELECT * FROM public.fee_mode_config;
-- SELECT * FROM public.fee_mode_audit ORDER BY changed_at DESC;
-- SELECT * FROM public.v_fee_mode_recent_history;
-- SELECT public.fn_get_active_fee_mode();
