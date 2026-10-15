-- 초안: 명명 확정(표준 1차 통과), 품질 게이트 대기 (da-modeler 2026-07-10)
--   운영 설정 변경 감사 이력 — 범용 단일 테이블(sys_cfg_chg_hist).
--   대상: fee_mode_config(BEAN|PI 전환)·promo_fee_config(프로모 ON/OFF·기간) + 향후 운영 설정 전반.
--   설계 근거·중복 검토·명명 검증 요청은 01_modeler_model.md 참조.
-- ⚠️ 명명(컬럼명·접미사)은 표준담당(std_dic·std_dom) 검증 후 확정. 아래는 초안 후보명.
-- ⚠️ 확정 시 리더가 sql/176_*.sql 로 이동. 본 파일은 워크스페이스 초안(운영 적용 금지).
-- 설계 선례: std_audit_log(sql/009, 범용 JSONB 패턴) · fee_mode_audit(140) · promo_fee_audit(149) · mps_txn_hist(029)
-- FK 무설계: 다형 참조(cfg_tbl_nm+cfg_tgt_id) — 단일 FK 표현 불가, 임베디드 조인 비대상.
-- 멱등: IF NOT EXISTS · CREATE OR REPLACE.

-- ── 1. 운영 설정 변경 감사 이력 (append-only) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sys_cfg_chg_hist (
  hist_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cfg_tbl_nm    TEXT        NOT NULL,                    -- 대상 설정 테이블명 ('fee_mode_config'|'promo_fee_config'|...)
  cfg_tgt_id    TEXT        NOT NULL,                    -- 대상 설정 행 PK 값(fee_mode_id/promo_fee_id) — 타입 상이 대응 TEXT
  chg_actn_cd   VARCHAR(20) NOT NULL                     -- 변경 행위
                CHECK (chg_actn_cd IN ('INSERT','UPDATE','SWITCH','TOGGLE','ROLLBACK','DELETE')),
  old_val       JSONB,                                   -- 변경 전 스냅샷/델타 (INSERT면 NULL)
  new_val       JSONB,                                   -- 변경 후 스냅샷/델타 (DELETE면 NULL)
  chg_rsn_cont  TEXT,                                    -- 변경 사유 (예: '메인넷 등재 준비'·'오픈기념행사')
  chgr_id       TEXT        NOT NULL,                    -- 변경 수행 관리자 usr_id (업무 감사 데이터)
  chg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 변경 시각 (업무 감사 데이터 — 정렬/필터 대상, 시스템 컬럼 아님)
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.sys_cfg_chg_hist              IS '운영 설정 변경 감사 이력(범용, append-only) — fee_mode_config·promo_fee_config 등 관리자 설정 토글 추적';
COMMENT ON COLUMN public.sys_cfg_chg_hist.cfg_tbl_nm   IS '대상 설정 테이블명. std_audit_log.tgt_tbl에 대응';
COMMENT ON COLUMN public.sys_cfg_chg_hist.cfg_tgt_id   IS '대상 설정 행 PK 값. UUID/기타 수용 위해 TEXT';
COMMENT ON COLUMN public.sys_cfg_chg_hist.chg_actn_cd  IS 'INSERT/UPDATE/SWITCH(모드전환)/TOGGLE(프로모)/ROLLBACK/DELETE';
COMMENT ON COLUMN public.sys_cfg_chg_hist.old_val      IS '변경 전 값(JSONB). 설정별 속성 상이 → 범용 수용 위해 JSONB';
COMMENT ON COLUMN public.sys_cfg_chg_hist.new_val      IS '변경 후 값(JSONB)';
COMMENT ON COLUMN public.sys_cfg_chg_hist.chgr_id      IS '변경 수행 관리자 usr_id — 업무 감사 데이터(regr_id 시스템 컬럼과 의미 구분)';
COMMENT ON COLUMN public.sys_cfg_chg_hist.chg_dtm      IS '변경 시각 — 업무 감사 데이터. 정렬/필터에 사용(reg_dtm은 순수 시스템)';

-- ── 2. 인덱스 (조회 패턴 Q1~Q4, 활성행 부분 인덱스) ──────────────────────────
-- Q1: 설정별 최신순 "누가 언제 이 설정을 바꿨나"
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_tbl
  ON public.sys_cfg_chg_hist(cfg_tbl_nm, chg_dtm DESC) WHERE del_yn = 'N';
-- Q2: 관리자별 변경 이력 "이 관리자가 무엇을 바꿨나"
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_chgr
  ON public.sys_cfg_chg_hist(chgr_id, chg_dtm DESC) WHERE del_yn = 'N';
-- Q3: 전 설정 횡단 최근 타임라인
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_dtm
  ON public.sys_cfg_chg_hist(chg_dtm DESC) WHERE del_yn = 'N';
-- Q4: 특정 설정 행의 변경 계보
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_tgt
  ON public.sys_cfg_chg_hist(cfg_tgt_id);
-- (JSONB 값 내부 검색 요건 발생 시: CREATE INDEX ... USING GIN (new_val jsonb_path_ops) — 현재 미포함)

-- ── 3. 공통 기록 헬퍼 (RPC 내 INSERT 방식 — 권고, 01_modeler_model.md §5) ─────
--   각 설정 RPC(fn_switch_fee_mode·fn_toggle_open_promo 등)가 변경 시 호출.
--   변경 주체·사유를 파라미터로 명확히 전달(트리거 대비 우수).
CREATE OR REPLACE FUNCTION public.fn_log_cfg_change(
  p_cfg_tbl_nm   TEXT,
  p_cfg_tgt_id   TEXT,
  p_chg_actn_cd  VARCHAR(20),
  p_old_val      JSONB,
  p_new_val      JSONB,
  p_chgr_id      TEXT,
  p_chg_rsn_cont TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_hist_id UUID;
BEGIN
  INSERT INTO public.sys_cfg_chg_hist (
    cfg_tbl_nm, cfg_tgt_id, chg_actn_cd, old_val, new_val,
    chg_rsn_cont, chgr_id, regr_id, modr_id
  )
  VALUES (
    p_cfg_tbl_nm, p_cfg_tgt_id, p_chg_actn_cd, p_old_val, p_new_val,
    p_chg_rsn_cont, p_chgr_id, p_chgr_id, p_chgr_id
  )
  RETURNING hist_id INTO v_hist_id;
  RETURN v_hist_id;
END $$;

COMMENT ON FUNCTION public.fn_log_cfg_change(TEXT, TEXT, VARCHAR, JSONB, JSONB, TEXT, TEXT)
  IS '운영 설정 변경 이력 기록 헬퍼 — 설정 RPC 내부에서 호출(변경 주체·사유 파라미터 전달)';

-- ── 4. 최근 변경 이력 뷰 (90일, 최신순) ──────────────────────────────────────
CREATE OR REPLACE VIEW public.v_sys_cfg_chg_recent AS
SELECT hist_id, cfg_tbl_nm, cfg_tgt_id, chg_actn_cd,
       old_val, new_val, chg_rsn_cont, chgr_id, chg_dtm
FROM public.sys_cfg_chg_hist
WHERE del_yn = 'N' AND chg_dtm >= (CURRENT_TIMESTAMP - INTERVAL '90 days')
ORDER BY chg_dtm DESC;

COMMENT ON VIEW public.v_sys_cfg_chg_recent IS '최근 90일 운영 설정 변경 이력(최신순)';

-- ── 검증 (초안 — 실 적용 금지) ───────────────────────────────────────────────
--   SELECT public.fn_log_cfg_change(
--     'fee_mode_config', '<fee_mode_id>', 'SWITCH',
--     jsonb_build_object('active_mode','BEAN'),
--     jsonb_build_object('active_mode','PI'),
--     'anakin', '메인넷 등재 준비');
--   SELECT * FROM public.v_sys_cfg_chg_recent;
--   -- 특정 설정 조회: SELECT * FROM sys_cfg_chg_hist WHERE cfg_tbl_nm='promo_fee_config' AND del_yn='N' ORDER BY chg_dtm DESC;
--   -- JSONB 값 접근: SELECT new_val->>'active_mode' FROM sys_cfg_chg_hist WHERE cfg_tbl_nm='fee_mode_config';
