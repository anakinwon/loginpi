-- 054_area_plan_upgrade_new_term.sql : 업그레이드 반영 방식 변경(마스터 지시 2026-10-19 '차액 = 상위 가격 − (현재 가격 − 현재 가격 × 사용일/30)')
--  업그레이드 = 승인 시각부터 상위 요금제 새 주기(meta prd : M 1개월·Y 1년), 금액(상위 가격 − 현재 요금제 미사용분)은 approve 때 서버가 src/lib/upgrade.ts 로 대조
--  053 의 '승인 시각 ~ 이전 종료일(meta end)' 방식 대체. 053 방식 업그레이드 결제는 운영 0건(구 코드는 U 결제를 만들지 않음)
--  일반 결제(PAY) 시작 = 같은 요금제 또는 더 높은 요금제의 마지막 종료일 뒤(높은 요금제 사용 중 하위 요금제를 사면 겹쳐 버려지던 기간 방지, 검증 지적 2026-10-19)
-- DA-APPROVED: 마스터 지시 2026-10-19 업그레이드 일할계산 — fn_area_plan_grant 본문만(구조 변경 없음)
BEGIN;

CREATE OR REPLACE FUNCTION fn_area_plan_grant(p_pymnt_id TEXT)
RETURNS std_area_plan
LANGUAGE plpgsql
AS $$
DECLARE
  v_p    pi_pymnt;
  v_f    sys_fee_plan;
  v_r    std_area_plan;
  v_a    UUID;
  v_cd   TEXT;
  v_prd  TEXT;
  v_from TEXT;
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
  PERFORM 1 FROM std_area WHERE area_id = v_a AND del_yn = 'N' FOR UPDATE; -- 같은 분류체계 동시 결제 직렬화
  IF NOT FOUND THEN RAISE EXCEPTION 'area_plan_area: 분류체계가 없습니다' USING ERRCODE = 'MPL01'; END IF;

  IF v_prd = 'U' THEN
    -- 업그레이드 : 승인 시각부터 상위 요금제 새 주기. 이전 요금제 기간은 그대로(높은 요금제 우선 — 이전 기간이 먼저 끝남)
    v_from := v_p.meta_val->>'from_plan';
    v_prd := v_p.meta_val->>'prd';
    -- 상위 요금제 또는 같은 요금제 월 → 연(마스터 지시 2026-10-19). 현재 기간 주기 대조는 approve(서버 견적)가 함
    IF NOT COALESCE(v_from IN ('P1', 'P2', 'P3', 'P4') AND v_cd IN ('P1', 'P2', 'P3', 'P4') AND v_prd IN ('M', 'Y') AND (v_from < v_cd OR (v_from = v_cd AND v_prd = 'Y')), FALSE) THEN
      RAISE EXCEPTION 'area_plan_upg: 상위 요금제 업그레이드가 아닙니다' USING ERRCODE = 'MPL01';
    END IF;
    SELECT * INTO v_f FROM sys_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd;
    IF NOT FOUND THEN RAISE EXCEPTION 'area_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01'; END IF;
    INSERT INTO std_area_plan (area_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
    VALUES (v_a, v_cd, v_prd, v_p.apv_dtm, v_p.apv_dtm + make_interval(months => v_f.use_mon_cnt), 'UPG', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
    RETURNING * INTO v_r;
    RETURN v_r;
  END IF;

  SELECT * INTO v_f FROM sys_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd; -- 사용 개월수만(가격은 approve 때 검증, 이후 변경·사용 중지와 무관)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'area_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01';
  END IF;
  SELECT GREATEST(CURRENT_TIMESTAMP, COALESCE(max(end_dtm), CURRENT_TIMESTAMP)) INTO v_base
    FROM std_area_plan WHERE area_id = v_a AND plan_cd >= v_cd AND del_yn = 'N'; -- 같은·높은 요금제 뒤로(P1~P4 문자 순서 = 등급 순서)
  INSERT INTO std_area_plan (area_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
  VALUES (v_a, v_cd, v_prd, v_base, v_base + make_interval(months => v_f.use_mon_cnt), 'PAY', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
  RETURNING * INTO v_r;
  RETURN v_r;
END;
$$;

COMMIT;
