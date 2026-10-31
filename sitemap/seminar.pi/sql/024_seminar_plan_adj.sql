-- 024 관리자 시간 관리 — 사용자관리 화면에서 관리자 서비스권(1시간권·1일권·1개월권)으로 무료 시간을 주고, 요금제(FREE·M·Y)별 남은 시간을 축소하고, 이력을 남긴다(마스터 2026-10-31)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-31 "물어보지 말고 권장사항 있으면 바로 진행") — smn_hst_pln 부여사유 ADM 1값 추가(CHECK 재정의)·fn_rem_smn_plan 유료 판정 1식(ADM 유료 이용권 포함)·
--  테이블 1개(smn_pln_adj_hist)·함수 2개(fn_svc_smn_plan·fn_adj_smn_plan) 신규. DA 사후 리뷰 대상
-- 선행 : 015(smn_hst_pln·fn_rem_smn_plan)·022(fn_hb_smn_hst). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
-- 신규 표준단어 : 조정 ADJ, 변경전 BFR, 변경후 AFT, 서비스권 SVC
--
-- 결정 :
--  · 서비스권(마스터 2026-10-31 "관리자 서비스권인 1시간권, 1일권, 1개월권 3개로 무료 서비스 시간을 추가") = 무료(FREE) 관리자 이용권(grnt_rsn_cd ADM) 1장 —
--    지금부터 그 기간 동안 쓸 수 있고, 부여 초 = 기간 길이(H1 1시간 · D1 24시간 · M1 1개월). 무료 세미나·유료 세미나의 무료 구간에서 쓰인다(AI 없음 — 무료 규칙 그대로).
--    하트비트 차감(fn_hb_smn_hst)·남은 시간(fn_rem_smn_plan_cd)이 요금제코드로만 고르므로 함수 변경 없이 그대로 쓰인다
--  · 축소 = 그 요금제 유효 이용권의 사용초수를 늘린다(만료 늦은 것부터 — 실제 차감은 만료 빠른 것부터라 남은 가치가 큰 쪽을 줄임). 남은 시간보다 많으면 남은 만큼만(0 까지)
--  · 이력 = smn_pln_adj_hist 1행(실제 반영 초·전후 남은 초·서비스권·사유·등록자 = 관리자). 반영할 것이 없으면(축소할 남은 시간 0) 행 없음
BEGIN;

-- 1. 부여사유 ADM(관리자 연장) — 결제 없음, 요금제 FREE·M·Y 모두
ALTER TABLE smn_hst_pln DROP CONSTRAINT IF EXISTS smn_hst_pln_grnt_rsn_cd_check;
ALTER TABLE smn_hst_pln ADD CONSTRAINT smn_hst_pln_grnt_rsn_cd_check CHECK (
  (grnt_rsn_cd = 'PAY' AND pymnt_id IS NOT NULL AND plan_cd IN ('M', 'Y'))
  OR (grnt_rsn_cd = 'FREE' AND pymnt_id IS NULL AND plan_cd = 'FREE')
  OR (grnt_rsn_cd = 'ADM' AND pymnt_id IS NULL AND plan_cd IN ('FREE', 'M', 'Y')));
COMMENT ON COLUMN smn_hst_pln.grnt_rsn_cd IS '부여사유코드 PAY 결제 / FREE 그 달 무료 / ADM 관리자 연장(sql/024)';

-- 2. 유료 여부 = 유료 요금제(M·Y) 이용권이 남아 있는가(ADM 으로 받은 M·Y 포함) — 015 의 PAY 판정 1식만 바꾼다
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
         CASE WHEN bool_or(p.plan_cd <> 'FREE') THEN 'Y' ELSE 'N' END::CHAR(1),
         MIN(p.end_dtm)
    FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
     AND p.use_sec_cnt < p.grnt_sec_cnt;
END;
$$;
COMMENT ON FUNCTION fn_rem_smn_plan(UUID) IS '개최자 남은 시간 — 이번 달(UTC) FREE 3600초 보장 후 유효·미소진 이용권의 남은 초 합, 유료(M·Y 남음, ADM 포함 — sql/024) 여부, 가장 이른 만료';

