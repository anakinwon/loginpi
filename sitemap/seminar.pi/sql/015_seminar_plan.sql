-- 015_seminar_plan.sql — 개최자 요금제(무료 매달 1시간 · 월간 30시간 · 연간 400시간, 마스터 2026-10-28) : 가격표·이용권·결제 반영·남은 시간·하트비트 계량
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-28) — 테이블 2개(smn_fee_plan·smn_hst_pln)·함수 4개(fn_cmpl_smn_plan·fn_rem_smn_plan·fn_hb_smn_hst·fn_chk_smn_plan_ai) 신규만. DA 사후 리뷰 대상
-- 선행 : 004(smn_mst)·008(smn_atd)·baseline(sys_user·pi_pymnt·fn_grant_svc_only). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
-- 신규 표준단어 : 이용권 PLN(Plan 관용 PLAN 과 구분 — 개최자 시간 주머니 1장), 원화금액 KRW(합성어 '_' 없이)
--
-- 원칙 : 원화(krw_amt)는 표시용 기준가일 뿐 — 결제·검증은 서버 견적(Pi 시세 환산·서명)의 Pi 금액만(memory krw-display-only-pay-pi)
-- 설계 :
--  · smn_fee_plan 1행 = 유료 요금제(M 월간·Y 연간) 기준가·부여 초·기간(개월). 무료값은 코드 상수(plan-rules PLAN.freeSec = 3600)
--  · smn_hst_pln 1행 = 이용권 1장(결제 1건 = PAY, 무료 = 그 달 FREE 1장). 여러 장이면 만료가 빠른 것부터 차감. 업그레이드·일할 계산 없음
--  · 무료 달 경계 = UTC 월초(date_trunc('month', UTC)) — 서버·DB 시간대와 무관하게 하나로(한국 시각으로는 매달 1일 09:00 에 바뀜)
--  · ADMIN 개최자 = 무제한(라우트가 계량하지 않음)
BEGIN;

