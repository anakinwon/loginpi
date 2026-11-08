-- 설정 RPC 이중기록(dual-write) 전환 — 기존 전용 audit 유지 + sys_cfg_chg_hist 동시 기록 (DA팀 확정 2026-07-10)
--   정본 계획: docs/da/_workspace/20260710_cfg_chg_hist/02_migration_plan.md §2 (R1·R2)
--   선행 조건: sql/176 적용 완료(fn_log_cfg_change 존재). 적용 순서 176 → 177 → 178.
--   원본: sql/140 §5 fn_switch_fee_mode · sql/149 §5 fn_toggle_open_promo 의 함수 전문 +
--         전용 audit INSERT 직후 fn_log_cfg_change 호출 1건씩 추가 (그 외 로직 무변경).
--   ⚠️ 적용 전 확인: 140·149 이후 두 함수를 재정의한 SQL이 없는지 grep(드리프트 방지).
--   fn_rollback_fee_mode(140 §6)는 변경 없음 — 내부에서 fn_switch_fee_mode 호출로 전이적 커버
--   ('ROLLBACK: ' reason 접두 → chg_actn_cd='ROLLBACK' 자동 분류).
--   앱(TypeScript) 라우트 변경 없음 — 동일 RPC명·시그니처 유지(CREATE OR REPLACE).
--   롤백: 본 파일 적용 후 문제 시 sql/140 §5·sql/149 §5의 원본 정의로 CREATE OR REPLACE 복원.

-- ── R1. fn_switch_fee_mode — 요금제 모드 전환 (원본 sql/140 §5 + 이중기록) ────
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

  -- 이중기록: 범용 설정 감사 이력 (UNCHANGED 조기 반환 경로에는 미기록 — 실제 변경만)
  PERFORM public.fn_log_cfg_change(
    'fee_mode_config', v_id::TEXT,
    CASE WHEN p_reason_memo LIKE 'ROLLBACK:%' THEN 'ROLLBACK' ELSE 'SWITCH' END,
    jsonb_build_object('active_mode', v_cur),
    jsonb_build_object('active_mode', p_new_mode),
    p_changed_by, p_reason_memo);

  RETURN QUERY SELECT true, 'SWITCHED', v_cur, p_new_mode, CURRENT_TIMESTAMP;
END $$;

COMMENT ON FUNCTION public.fn_switch_fee_mode(VARCHAR, TEXT, TEXT)
  IS '요금제 모드 전환 + 감사 기록 (RPC) — PRD_24 §6. sql/178: sys_cfg_chg_hist 이중기록 추가';

-- ── R2. fn_toggle_open_promo — 프로모션 토글 (원본 sql/149 §5 + 이중기록) ─────
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

  -- 이중기록: 범용 설정 감사 이력 (최초 생성=INSERT·old NULL, 이후=TOGGLE — 백필 §1.2와 동일 규약)
  PERFORM public.fn_log_cfg_change(
    'promo_fee_config', v_id::TEXT,
    CASE WHEN v_old_active_yn IS NULL THEN 'INSERT' ELSE 'TOGGLE' END,
    CASE WHEN v_old_active_yn IS NULL THEN NULL
         ELSE jsonb_build_object('promo_active_yn', v_old_active_yn,
                                 'promo_start_dtm', v_old_start_dtm,
                                 'promo_end_dtm',   v_old_end_dtm) END,
    jsonb_build_object('promo_active_yn', p_active_yn,
                       'promo_start_dtm', p_start_dtm,
                       'promo_end_dtm',   p_end_dtm),
    p_changed_by, p_reason_memo);

  RETURN QUERY
  SELECT
    true,
    CASE WHEN v_old_active_yn IS NULL THEN 'CREATED' ELSE 'UPDATED' END,
    p_active_yn,
    p_start_dtm,
    p_end_dtm;
END $$;

COMMENT ON FUNCTION public.fn_toggle_open_promo(CHAR, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT)
  IS '프로모션 토글 + 감사 (원자적) — PRD_26. sql/178: sys_cfg_chg_hist 이중기록 추가';

-- ── 검증 (V6 — ⚠️스테이징에서만, 운영 검증 토글 금지) ─────────────────────────
--   SELECT * FROM public.fn_switch_fee_mode('PI','anakin','스테이징 이중기록 검증');
--   → fee_mode_audit +1  AND  sys_cfg_chg_hist(cfg_tbl_nm='fee_mode_config') +1
--   확인 후 원상 복귀: SELECT * FROM public.fn_rollback_fee_mode('anakin');
