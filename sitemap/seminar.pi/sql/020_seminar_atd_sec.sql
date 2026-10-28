-- 020 출석 참석 시간 누적 — 출석부가 '최초 입장 ~ 최종 종료' 사이에서 들락거린(나가 있던) 시간을 뺀 실제 참석 시간을 보이게(마스터 2026-10-29)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-29) — smn_atd 칼럼 1개(atnd_sec_cnt 참석초수)·fn_hb_smn_hst 본문 교체(018 + 누적 1식). DA 사후 리뷰 대상
-- 선행 : 008(smn_atd)·018(fn_hb_smn_hst). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod (2회 멱등)
--  · 기존 행 = 최종 확인 − 최초 입장(들락거림을 알 수 없으므로 최선값, 첫 적용 때 0 인 행만)
BEGIN;

ALTER TABLE smn_atd ADD COLUMN IF NOT EXISTS atnd_sec_cnt INT NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smn_atd_atnd_sec_cnt_check' AND conrelid = 'smn_atd'::regclass) THEN
    ALTER TABLE smn_atd ADD CONSTRAINT smn_atd_atnd_sec_cnt_check CHECK (atnd_sec_cnt >= 0);
  END IF;
END;
$$;
COMMENT ON COLUMN smn_atd.atnd_sec_cnt IS '참석초수 — 하트비트 사이 150초 이하 구간 합(나가 있던 시간 제외, sql/020)';
UPDATE smn_atd SET atnd_sec_cnt = GREATEST(EXTRACT(EPOCH FROM (lst_hb_dtm - ent_dtm))::INT, 0)
 WHERE atnd_sec_cnt = 0 AND lst_hb_dtm > ent_dtm;

-- 개최자 하트비트 — 018 과 같고 참석 시간 누적만 더함
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
COMMENT ON FUNCTION fn_hb_smn_hst(UUID, UUID) IS '개최자 하트비트 — 출석 행 잠금·갱신(참석초수 누적, 150초 넘는 공백 제외), LIVE 개최자면(관리자 포함) 경과초(0~90)를 세미나 요금제(plan_cd) 이용권에서 만료 빠른 것부터 차감하고 그 요금제 남은 초 합 반환(계량 안 하면 NULL)';

-- CREATE OR REPLACE 는 SET search_path 를 지운다(017 교훈) — 다시 고정 + 서버 전용 권한
DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_hb_smn_hst(UUID, UUID) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_hb_smn_hst(UUID, UUID)');

COMMIT;
