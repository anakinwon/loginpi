-- 021 카운트다운 이원화 — 유료(M·Y) 세미나는 그 요금제 이용권을 먼저 쓰고, 다 쓰면 이번 달 무료 시간을 이어서 쓴다(마스터 2026-10-29)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-29) — fn_hb_smn_hst 본문 교체만(차감 대상·순서·반환 합). 테이블 변경 없음
-- 선행 : 020. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
--  · FREE 세미나 = 무료만(그대로). M·Y 세미나 = 그 요금제 → 무료 순. 반환 = 그 둘의 남은 초 합(0 이하 = 방 종료)
--  · AI 허용(fn_chk_smn_plan_ai)은 그대로 — 유료 요금제 시간이 남아 있을 때만(무료 구간에 들어서면 AI 꺼짐)
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
  v_left := COALESCE(LEAST(GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_prev))::INT, 0), 90), 0);
  FOR r IN
    SELECT p.pln_id, p.grnt_sec_cnt - p.use_sec_cnt AS rem
      FROM smn_hst_pln p
     WHERE p.usr_id = p_usr_id AND p.del_yn = 'N'
       AND (p.plan_cd = v_plan OR (v_plan <> 'FREE' AND p.plan_cd = 'FREE')) -- 유료 세미나 = 그 요금제 다음 무료(021)
       AND p.strt_dtm <= CURRENT_TIMESTAMP AND p.end_dtm > CURRENT_TIMESTAMP
       AND p.use_sec_cnt < p.grnt_sec_cnt
     ORDER BY (p.plan_cd = 'FREE'), p.end_dtm, p.pln_id -- 유료 먼저, 같은 요금제 안에서는 만료 빠른 것부터
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
COMMENT ON FUNCTION fn_hb_smn_hst(UUID, UUID) IS '개최자 하트비트 — 출석 행 잠금·갱신(참석초수 누적), LIVE 개최자면(관리자 포함) 경과초(0~90)를 세미나 요금제 이용권 → (유료 세미나면) 이번 달 무료 순으로 차감하고 그 남은 초 합 반환(계량 안 하면 NULL, sql/021)';

-- CREATE OR REPLACE 는 SET search_path 를 지운다(017 교훈) — 다시 고정 + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_hb_smn_hst(UUID, UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_hb_smn_hst(UUID, UUID)');

COMMIT;
