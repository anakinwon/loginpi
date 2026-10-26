-- 004_seminar_smnr.sql — 세미나 마스터 + 참가(입장 등록) + 정원 잠금 입장 함수 (PRD v1.0 F-02·F-03·F-04)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-26) — 신규 접두사 smn_(세미나 주제영역) 신설, 테이블 2개(smn_smnr·smn_ptcp)·함수 1개. 칼럼은 기존 관용 용어(start_dtm·end_dtm·max_cnt·cncl_dtm·pi_amt) 승계, 객체 이름 DA 표준 §5 v2.5(pk_·x_NN). sys_user·pi_pymnt baseline 무변경. DA 사후 리뷰 대상
-- 선행 : packages/pi-db/sql/000_baseline.sql(sys_user·fn_grant_svc_only) · 010_pi_pymnt.sql(pi_pymnt). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
-- 설계 :
--  · smn_smnr — 세미나 1건. smnr_id = 화상 룸 ID(입장권 room). 상태 SCHEDULED → LIVE → ENDED, 개최자 취소 = CANCELED
--  · smn_ptcp — 참가(입장 등록) 1건. 무료 = "입장" 클릭 시, 유료 = pi_pymnt COMPLETED 시 생성. 사용자당 세미나 활성 1건
--  · 입장료 entr_pi_amt = Pi 소수(NUMERIC(18,7), pi_pymnt.pi_amt 와 같은 정밀도), 0 = 무료
--  · 정원 max_cnt 기본 30(M4 목표)·최대 100. 정원 경합은 fn_join_smn_smnr 이 세미나 행을 잠그고 판정(R-P5)
--  · 물리 DELETE 금지 — 참가 취소·세미나 삭제는 del_yn='Y'. 환불은 v1.0 자동화 없음(수동, PRD 9절)
BEGIN;

