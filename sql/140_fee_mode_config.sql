-- DA-APPROVED: 이중 요금제 전환 메커니즘 (PRD_24_FEES_STRATAGE §6·§10, 2026-06-29 v0.4)
--   신규 도메인 'fee'(요금제 모드). Bean Token ↔ Pi Coin 런타임 전환 + 양방향 롤백.
-- 요점: 단일 플래그(BEAN|PI) · 전환 이력 + 롤백 보장 · DA 표준(시스템4 + del_yn 논리삭제).
-- ⚠️ FK 무설계 관례([no-postgrest-embedded-join-fk-less]): audit는 참조 UUID 컬럼만(FK 제약 X).
-- 멱등: IF NOT EXISTS · ON CONFLICT DO NOTHING · OR REPLACE.

-- ── 1. 요금제 모드 설정 (단일 활성 행, 최신 mod_dtm 기준) ─────────────────────
CREATE TABLE IF NOT EXISTS public.fee_mode_config (
  fee_mode_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  active_mode   VARCHAR(10) NOT NULL DEFAULT 'BEAN' CHECK (active_mode IN ('BEAN','PI')),
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 현재 모드 전환 시각
  reason_memo   TEXT,
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fee_mode_config             IS '활성 요금제 모드 (BEAN|PI) — PRD_24. 최신 mod_dtm 1행이 권위';
COMMENT ON COLUMN public.fee_mode_config.active_mode IS 'BEAN=Bean Token 요금제 / PI=Pi Coin 직결제 요금제';
COMMENT ON COLUMN public.fee_mode_config.reason_memo IS '전환 사유 (메인넷 등재 준비·Bean 발행 후 복귀·롤백 등)';

-- 활성 조회용 단일 인덱스(중복 idx_..._mode_mode 제거 — active 인덱스의 prefix라 불필요)
CREATE INDEX IF NOT EXISTS idx_fee_mode_config_active
  ON public.fee_mode_config(active_mode, mod_dtm DESC) WHERE del_yn = 'N';

-- ── 2. 전환 이력 (append-only · 롤백 추적, FK 무설계 관례) ────────────────────
CREATE TABLE IF NOT EXISTS public.fee_mode_audit (
  audit_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  old_mode     VARCHAR(10) NOT NULL,
  new_mode     VARCHAR(10) NOT NULL,
  changed_by   TEXT        NOT NULL,                 -- 전환 수행 관리자 id
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_memo  TEXT,
  fee_mode_id  UUID,                                 -- fee_mode_config 참조(FK 제약 없음 — 관례)
  del_yn       CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.fee_mode_audit IS '요금제 전환 이력 — 감사·롤백 추적(append-only) — PRD_24 §6-2';

CREATE INDEX IF NOT EXISTS idx_fee_mode_audit_changed
  ON public.fee_mode_audit(changed_at DESC) WHERE del_yn = 'N';

-- ── 3. 초기 데이터 (현재 모드 BEAN, 멱등) ────────────────────────────────────
INSERT INTO public.fee_mode_config (active_mode, reason_memo)
SELECT 'BEAN', '평상시 운영 — Bean Token 요금제'
WHERE NOT EXISTS (SELECT 1 FROM public.fee_mode_config WHERE del_yn = 'N');

-- ── 4. 활성 모드 조회 (STABLE — 캐시 권장이나 결제 시점은 직접 조회) ──────────
CREATE OR REPLACE FUNCTION public.fn_get_active_fee_mode()
RETURNS VARCHAR(10) AS $$
  SELECT active_mode FROM public.fee_mode_config
  WHERE del_yn = 'N' ORDER BY mod_dtm DESC LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.fn_get_active_fee_mode() IS '현재 활성 요금제 모드 조회 (BEAN|PI)';

-- ── 5. 모드 전환 + 감사 기록 (원자적) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_switch_fee_mode(
  p_new_mode    VARCHAR(10),
  p_changed_by  TEXT,
  p_reason_memo TEXT
)
RETURNS TABLE (ok BOOLEAN, message TEXT, old_mode VARCHAR(10), new_mode VARCHAR(10), changed_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  v_cur   VARCHAR(10);
  v_id    UUID;
BEGIN
  IF p_new_mode NOT IN ('BEAN','PI') THEN
    RETURN QUERY SELECT false, 'INVALID_MODE: '||p_new_mode, NULL::VARCHAR(10), p_new_mode, CURRENT_TIMESTAMP; RETURN;
  END IF;

  SELECT active_mode, fee_mode_id INTO v_cur, v_id
  FROM public.fee_mode_config WHERE del_yn='N' ORDER BY mod_dtm DESC LIMIT 1;

  IF v_cur = p_new_mode THEN
    RETURN QUERY SELECT true, 'UNCHANGED', v_cur, p_new_mode, CURRENT_TIMESTAMP; RETURN;
  END IF;

  UPDATE public.fee_mode_config
     SET active_mode=p_new_mode, activated_at=CURRENT_TIMESTAMP,
         reason_memo=p_reason_memo, modr_id=p_changed_by, mod_dtm=CURRENT_TIMESTAMP
   WHERE fee_mode_id = v_id;

  INSERT INTO public.fee_mode_audit (old_mode, new_mode, changed_by, reason_memo, fee_mode_id, regr_id, modr_id)
  VALUES (v_cur, p_new_mode, p_changed_by, p_reason_memo, v_id, p_changed_by, p_changed_by);

  RETURN QUERY SELECT true, 'SWITCHED', v_cur, p_new_mode, CURRENT_TIMESTAMP;
END $$;

COMMENT ON FUNCTION public.fn_switch_fee_mode(VARCHAR, TEXT, TEXT) IS '요금제 모드 전환 + 감사 기록 (RPC) — PRD_24 §6';

-- ── 6. 롤백 — 직전 모드로 원자 복원 (v0.3 롤백 보장) ──────────────────────────
--   "언제든 현재 요금제로 복귀": 최신 전환 이력의 old_mode로 되돌린다.
CREATE OR REPLACE FUNCTION public.fn_rollback_fee_mode(
  p_changed_by  TEXT,
  p_reason_memo TEXT DEFAULT '직전 요금제 복귀'
)
RETURNS TABLE (ok BOOLEAN, message TEXT, old_mode VARCHAR(10), new_mode VARCHAR(10), changed_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  v_prev VARCHAR(10);
BEGIN
  SELECT a.old_mode INTO v_prev
  FROM public.fee_mode_audit a WHERE a.del_yn='N' ORDER BY a.changed_at DESC LIMIT 1;

  IF v_prev IS NULL THEN
    RETURN QUERY SELECT false, 'NO_HISTORY', NULL::VARCHAR(10), NULL::VARCHAR(10), CURRENT_TIMESTAMP; RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.fn_switch_fee_mode(v_prev, p_changed_by, 'ROLLBACK: '||p_reason_memo);
END $$;

COMMENT ON FUNCTION public.fn_rollback_fee_mode(TEXT, TEXT) IS '직전 요금제 모드로 원자 복원 — PRD_24 v0.3 롤백 보장';

-- ── 7. 최근 전환 이력 뷰 (90일) ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_fee_mode_recent_history AS
SELECT audit_id, old_mode, new_mode, changed_by, changed_at, reason_memo
FROM public.fee_mode_audit
WHERE del_yn='N' AND changed_at >= (CURRENT_TIMESTAMP - INTERVAL '90 days')
ORDER BY changed_at DESC;

COMMENT ON VIEW public.v_fee_mode_recent_history IS '최근 90일 요금제 전환 이력 (최신순)';

-- 검증:
--   SELECT public.fn_get_active_fee_mode();
--   SELECT * FROM public.fn_switch_fee_mode('PI','anakin','메인넷 등재 준비');
--   SELECT * FROM public.fn_rollback_fee_mode('anakin','심사 연기');
--   SELECT * FROM public.v_fee_mode_recent_history;
