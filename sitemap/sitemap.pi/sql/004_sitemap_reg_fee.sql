-- 004_sitemap_reg_fee.sql — 등록 요금(승인 전 결제) : 요금표 fee_plan + site_mst 결제 참조 + 결제 완료 RPC (마스터 지시 2026-10-11)
-- DA-APPROVED: 마스터 지시 2026-10-11 — 사이트 등록 신청은 요금 결제 완료 전 승인 불가. Part B fee_plan 을 REGISTER 유형 최소 컬럼으로 선분리(전체 Part B 는 Phase 2). site_mst 는 ALTER 2컬럼. DA 사후 리뷰 대상 (2026-10-11)
-- 선행 : pi-db/000 → pi-db/010_pi_pymnt → sitemap.pi/001 → 002 → 003. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 설계 :
--  · fee_plan : 요금유형 REGISTER × 사이트 요금제(plan_cd) 1행 = 등록 심사비 단가(Pi). pi_amt = 0 이면 결제 없이 승인 가능(무료 요금제를 둘 때)
--  · site_mst.pymnt_id : 결제 완료(COMPLETED) 된 pi_pymnt 참조. 승인 API 는 외부 등록(own_site_yn='N')·단가 > 0 일 때 pymnt_id 필수
--  · fn_cmpl_site_reg_pymnt : complete 한 트랜잭션 — pi_pymnt COMPLETED + site_mst.pymnt_id/pay_dtm/plan_cd 기록(이미 결제된 사이트는 거부)
--  · 단가는 테스트넷 제안값 [확인중 : 마스터 확정, PRD §9 #3] — 값 변경은 UPDATE 로(코드 변경 불필요)
BEGIN;

-- ------------------------------------------------------------
-- 1. fee_plan — 요금표(REGISTER)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_plan (
  fee_plan_id   UUID          NOT NULL DEFAULT gen_random_uuid(),          -- 요금제ID
  fee_plan_cd   VARCHAR(30)   NOT NULL,                                    -- 요금제코드 (REG_VIP …)
  fee_tp_cd     VARCHAR(20)   NOT NULL,                                    -- 요금유형코드: REGISTER(등록 심사비)
  plan_cd       VARCHAR(10)   NOT NULL,                                    -- 사이트 요금제코드 (site_mst.plan_cd 와 동일 값)
  fee_plan_nm   TEXT          NOT NULL,                                    -- 요금제명(관리 표시용, 사용자 표시는 번역키 plan.<plan_cd>)
  pi_amt        NUMERIC(18,7) NOT NULL,                                    -- 단가(Pi). 0 = 결제 불필요
  use_yn        CHAR(1)       NOT NULL DEFAULT 'Y',                        -- 사용여부(판매 여부)
  sort_no       INTEGER       NOT NULL DEFAULT 0,                          -- 정렬순번
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fee_plan_pkey PRIMARY KEY (fee_plan_id),
  CONSTRAINT fee_plan_fee_plan_cd_key UNIQUE (fee_plan_cd),
  CONSTRAINT fee_plan_fee_tp_cd_check CHECK (fee_tp_cd IN ('REGISTER')),
  CONSTRAINT fee_plan_plan_cd_check CHECK (plan_cd IN ('VIP', 'PRM2', 'PRM1', 'BSC2', 'BSC1', 'NONE')),
  CONSTRAINT fee_plan_pi_amt_check CHECK (pi_amt >= 0),
  CONSTRAINT fee_plan_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT fee_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE fee_plan IS '요금표 — REGISTER(등록 심사비) × 사이트 요금제. 단가 변경은 UPDATE(코드 변경 없음). 전체 요금 모델(Part B)은 Phase 2 에서 확장';
-- 요금유형 × 사이트 요금제 활성 1건
CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_plan_fee_tp_plan_actv
  ON fee_plan (fee_tp_cd, plan_cd) WHERE del_yn = 'N';

CREATE OR REPLACE FUNCTION fn_upd_fee_plan_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fee_plan_mod_dtm ON fee_plan;
CREATE TRIGGER trg_fee_plan_mod_dtm
  BEFORE UPDATE ON fee_plan
  FOR EACH ROW EXECUTE FUNCTION fn_upd_fee_plan_mod_dtm();

-- 시드 — 테스트넷 제안 단가 [확인중 : 마스터 확정] (PRD §3-1 기간표 차용 : VIP 영구 / PRM2 5년 / PRM1 1년 / BSC2 12개월 / BSC1 6개월)
INSERT INTO fee_plan (fee_plan_cd, fee_tp_cd, plan_cd, fee_plan_nm, pi_amt, sort_no) VALUES
  ('REG_VIP',  'REGISTER', 'VIP',  '등록 심사비 — VIP 요금제',    270, 1),
  ('REG_PRM2', 'REGISTER', 'PRM2', '등록 심사비 — 프리미엄 2',    108, 2),
  ('REG_PRM1', 'REGISTER', 'PRM1', '등록 심사비 — 프리미엄 1',     54, 3),
  ('REG_BSC2', 'REGISTER', 'BSC2', '등록 심사비 — 기본 2',         27, 4),
  ('REG_BSC1', 'REGISTER', 'BSC1', '등록 심사비 — 기본 1',         15, 5)
ON CONFLICT (fee_plan_cd) DO NOTHING;

-- ------------------------------------------------------------
-- 2. site_mst — 결제 참조
-- ------------------------------------------------------------
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS pymnt_id TEXT;             -- 결제ID → pi_pymnt.pymnt_id (COMPLETED)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS pay_dtm  TIMESTAMPTZ;      -- 결제완료일시
COMMENT ON COLUMN site_mst.pymnt_id IS '등록 심사비 결제ID — fn_cmpl_site_reg_pymnt 만 기록. 외부 등록 승인은 이 값 필수(단가 > 0)';

ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_pi_pymnt_id_fkey;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (pymnt_id);
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_pay_dtm_check;
ALTER TABLE site_mst ADD  CONSTRAINT site_mst_pay_dtm_check CHECK ((pymnt_id IS NULL) = (pay_dtm IS NULL));
-- 결제 1건 = 사이트 1건
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_mst_pymnt_id_actv
  ON site_mst (pymnt_id) WHERE pymnt_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. 결제 완료 RPC — complete 한 트랜잭션
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cmpl_site_reg_pymnt(p_pymnt_id TEXT, p_tx_id TEXT)
RETURNS site_mst
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_p    pi_pymnt;
  v_s    site_mst;
  v_site UUID;
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = usr_id::TEXT
   WHERE pymnt_id = p_pymnt_id
     AND del_yn = 'N'
     AND pymnt_tp_cd = 'SITE_REG'
     AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 결제 없음 또는 상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002';
  END IF;

  v_site := (v_p.meta_val ->> 'site_id')::UUID;

  -- 멱등 : 같은 결제로 재호출은 통과, 다른 결제가 이미 기록된 사이트는 거부
  UPDATE site_mst
     SET pymnt_id = p_pymnt_id,
         pay_dtm  = COALESCE(pay_dtm, CURRENT_TIMESTAMP),
         plan_cd  = COALESCE(NULLIF(v_p.meta_val ->> 'plan_cd', ''), plan_cd),
         modr_id  = v_p.usr_id::TEXT
   WHERE site_id = v_site
     AND del_yn = 'N'
     AND ownr_usr_id = v_p.usr_id
     AND (pymnt_id IS NULL OR pymnt_id = p_pymnt_id)
  RETURNING * INTO v_s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 사이트 없음·소유자 불일치·이미 다른 결제 기록 (%)', v_site USING ERRCODE = 'P0003';
  END IF;

  RETURN v_s;
END;
$$;

SELECT fn_grant_svc_only('TABLE', 'fee_plan');
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_reg_pymnt(text, text)');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT plan_cd, pi_amt FROM fee_plan WHERE fee_tp_cd='REGISTER' AND del_yn='N' ORDER BY sort_no;   → 5행
-- SELECT count(*) FROM site_mst WHERE pymnt_id IS NOT NULL;                                            → 0 (적용 직후)
