-- 049_area_plan.sql : 분류체계 요금제(마스터 표 2026-10-18·결정 2026-10-19) — Pi 결제 원장·요금표·분류체계 요금제 기간·결제 반영 함수(유예는 050 — 운영 배포 때 적용)
-- DA-APPROVED: 마스터 지시 2026-10-18 '권한·요금제 표' + 결정 2026-10-19(결제 = DA·SYS, 배포 시 기존 분류체계 1주일 요금제4 유예, 테스트넷)
--  pi_pymnt = @pi/db 010 공용 원장 정의 그대로(DA 표준명 승계). 신규 약어 PRD(주기)·GRNT(부여) 표준단어 [확인중 : da-standards]
-- 설계 :
--  · 요금제코드 plan_cd = P1 개발자 / P2 표준담당자 / P3 모델러 / P4 DA (권한은 코드 src/lib/roles.ts PLAN_PERMS 가 정본, 가격만 DB)
--  · sys_fee_plan 1행 = 요금제 × 주기(M 월·Y 년) 가격. 서버가 이 표로 정가를 다시 계산해 결제 금액과 맞춤(클라이언트 금액 불신)
--  · std_area_plan 1행 = 분류체계 요금제 기간 1건(결제 1건 또는 유예). 현재 요금제 = 기간 안 행 중 가장 높은 요금제, 없으면 FREE
--  · fn_area_plan_grant(결제ID) = 완료 결제 → 기간 행 1건(같은 결제 두 번 반영 불가 : pymnt_id UNIQUE). 같은 요금제 재결제 = 그 요금제 최신 종료일 뒤로 연장, 다른 요금제 = 지금부터
BEGIN;

