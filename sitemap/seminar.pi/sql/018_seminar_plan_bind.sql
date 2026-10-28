-- 018 세미나별 요금제 묶기 + 관리자도 계량 — 개설 때 고른 요금제(FREE·M·Y)를 세미나에 기록하고, 시간 차감·남은 시간·AI 허용을 그 요금제 기준으로 (마스터 2026-10-29)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-29) — smn_mst 칼럼 1개(plan_cd, 기본 FREE)·함수 1개 신규(fn_rem_smn_plan_cd)·fn_crt_smn 5인자 겹정의 1개·fn_hb_smn_hst·fn_chk_smn_plan_ai 본문 교체. DA 사후 리뷰 대상
-- 선행 : 011(fn_crt_smn 4인자)·015(smn_hst_pln·fn_rem_smn_plan)·017. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
--
-- 결정(마스터 2026-10-29) :
--  · 세미나 = 요금제 1개. FREE 세미나는 그 달 무료 이용권에서만, M·Y 세미나는 같은 요금제 유료 이용권에서만 차감(만료 빠른 것부터). 다른 요금제로 넘어가지 않는다
--  · AI(자막·번역·더빙·회의록 요약) = 세미나 요금제가 M·Y 이고 그 요금제 남은 시간이 있을 때만
--  · 관리자(ADMIN·MASTER)도 일반 개최자와 같이 계량 — 015·016 의 관리자 무제한 예외 제거
--  · 기존 세미나는 plan_cd = FREE(칼럼 기본값)
--  · fn_crt_smn 4인자(011)는 배포 사이 호환용으로 남긴다(구 코드 = FREE 세미나). 새 코드는 5인자 — 다음 정리 때 4인자 DROP [확인중 : 마스터]
BEGIN;

-- 1. 세미나 요금제
ALTER TABLE smn_mst ADD COLUMN IF NOT EXISTS plan_cd VARCHAR(10) NOT NULL DEFAULT 'FREE';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smn_mst_plan_cd_check' AND conrelid = 'smn_mst'::regclass) THEN
    ALTER TABLE smn_mst ADD CONSTRAINT smn_mst_plan_cd_check CHECK (plan_cd IN ('FREE', 'M', 'Y'));
  END IF;
END;
$$;
COMMENT ON COLUMN smn_mst.plan_cd IS '요금제코드 FREE·M·Y — 개설 때 개최자가 고른 요금제. 시간 차감·남은 시간·AI 허용 기준(sql/018)';

-- 2. 요금제별 남은 시간 — 이번 달 FREE 보장(fn_rem_smn_plan) 후 유효·미소진 이용권을 요금제별로 합산
CREATE OR REPLACE FUNCTION fn_rem_smn_plan_cd(p_usr_id UUID)
RETURNS TABLE (plan_cd VARCHAR, rem_sec BIGINT, max_end_dtm TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM fn_rem_smn_plan(p_usr_id);
  RETURN QUERY
  SELECT p.plan_cd::VARCHAR, SUM(p.grnt_sec_cnt - p.use_sec_cnt)::BIGINT, MAX(p.end_dtm)
    FROM smn_hst_pln p
   WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
     AND p.use_sec_cnt < p.grnt_sec_cnt
   GROUP BY p.plan_cd;
END;
$$;
COMMENT ON FUNCTION fn_rem_smn_plan_cd(UUID) IS '개최자 요금제별 남은 시간 — 이번 달 FREE 보장 후 유효·미소진 이용권을 요금제(FREE·M·Y)별로 남은 초 합·가장 늦은 만료. 남은 것이 없는 요금제는 행 없음';

-- 3. 개설(5인자) — 4인자(011)와 같은 섬 고르기 + 요금제 기록. 남은 시간 확인은 API 가 먼저 한다(입장권이 다시 확인)
CREATE OR REPLACE FUNCTION fn_crt_smn(p_hst_usr_id UUID, p_start_dtm TIMESTAMPTZ, p_max_cnt INT, p_ent_pi_amt NUMERIC, p_plan_cd VARCHAR)
RETURNS TABLE (smn_id UUID, smn_nm VARCHAR)
LANGUAGE plpgsql
AS $$
DECLARE
  v_no INT;
  v_nm VARCHAR(100);
BEGIN
  IF p_plan_cd IS NULL OR p_plan_cd NOT IN ('FREE', 'M', 'Y') THEN
    RAISE EXCEPTION 'plan_cd invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fn_crt_smn'));
  SELECT i.isl_no, i.isl_nm INTO v_no, v_nm
    FROM smn_isl_mst i
   WHERE i.use_yn = 'Y' AND i.del_yn = 'N'
     AND NOT EXISTS (
       SELECT 1 FROM smn_mst m
        WHERE m.isl_no = i.isl_no AND m.isl_sfx_no = 0
          AND m.del_yn = 'N' AND m.smn_sts_cd IN ('SCHEDULED', 'LIVE'))
   ORDER BY random()
   LIMIT 1;
  IF v_no IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  INSERT INTO smn_mst AS s (hst_usr_id, smn_nm, start_dtm, max_cnt, ent_pi_amt, isl_no, isl_sfx_no, plan_cd, regr_id, modr_id)
  VALUES (p_hst_usr_id, v_nm, p_start_dtm, p_max_cnt, p_ent_pi_amt, v_no, 0, p_plan_cd, p_hst_usr_id::TEXT, p_hst_usr_id::TEXT)
  RETURNING s.smn_id, s.smn_nm;
