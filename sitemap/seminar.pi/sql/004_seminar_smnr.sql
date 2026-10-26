-- 004_seminar_smnr.sql — 세미나 마스터 + 참가(입장 등록) + 결제 검증 입장 함수 + 정원 확인 함수 (PRD v1.0 F-02·F-03·F-04)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-26) — 신규 접두사 smn_(세미나 주제영역) 신설, 테이블 2개(smn_mst·smn_ptc)·함수 2개(fn_join_smn·fn_chk_smn_cap). 객체 이름 DA 표준 §5 v2.5(pk_·x_NN). sys_user·pi_pymnt baseline 무변경. DA 사후 리뷰 대상
-- 선행 : packages/pi-db/sql/000_baseline.sql(sys_user·fn_grant_svc_only) · 010_pi_pymnt.sql(pi_pymnt). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
--
-- 신규 표준단어(자음 위주 2~3자, 데이터표준규칙 §1-1 — 아소카 결정, DA 사후 리뷰 시 §9 등재) :
--  · 세미나 SMN (Seminar)        — 접두사 smn_ · smn_id · smn_nm · smn_sts_cd
--  · 참가   PTC (Participation)  — smn_ptc · ptc_id
--  · 입장   ENT (Entrance)       — ent_pi_amt · 결제유형 SMN_ENT  ⚠ 행안부 공통표준단어 '기업'=ENT 와 동음 — 사후 리뷰 대상
--  · 개최자 HST (Host)           — hst_usr_id                    (행안부 '주최'=HST 와 같은 뜻 계열)
--  · 점검 CHK · 정원 CAP         — 함수명 전용(fn_chk_smn_cap), 칼럼 미사용
--  · 마스터 MST                  — 기존 관용(i18n_cntry_mst·i18n_lang_mst) 승계
--  기존 관용어 그대로 승계 : start_dtm · end_dtm · cncl_dtm · max_cnt · pi_amt · usr_id · pymnt_id
--
-- 설계 :
--  · smn_mst — 세미나 1건. smn_id = 화상 룸 ID(입장권 room). 상태 SCHEDULED → LIVE → ENDED, 개최자 취소 = CANCELED
--  · smn_ptc — 참가(입장 등록) 1건. 무료 = "입장" 클릭 시, 유료 = pi_pymnt COMPLETED 시 생성. 사용자당 세미나 활성 1건
--  · 입장료 ent_pi_amt = Pi 소수(NUMERIC(18,7), pi_pymnt.pi_amt 와 같은 정밀도), 0 = 무료
--  · 유료 결제 계약(PRD D-10) : pi_pymnt.pymnt_tp_cd = 'SMN_ENT', meta_val = {"type":"SMN_ENT","smn_id":"<smn_id>"}
--  · 정원 max_cnt 기본 30(M4 목표)·최대 100. 정원 경합은 두 함수가 세미나 행을 FOR UPDATE 로 잠그고 판정(R-P5, PRD D-6)
--  · 함수 search_path 는 생성 스키마(current_schema())로 고정 — dev·stg·prod 가 같은 프로젝트의 다른 스키마라서 호출자 경로에 흔들리지 않게
--  · 물리 DELETE 금지 — 참가 취소·세미나 삭제는 del_yn='Y'. 환불은 v1.0 자동화 없음(수동, PRD 9절)
--
-- ⚠ 1회성 재설정(2026-10-26, 아소카 결정) : 이 파일의 첫 판(smn_smnr·smn_ptcp·fn_join_smn_smnr)이 seminar_dev·seminar_stg 에
--   적용된 뒤 표준단어 통일로 이 자리에서 다시 썼다(public 은 첫 판 미적용). 두 스키마에서 행 0건 확인 후 한 트랜잭션으로
--   첫 판 객체(테이블 2·함수 3·트리거 2)를 DROP 하고 schema_migrations 의 이 파일 1행만 지워 재적용했다.
--   행이 1건이라도 있으면 중단하는 조건이었고, 건드린 것은 빈 신규 객체뿐이다. 이후 이 파일 변경은 새 NNN 파일로.
BEGIN;