-- ------------------------------------------------------------
-- 1. smn_smnr — 세미나 마스터
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_smnr (
  smnr_id       UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 세미나ID (= 화상 룸 ID)
  host_usr_id   UUID          NOT NULL,                                   -- 개최자 사용자ID → sys_user.usr_id
  smnr_nm       VARCHAR(100)  NOT NULL,                                   -- 세미나명(제목)
  start_dtm     TIMESTAMPTZ   NOT NULL,                                   -- 시작일시(예정)
  end_dtm       TIMESTAMPTZ,                                              -- 종료일시(실제, ENDED 시 기록)
  cncl_dtm      TIMESTAMPTZ,                                              -- 취소일시(CANCELED 시 기록)
  max_cnt       INT           NOT NULL DEFAULT 30,                        -- 정원(청중 상한)
  entr_pi_amt   NUMERIC(18,7) NOT NULL DEFAULT 0,                         -- 입장 Pi 금액(0 = 무료)
  smnr_sts_cd   VARCHAR(20)   NOT NULL DEFAULT 'SCHEDULED',               -- 세미나상태코드: SCHEDULED → LIVE → ENDED | CANCELED
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_smnr PRIMARY KEY (smnr_id),
  CONSTRAINT smn_smnr_sys_user_id_fkey FOREIGN KEY (host_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_smnr_smnr_nm_check CHECK (length(btrim(smnr_nm)) > 0),
  CONSTRAINT smn_smnr_max_cnt_check CHECK (max_cnt BETWEEN 1 AND 100),
  CONSTRAINT smn_smnr_entr_pi_amt_check CHECK (entr_pi_amt >= 0),
  CONSTRAINT smn_smnr_smnr_sts_cd_check CHECK (smnr_sts_cd IN ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELED')),
  CONSTRAINT smn_smnr_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_smnr IS '세미나 마스터 — 1행 = 세미나 1건(smnr_id = 화상 룸 ID). 개설은 v1.0 에서 ADMIN 만';
COMMENT ON COLUMN smn_smnr.entr_pi_amt IS '입장 Pi 금액 — pi_pymnt.pi_amt 와 같은 NUMERIC(18,7). 0 = 무료. 서버가 이 값으로 결제 금액을 재검증';
COMMENT ON COLUMN smn_smnr.max_cnt IS '정원 — 청중(참가 등록) 상한, 기본 30·최대 100. 개최자·발표자는 세지 않음';

-- 목록(S1 전체 탭) : 상태 + 시작일시 정렬
CREATE INDEX IF NOT EXISTS x_smn_smnr_01
  ON smn_smnr (smnr_sts_cd, start_dtm) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_smnr_01 IS '목록 — 상태별 시작일시 순(S1 전체 탭, 서버 페이지네이션)';
-- 목록(S1 내가 연 것 탭) : 개최자 + 시작일시
CREATE INDEX IF NOT EXISTS x_smn_smnr_02
  ON smn_smnr (host_usr_id, start_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_smnr_02 IS '목록 — 내가 연 것(개최자별 시작일시 역순)';

CREATE OR REPLACE FUNCTION fn_upd_smn_smnr_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_smn_smnr_mod_dtm ON smn_smnr;
CREATE TRIGGER trg_smn_smnr_mod_dtm
  BEFORE UPDATE ON smn_smnr
  FOR EACH ROW EXECUTE FUNCTION fn_upd_smn_smnr_mod_dtm();

-- ------------------------------------------------------------
-- 2. smn_ptcp — 세미나 참가(입장 등록)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_ptcp (
  ptcp_id       UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 참가ID
  smnr_id       UUID          NOT NULL,                                   -- 세미나ID → smn_smnr.smnr_id
  usr_id        UUID          NOT NULL,                                   -- 참가자 사용자ID → sys_user.usr_id
  pymnt_id      TEXT,                                                     -- 결제ID → pi_pymnt.pymnt_id (무료 = NULL)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부(참가 취소)
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시(= 입장 등록 일시)
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_ptcp PRIMARY KEY (ptcp_id),
  CONSTRAINT smn_ptcp_smn_smnr_id_fkey FOREIGN KEY (smnr_id) REFERENCES smn_smnr (smnr_id),
  CONSTRAINT smn_ptcp_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_ptcp_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (pymnt_id),
  CONSTRAINT smn_ptcp_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_ptcp IS '세미나 참가(입장 등록) — 무료는 입장 클릭 시, 유료는 결제 COMPLETED 시 생성. 유료 세미나 청중 입장권 발급 조건';
COMMENT ON COLUMN smn_ptcp.pymnt_id IS '결제ID — 유료 입장의 pi_pymnt(pymnt_tp_cd=SMNR_ENTR) 1건. 무료 입장은 NULL';

-- 사용자당 세미나 활성 참가 1건 + 세미나별 참가자 수(정원) 집계
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_ptcp_01
  ON smn_ptcp (smnr_id, usr_id) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_ptcp_01 IS '유일 — 세미나·사용자 활성 참가 1건, 정원 집계(smnr_id 선두)';
-- 목록(S1 내가 참가한 것 탭)
CREATE INDEX IF NOT EXISTS x_smn_ptcp_02
  ON smn_ptcp (usr_id, reg_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_ptcp_02 IS '목록 — 내가 참가한 것(사용자별 등록일시 역순)';
-- 결제 1건 = 참가 1건(complete 재호출 중복 차단)
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_ptcp_03
  ON smn_ptcp (pymnt_id) WHERE pymnt_id IS NOT NULL;
COMMENT ON INDEX x_smn_ptcp_03 IS '유일 — 결제ID 당 참가 1건';

CREATE OR REPLACE FUNCTION fn_upd_smn_ptcp_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_smn_ptcp_mod_dtm ON smn_ptcp;
CREATE TRIGGER trg_smn_ptcp_mod_dtm
  BEFORE UPDATE ON smn_ptcp
  FOR EACH ROW EXECUTE FUNCTION fn_upd_smn_ptcp_mod_dtm();

-- ------------------------------------------------------------
-- 3. fn_join_smn_smnr — 입장 등록(정원 경합 차단, R-P5)
--    세미나 행을 FOR UPDATE 로 잠근 뒤 상태·정원·중복을 판정하고 참가 1행을 만든다
--    반환 rslt_cd : OK(신규) · ALREADY(이미 참가 — 기존 ptcp_id) · NOT_FOUND · CLOSED(ENDED·CANCELED) · FULL · PAY_REQUIRED(유료인데 결제ID 없음)
--    유료(p_pymnt_id 있음)는 정원 초과여도 등록 — 결제가 이미 끝났고 자동 환불이 없으므로. 정원 판정은 approve 단계에서 앱이 먼저 한다
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_join_smn_smnr(p_smnr_id UUID, p_usr_id UUID, p_pymnt_id TEXT DEFAULT NULL)
RETURNS TABLE (rslt_cd TEXT, ptcp_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_smnr smn_smnr%ROWTYPE;
  v_ptcp_id UUID;
  v_cnt INT;
BEGIN
  SELECT * INTO v_smnr FROM smn_smnr s
   WHERE s.smnr_id = p_smnr_id AND s.del_yn = 'N'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::UUID; RETURN;
  END IF;

  SELECT p.ptcp_id INTO v_ptcp_id FROM smn_ptcp p
   WHERE p.smnr_id = p_smnr_id AND p.usr_id = p_usr_id AND p.del_yn = 'N';
  IF FOUND THEN
    RETURN QUERY SELECT 'ALREADY'::TEXT, v_ptcp_id; RETURN;
  END IF;

  IF v_smnr.smnr_sts_cd IN ('ENDED', 'CANCELED') THEN
    RETURN QUERY SELECT 'CLOSED'::TEXT, NULL::UUID; RETURN;
  END IF;
  IF v_smnr.entr_pi_amt > 0 AND p_pymnt_id IS NULL THEN
    RETURN QUERY SELECT 'PAY_REQUIRED'::TEXT, NULL::UUID; RETURN;
  END IF;
  IF p_pymnt_id IS NULL THEN
    SELECT count(*) INTO v_cnt FROM smn_ptcp p WHERE p.smnr_id = p_smnr_id AND p.del_yn = 'N';
    IF v_cnt >= v_smnr.max_cnt THEN
      RETURN QUERY SELECT 'FULL'::TEXT, NULL::UUID; RETURN;
    END IF;
  END IF;

  INSERT INTO smn_ptcp (smnr_id, usr_id, pymnt_id, regr_id, modr_id)
  VALUES (p_smnr_id, p_usr_id, p_pymnt_id, p_usr_id::TEXT, p_usr_id::TEXT)
  RETURNING smn_ptcp.ptcp_id INTO v_ptcp_id;
  RETURN QUERY SELECT 'OK'::TEXT, v_ptcp_id;
END;
$$;
COMMENT ON FUNCTION fn_join_smn_smnr(UUID, UUID, TEXT) IS '세미나 입장 등록 — 세미나 행 잠금 후 상태·정원·중복 판정(R-P5). rslt_cd OK·ALREADY·NOT_FOUND·CLOSED·FULL·PAY_REQUIRED';

-- ------------------------------------------------------------
-- 4. 권한 — 서버 전용 service_role (anon·authenticated 회수)
-- ------------------------------------------------------------
SELECT fn_grant_svc_only('TABLE', 'smn_smnr');
SELECT fn_grant_svc_only('TABLE', 'smn_ptcp');
SELECT fn_grant_svc_only('FUNCTION', 'fn_join_smn_smnr(UUID, UUID, TEXT)');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT count(*) FROM smn_smnr;                                            → 0
-- INSERT INTO smn_smnr (host_usr_id, smnr_nm, start_dtm, max_cnt) VALUES ('<usr_id>', 't', now(), 101); → 23514(정원 CHECK)
-- SELECT * FROM fn_join_smn_smnr(gen_random_uuid(), '<usr_id>');           → NOT_FOUND