-- 1. Pi U2A 결제 원장(@pi/db 010 과 같은 정의)
CREATE TABLE IF NOT EXISTS pi_pymnt (
  pymnt_id      TEXT          NOT NULL,                                    -- 결제ID (Pi Platform payment identifier)
  usr_id        UUID          NOT NULL,                                    -- 결제자 사용자ID → sys_user.usr_id
  pi_uid        TEXT,                                                      -- 결제 시점 Pi uid (앱 scoped, 참고용)
  pi_amt        NUMERIC(18,7) NOT NULL,                                    -- 결제금액(Pi)
  memo_txt      TEXT,                                                      -- 결제 메모(SDK memo)
  meta_val      JSONB         NOT NULL DEFAULT '{}'::jsonb,                -- SDK metadata 원문
  pymnt_tp_cd   VARCHAR(20)   NOT NULL,                                    -- 결제유형코드 (= meta.type, 예: AREA_PLAN)
  pymnt_sts_cd  VARCHAR(20)   NOT NULL DEFAULT 'APPROVED',                 -- 결제상태코드: APPROVED → COMPLETED | CANCELED
  tx_id         TEXT,                                                      -- 블록체인 거래ID (complete 시)
  apv_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 승인일시(서버 approve)
  cmpl_dtm      TIMESTAMPTZ,                                               -- 완료일시
  cncl_dtm      TIMESTAMPTZ,                                               -- 취소일시
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT pi_pymnt_pkey PRIMARY KEY (pymnt_id),
  CONSTRAINT pi_pymnt_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT pi_pymnt_pi_amt_check CHECK (pi_amt > 0),
  CONSTRAINT pi_pymnt_pymnt_sts_cd_check CHECK (pymnt_sts_cd IN ('APPROVED', 'COMPLETED', 'CANCELED')),
  CONSTRAINT pi_pymnt_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE pi_pymnt IS 'Pi U2A 결제 원장 — 1행 = Pi Platform 결제 1건. 서버 approve 로 생성(APPROVED), complete 로 COMPLETED';
CREATE INDEX IF NOT EXISTS idx_pi_pymnt_usr_id ON pi_pymnt (usr_id);
CREATE INDEX IF NOT EXISTS idx_pi_pymnt_pymnt_tp_cd_sts ON pi_pymnt (pymnt_tp_cd, pymnt_sts_cd);
SELECT fn_add_mod_dtm_trg('pi_pymnt'), fn_grant_svc_only('TABLE', 'pi_pymnt');

-- 2. 요금표 — 요금제 × 주기
CREATE TABLE IF NOT EXISTS sys_fee_plan (
  plan_cd       VARCHAR(10)   NOT NULL,                                    -- 요금제코드 P1~P4
  prd_cd        CHAR(1)       NOT NULL,                                    -- 주기코드 M 월 / Y 년
  plan_nm       VARCHAR(100)  NOT NULL,                                    -- 요금제명
  pi_amt        NUMERIC(18,7) NOT NULL,                                    -- 가격(Pi)
  use_mon_cnt   INT           NOT NULL,                                    -- 사용개월수(M=1, Y=12)
  sort_seq      INT           NOT NULL DEFAULT 0,                          -- 정렬순서
  use_yn        CHAR(1)       NOT NULL DEFAULT 'Y',                        -- 사용여부
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT sys_fee_plan_pkey PRIMARY KEY (plan_cd, prd_cd),
  CONSTRAINT sys_fee_plan_plan_cd_check CHECK (plan_cd IN ('P1', 'P2', 'P3', 'P4')),
  CONSTRAINT sys_fee_plan_prd_cd_check CHECK (prd_cd IN ('M', 'Y')),
  CONSTRAINT sys_fee_plan_pi_amt_check CHECK (pi_amt > 0),
  CONSTRAINT sys_fee_plan_use_mon_cnt_check CHECK (use_mon_cnt > 0),
  CONSTRAINT sys_fee_plan_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT sys_fee_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE sys_fee_plan IS '분류체계 요금표 — 1행 = 요금제 × 주기 가격(Pi). 권한은 코드(roles.ts PLAN_PERMS)';
SELECT fn_add_mod_dtm_trg('sys_fee_plan'), fn_grant_svc_only('TABLE', 'sys_fee_plan');
INSERT INTO sys_fee_plan (plan_cd, prd_cd, plan_nm, pi_amt, use_mon_cnt, sort_seq) VALUES
  ('P1', 'M', '개발자',     10,  1, 11), ('P1', 'Y', '개발자',     100, 12, 12),
  ('P2', 'M', '표준담당자', 20,  1, 21), ('P2', 'Y', '표준담당자', 200, 12, 22),
  ('P3', 'M', '모델러',     30,  1, 31), ('P3', 'Y', '모델러',     300, 12, 32),
  ('P4', 'M', 'DA',         50,  1, 41), ('P4', 'Y', 'DA',         500, 12, 42)
ON CONFLICT (plan_cd, prd_cd) DO NOTHING;

-- 3. 분류체계 요금제 기간
CREATE TABLE IF NOT EXISTS std_area_plan (
  area_plan_id  UUID          NOT NULL DEFAULT gen_random_uuid(),          -- 분류체계요금제ID
  area_id       UUID          NOT NULL,                                    -- 분류체계ID → std_area
  plan_cd       VARCHAR(10)   NOT NULL,                                    -- 요금제코드 P1~P4
  prd_cd        CHAR(1),                                                   -- 주기코드(결제 = M·Y, 유예 = NULL)
  strt_dtm      TIMESTAMPTZ   NOT NULL,                                    -- 시작일시
  end_dtm       TIMESTAMPTZ   NOT NULL,                                    -- 종료일시(이 시각 전까지 사용)
  grnt_rsn_cd   VARCHAR(10)   NOT NULL,                                    -- 부여사유코드 PAY 결제 / GRACE 유예
  pymnt_id      TEXT,                                                      -- 결제ID → pi_pymnt(유예 = NULL)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT std_area_plan_pkey PRIMARY KEY (area_plan_id),
  CONSTRAINT std_area_plan_std_area_id_fkey FOREIGN KEY (area_id) REFERENCES std_area (area_id),
  CONSTRAINT std_area_plan_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (pymnt_id),
  CONSTRAINT std_area_plan_pymnt_id_key UNIQUE (pymnt_id), -- 같은 결제 두 번 반영 불가
  CONSTRAINT std_area_plan_plan_cd_check CHECK (plan_cd IN ('P1', 'P2', 'P3', 'P4')),
  CONSTRAINT std_area_plan_prd_cd_check CHECK (prd_cd IN ('M', 'Y')),
  CONSTRAINT std_area_plan_grnt_rsn_cd_check CHECK ((grnt_rsn_cd = 'PAY' AND pymnt_id IS NOT NULL AND prd_cd IS NOT NULL) OR (grnt_rsn_cd = 'GRACE' AND pymnt_id IS NULL)),
  CONSTRAINT std_area_plan_dtm_check CHECK (end_dtm > strt_dtm),
  CONSTRAINT std_area_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE std_area_plan IS '분류체계 요금제 기간 — 1행 = 결제 1건 또는 유예. 현재 요금제 = 기간 안 행 중 가장 높은 요금제(없으면 FREE)';
CREATE INDEX IF NOT EXISTS idx_std_area_plan_area_end ON std_area_plan (area_id, end_dtm DESC) WHERE del_yn = 'N';
SELECT fn_add_mod_dtm_trg('std_area_plan'), fn_grant_svc_only('TABLE', 'std_area_plan');

-- 4. 결제 반영 — 완료 결제 1건 → 기간 1행(재호출 = 같은 행 반환)
CREATE OR REPLACE FUNCTION fn_area_plan_grant(p_pymnt_id TEXT)
RETURNS std_area_plan
LANGUAGE plpgsql
AS $$
DECLARE
  v_p   pi_pymnt;
  v_f   sys_fee_plan;
  v_r   std_area_plan;
  v_a   UUID;
  v_cd  TEXT;
  v_prd TEXT;
  v_base TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_r FROM std_area_plan WHERE pymnt_id = p_pymnt_id;
  IF FOUND THEN RETURN v_r; END IF;
  SELECT * INTO v_p FROM pi_pymnt WHERE pymnt_id = p_pymnt_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR v_p.pymnt_sts_cd <> 'COMPLETED' OR v_p.pymnt_tp_cd <> 'AREA_PLAN' THEN
    RAISE EXCEPTION 'area_plan_pymnt: 완료된 요금제 결제가 아닙니다' USING ERRCODE = 'MPL01';
  END IF;
  v_a := (v_p.meta_val->>'area_id')::uuid;
  v_cd := v_p.meta_val->>'plan_cd';
  v_prd := v_p.meta_val->>'prd_cd';
  SELECT * INTO v_f FROM sys_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd AND del_yn = 'N';
  IF NOT FOUND OR abs(v_f.pi_amt - v_p.pi_amt) > 0.000001 THEN
    RAISE EXCEPTION 'area_plan_amt: 요금표와 결제 금액이 다릅니다' USING ERRCODE = 'MPL01';
  END IF;
  PERFORM 1 FROM std_area WHERE area_id = v_a AND del_yn = 'N' FOR UPDATE; -- 같은 분류체계 동시 결제 직렬화
  IF NOT FOUND THEN RAISE EXCEPTION 'area_plan_area: 분류체계가 없습니다' USING ERRCODE = 'MPL01'; END IF;
  SELECT GREATEST(CURRENT_TIMESTAMP, COALESCE(max(end_dtm), CURRENT_TIMESTAMP)) INTO v_base
    FROM std_area_plan WHERE area_id = v_a AND plan_cd = v_cd AND del_yn = 'N';
  INSERT INTO std_area_plan (area_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
  VALUES (v_a, v_cd, v_prd, v_base, v_base + make_interval(months => v_f.use_mon_cnt), 'PAY', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
  RETURNING * INTO v_r;
  RETURN v_r;
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_area_plan_grant(text)');

-- 5. 결제 완료 = 원장 COMPLETED + 기간 반영(한 트랜잭션, 재호출 = 같은 행). 결제자 본인 원장만(다른 사람 결제ID·txid 재생 차단)
CREATE OR REPLACE FUNCTION fn_cmpl_area_plan_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS std_area_plan
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED', tx_id = COALESCE(tx_id, p_tx_id), cmpl_dtm = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP), modr_id = p_usr_id::text
   WHERE pymnt_id = p_pymnt_id AND usr_id = p_usr_id AND del_yn = 'N' AND pymnt_sts_cd IN ('APPROVED', 'COMPLETED');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'area_plan_pymnt: 본인의 승인된 결제가 아닙니다' USING ERRCODE = 'MPL01';
  END IF;
  RETURN fn_area_plan_grant(p_pymnt_id);
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_area_plan_pymnt(text, text, uuid)');

COMMIT;

NOTIFY pgrst, 'reload schema';
