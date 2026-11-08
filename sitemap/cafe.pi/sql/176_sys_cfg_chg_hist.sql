-- 운영 설정 변경 감사 이력(범용) — sys_cfg_chg_hist + 표준 등재 (DA팀 확정 2026-07-10)
--   대상: fee_mode_config(BEAN|PI 전환)·promo_fee_config(프로모 토글) + 향후 운영 설정 전반.
--   산출 근거: docs/da/_workspace/20260710_cfg_chg_hist/ (모델·명명검증·이행계획·품질게이트 전량 통과, P1 0건)
--   설계 선례: std_audit_log(sql/009, 범용 JSONB 패턴) · fee_mode_audit(140) · promo_fee_audit(149)
--   FK 무설계: 다형 참조(cfg_tbl_nm+cfg_tgt_id) — 단일 FK 표현 불가, 임베디드 조인 비대상.
--   적용 순서: 176(본 파일) → 177(백필) → 178(RPC 이중기록). 역순 금지.
--   멱등: IF NOT EXISTS · CREATE OR REPLACE · WHERE NOT EXISTS.

-- ── 0. 표준사전 등재 (경고 0 완전 준수 전제 — 표준담당 등재안 §5·§6) ──────────
--   Hook DOMAIN_SUFFIXES 'val' 추가 및 정본 §1-2 동기화는 같은 커밋에서 반영(한쪽만 갱신 금지).

-- 0-1. 표준단어 10개 (std_dic — 실컬럼: src/app/api/admin/std/words/route.ts 기준)
INSERT INTO public.std_dic (dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, dic_gbn_cd, apv_status, regr_id)
SELECT gen_random_uuid(), v.log_nm, v.phy_nm, v.fll_nm, v.dsc, '0001', 'APPROVED', 'ADMIN'
FROM (VALUES
  ('설정',   'CFG',  'config',  '운영 설정(config)'),
  ('변경',   'CHG',  'change',  '변경 행위(mod와 구분 — 업무 감사 문맥)'),
  ('이력',   'HIST', 'history', '변경 이력(append-only)'),
  ('테이블', 'TBL',  'table',   '대상 테이블'),
  ('대상',   'TGT',  'target',  '다형 참조 대상'),
  ('행위',   'ACTN', 'action',  '변경 행위 유형'),
  ('사유',   'RSN',  'reason',  '변경 사유'),
  ('변경자', 'CHGR', 'changer', '변경 수행자(복합어, REGR/MODR 계열)'),
  ('전',     'OLD',  'old',     '변경 전 상태'),
  ('후',     'NEW',  'new',     '변경 후 상태')
) AS v(log_nm, phy_nm, fll_nm, dsc)
WHERE NOT EXISTS (
  SELECT 1 FROM public.std_dic d WHERE d.dic_phy_nm = v.phy_nm AND d.del_yn = 'N'
);

-- 0-2. 표준도메인 2개 (std_dom — 실컬럼: src/app/api/admin/std/domains/route.ts 기준)
--   dom_type_cd·data_type_cd는 화면 기본값('0003') 사용 — 실 타입은 dom_desc에 명기,
--   코드값 세부 조정이 필요하면 /admin/std/domains 화면에서 보정.
INSERT INTO public.std_dom (dom_id, dom_nm, key_dom_nm, key_dom_phy_nm, dom_type_cd, data_type_cd, data_len, data_scale, dom_desc, regr_id)
SELECT gen_random_uuid(), v.dom_nm, v.key_nm, v.key_phy, '0003', '0003', NULL, NULL, v.dsc, 'ADMIN'
FROM (VALUES
  ('값',   '값',   'VAL',  '변경 전/후 스냅샷 값 — 기본 타입 JSONB (범용 감사)'),
  ('내용', '내용', 'CONT', '자유 서술 내용 — 기본 타입 TEXT (Hook 기존 등재분 소급 명문화)')
) AS v(dom_nm, key_nm, key_phy, dsc)
WHERE NOT EXISTS (
  SELECT 1 FROM public.std_dom d WHERE d.key_dom_phy_nm = v.key_phy AND d.del_yn = 'N'
);

