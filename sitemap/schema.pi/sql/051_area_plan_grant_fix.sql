-- 051_area_plan_grant_fix.sql : 결제 반영 함수 보강(검증 지적 M1 2026-10-19) — 승인 뒤 요금표 가격이 바뀌어도 이미 결제된 건은 반영
-- DA-APPROVED: 마스터 결정 2026-10-19 요금제 결제 — 함수 본문만(구조 변경 없음). 금액은 approve 시점에 서버가 요금표와 정확히 대조해 원장에 기록했으므로
--  반영 시점에는 요금제·주기 존재(사용 개월수)만 확인한다. 나머지(완료 결제·유형·분류체계·중복 반영 차단·같은 요금제 연장)는 049 와 같음
BEGIN;

CREATE OR REPLACE FUNCTION fn_area_plan_grant(p_pymnt_id TEXT)
RETURNS std_area_plan
LANGUAGE plpgsql
AS $$
DECLARE
  v_p   pi_pymnt;
  v_f   sys_fee_plan;
  v_r   std_area_plan;
  v_a   UUID;
  v_cd  TEXT;
  v_prd TEXT;
  v_base TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_r FROM std_area_plan WHERE pymnt_id = p_pymnt_id;
  IF FOUND THEN RETURN v_r; END IF;
  SELECT * INTO v_p FROM pi_pymnt WHERE pymnt_id = p_pymnt_id AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND OR v_p.pymnt_sts_cd <> 'COMPLETED' OR v_p.pymnt_tp_cd <> 'AREA_PLAN' THEN
    RAISE EXCEPTION 'area_plan_pymnt: 완료된 요금제 결제가 아닙니다' USING ERRCODE = 'MPL01';
  END IF;
  v_a := (v_p.meta_val->>'area_id')::uuid;
  v_cd := v_p.meta_val->>'plan_cd';
  v_prd := v_p.meta_val->>'prd_cd';
  SELECT * INTO v_f FROM sys_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd; -- 사용 개월수만(가격은 approve 때 검증, 이후 변경·사용 중지와 무관)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'area_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01';
  END IF;
  PERFORM 1 FROM std_area WHERE area_id = v_a AND del_yn = 'N' FOR UPDATE; -- 같은 분류체계 동시 결제 직렬화
  IF NOT FOUND THEN RAISE EXCEPTION 'area_plan_area: 분류체계가 없습니다' USING ERRCODE = 'MPL01'; END IF;
  SELECT GREATEST(CURRENT_TIMESTAMP, COALESCE(max(end_dtm), CURRENT_TIMESTAMP)) INTO v_base
    FROM std_area_plan WHERE area_id = v_a AND plan_cd = v_cd AND del_yn = 'N';
  INSERT INTO std_area_plan (area_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
  VALUES (v_a, v_cd, v_prd, v_base, v_base + make_interval(months => v_f.use_mon_cnt), 'PAY', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
  RETURNING * INTO v_r;
  RETURN v_r;
END;
$$;

COMMIT;
