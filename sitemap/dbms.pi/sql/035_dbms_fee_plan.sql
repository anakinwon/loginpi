-- 035_dbms_fee_plan.sql — dbms.pi 연결(분류체계) 단위 요금제 : 요금표(원화 기준가·한도)·연결 요금제 기간·결제 반영·새 연결 D3 7일 체험(마스터 확정 2026-11-02, 계획 floating-hopping-curry)
-- DA-APPROVED: 2026-11-02 마스터 승인 계획(요금표 FREE·D1·D2·D3, 연결 단위, 원화 정가 → Pi 환산, schema.pi 묶음 할인 20%) — 테이블 2개(dbm_fee_plan·dbm_lnk_plan)·함수 3개·트리거 1개 신규만.
--  구조 승계 : schema.pi sql/049·056(sys_fee_plan·std_area_plan·fn_area_plan_grant — 업그레이드·선결제), seminar.pi sql/015(원화 기준가 krw_amt). 신규 표준단어 없음(CLCT 수집·KEEP 보관은 기존 칼럼 선례) — DA 사후 리뷰 대상
-- 선행 : packages/pi-db/sql/000_baseline.sql(sys_user·fn_grant_svc_only)·010_pi_pymnt.sql(원장 — db-migrate 가 사이트 SQL 보다 먼저 적용)·004(dbm_lnk)
-- 적용 : node scripts/db-migrate.mjs --app dbms --tier prod (재실행 안전 — IF NOT EXISTS·ON CONFLICT·체험 중복 방지)
-- 설계 :
--  · 원칙 : 원화(krw_amt)는 표시·Pi 환산 기준가일 뿐 — 결제·검증은 서버 견적(시세 환산·서명)의 Pi 금액만(memory krw-display-only-pay-pi)
--  · dbm_fee_plan 1행 = 요금제 × 주기 가격·한도. FREE 는 주기 없음(M 1행 = 무료 한도). 한도는 같은 요금제면 M·Y 같은 값. 기능 권한은 코드(src/lib/plan-rules.ts PERM_MIN)
--  · dbm_lnk_plan 1행 = 연결 요금제 기간 1건(PAY 결제 · UPG 업그레이드 · GRACE 체험). 현재 요금제 = 기간 안 행 중 가장 높은 요금제(D1<D2<D3 문자 순서), 없으면 FREE
--  · fn_dbm_lnk_plan_grant(결제ID) = 완료 결제 → 기간 행(결제ID 유일 = 두 번 반영 불가). 같은·높은 요금제 마지막 종료 뒤로 이어 붙임(선결제), 업그레이드(prd_cd U) = 승인 시각부터 새 주기 + 견적에 든 선결제(meta pre)만 상위로
--  · 새 연결(dbm_lnk INSERT) = 트리거가 D3 7일 체험 부여(사용자 + 분류체계당 1번 — 해제 후 재등록으로 체험 반복 불가) + 같은 분류체계의 해제된 이전 연결 기간을 새 연결로 옮김(결제 기간 보존)
--  · 기존 연결 = 이 파일 적용 시각부터 D3 7일 체험 소급(같은 규칙, 1번만)
BEGIN;