END;
$$;
COMMENT ON FUNCTION fn_crt_smn(UUID, TIMESTAMPTZ, INT, NUMERIC, VARCHAR) IS '세미나 개설(요금제 포함) — 남은 섬 무작위 1개(전역 잠금) + smn_mst INSERT(plan_cd). 남은 섬 없으면 행 0건';

-- 4. 개최자 하트비트 계량 — 015 와 같고, 관리자 예외 없음 + 세미나 요금제(plan_cd) 이용권에서만 차감, 반환 = 그 요금제 남은 초 합
CREATE OR REPLACE FUNCTION fn_hb_smn_hst(p_smn_id UUID, p_usr_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev TIMESTAMPTZ;
  v_live BOOLEAN;
  v_plan VARCHAR(10);
  v_left INT;
  v_take INT;
  r RECORD;
BEGIN
  SELECT (s.smn_sts_cd = 'LIVE' AND s.hst_usr_id = p_usr_id), s.plan_cd INTO v_live, v_plan
    FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N';

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
     WHERE p.usr_id = p_usr_id AND p.del_yn = 'N' AND p.plan_cd = v_plan
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
           WHERE p.usr_id = p_usr_id AND p.del_yn = 'N' AND p.plan_cd = v_plan
             AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP);
END;
$$;
COMMENT ON FUNCTION fn_hb_smn_hst(UUID, UUID) IS '개최자 하트비트 — 출석 행 잠금·갱신, LIVE 개최자면(관리자 포함) 경과초(0~90)를 세미나 요금제(plan_cd) 이용권에서 만료 빠른 것부터 차감하고 그 요금제 남은 초 합 반환(계량 안 하면 NULL)';

-- 5. AI 허용 — 세미나 요금제가 M·Y 이고 개최자에게 그 요금제 남은 시간이 있을 때만(관리자 예외 없음)
CREATE OR REPLACE FUNCTION fn_chk_smn_plan_ai(p_smn_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM smn_mst s JOIN smn_hst_pln p ON p.usr_id = s.hst_usr_id AND p.plan_cd = s.plan_cd
     WHERE s.smn_id = p_smn_id AND s.del_yn = 'N' AND s.plan_cd IN ('M', 'Y')
       AND p.del_yn = 'N' AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
       AND p.use_sec_cnt < p.grnt_sec_cnt);
$$;
COMMENT ON FUNCTION fn_chk_smn_plan_ai(UUID) IS 'AI 기능 허용 — 세미나 요금제(plan_cd)가 M·Y 이고 개최자가 그 요금제의 남은 시간이 있는 이용권 보유(관리자 예외 없음, sql/018)';

-- 함수 search_path = 생성 스키마 고정(CREATE OR REPLACE 는 SET 설정을 지운다 — 017 교훈) + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_rem_smn_plan_cd(UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_crt_smn(UUID, TIMESTAMPTZ, INT, NUMERIC, VARCHAR) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_hb_smn_hst(UUID, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_chk_smn_plan_ai(UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_rem_smn_plan_cd(UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_crt_smn(UUID, TIMESTAMPTZ, INT, NUMERIC, VARCHAR)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_hb_smn_hst(UUID, UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_chk_smn_plan_ai(UUID)');

COMMIT;