-- 1. 가격표
CREATE TABLE IF NOT EXISTS smn_fee_plan (
  plan_cd       VARCHAR(10)   NOT NULL,                                   -- 요금제코드 M 월간 / Y 연간
  krw_amt       NUMERIC(12,0) NOT NULL,                                   -- 원화금액(기준가 — 표시·Pi 환산 기준, 결제 금액 아님)
  use_sec_cnt   INT           NOT NULL,                                   -- 사용초수(부여 시간)
  use_mon_cnt   INT           NOT NULL,                                   -- 사용개월수(유효 기간)
  sort_seq      INT           NOT NULL DEFAULT 0,                         -- 정렬순서
  use_yn        CHAR(1)       NOT NULL DEFAULT 'Y',                       -- 사용여부(N = 판매 중지)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_fee_plan PRIMARY KEY (plan_cd),
  CONSTRAINT smn_fee_plan_plan_cd_check CHECK (plan_cd IN ('M', 'Y')),
  CONSTRAINT smn_fee_plan_krw_amt_check CHECK (krw_amt > 0),
  CONSTRAINT smn_fee_plan_use_sec_cnt_check CHECK (use_sec_cnt > 0),
  CONSTRAINT smn_fee_plan_use_mon_cnt_check CHECK (use_mon_cnt > 0),
  CONSTRAINT smn_fee_plan_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT smn_fee_plan_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE smn_fee_plan IS '세미나 개최자 요금표 — 1행 = 유료 요금제. 원화는 기준가(표시·Pi 환산용), 결제는 서버 견적의 Pi 금액';
INSERT INTO smn_fee_plan (plan_cd, krw_amt, use_sec_cnt, use_mon_cnt, sort_seq) VALUES
  ('M', 5000, 108000, 1, 1),
  ('Y', 40000, 1440000, 12, 2)
ON CONFLICT (plan_cd) DO NOTHING;

-- 2. 개최자 이용권
CREATE TABLE IF NOT EXISTS smn_hst_pln (
  pln_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 이용권ID
  usr_id        UUID          NOT NULL,                                   -- 개최자 사용자ID → sys_user
  plan_cd       VARCHAR(10)   NOT NULL,                                   -- 요금제코드 FREE·M·Y
  grnt_sec_cnt  INT           NOT NULL,                                   -- 부여초수
  use_sec_cnt   INT           NOT NULL DEFAULT 0,                         -- 사용초수
  strt_dtm      TIMESTAMPTZ   NOT NULL,                                   -- 시작일시
  end_dtm       TIMESTAMPTZ   NOT NULL,                                   -- 종료일시(이 시각 전까지 사용)
  pymnt_id      TEXT,                                                     -- 결제ID → pi_pymnt(FREE = NULL)
  grnt_rsn_cd   VARCHAR(10)   NOT NULL,                                   -- 부여사유코드 PAY 결제 / FREE 무료
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_hst_pln PRIMARY KEY (pln_id),
  CONSTRAINT x_smn_hst_pln_01 UNIQUE (pymnt_id), -- 같은 결제 두 번 반영 불가(NULL 은 충돌 없음)
  CONSTRAINT smn_hst_pln_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_hst_pln_pi_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt (pymnt_id),
  CONSTRAINT smn_hst_pln_plan_cd_check CHECK (plan_cd IN ('FREE', 'M', 'Y')),
  CONSTRAINT smn_hst_pln_grnt_rsn_cd_check CHECK (
    (grnt_rsn_cd = 'PAY' AND pymnt_id IS NOT NULL AND plan_cd IN ('M', 'Y'))
    OR (grnt_rsn_cd = 'FREE' AND pymnt_id IS NULL AND plan_cd = 'FREE')),
  CONSTRAINT smn_hst_pln_sec_check CHECK (grnt_sec_cnt > 0 AND use_sec_cnt BETWEEN 0 AND grnt_sec_cnt),
  CONSTRAINT smn_hst_pln_dtm_check CHECK (end_dtm > strt_dtm),
  CONSTRAINT smn_hst_pln_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE smn_hst_pln IS '세미나 개최자 이용권 — 1행 = 결제 1건(PAY) 또는 그 달 무료(FREE). 남은 초 = 기간 안 행의 grnt − use 합, 만료 빠른 것부터 차감';
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_hst_pln_02 ON smn_hst_pln (usr_id, strt_dtm) WHERE grnt_rsn_cd = 'FREE' AND del_yn = 'N';
COMMENT ON INDEX x_smn_hst_pln_02 IS '유일 — 사용자·달마다 무료 이용권 1장(fn_rem_smn_plan ON CONFLICT DO NOTHING)';
CREATE INDEX IF NOT EXISTS x_smn_hst_pln_03 ON smn_hst_pln (usr_id, end_dtm) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_hst_pln_03 IS '사용자별 유효 이용권(end_dtm > now) 범위 조회·만료 순 차감';

-- 3. 결제 완료 = 원장 COMPLETED + 이용권 부여(한 트랜잭션, 재호출 멱등). 007 fn_cmpl_smn_ent 와 같은 원장 조건
--  반환 OK · PAY_INVALID(본인·SMN_PLAN·APPROVED 아님 — 아무것도 안 바꿈) · PLAN_INVALID(원장은 COMPLETED, 요금표에 없음 — 수동 처리)
CREATE OR REPLACE FUNCTION fn_cmpl_smn_plan(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan TEXT;
  v_f smn_fee_plan;
BEGIN
  UPDATE pi_pymnt y
     SET pymnt_sts_cd = 'COMPLETED',
         tx_id        = COALESCE(y.tx_id, p_tx_id),
         cmpl_dtm     = COALESCE(y.cmpl_dtm, CURRENT_TIMESTAMP),
         modr_id      = p_usr_id::TEXT
   WHERE y.pymnt_id = p_pymnt_id
     AND y.usr_id = p_usr_id
     AND y.del_yn = 'N'
     AND y.pymnt_tp_cd = 'SMN_PLAN'
     AND (y.pymnt_sts_cd = 'APPROVED' OR (y.pymnt_sts_cd = 'COMPLETED' AND y.tx_id = p_tx_id))
  RETURNING y.meta_val ->> 'plan' INTO v_plan;
  IF NOT FOUND THEN RETURN 'PAY_INVALID'; END IF;

  -- 판매 중지(use_yn = N)여도 이미 돈을 냈으므로 부여한다
  SELECT * INTO v_f FROM smn_fee_plan f WHERE f.plan_cd = v_plan AND f.del_yn = 'N';
  IF NOT FOUND THEN RETURN 'PLAN_INVALID'; END IF;

  INSERT INTO smn_hst_pln (usr_id, plan_cd, grnt_sec_cnt, strt_dtm, end_dtm, pymnt_id, grnt_rsn_cd, regr_id, modr_id)
  VALUES (p_usr_id, v_f.plan_cd, v_f.use_sec_cnt, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + make_interval(months => v_f.use_mon_cnt),
          p_pymnt_id, 'PAY', p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (pymnt_id) DO NOTHING;
  RETURN 'OK';
END;
$$;
COMMENT ON FUNCTION fn_cmpl_smn_plan(TEXT, TEXT, UUID) IS '요금제 결제 완료 — 원장 COMPLETED(본인·SMN_PLAN·APPROVED 또는 같은 tx 재호출) + 이용권 1장 부여(pymnt_id 유일, 멱등). OK·PAY_INVALID·PLAN_INVALID';

-- 4. 남은 시간 — 이번 달 FREE 이용권 보장(UTC 월초, 이월 없음) + 유효 이용권 남은 초 합·유료 여부·가장 이른 만료
CREATE OR REPLACE FUNCTION fn_rem_smn_plan(p_usr_id UUID)
RETURNS TABLE (rem_sec BIGINT, paid_yn CHAR(1), min_end_dtm TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_mon TIMESTAMPTZ := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  INSERT INTO smn_hst_pln (usr_id, plan_cd, grnt_sec_cnt, strt_dtm, end_dtm, grnt_rsn_cd, regr_id, modr_id)
  VALUES (p_usr_id, 'FREE', 3600, v_mon, v_mon + INTERVAL '1 month', 'FREE', p_usr_id::TEXT, p_usr_id::TEXT)
  ON CONFLICT (usr_id, strt_dtm) WHERE grnt_rsn_cd = 'FREE' AND del_yn = 'N' DO NOTHING;

  RETURN QUERY
  SELECT COALESCE(SUM(p.grnt_sec_cnt - p.use_sec_cnt), 0)::BIGINT,
         CASE WHEN bool_or(p.grnt_rsn_cd = 'PAY') THEN 'Y' ELSE 'N' END::CHAR(1),
         MIN(p.end_dtm)
    FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
     AND p.use_sec_cnt < p.grnt_sec_cnt;
END;
$$;
COMMENT ON FUNCTION fn_rem_smn_plan(UUID) IS '개최자 남은 시간 — 이번 달(UTC) FREE 3600초 보장 후 유효·미소진 이용권의 남은 초 합, 유료(PAY 남음) 여부, 가장 이른 만료';

-- 5. 개최자 하트비트 계량 — 출석 행 lst_hb_dtm 을 잠그고(여러 탭 직렬화) 경과초 = clamp(now − 이전, 0, 90) 를 만료 빠른 이용권부터 차감.
--  출석 행 갱신(없으면 INSERT)도 이 함수가 맡는다(라우트와 이중 갱신 없음). 세미나가 LIVE 이고 요청자가 개최자(ADMIN 아님)일 때만 계량,
--  아니면 하트비트만 하고 rem_sec = NULL. 반환 rem_sec = 차감 뒤 남은 초 합(0 이하 = 소진)
CREATE OR REPLACE FUNCTION fn_hb_smn_hst(p_smn_id UUID, p_usr_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev TIMESTAMPTZ;
  v_live BOOLEAN;
  v_left INT;
  v_take INT;
  r RECORD;
BEGIN
  -- ADMIN·MASTER 개최자 = 무제한(계량 안 함, fn_chk_smn_plan_ai 와 같은 역할 판정)
  SELECT (s.smn_sts_cd = 'LIVE' AND s.hst_usr_id = p_usr_id AND u.role_cd NOT IN ('ADMIN', 'MASTER')) INTO v_live
    FROM smn_mst s JOIN sys_user u ON u.usr_id = s.hst_usr_id
   WHERE s.smn_id = p_smn_id AND s.del_yn = 'N';

  SELECT a.lst_hb_dtm INTO v_prev FROM smn_atd a
   WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.del_yn = 'N' FOR UPDATE;
  IF FOUND THEN
    UPDATE smn_atd a SET lst_hb_dtm = GREATEST(a.lst_hb_dtm, CURRENT_TIMESTAMP), modr_id = p_usr_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
     WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.del_yn = 'N';
  ELSE
    -- 첫 입장 — 계량 없음(경과 0). 동시 첫 호출은 한쪽만 INSERT
    INSERT INTO smn_atd (smn_id, usr_id, ent_dtm, lst_hb_dtm, regr_id, modr_id)
    VALUES (p_smn_id, p_usr_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, p_usr_id::TEXT, p_usr_id::TEXT)
    ON CONFLICT (smn_id, usr_id) WHERE del_yn = 'N' DO NOTHING;
  END IF;

  IF NOT COALESCE(v_live, FALSE) THEN RETURN NULL; END IF;

  PERFORM fn_rem_smn_plan(p_usr_id); -- 이번 달 FREE 보장(달이 바뀐 채 진행 중이어도)
  v_left := COALESCE(LEAST(GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_prev))::INT, 0), 90), 0);
  FOR r IN
    SELECT p.pln_id, p.grnt_sec_cnt - p.use_sec_cnt AS rem
      FROM smn_hst_pln p
     WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
       AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
       AND p.use_sec_cnt < p.grnt_sec_cnt
     ORDER BY p.end_dtm, p.pln_id
       FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, r.rem);
    UPDATE smn_hst_pln SET use_sec_cnt = use_sec_cnt + v_take, modr_id = p_usr_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
     WHERE pln_id = r.pln_id;
    v_left := v_left - v_take;
  END LOOP;

  RETURN (SELECT COALESCE(SUM(p.grnt_sec_cnt - p.use_sec_cnt), 0)::BIGINT FROM smn_hst_pln p
           WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
             AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP);
END;
$$;
COMMENT ON FUNCTION fn_hb_smn_hst(UUID, UUID) IS '개최자 하트비트 — 출석 행 잠금·갱신, LIVE 개최자면 경과초(0~90)를 만료 빠른 이용권부터 차감하고 남은 초 합 반환(계량 안 하면 NULL)';

-- 6. AI 허용 — 세미나 개최자가 ADMIN 이거나 남은 시간이 있는 PAY 이용권 보유(무료 = AI 제외, 마스터 2026-10-28)
CREATE OR REPLACE FUNCTION fn_chk_smn_plan_ai(p_smn_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM smn_mst s JOIN sys_user u ON u.usr_id = s.hst_usr_id
     WHERE s.smn_id = p_smn_id AND s.del_yn = 'N'
       AND (u.role_cd IN ('ADMIN', 'MASTER')
         OR EXISTS (SELECT 1 FROM smn_hst_pln p
                     WHERE p.usr_id = s.hst_usr_id AND p.del_yn = 'N' AND p.grnt_rsn_cd = 'PAY'
                       AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
                       AND p.use_sec_cnt < p.grnt_sec_cnt)));
$$;
COMMENT ON FUNCTION fn_chk_smn_plan_ai(UUID) IS 'AI 기능 허용 — 세미나 개최자가 ADMIN·MASTER 이거나 남은 시간이 있는 유료(PAY) 이용권 보유';

-- 함수 search_path = 생성 스키마 고정(007·009 와 같은 방식) + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_cmpl_smn_plan(TEXT, TEXT, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_rem_smn_plan(UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_hb_smn_hst(UUID, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_chk_smn_plan_ai(UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('TABLE', 'smn_fee_plan');
SELECT fn_grant_svc_only('TABLE', 'smn_hst_pln');
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_smn_plan(TEXT, TEXT, UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_rem_smn_plan(UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_hb_smn_hst(UUID, UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_smn_plan_ai(UUID)');

COMMIT;

-- 검증 (적용 후 — 롤백 시험 $TEMP/isl/plan-chk.mjs)
-- SELECT * FROM fn_rem_smn_plan('<usr_id>');               → (3600, N, 다음 달 UTC 월초) — 두 번 불러도 FREE 1행
-- SELECT fn_cmpl_smn_plan('no-such', 'tx', gen_random_uuid()); → PAY_INVALID
