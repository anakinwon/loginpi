-- 설정 감사 이력 백필 — fee_mode_audit·promo_fee_audit → sys_cfg_chg_hist (DA팀 확정 2026-07-10)
--   정본 계획: docs/da/_workspace/20260710_cfg_chg_hist/02_migration_plan.md
--   선행 조건: sql/176 적용 완료(테이블·헬퍼 존재). 적용 순서 176 → 177 → 178 (역순 금지).
--   원칙: 소스 실재 건만 이전(임의값 생성 0) · 활성행(del_yn='N')만 · 원본 비파괴 · 멱등(NOT EXISTS 가드).
--   ⛔ 적용 전 사전 품질점검(§0) 필수 — null_row_id·null_chgr가 0이 아니면 중단·상신.

-- ── 0. 사전 품질점검 (백필 전 필수 실행 — 이상 시 중단) ──────────────────────
-- P1. fee_mode_audit: 고아·NULL 점검 (null_row_id·null_chgr 기대 0)
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE del_yn='N')                          AS active,
--          count(*) FILTER (WHERE fee_mode_id IS NULL)                 AS null_row_id,
--          count(*) FILTER (WHERE changed_by IS NULL)                  AS null_chgr,
--          count(*) FILTER (WHERE old_mode IS NULL OR new_mode IS NULL) AS null_mode
--   FROM public.fee_mode_audit;
-- P2. promo_fee_audit: 동일 점검 (promo_fee_id·changed_by·new_active_yn NULL 기대 0)
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE del_yn='N')                  AS active,
--          count(*) FILTER (WHERE promo_fee_id IS NULL)        AS null_row_id,
--          count(*) FILTER (WHERE changed_by IS NULL)          AS null_chgr,
--          count(*) FILTER (WHERE new_active_yn IS NULL)       AS null_new_yn
--   FROM public.promo_fee_audit;
-- 고아(null_row_id>0) 발견 시: 해당 행은 백필에서 자동 제외되나(아래 IS NOT NULL 필터),
-- 건수·audit_id를 리더/마스터에 보고 후 진행 여부 판단(임의 보정 금지).

-- ── 1. fee_mode_audit → sys_cfg_chg_hist ─────────────────────────────────────
-- chg_actn_cd는 소스 실재 필드(reason_memo 접두)에서 파생 — fn_rollback_fee_mode가 'ROLLBACK: ' 접두 기록.
INSERT INTO public.sys_cfg_chg_hist
  (cfg_tbl_nm, cfg_tgt_id, chg_actn_cd, old_val, new_val, chg_rsn_cont, chgr_id, chg_dtm, regr_id, modr_id)
SELECT
  'fee_mode_config',
  a.fee_mode_id::TEXT,
  CASE WHEN a.reason_memo LIKE 'ROLLBACK:%' THEN 'ROLLBACK' ELSE 'SWITCH' END,
  jsonb_build_object('active_mode', a.old_mode),
  jsonb_build_object('active_mode', a.new_mode),
  a.reason_memo,
  a.changed_by,
  a.changed_at,
  'MIGRATION', 'MIGRATION'
FROM public.fee_mode_audit a
WHERE a.del_yn = 'N'
  AND a.fee_mode_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sys_cfg_chg_hist h
    WHERE h.cfg_tbl_nm = 'fee_mode_config'
      AND h.cfg_tgt_id = a.fee_mode_id::TEXT
      AND h.chg_dtm    = a.changed_at
      AND h.chgr_id    = a.changed_by
  );

-- ── 2. promo_fee_audit → sys_cfg_chg_hist ────────────────────────────────────
-- 최초 생성(old_active_yn IS NULL)=INSERT(old_val NULL), 이후=TOGGLE — 소스 파생.
INSERT INTO public.sys_cfg_chg_hist
  (cfg_tbl_nm, cfg_tgt_id, chg_actn_cd, old_val, new_val, chg_rsn_cont, chgr_id, chg_dtm, regr_id, modr_id)
SELECT
  'promo_fee_config',
  a.promo_fee_id::TEXT,
  CASE WHEN a.old_active_yn IS NULL THEN 'INSERT' ELSE 'TOGGLE' END,
  CASE WHEN a.old_active_yn IS NULL THEN NULL
       ELSE jsonb_build_object('promo_active_yn', a.old_active_yn,
                               'promo_start_dtm', a.old_start_dtm,
                               'promo_end_dtm',   a.old_end_dtm) END,
  jsonb_build_object('promo_active_yn', a.new_active_yn,
                     'promo_start_dtm', a.new_start_dtm,
                     'promo_end_dtm',   a.new_end_dtm),
  a.reason_memo,
  a.changed_by,
  a.changed_at,
  'MIGRATION', 'MIGRATION'
FROM public.promo_fee_audit a
WHERE a.del_yn = 'N'
  AND a.promo_fee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sys_cfg_chg_hist h
    WHERE h.cfg_tbl_nm = 'promo_fee_config'
      AND h.cfg_tgt_id = a.promo_fee_id::TEXT
      AND h.chg_dtm    = a.changed_at
      AND h.chgr_id    = a.changed_by
  );

-- ── 3. 이행 후 검증 (전량 통과가 확정 조건 — 불일치 1건이라도 있으면 중단·원인 분석) ──
-- V1. 건수 대사(설정별): src == dst
--   SELECT (SELECT count(*) FROM public.fee_mode_audit  WHERE del_yn='N' AND fee_mode_id  IS NOT NULL) AS src_fee,
--          (SELECT count(*) FROM public.sys_cfg_chg_hist WHERE cfg_tbl_nm='fee_mode_config')            AS dst_fee;
--   SELECT (SELECT count(*) FROM public.promo_fee_audit WHERE del_yn='N' AND promo_fee_id IS NOT NULL) AS src_promo,
--          (SELECT count(*) FROM public.sys_cfg_chg_hist WHERE cfg_tbl_nm='promo_fee_config')          AS dst_promo;
-- V2. 총계 대사: 두 원천 합 == 대상 총건
-- V3. 멱등 대사: 본 파일 2회 실행 후에도 dst 총건 불변
-- V4. 샘플 대조: 설정별 최신 3건의 값·시각이 원천과 동일
--   SELECT h.chg_dtm, h.chg_actn_cd, h.old_val->>'active_mode' AS old_m, h.new_val->>'active_mode' AS new_m, h.chgr_id
--   FROM public.sys_cfg_chg_hist h WHERE h.cfg_tbl_nm='fee_mode_config' ORDER BY h.chg_dtm DESC LIMIT 3;
-- V5. 무결성: 필수값 위반 0
--   SELECT count(*) FILTER (WHERE chgr_id IS NULL)     AS null_chgr,
--          count(*) FILTER (WHERE cfg_tgt_id IS NULL)  AS null_tgt,
--          count(*) FILTER (WHERE chg_actn_cd NOT IN ('INSERT','UPDATE','SWITCH','TOGGLE','ROLLBACK','DELETE')) AS bad_actn
--   FROM public.sys_cfg_chg_hist;

-- ── 롤백 (검증 불일치 시 — 물리 DELETE 금지, 원천 audit 불변) ─────────────────
--   UPDATE public.sys_cfg_chg_hist
--      SET del_yn='Y', del_dtm=CURRENT_TIMESTAMP, modr_id='MIGRATION', mod_dtm=CURRENT_TIMESTAMP
--    WHERE regr_id='MIGRATION';