-- ── 1. 운영 설정 변경 감사 이력 (append-only) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sys_cfg_chg_hist (
  hist_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cfg_tbl_nm    TEXT        NOT NULL,                    -- 대상 설정 테이블명 ('fee_mode_config'|'promo_fee_config'|...)
  cfg_tgt_id    TEXT        NOT NULL,                    -- 대상 설정 행 PK 값(fee_mode_id/promo_fee_id) — 타입 상이 대응 TEXT
  chg_actn_cd   VARCHAR(20) NOT NULL                     -- 변경 행위
                CHECK (chg_actn_cd IN ('INSERT','UPDATE','SWITCH','TOGGLE','ROLLBACK','DELETE')),
  old_val       JSONB,                                   -- 변경 전 업무 컬럼 스냅샷 (INSERT면 NULL)
  new_val       JSONB,                                   -- 변경 후 업무 컬럼 스냅샷 (DELETE면 NULL)
  chg_rsn_cont  TEXT,                                    -- 변경 사유 (예: '메인넷 등재 준비'·'오픈기념행사')
  chgr_id       TEXT        NOT NULL,                    -- 변경 수행 관리자 usr_id (업무 감사 데이터)
  chg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 변경 시각 (업무 감사 데이터 — 정렬/필터 대상)
  del_yn        CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- mod_dtm 트리거 없음: append-only 감사 테이블 예외(정본 §6) — 논리삭제 UPDATE 시 modr_id·mod_dtm 수동 설정 필수.

COMMENT ON TABLE  public.sys_cfg_chg_hist              IS '운영 설정 변경 감사 이력(범용, append-only) — fee_mode_config·promo_fee_config 등 관리자 설정 토글 추적';
COMMENT ON COLUMN public.sys_cfg_chg_hist.cfg_tbl_nm   IS '대상 설정 테이블명. std_audit_log.tgt_tbl에 대응';
COMMENT ON COLUMN public.sys_cfg_chg_hist.cfg_tgt_id   IS '대상 설정 행 PK 값. UUID/기타 수용 위해 TEXT';
COMMENT ON COLUMN public.sys_cfg_chg_hist.chg_actn_cd  IS 'INSERT/UPDATE/SWITCH(모드전환)/TOGGLE(프로모)/ROLLBACK/DELETE';
COMMENT ON COLUMN public.sys_cfg_chg_hist.old_val      IS '변경 전 값(JSONB) — 해당 설정의 업무 컬럼만 담는 스냅샷(시스템4·del_yn·singleton 제외, 설정별 키 집합 고정)';
COMMENT ON COLUMN public.sys_cfg_chg_hist.new_val      IS '변경 후 값(JSONB) — 업무 컬럼 스냅샷(규약은 old_val과 동일)';
COMMENT ON COLUMN public.sys_cfg_chg_hist.chgr_id      IS '변경 수행 관리자 usr_id — 업무 감사 데이터(regr_id 시스템 컬럼과 의미 구분)';
COMMENT ON COLUMN public.sys_cfg_chg_hist.chg_dtm      IS '변경 시각 — 업무 감사 데이터. 정렬/필터에 사용(reg_dtm은 순수 시스템)';

-- ── 2. 인덱스 (조회 패턴 Q1~Q4, 활성행 부분 인덱스 — 명명 정본 §5 idx_<테이블명>_<컬럼>) ──
-- Q1: 설정별 최신순 "누가 언제 이 설정을 바꿨나"
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_hist_tbl
  ON public.sys_cfg_chg_hist(cfg_tbl_nm, chg_dtm DESC) WHERE del_yn = 'N';
-- Q2: 관리자별 변경 이력 "이 관리자가 무엇을 바꿨나"
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_hist_chgr
  ON public.sys_cfg_chg_hist(chgr_id, chg_dtm DESC) WHERE del_yn = 'N';
-- Q3: 전 설정 횡단 최근 타임라인
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_hist_dtm
  ON public.sys_cfg_chg_hist(chg_dtm DESC) WHERE del_yn = 'N';
-- Q4: 특정 설정 행의 변경 계보
CREATE INDEX IF NOT EXISTS idx_sys_cfg_chg_hist_tgt
  ON public.sys_cfg_chg_hist(cfg_tgt_id);
-- (JSONB 값 내부 검색 요건 발생 시: CREATE INDEX ... USING GIN (new_val jsonb_path_ops) — 현재 미포함)

-- ── 3. 공통 기록 헬퍼 (RPC 내 INSERT 방식 — 변경 주체·사유를 파라미터로 전달) ──
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

-- ── 검증 (적용 후 확인용) ────────────────────────────────────────────────────
--   SELECT count(*) FROM public.std_dic WHERE dic_phy_nm IN ('CFG','CHG','HIST','TBL','TGT','ACTN','RSN','CHGR','OLD','NEW') AND del_yn='N';  -- 10
--   SELECT count(*) FROM public.std_dom WHERE key_dom_phy_nm IN ('VAL','CONT') AND del_yn='N';  -- 2
--   SELECT public.fn_log_cfg_change('fee_mode_config','<fee_mode_id>','SWITCH',
--     jsonb_build_object('active_mode','BEAN'), jsonb_build_object('active_mode','PI'),
--     'anakin','적용 검증');   -- ⚠️스테이징에서만
--   SELECT * FROM public.v_sys_cfg_chg_recent;
