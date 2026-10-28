-- 023 녹화 계량 — 녹화(로컬 저장)는 월간·연간 요금제 세미나만, 녹화 중에는 룸 시간과 따로 녹화 시간을 유료 이용권에서 한 번 더 차감(마스터 2026-10-29)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-29) — smn_atd 칼럼 2개(rec_hb_dtm 녹화확인일시·rec_sec_cnt 녹화초수)·함수 1개(fn_rec_smn) 신규. DA 사후 리뷰 대상
-- 선행 : 008(smn_atd)·015(smn_hst_pln)·018(smn_mst.plan_cd)·022. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
--
-- 결정 :
--  · 녹화 파일은 서버에 남기지 않는다(브라우저 내려받기만, 녹화 기능 그대로) — 서버는 시간만 센다
--  · 허용 = 세미나 LIVE + 요금제 M·Y + 그 요금제 유료 남은 시간 > 0 (AI 허용 fn_chk_smn_plan_ai 와 같은 기준 — 무료 구간에 들어서면 녹화 불가)
--  · 차감 = 녹화하는 사람의 출석 행 rec_hb_dtm 이후 경과(90초 이하만 — 넘으면 끊겼던 것, 022 와 같은 기준)를 세미나 개최자의 그 요금제 유료 이용권에서(만료 빠른 것부터). 무료로 넘어가지 않는다
--  · 녹화하는 사람 권한(개최자·관리자 = 발표자)은 API 가 확인한다
BEGIN;

ALTER TABLE smn_atd ADD COLUMN IF NOT EXISTS rec_hb_dtm TIMESTAMPTZ;
ALTER TABLE smn_atd ADD COLUMN IF NOT EXISTS rec_sec_cnt INT NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smn_atd_rec_sec_cnt_check' AND conrelid = 'smn_atd'::regclass) THEN
    ALTER TABLE smn_atd ADD CONSTRAINT smn_atd_rec_sec_cnt_check CHECK (rec_sec_cnt >= 0);
  END IF;
END;
$$;
COMMENT ON COLUMN smn_atd.rec_hb_dtm IS '녹화확인일시 — 녹화 중 마지막 녹화 하트비트(NULL = 녹화 안 함). 다음 하트비트가 이 뒤 경과(90초 이하)를 유료 이용권에서 차감(sql/023)';
COMMENT ON COLUMN smn_atd.rec_sec_cnt IS '녹화초수 — 이 세미나에서 녹화로 차감된 초 합(감사·표시용, sql/023)';

-- 녹화 계량 — p_act START(시작 : 기준 시각만 둔다) · BEAT(경과 차감) · STOP(경과 차감 후 녹화 끝)
--  반환 rslt_cd : OK · CLOSED(LIVE 아님) · PAID_ONLY(무료 세미나) · EXHAUSTED(유료 남은 시간 0 — 녹화 멈춤) · NOT_IN_ROOM(출석 행 없음), paid_sec = 차감 뒤 유료 남은 초
CREATE OR REPLACE FUNCTION fn_rec_smn(p_smn_id UUID, p_usr_id UUID, p_act VARCHAR)
RETURNS TABLE (rslt_cd VARCHAR, paid_sec BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sts  VARCHAR(20);
  v_plan VARCHAR(10);
  v_host UUID;
  v_prev TIMESTAMPTZ;
  v_left INT := 0;
  v_take INT;
  v_used INT := 0;
  v_paid BIGINT;
  r RECORD;
BEGIN
  IF p_act IS NULL OR p_act NOT IN ('START', 'BEAT', 'STOP') THEN
    RAISE EXCEPTION 'act invalid' USING ERRCODE = '22023';
  END IF;
  SELECT s.smn_sts_cd, s.plan_cd, s.hst_usr_id INTO v_sts, v_plan, v_host
    FROM smn_mst s WHERE s.smn_id = p_smn_id AND s.del_yn = 'N';

  -- 녹화하는 사람 출석 행 잠금(같은 사람 하트비트·녹화 하트비트 직렬화) — 끝내기(STOP)는 상태와 관계없이 기준 시각을 지운다
  SELECT a.rec_hb_dtm INTO v_prev FROM smn_atd a
   WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.del_yn = 'N' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_IN_ROOM'::VARCHAR, 0::BIGINT; RETURN; END IF;

  IF v_sts IS DISTINCT FROM 'LIVE' OR v_plan NOT IN ('M', 'Y') THEN
    UPDATE smn_atd a SET rec_hb_dtm = NULL, modr_id = p_usr_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
     WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.del_yn = 'N' AND a.rec_hb_dtm IS NOT NULL;
    RETURN QUERY SELECT (CASE WHEN v_sts IS DISTINCT FROM 'LIVE' THEN 'CLOSED' ELSE 'PAID_ONLY' END)::VARCHAR, 0::BIGINT;
    RETURN;
  END IF;

  -- 경과 차감(BEAT·STOP, 기준 시각이 있고 90초 이하일 때만) — 세미나 개최자의 그 요금제 유료 이용권, 만료 빠른 것부터
  IF p_act <> 'START' AND v_prev IS NOT NULL AND CURRENT_TIMESTAMP - v_prev BETWEEN INTERVAL '0' AND INTERVAL '90 seconds' THEN
    v_left := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_prev))::INT;
    FOR r IN
      SELECT p.pln_id, p.grnt_sec_cnt - p.use_sec_cnt AS rem
        FROM smn_hst_pln p
       WHERE p.usr_id = v_host AND p.del_yn = 'N' AND p.plan_cd = v_plan
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
      v_used := v_used + v_take;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(p.grnt_sec_cnt - p.use_sec_cnt), 0)::BIGINT INTO v_paid
    FROM smn_hst_pln p
   WHERE p.usr_id = v_host AND p.del_yn = 'N' AND p.plan_cd = v_plan
     AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP;

  -- 기준 시각 : 계속(START·BEAT, 남은 시간 있음) = 지금, 끝(STOP·소진) = NULL
  UPDATE smn_atd a
     SET rec_hb_dtm = CASE WHEN p_act = 'STOP' OR v_paid <= 0 THEN NULL ELSE CURRENT_TIMESTAMP END,
         rec_sec_cnt = a.rec_sec_cnt + v_used,
         modr_id = p_usr_id::TEXT, mod_dtm = CURRENT_TIMESTAMP
   WHERE a.smn_id = p_smn_id AND a.usr_id = p_usr_id AND a.del_yn = 'N';

  RETURN QUERY SELECT (CASE WHEN v_paid <= 0 AND p_act <> 'STOP' THEN 'EXHAUSTED' ELSE 'OK' END)::VARCHAR, v_paid;
END;
$$;
COMMENT ON FUNCTION fn_rec_smn(UUID, UUID, VARCHAR) IS '녹화 계량 — START·BEAT·STOP. LIVE·M·Y 세미나만, 녹화 하트비트 사이 90초 이하 경과를 개최자의 세미나 요금제 유료 이용권에서 추가 차감(룸 시간과 별도). OK·CLOSED·PAID_ONLY·EXHAUSTED·NOT_IN_ROOM + 유료 남은 초';

DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_rec_smn(UUID, UUID, VARCHAR) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_rec_smn(UUID, UUID, VARCHAR)');

COMMIT;