-- ------------------------------------------------------------
-- 1. smn_mst — 세미나 마스터
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_mst (
  smn_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 세미나ID (= 화상 룸 ID)
  hst_usr_id    UUID          NOT NULL,                                   -- 개최자 사용자ID → sys_user.usr_id
  smn_nm        VARCHAR(100)  NOT NULL,                                   -- 세미나명(제목)
  start_dtm     TIMESTAMPTZ   NOT NULL,                                   -- 시작일시(예정)
  end_dtm       TIMESTAMPTZ,                                              -- 종료일시(실제, ENDED 시 기록)
  cncl_dtm      TIMESTAMPTZ,                                              -- 취소일시(CANCELED 시 기록)
  max_cnt       INT           NOT NULL DEFAULT 30,                        -- 정원(청중 상한)
  ent_pi_amt    NUMERIC(18,7) NOT NULL DEFAULT 0,                         -- 입장 Pi 금액(0 = 무료)
  smn_sts_cd    VARCHAR(20)   NOT NULL DEFAULT 'SCHEDULED',               -- 세미나상태코드: SCHEDULED → LIVE → ENDED | CANCELED
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_mst PRIMARY KEY (smn_id),
  CONSTRAINT smn_mst_sys_user_id_fkey FOREIGN KEY (hst_usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_mst_smn_nm_check CHECK (length(btrim(smn_nm)) > 0),
  CONSTRAINT smn_mst_max_cnt_check CHECK (max_cnt BETWEEN 1 AND 100),
  CONSTRAINT smn_mst_ent_pi_amt_check CHECK (ent_pi_amt >= 0),
  CONSTRAINT smn_mst_smn_sts_cd_check CHECK (smn_sts_cd IN ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELED')),
  CONSTRAINT smn_mst_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_mst IS '세미나 마스터 — 1행 = 세미나 1건(smn_id = 화상 룸 ID). 개설은 v1.0 에서 ADMIN 만';
COMMENT ON COLUMN smn_mst.ent_pi_amt IS '입장 Pi 금액 — pi_pymnt.pi_amt 와 같은 NUMERIC(18,7). 0 = 무료. fn_join_smn 이 결제 금액과 정확히 일치하는지 재검증';
COMMENT ON COLUMN smn_mst.max_cnt IS '정원 — 청중(참가 등록) 상한, 기본 30·최대 100. 개최자·발표자는 세지 않음';

-- 목록(S1 전체 탭) : 예정·진행 중만, 시작일시 순 — ORDER BY start_dtm LIMIT n 을 정렬 없이 인덱스 순서로 끊어 읽는다.
-- (상태 선두 복합 인덱스는 IN 2값이라 정렬 단계가 남고, S1 에 상태별·종료 목록 탭이 없어 두지 않음)
CREATE INDEX IF NOT EXISTS x_smn_mst_01
  ON smn_mst (start_dtm) WHERE del_yn = 'N' AND smn_sts_cd IN ('SCHEDULED', 'LIVE');
COMMENT ON INDEX x_smn_mst_01 IS '목록 — 예정·진행 중 세미나 시작일시 순(S1 전체 탭, 서버 페이지네이션)';
-- 목록(S1 내가 연 것 탭) : 개최자 + 시작일시
CREATE INDEX IF NOT EXISTS x_smn_mst_02
  ON smn_mst (hst_usr_id, start_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_mst_02 IS '목록 — 내가 연 것(개최자별 시작일시 역순)';

CREATE OR REPLACE FUNCTION fn_upd_smn_mst_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_smn_mst_mod_dtm ON smn_mst;
CREATE TRIGGER trg_smn_mst_mod_dtm
  BEFORE UPDATE ON smn_mst
  FOR EACH ROW EXECUTE FUNCTION fn_upd_smn_mst_mod_dtm();

-- ------------------------------------------------------------
-- 2. smn_ptc — 세미나 참가(입장 등록)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smn_ptc (
  ptc_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 참가ID
  smn_id        UUID          NOT NULL,                                   -- 세미나ID → smn_mst.smn_id
  usr_id        UUID          NOT NULL,                                   -- 참가자 사용자ID → sys_user.usr_id
  pymnt_id      TEXT,                                                     -- 결제ID → pi_pymnt.pymnt_id (무료 = NULL)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부(참가 취소)
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시(= 입장 등록 일시)
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_ptc PRIMARY KEY (ptc_id),
  CONSTRAINT smn_ptc_smn_mst_id_fkey FOREIGN KEY (smn_id) REFERENCES smn_mst (smn_id),
  CONSTRAINT smn_ptc_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_ptc_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (pymnt_id),
  CONSTRAINT smn_ptc_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE  smn_ptc IS '세미나 참가(입장 등록) — 무료는 입장 클릭 시, 유료는 결제 COMPLETED 시 생성. 유료 세미나 청중 입장권 발급 조건';
COMMENT ON COLUMN smn_ptc.pymnt_id IS '결제ID — 유료 입장의 pi_pymnt(pymnt_tp_cd=SMN_ENT) 1건. 무료 입장은 NULL';

-- 사용자당 세미나 활성 참가 1건 + 세미나별 참가자 수(정원) 집계
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_ptc_01
  ON smn_ptc (smn_id, usr_id) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_ptc_01 IS '유일 — 세미나·사용자 활성 참가 1건, 정원 집계(smn_id 선두)';
-- 목록(S1 내가 참가한 것 탭)
CREATE INDEX IF NOT EXISTS x_smn_ptc_02
  ON smn_ptc (usr_id, reg_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_ptc_02 IS '목록 — 내가 참가한 것(사용자별 등록일시 역순)';
-- 결제 1건 = 참가 1건(취소된 참가 포함 — 같은 결제로 재등록 불가, complete 재호출 중복 차단)
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_ptc_03
  ON smn_ptc (pymnt_id) WHERE pymnt_id IS NOT NULL;
COMMENT ON INDEX x_smn_ptc_03 IS '유일 — 결제ID 당 참가 1건';

CREATE OR REPLACE FUNCTION fn_upd_smn_ptc_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_smn_ptc_mod_dtm ON smn_ptc;
CREATE TRIGGER trg_smn_ptc_mod_dtm
  BEFORE UPDATE ON smn_ptc
  FOR EACH ROW EXECUTE FUNCTION fn_upd_smn_ptc_mod_dtm();

-- ------------------------------------------------------------
-- 3. fn_chk_smn_cap — 유료 approve 단계 정원 확인(PRD D-6)
--    세미나 행을 FOR UPDATE 로 잠그고 [활성 참가 + 10분 안의 APPROVED SMN_ENT 결제(진행 중 좌석 점유)] 를 정원과 비교
--    반환 rslt_cd : OK · FULL · CLOSED(ENDED·CANCELED) · NOT_FOUND · ALREADY(이미 참가 — 이중 결제 차단)
--    p_pymnt_id = 이번 approve 의 결제ID(이미 APPROVED 로 넣었으면 자기 점유는 빼고 센다). 순서 권장 : pi_pymnt APPROVED 기록 → 이 함수
--    점유 10분 = Pi U2A 미완료 결제 만료 기준. 초과 등록 상한 = 10분 넘겨 complete 된 결제 수(실무상 0)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_chk_smn_cap(p_smn_id UUID, p_usr_id UUID, p_pymnt_id TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_cnt INT;
  v_hld INT;
BEGIN
  SELECT * INTO v_smn FROM smn_mst s
   WHERE s.smn_id = p_smn_id AND s.del_yn = 'N'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_smn.smn_sts_cd IN ('ENDED', 'CANCELED') THEN RETURN 'CLOSED'; END IF;
  IF EXISTS (SELECT 1 FROM smn_ptc p
              WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N') THEN
    RETURN 'ALREADY';
  END IF;

  SELECT count(*) INTO v_cnt FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.del_yn = 'N';
  SELECT count(*) INTO v_hld FROM pi_pymnt y
   WHERE y.pymnt_tp_cd = 'SMN_ENT' AND y.pymnt_sts_cd = 'APPROVED' AND y.del_yn = 'N'
     AND y.meta_val ->> 'smn_id' = p_smn_id::TEXT
     AND y.reg_dtm > CURRENT_TIMESTAMP - INTERVAL '10 minutes'
     AND y.pymnt_id IS DISTINCT FROM p_pymnt_id;
  IF v_cnt + v_hld >= v_smn.max_cnt THEN RETURN 'FULL'; END IF;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_chk_smn_cap(UUID, UUID, TEXT) IS '유료 입장 approve 단계 정원 확인 — 세미나 행 잠금 후 활성 참가+10분 APPROVED 점유 vs 정원. OK·FULL·CLOSED·NOT_FOUND·ALREADY';

-- ------------------------------------------------------------
-- 4. fn_join_smn — 입장 등록(결제 검증 + 정원 경합 차단, R-P5)
--    세미나 행을 FOR UPDATE 로 잠근 뒤 상태·중복·결제·정원을 판정하고 참가 1행을 만든다
--    반환 rslt_cd : OK(신규) · ALREADY(이미 참가 — 기존 ptc_id) · NOT_FOUND · CLOSED(ENDED·CANCELED) · FULL
--                   · PAY_REQUIRED(유료인데 결제ID 없음) · PAY_INVALID(결제가 본인·COMPLETED·SMN_ENT·금액·세미나 중 하나라도 불일치,
--                     이미 다른 참가에 쓰인 결제, 무료 세미나에 결제ID)
--    정원 생략 = 유료(ent_pi_amt > 0)이고 결제가 유효할 때만 — 결제가 끝난 사람은 막지 않음(정원은 approve 단계 fn_chk_smn_cap)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_join_smn(p_smn_id UUID, p_usr_id UUID, p_pymnt_id TEXT DEFAULT NULL)
RETURNS TABLE (rslt_cd TEXT, ptc_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_smn smn_mst%ROWTYPE;
  v_ptc_id UUID;
  v_cnt INT;
BEGIN
  SELECT * INTO v_smn FROM smn_mst s
   WHERE s.smn_id = p_smn_id AND s.del_yn = 'N'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::UUID; RETURN;
  END IF;

  SELECT p.ptc_id INTO v_ptc_id FROM smn_ptc p
   WHERE p.smn_id = p_smn_id AND p.usr_id = p_usr_id AND p.del_yn = 'N';
  IF FOUND THEN
    RETURN QUERY SELECT 'ALREADY'::TEXT, v_ptc_id; RETURN;
  END IF;

  IF v_smn.smn_sts_cd IN ('ENDED', 'CANCELED') THEN
    RETURN QUERY SELECT 'CLOSED'::TEXT, NULL::UUID; RETURN;
  END IF;

  IF v_smn.ent_pi_amt > 0 THEN
    IF p_pymnt_id IS NULL THEN
      RETURN QUERY SELECT 'PAY_REQUIRED'::TEXT, NULL::UUID; RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pi_pymnt y
                    WHERE y.pymnt_id = p_pymnt_id
                      AND y.usr_id = p_usr_id
                      AND y.pymnt_sts_cd = 'COMPLETED'
                      AND y.pymnt_tp_cd = 'SMN_ENT'
                      AND y.pi_amt = v_smn.ent_pi_amt
                      AND y.meta_val ->> 'smn_id' = p_smn_id::TEXT
                      AND y.del_yn = 'N')
       OR EXISTS (SELECT 1 FROM smn_ptc p WHERE p.pymnt_id = p_pymnt_id) THEN
      RETURN QUERY SELECT 'PAY_INVALID'::TEXT, NULL::UUID; RETURN;
    END IF;
  ELSE
    IF p_pymnt_id IS NOT NULL THEN
      RETURN QUERY SELECT 'PAY_INVALID'::TEXT, NULL::UUID; RETURN;
    END IF;
    SELECT count(*) INTO v_cnt FROM smn_ptc p WHERE p.smn_id = p_smn_id AND p.del_yn = 'N';
    IF v_cnt >= v_smn.max_cnt THEN
      RETURN QUERY SELECT 'FULL'::TEXT, NULL::UUID; RETURN;
    END IF;
  END IF;

  INSERT INTO smn_ptc (smn_id, usr_id, pymnt_id, regr_id, modr_id)
  VALUES (p_smn_id, p_usr_id, p_pymnt_id, p_usr_id::TEXT, p_usr_id::TEXT)
  RETURNING smn_ptc.ptc_id INTO v_ptc_id;
  RETURN QUERY SELECT 'OK'::TEXT, v_ptc_id;
END;
$$;
COMMENT ON FUNCTION fn_join_smn(UUID, UUID, TEXT) IS '세미나 입장 등록 — 세미나 행 잠금 후 상태·중복·결제·정원 판정(R-P5). rslt_cd OK·ALREADY·NOT_FOUND·CLOSED·FULL·PAY_REQUIRED·PAY_INVALID';

-- 함수 search_path = 생성 스키마 고정(db-migrate 가 SET search_path TO <대상 스키마> 후 실행 → current_schema() = 대상)
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_chk_smn_cap(UUID, UUID, TEXT) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_join_smn(UUID, UUID, TEXT) SET search_path = %I, pg_temp', current_schema());
END;
$$;

-- ------------------------------------------------------------
-- 5. 권한 — 서버 전용 service_role (anon·authenticated 회수)
-- ------------------------------------------------------------
SELECT fn_grant_svc_only('TABLE', 'smn_mst');
SELECT fn_grant_svc_only('TABLE', 'smn_ptc');
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_smn_cap(UUID, UUID, TEXT)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_join_smn(UUID, UUID, TEXT)');

COMMIT;

-- ------------------------------------------------------------
-- 검증 (적용 후 수동 실행)
-- ------------------------------------------------------------
-- SELECT count(*) FROM smn_mst;                                             → 0
-- INSERT INTO smn_mst (hst_usr_id, smn_nm, start_dtm, max_cnt) VALUES ('<usr_id>', 't', now(), 101); → 23514(정원 CHECK)
-- SELECT * FROM fn_join_smn(gen_random_uuid(), '<usr_id>');                → NOT_FOUND
-- SELECT proconfig FROM pg_proc WHERE proname = 'fn_join_smn';             → {search_path=<스키마>, pg_temp}