-- 3. 조정 이력
CREATE TABLE IF NOT EXISTS smn_pln_adj_hist (
  adj_id        UUID          NOT NULL DEFAULT gen_random_uuid(),         -- 조정ID
  usr_id        UUID          NOT NULL,                                   -- 대상 사용자ID → sys_user
  plan_cd       VARCHAR(10)   NOT NULL,                                   -- 요금제코드 FREE·M·Y
  adj_sec_cnt   INT           NOT NULL,                                   -- 조정초수(실제 반영값 — 양수 연장, 음수 축소)
  bfr_sec_cnt   BIGINT        NOT NULL,                                   -- 변경전초수(그 요금제 남은 초)
  aft_sec_cnt   BIGINT        NOT NULL,                                   -- 변경후초수(그 요금제 남은 초)
  pln_id        UUID,                                                     -- 이용권ID → smn_hst_pln(서비스권으로 만든 ADM 이용권, 축소 = NULL)
  svc_cd        VARCHAR(10),                                              -- 서비스권코드 H1 1시간권 · D1 1일권 · M1 1개월권(축소 = NULL)
  adj_rsn_cont  VARCHAR(200),                                             -- 조정사유내용(선택)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID(조정한 관리자 usr_id)
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_pln_adj_hist PRIMARY KEY (adj_id),
  CONSTRAINT smn_pln_adj_hist_sys_user_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user (usr_id),
  CONSTRAINT smn_pln_adj_hist_smn_hst_pln_id_fkey FOREIGN KEY (pln_id) REFERENCES smn_hst_pln (pln_id),
  CONSTRAINT smn_pln_adj_hist_plan_cd_check CHECK (plan_cd IN ('FREE', 'M', 'Y')),
  CONSTRAINT smn_pln_adj_hist_adj_sec_cnt_check CHECK (adj_sec_cnt <> 0),
  CONSTRAINT smn_pln_adj_hist_svc_cd_check CHECK (
    (svc_cd IS NULL AND adj_sec_cnt < 0) OR (svc_cd IN ('H1', 'D1', 'M1') AND adj_sec_cnt > 0 AND plan_cd = 'FREE' AND pln_id IS NOT NULL)),
  CONSTRAINT smn_pln_adj_hist_sec_check CHECK (bfr_sec_cnt >= 0 AND aft_sec_cnt >= 0 AND aft_sec_cnt = bfr_sec_cnt + adj_sec_cnt),
  CONSTRAINT smn_pln_adj_hist_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE smn_pln_adj_hist IS '세미나 개최자 시간 조정 이력 — 1행 = 관리자 서비스권 지급(+, 무료)·축소(−) 1건, 요금제별 전후 남은 초(sql/024)';
CREATE INDEX IF NOT EXISTS x_smn_pln_adj_hist_01 ON smn_pln_adj_hist (usr_id, reg_dtm DESC) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_pln_adj_hist_01 IS '사용자별 최근 조정 이력(사용자관리 화면)';

-- 4. 서비스권 지급 — 무료(FREE) ADM 이용권 1장(지금 ~ 기간 끝, 부여 초 = 기간 길이) + 이력 1행. 반환 adj_sec = 부여 초, rem_sec = 무료 남은 초, end_dtm = 만료
--  입력 오류(서비스권 코드) = 예외(라우트가 먼저 막는다)
CREATE OR REPLACE FUNCTION fn_svc_smn_plan(p_usr_id UUID, p_svc_cd VARCHAR, p_rsn VARCHAR, p_adm_id UUID)
RETURNS TABLE (adj_sec INT, rem_sec BIGINT, end_dtm TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_end TIMESTAMPTZ;
  v_sec INT;
  v_bfr BIGINT;
  v_pln UUID;
BEGIN
  v_end := CURRENT_TIMESTAMP + CASE p_svc_cd WHEN 'H1' THEN INTERVAL '1 hour' WHEN 'D1' THEN INTERVAL '1 day' WHEN 'M1' THEN INTERVAL '1 month' END;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'fn_svc_smn_plan: invalid input' USING ERRCODE = '22023';
  END IF;
  v_sec := EXTRACT(EPOCH FROM (v_end - CURRENT_TIMESTAMP))::INT;
  -- 같은 사용자 지급·축소는 하나씩(검토 2026-10-31 : 행 잠금만으로는 다른 조정이 막 넣은 이용권을 못 잠가 이력 전후값·교착 위험)
  PERFORM pg_advisory_xact_lock(hashtext('smn_pln_adj'), hashtext(p_usr_id::TEXT));
  PERFORM fn_rem_smn_plan(p_usr_id); -- 이번 달 FREE 보장(전후 남은 초를 실제 값으로)

  -- 잠금(동시 지급·하트비트 차감과 직렬화) + 변경 전 무료 남은 초
  PERFORM 1 FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.plan_cd = 'FREE' AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
   ORDER BY p.end_dtm, p.pln_id
     FOR UPDATE;
  SELECT COALESCE(SUM(p.grnt_sec_cnt - p.use_sec_cnt), 0) INTO v_bfr
    FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.plan_cd = 'FREE' AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP;

  INSERT INTO smn_hst_pln (usr_id, plan_cd, grnt_sec_cnt, strt_dtm, end_dtm, grnt_rsn_cd, regr_id, modr_id)
  VALUES (p_usr_id, 'FREE', v_sec, CURRENT_TIMESTAMP, v_end, 'ADM', p_adm_id::TEXT, p_adm_id::TEXT)
  RETURNING pln_id INTO v_pln;
  INSERT INTO smn_pln_adj_hist (usr_id, plan_cd, adj_sec_cnt, bfr_sec_cnt, aft_sec_cnt, pln_id, svc_cd, adj_rsn_cont, regr_id, modr_id)
  VALUES (p_usr_id, 'FREE', v_sec, v_bfr, v_bfr + v_sec, v_pln, p_svc_cd, NULLIF(btrim(p_rsn), ''), p_adm_id::TEXT, p_adm_id::TEXT);
  RETURN QUERY SELECT v_sec, v_bfr + v_sec, v_end;
END;
$$;
COMMENT ON FUNCTION fn_svc_smn_plan(UUID, VARCHAR, VARCHAR, UUID) IS '관리자 서비스권 지급 — 무료 ADM 이용권(H1 1시간·D1 1일·M1 1개월, 부여 초 = 기간) + 이력 1행. 반환 부여 초·무료 남은 초·만료(sql/024)';

-- 5. 축소 — 한 트랜잭션(그 사용자·요금제 유효 이용권을 잠가 하트비트 차감·동시 조정과 직렬화). 반환 adj_sec = 실제 반영(음수, 0 = 줄일 남은 시간 없음), rem_sec = 그 요금제 남은 초
--  입력 오류(요금제·0 이상·1000시간 초과) = 예외(라우트가 먼저 막는다)
CREATE OR REPLACE FUNCTION fn_adj_smn_plan(p_usr_id UUID, p_plan_cd VARCHAR, p_sec INT, p_rsn VARCHAR, p_adm_id UUID)
RETURNS TABLE (adj_sec INT, rem_sec BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_bfr BIGINT;
  v_left INT;
  v_take INT := 0;
  r RECORD;
BEGIN
  IF p_plan_cd NOT IN ('FREE', 'M', 'Y') OR p_sec IS NULL OR p_sec >= 0 OR p_sec < -3600000 THEN
    RAISE EXCEPTION 'fn_adj_smn_plan: invalid input' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('smn_pln_adj'), hashtext(p_usr_id::TEXT)); -- fn_svc_smn_plan 과 같은 키(사용자별 직렬)
  PERFORM fn_rem_smn_plan(p_usr_id); -- 이번 달 FREE 보장(FREE 축소 대상이 있도록)

  PERFORM 1 FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.plan_cd = p_plan_cd AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
   ORDER BY p.end_dtm, p.pln_id
     FOR UPDATE;
  SELECT COALESCE(SUM(p.grnt_sec_cnt - p.use_sec_cnt), 0) INTO v_bfr
    FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.plan_cd = p_plan_cd AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP;

  v_left := LEAST(-p_sec, v_bfr)::INT;
  FOR r IN
    SELECT p.pln_id, p.grnt_sec_cnt - p.use_sec_cnt AS rem
      FROM smn_hst_pln p
     WHERE p.usr_id = p_usr_id AND p.plan_cd = p_plan_cd AND p.del_yn = 'N'
       AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
       AND p.use_sec_cnt < p.grnt_sec_cnt
     ORDER BY p.end_dtm DESC, p.pln_id
       FOR UPDATE -- 잠금 대기 뒤 남은 초를 다시 읽어 사용초수가 부여초수를 넘지 않게
  LOOP
    EXIT WHEN v_left <= 0;
    UPDATE smn_hst_pln SET use_sec_cnt = use_sec_cnt + LEAST(v_left, r.rem), modr_id = p_adm_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
     WHERE pln_id = r.pln_id;
    v_take := v_take - LEAST(v_left, r.rem);
    v_left := v_left - LEAST(v_left, r.rem);
  END LOOP;
  IF v_take = 0 THEN
    RETURN QUERY SELECT 0, v_bfr;
    RETURN;
  END IF;

  INSERT INTO smn_pln_adj_hist (usr_id, plan_cd, adj_sec_cnt, bfr_sec_cnt, aft_sec_cnt, adj_rsn_cont, regr_id, modr_id)
  VALUES (p_usr_id, p_plan_cd, v_take, v_bfr, v_bfr + v_take, NULLIF(btrim(p_rsn), ''), p_adm_id::TEXT, p_adm_id::TEXT);
  RETURN QUERY SELECT v_take, v_bfr + v_take;
END;
$$;
COMMENT ON FUNCTION fn_adj_smn_plan(UUID, VARCHAR, INT, VARCHAR, UUID) IS '관리자 시간 축소 — 그 요금제 유효 이용권 사용초수 증가(만료 늦은 것부터, 남은 만큼만) + 이력 1행. 반환 실제 반영 초(음수, 0 = 없음)·그 요금제 남은 초(sql/024)';

-- CREATE OR REPLACE 는 SET search_path 를 지운다(017 교훈) — 두 함수 다시 고정 + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_rem_smn_plan(UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_svc_smn_plan(UUID, VARCHAR, VARCHAR, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_adj_smn_plan(UUID, VARCHAR, INT, VARCHAR, UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('TABLE', 'smn_pln_adj_hist');
SELECT fn_grant_svc_only('FUNCTION', 'fn_rem_smn_plan(UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_svc_smn_plan(UUID, VARCHAR, VARCHAR, UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_adj_smn_plan(UUID, VARCHAR, INT, VARCHAR, UUID)');

COMMIT;
