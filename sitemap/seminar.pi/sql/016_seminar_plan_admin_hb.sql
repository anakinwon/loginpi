-- 016 개최자 하트비트 계량 — ADMIN·MASTER 개최자 비계량(무제한) 반영. 015 를 dev 에 먼저 적용한 뒤 바뀐 fn_hb_smn_hst 만 다시 만든다
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-28) — 기존 함수 본문 교체만(테이블·칼럼 변경 없음). 새 DB 는 015 와 같은 정의 재생성(멱등)
-- 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod

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