-- 1. 요금표 — 요금제 × 주기(원화 기준가·한도)
CREATE TABLE IF NOT EXISTS dbm_fee_plan (
  plan_cd       VARCHAR(10)   NOT NULL,                                    -- 요금제코드 FREE·D1 관측·D2 튜닝·D3 DBA
  prd_cd        VARCHAR(1)    NOT NULL,                                    -- 주기코드 M 월 / Y 년(FREE = M 1행)
  plan_nm       VARCHAR(100)  NOT NULL,                                    -- 요금제명(표시는 다국어 키 plan.names.<코드>, 이 값은 관리용)
  krw_amt       NUMERIC(12,0) NOT NULL,                                    -- 원화금액(기준가 — 표시·Pi 환산 기준, 결제 금액 아님)
  use_mon_cnt   INT           NOT NULL,                                    -- 사용개월수(M=1, Y=12)
  ai_mon_cnt    INT           NOT NULL DEFAULT 0,                          -- AI 튜닝 월 횟수(0 = 사용 불가)
  keep_day_cnt  INT           NOT NULL,                                    -- 지난 값 보관일수(dbm_mon_snap·dbm_prf_* 조회 범위)
  clct_day_cnt  INT,                                                       -- 하루 수동 수집 횟수(NULL = 무제한)
  sort_seq      INT           NOT NULL DEFAULT 0,                          -- 정렬순서
  use_yn        CHAR(1)       NOT NULL DEFAULT 'Y',                        -- 사용여부(N = 판매 중지)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT pk_dbm_fee_plan PRIMARY KEY (plan_cd, prd_cd),
  CONSTRAINT dbm_fee_plan_plan_cd_check CHECK (plan_cd IN ('FREE', 'D1', 'D2', 'D3')),
  CONSTRAINT dbm_fee_plan_prd_cd_check CHECK (prd_cd IN ('M', 'Y')),
  CONSTRAINT dbm_fee_plan_krw_amt_check CHECK ((plan_cd = 'FREE' AND krw_amt = 0 AND prd_cd = 'M') OR (plan_cd <> 'FREE' AND krw_amt > 0)),
  CONSTRAINT dbm_fee_plan_use_mon_cnt_check CHECK (use_mon_cnt > 0 AND ai_mon_cnt >= 0 AND keep_day_cnt > 0 AND (clct_day_cnt IS NULL OR clct_day_cnt > 0)),
  CONSTRAINT dbm_fee_plan_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT dbm_fee_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_fee_plan IS 'dbms.pi 요금표 — 1행 = 요금제 × 주기 원화 기준가·한도(연결 1개 기준). 결제는 서버 견적의 Pi 금액, 기능 권한은 코드(plan-rules.ts PERM_MIN)';
COMMENT ON COLUMN dbm_fee_plan.krw_amt IS '원화 기준가 — 표시·Pi 환산 기준일 뿐 결제 금액이 아님. 연 = 월 × 10(두 달 무료)';
COMMENT ON COLUMN dbm_fee_plan.ai_mon_cnt IS 'AI 튜닝 권고 월 횟수(UTC 월초 기준, dbm_sql_tun engn_cd=AI 행 수로 집계 — 삭제 행 포함). 0 = 사용 불가';
COMMENT ON COLUMN dbm_fee_plan.clct_day_cnt IS '하루 수동 성능 수집 횟수(UTC 0시 기준, dbm_prf_clct 행 수로 집계 — 삭제 행 포함). NULL = 무제한(schema.pi 연결 API 분당 60회 한도는 그대로)';
INSERT INTO dbm_fee_plan (plan_cd, prd_cd, plan_nm, krw_amt, use_mon_cnt, ai_mon_cnt, keep_day_cnt, clct_day_cnt, sort_seq) VALUES
  ('FREE', 'M', '무료', 0,      1,  0,   7,   3,    1),
  ('D1',   'M', '관측', 9900,   1,  0,   30,  NULL, 11), ('D1', 'Y', '관측', 99000,  12, 0,   30,  NULL, 12),
  ('D2',   'M', '튜닝', 19900,  1,  30,  365, NULL, 21), ('D2', 'Y', '튜닝', 199000, 12, 30,  365, NULL, 22),
  ('D3',   'M', 'DBA',  39900,  1,  100, 365, NULL, 31), ('D3', 'Y', 'DBA',  399000, 12, 100, 365, NULL, 32)
ON CONFLICT (plan_cd, prd_cd) DO NOTHING;
SELECT fn_grant_svc_only('TABLE', 'dbm_fee_plan');

-- 2. 연결 요금제 기간
CREATE TABLE IF NOT EXISTS dbm_lnk_plan (
  lnk_plan_id   UUID          NOT NULL DEFAULT gen_random_uuid(),          -- 연결요금제ID
  lnk_id        UUID          NOT NULL,                                    -- 연결ID → dbm_lnk.lnk_id
  plan_cd       VARCHAR(10)   NOT NULL,                                    -- 요금제코드 D1~D3
  prd_cd        VARCHAR(1),                                                -- 주기코드(결제·업그레이드 = M·Y, 체험 = NULL)
  strt_dtm      TIMESTAMPTZ   NOT NULL,                                    -- 시작일시
  end_dtm       TIMESTAMPTZ   NOT NULL,                                    -- 종료일시(이 시각 전까지 사용)
  grnt_rsn_cd   VARCHAR(10)   NOT NULL,                                    -- 부여사유코드 PAY 결제 / UPG 업그레이드 / GRACE 체험
  pymnt_id      TEXT,                                                      -- 결제ID → pi_pymnt(체험 = NULL)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                        -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                               -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                    -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,          -- 변경일시
  CONSTRAINT pk_dbm_lnk_plan PRIMARY KEY (lnk_plan_id),
  CONSTRAINT x_dbm_lnk_plan_01 UNIQUE (pymnt_id), -- 같은 결제 두 번 반영 불가(NULL = 체험, 충돌 없음)
  CONSTRAINT dbm_lnk_plan_dbm_lnk_id_fkey FOREIGN KEY (lnk_id) REFERENCES dbm_lnk (lnk_id),
  CONSTRAINT dbm_lnk_plan_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (pymnt_id),
  CONSTRAINT dbm_lnk_plan_plan_cd_check CHECK (plan_cd IN ('D1', 'D2', 'D3')),
  CONSTRAINT dbm_lnk_plan_prd_cd_check CHECK (prd_cd IN ('M', 'Y')),
  CONSTRAINT dbm_lnk_plan_grnt_rsn_cd_check CHECK (
    (grnt_rsn_cd IN ('PAY', 'UPG') AND pymnt_id IS NOT NULL AND prd_cd IS NOT NULL)
    OR (grnt_rsn_cd = 'GRACE' AND pymnt_id IS NULL)),
  CONSTRAINT dbm_lnk_plan_end_dtm_check CHECK (end_dtm > strt_dtm),
  CONSTRAINT dbm_lnk_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE dbm_lnk_plan IS 'dbms.pi 연결 요금제 기간 — 1행 = 결제(PAY)·업그레이드(UPG)·체험(GRACE) 1건. 현재 요금제 = 기간 안 행 중 가장 높은 요금제(없으면 FREE)';
COMMENT ON COLUMN dbm_lnk_plan.grnt_rsn_cd IS 'PAY 결제(같은·높은 요금제 마지막 종료 뒤로 이어 붙임) / UPG 업그레이드(승인 시각부터 새 주기) / GRACE 새 연결 D3 7일 체험(사용자 + 분류체계당 1번)';
CREATE INDEX IF NOT EXISTS x_dbm_lnk_plan_02 ON dbm_lnk_plan (lnk_id, end_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_dbm_lnk_plan_02 IS '연결별 유효 기간(end_dtm > now) 범위 조회 — 현재 요금제 판정·업그레이드 견적';
SELECT fn_grant_svc_only('TABLE', 'dbm_lnk_plan');

CREATE OR REPLACE FUNCTION fn_upd_dbm_lnk_plan_mod_dtm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_lnk_plan_mod_dtm ON dbm_lnk_plan;
CREATE TRIGGER trg_dbm_lnk_plan_mod_dtm
  BEFORE UPDATE ON dbm_lnk_plan
  FOR EACH ROW EXECUTE FUNCTION fn_upd_dbm_lnk_plan_mod_dtm();

-- 3. 결제 반영 — 완료 결제 1건 → 기간 1행(재호출 = 같은 행 반환). schema.pi 056 fn_area_plan_grant 와 같은 규칙(요금제 D1~D3·연결 단위)
CREATE OR REPLACE FUNCTION fn_dbm_lnk_plan_grant(p_pymnt_id TEXT)
RETURNS dbm_lnk_plan
LANGUAGE plpgsql
AS $$
DECLARE
  v_p    pi_pymnt;
  v_f    dbm_fee_plan;
  v_r    dbm_lnk_plan;
  v_l    UUID;
  v_cd   TEXT;
  v_prd  TEXT;
  v_from TEXT;
  v_base TIMESTAMPTZ;
  v_t    dbm_lnk_plan;
  v_m    INT;
BEGIN
  SELECT * INTO v_r FROM dbm_lnk_plan WHERE pymnt_id = p_pymnt_id;
  IF FOUND THEN RETURN v_r; END IF;
  SELECT * INTO v_p FROM pi_pymnt WHERE pymnt_id = p_pymnt_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR v_p.pymnt_sts_cd <> 'COMPLETED' OR v_p.pymnt_tp_cd <> 'DBM_PLAN' THEN
    RAISE EXCEPTION 'dbm_plan_pymnt: 완료된 요금제 결제가 아닙니다' USING ERRCODE = 'MPL01';
  END IF;
  v_l := (v_p.meta_val->>'lnk_id')::uuid;
  v_cd := v_p.meta_val->>'plan_cd';
  v_prd := v_p.meta_val->>'prd_cd';
  PERFORM 1 FROM dbm_lnk WHERE lnk_id = v_l FOR UPDATE; -- 같은 연결 동시 결제 직렬화(해제된 연결도 돈은 받았으므로 반영 — 재등록 때 트리거가 새 연결로 옮김)
  IF NOT FOUND THEN RAISE EXCEPTION 'dbm_plan_lnk: 연결이 없습니다' USING ERRCODE = 'MPL01'; END IF;

  IF v_prd = 'U' THEN
    -- 업그레이드 : 승인 시각부터 상위 요금제 새 주기. 이전 요금제 기간은 그대로(높은 요금제 우선 — 이전 기간이 먼저 끝남)
    v_from := v_p.meta_val->>'from_plan';
    v_prd := v_p.meta_val->>'prd';
    -- 상위 요금제 또는 같은 요금제 월 → 연. 현재 기간 주기·금액 대조는 approve(서명 견적 + 서버 재계산)가 함
    IF NOT COALESCE(v_from IN ('D1', 'D2', 'D3') AND v_cd IN ('D1', 'D2', 'D3') AND v_prd IN ('M', 'Y') AND (v_from < v_cd OR (v_from = v_cd AND v_prd = 'Y')), FALSE) THEN
      RAISE EXCEPTION 'dbm_plan_upg: 상위 요금제 업그레이드가 아닙니다' USING ERRCODE = 'MPL01';
    END IF;
    SELECT * INTO v_f FROM dbm_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd;
    IF NOT FOUND THEN RAISE EXCEPTION 'dbm_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01'; END IF;
    INSERT INTO dbm_lnk_plan (lnk_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
    VALUES (v_l, v_cd, v_prd, v_p.apv_dtm, v_p.apv_dtm + make_interval(months => v_f.use_mon_cnt), 'UPG', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
    RETURNING * INTO v_r;
    -- 선결제(승인 시각 뒤 시작하는 이전 요금제 결제 기간) = 상위 요금제로 바꿔 새 주기 종료일 뒤로 이어 붙임(차액은 견적에 포함).
    --  견적에 든 선결제 수(meta pre)만 + reg_dtm < 승인 시각(승인 뒤 반영된 선결제가 차액 없이 올라가는 경합 차단 — schema.pi 056 보안 검토 승계)
    v_base := v_r.end_dtm;
    FOR v_t IN SELECT * FROM dbm_lnk_plan WHERE lnk_id = v_l AND plan_cd = v_from AND grnt_rsn_cd = 'PAY' AND strt_dtm > v_p.apv_dtm AND reg_dtm < v_p.apv_dtm AND del_yn = 'N' ORDER BY strt_dtm LIMIT COALESCE((v_p.meta_val->>'pre')::int, 0) LOOP
      SELECT use_mon_cnt INTO v_m FROM dbm_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_t.prd_cd;
      IF NOT FOUND THEN RAISE EXCEPTION 'dbm_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01'; END IF;
      UPDATE dbm_lnk_plan SET plan_cd = v_cd, strt_dtm = v_base, end_dtm = v_base + make_interval(months => v_m), modr_id = v_p.usr_id::text
       WHERE lnk_plan_id = v_t.lnk_plan_id;
      v_base := v_base + make_interval(months => v_m);
    END LOOP;
    RETURN v_r;
  END IF;

  SELECT * INTO v_f FROM dbm_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd AND plan_cd <> 'FREE'; -- 사용 개월수만(가격은 approve 때 검증, 이후 변경·판매 중지와 무관)
  IF NOT FOUND THEN RAISE EXCEPTION 'dbm_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01'; END IF;
  SELECT GREATEST(CURRENT_TIMESTAMP, COALESCE(max(end_dtm), CURRENT_TIMESTAMP)) INTO v_base
    FROM dbm_lnk_plan WHERE lnk_id = v_l AND plan_cd >= v_cd AND del_yn = 'N'; -- 같은·높은 요금제(체험 포함) 뒤로 — D1~D3 문자 순서 = 등급 순서
  INSERT INTO dbm_lnk_plan (lnk_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
  VALUES (v_l, v_cd, v_prd, v_base, v_base + make_interval(months => v_f.use_mon_cnt), 'PAY', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
  RETURNING * INTO v_r;
  RETURN v_r;
END;
$$;
COMMENT ON FUNCTION fn_dbm_lnk_plan_grant(TEXT) IS '요금제 결제 반영 — 완료된 DBM_PLAN 결제 1건 → 연결 요금제 기간 1행(결제ID 유일, 재호출 = 같은 행). 업그레이드(prd_cd U) = 승인 시각부터 + 견적 선결제(pre)만 상위로';

-- 4. 결제 완료 = 원장 COMPLETED + 기간 반영(한 트랜잭션, 재호출 = 같은 행). 결제자 본인 원장만(다른 사람 결제ID·txid 재생 차단)
CREATE OR REPLACE FUNCTION fn_cmpl_dbm_lnk_plan(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS dbm_lnk_plan
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pi_pymnt
     SET pymnt_sts_cd = 'COMPLETED', tx_id = COALESCE(tx_id, p_tx_id), cmpl_dtm = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP), modr_id = p_usr_id::text
   WHERE pymnt_id = p_pymnt_id AND usr_id = p_usr_id AND del_yn = 'N' AND pymnt_tp_cd = 'DBM_PLAN'
     AND (pymnt_sts_cd = 'APPROVED' OR (pymnt_sts_cd = 'COMPLETED' AND tx_id = p_tx_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dbm_plan_pymnt: 본인의 승인된 요금제 결제가 아닙니다' USING ERRCODE = 'MPL01';
  END IF;
  RETURN fn_dbm_lnk_plan_grant(p_pymnt_id);
END;
$$;
COMMENT ON FUNCTION fn_cmpl_dbm_lnk_plan(TEXT, TEXT, UUID) IS '요금제 결제 완료 — 원장 COMPLETED(본인·DBM_PLAN·APPROVED 또는 같은 tx 재호출) + 기간 반영 한 트랜잭션. 실패 = MPL01';

-- 5. 새 연결 — 해제된 이전 연결(같은 사용자 + 분류체계)의 기간을 옮기고, 처음이면 D3 7일 체험
CREATE OR REPLACE FUNCTION fn_dbm_lnk_plan_new()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE dbm_lnk_plan p SET lnk_id = NEW.lnk_id, modr_id = NEW.regr_id
   WHERE p.lnk_id IN (SELECT l.lnk_id FROM dbm_lnk l WHERE l.usr_id = NEW.usr_id AND l.area_id = NEW.area_id AND l.del_yn = 'Y');
  INSERT INTO dbm_lnk_plan (lnk_id, plan_cd, strt_dtm, end_dtm, grnt_rsn_cd, regr_id, modr_id)
  SELECT NEW.lnk_id, 'D3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days', 'GRACE', NEW.regr_id, NEW.regr_id
   WHERE NOT EXISTS (SELECT 1 FROM dbm_lnk_plan p JOIN dbm_lnk l ON l.lnk_id = p.lnk_id
                      WHERE l.usr_id = NEW.usr_id AND l.area_id = NEW.area_id AND p.grnt_rsn_cd = 'GRACE');
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_dbm_lnk_plan_new ON dbm_lnk;
CREATE TRIGGER trg_dbm_lnk_plan_new
  AFTER INSERT ON dbm_lnk
  FOR EACH ROW EXECUTE FUNCTION fn_dbm_lnk_plan_new();
COMMENT ON FUNCTION fn_dbm_lnk_plan_new() IS '새 연결 트리거 — 같은 사용자 + 분류체계의 해제된 연결 기간을 새 연결로 옮기고, 체험 이력이 없으면 D3 7일 체험(GRACE) 부여';

-- 6. 기존 연결 — 적용 시각부터 D3 7일 체험 소급(사용자 + 분류체계당 1번, 재실행해도 추가 없음)
INSERT INTO dbm_lnk_plan (lnk_id, plan_cd, strt_dtm, end_dtm, grnt_rsn_cd, regr_id, modr_id)
SELECT l.lnk_id, 'D3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days', 'GRACE', 'MIGR', 'MIGR'
  FROM dbm_lnk l
 WHERE l.del_yn = 'N'
   AND NOT EXISTS (SELECT 1 FROM dbm_lnk_plan p JOIN dbm_lnk o ON o.lnk_id = p.lnk_id
                    WHERE o.usr_id = l.usr_id AND o.area_id = l.area_id AND p.grnt_rsn_cd = 'GRACE');

-- 함수 search_path = 생성 스키마 고정(seminar 015 와 같은 방식) + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_dbm_lnk_plan_grant(TEXT) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_cmpl_dbm_lnk_plan(TEXT, TEXT, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_dbm_lnk_plan_new() SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_dbm_lnk_plan_grant(TEXT)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_dbm_lnk_plan(TEXT, TEXT, UUID)');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- 검증 (적용 후)
-- SELECT plan_cd, prd_cd, krw_amt, ai_mon_cnt, keep_day_cnt, clct_day_cnt FROM dbm_fee_plan ORDER BY sort_seq;  → 7행
-- SELECT count(*) FROM dbm_lnk_plan WHERE grnt_rsn_cd = 'GRACE';                                                → 활성 연결 수(사용자 + 분류체계)
-- SELECT fn_cmpl_dbm_lnk_plan('no-such', 'tx', gen_random_uuid());                                              → MPL01
