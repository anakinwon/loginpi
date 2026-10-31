-- 025 무료 서비스권 소진 순서 — 시간권(H1) → 일권(D1) → 월권(M1) 순으로 자동 소진(마스터 2026-10-31 "무료서비스로 지급된 쿠폰은 시간/일/월 순서로 자동 소진된다")
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-31) — fn_hb_smn_hst·fn_adj_smn_plan 본문의 ORDER BY 1식씩 교체. 테이블·컬럼 변경 없음
-- 선행 : 022(fn_hb_smn_hst)·024(fn_adj_smn_plan). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
--
-- 결정 :
--  · 서비스권은 종류 컬럼이 없고(smn_hst_pln 은 grnt_rsn_cd ADM 만) 기간 = 부여 초 = 종류(1시간·1일·1개월)이므로 **이용권 기간(end_dtm - strt_dtm) 짧은 것부터** 차감하면 시간권 → 일권 → 월권 순이 된다.
--    구 규칙 "만료 빠른 것부터"는 어제 받은 일권이 방금 받은 시간권보다 먼저 소진되는 경우가 있어 마스터 규칙과 어긋난다.
--  · 같은 기간이면 만료 빠른 것부터(이번 달 무료 1시간은 월 초~다음 달 초라 월권과 기간이 비슷 — 만료가 더 빠른 쪽이 먼저). 유료 세미나의 "유료 먼저, 그다음 무료"(021)는 그대로.
--  · 축소(fn_adj_smn_plan)는 거울상 — 기간 긴 것(월권)부터 줄여 소진 순서의 끝에서 뺀다(남은 가치가 큰 쪽).
BEGIN;

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
    -- 참석 시간 = 하트비트 사이가 150초(ONLINE_MS, '접속 중' 기준) 이하인 구간만 더한다 — 그보다 길면 나갔다 들어온 것(sql/020)
    UPDATE smn_atd a SET lst_hb_dtm = GREATEST(a.lst_hb_dtm, CURRENT_TIMESTAMP),
           atnd_sec_cnt = a.atnd_sec_cnt + CASE WHEN CURRENT_TIMESTAMP - v_prev BETWEEN INTERVAL '0' AND INTERVAL '150 seconds'
                                                THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_prev))::INT ELSE 0 END,
           modr_id = p_usr_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
     WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.del_yn = 'N';
  ELSE
    -- 첫 입장 — 계량 없음(경과 0). 동시 첫 호출은 한쪽만 INSERT
    INSERT INTO smn_atd (smn_id, usr_id, ent_dtm, lst_hb_dtm, regr_id, modr_id)
    VALUES (p_smn_id, p_usr_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, p_usr_id::TEXT, p_usr_id::TEXT)
    ON CONFLICT (smn_id, usr_id) WHERE del_yn = 'N' DO NOTHING;
  END IF;

  IF NOT COALESCE(v_live, FALSE) THEN RETURN NULL; END IF;

  PERFORM fn_rem_smn_plan(p_usr_id); -- 이번 달 FREE 보장(달이 바뀐 채 진행 중이어도)
  -- 하트비트 사이 90초 이하만 차감 — 그보다 길면 룸을 나가 있던 것(022)
  v_left := CASE WHEN CURRENT_TIMESTAMP - v_prev BETWEEN INTERVAL '0' AND INTERVAL '90 seconds'
                 THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_prev))::INT ELSE 0 END;
  FOR r IN
    SELECT p.pln_id, p.grnt_sec_cnt - p.use_sec_cnt AS rem
      FROM smn_hst_pln p
     WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
       AND (p.plan_cd = v_plan OR (v_plan <> 'FREE' AND p.plan_cd = 'FREE')) -- 유료 세미나 = 그 요금제 다음 무료(021)
       AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
       AND p.use_sec_cnt < p.grnt_sec_cnt
     -- 유료 먼저 → 이용권 기간 짧은 것부터(서비스권 시간권 → 일권 → 월권, 025) → 같은 기간이면 만료 빠른 것부터
     ORDER BY (p.plan_cd = 'FREE'), (p.end_dtm - p.strt_dtm), p.end_dtm, p.pln_id
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
             AND (p.plan_cd = v_plan OR (v_plan <> 'FREE' AND p.plan_cd = 'FREE'))
             AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP);
END;
$$;
COMMENT ON FUNCTION fn_hb_smn_hst(UUID, UUID) IS '개최자 하트비트 — 출석 행 잠금·갱신(참석초수 누적), LIVE 개최자면 하트비트 사이 90초 이하 경과만 세미나 요금제 이용권 → (유료 세미나면) 무료 순으로 차감. 같은 요금제 안에서는 이용권 기간 짧은 것부터 = 서비스권 시간권 → 일권 → 월권(sql/025), 그 남은 초 합 반환(계량 안 하면 NULL)';

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
     -- 소진 순서의 거울상 — 기간 긴 것(월권)부터, 같은 기간이면 만료 늦은 것부터(025)
     ORDER BY (p.end_dtm - p.strt_dtm) DESC, p.end_dtm DESC, p.pln_id
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
COMMENT ON FUNCTION fn_adj_smn_plan(UUID, VARCHAR, INT, VARCHAR, UUID) IS '관리자 시간 축소 — 그 요금제 유효 이용권 사용초수 증가(기간 긴 것부터 = 월권 → 일권 → 시간권, 남은 만큼만) + 이력 1행. 반환 실제 반영 초(음수, 0 = 없음)·그 요금제 남은 초(sql/024·025)';

-- CREATE OR REPLACE 는 SET search_path 를 지운다(017 교훈) — 다시 고정 + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_hb_smn_hst(UUID, UUID) SET search_path = %I, pg_temp', current_schema());
  EXECUTE format('ALTER FUNCTION fn_adj_smn_plan(UUID, VARCHAR, INT, VARCHAR, UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_hb_smn_hst(UUID, UUID)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_adj_smn_plan(UUID, VARCHAR, INT, VARCHAR, UUID)');

COMMIT;
