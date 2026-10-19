-- 053_area_plan_upgrade.sql : 요금제 업그레이드 일할계산 반영(마스터 지시 2026-10-19) — 남은 기간만 상위 요금제, 기간 = 승인 시각 ~ 견적 종료일(metadata end, 승인 때 서버 대조)
--  완료 시점에 다시 계산하지 않음 : 승인 뒤 산 이전 요금제 연장분이 무상 업그레이드되거나 완료 지연으로 결제 일수를 잃지 않게(검증 지적 2026-10-19)
--  부여사유코드 UPG(업그레이드) 추가. 금액은 approve 때 서버가 일할계산(src/lib/upgrade.ts)과 대조해 원장에 기록 — 반영 시점에는 기간만 정함
--  기존 PAY(월·년) 반영은 051 과 같음
-- DA-APPROVED: 마스터 지시 2026-10-19 '상위 요금제 업그레이드 일할계산' — std_area_plan 부여사유 CHECK 에 UPG 추가(컬럼 변경 없음) + fn_area_plan_grant 본문
BEGIN;

ALTER TABLE std_area_plan DROP CONSTRAINT IF EXISTS std_area_plan_grnt_rsn_cd_check;
ALTER TABLE std_area_plan ADD CONSTRAINT std_area_plan_grnt_rsn_cd_check
  CHECK ((grnt_rsn_cd IN ('PAY', 'UPG') AND pymnt_id IS NOT NULL AND prd_cd IS NOT NULL) OR (grnt_rsn_cd = 'GRACE' AND pymnt_id IS NULL));
COMMENT ON COLUMN std_area_plan.grnt_rsn_cd IS '부여사유코드 PAY 결제 / UPG 업그레이드(일할계산) / GRACE 유예';

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
  v_end  TIMESTAMPTZ;
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
    -- 업그레이드 : 승인 시각 ~ 견적 종료일(최소 하루 — 남은 일수 올림이라 최소 하루치를 받음). 주기 = 이전 요금제 행 주기(섞인 주기는 견적 단계에서 거부)
    v_from := v_p.meta_val->>'from_plan';
    v_end := (v_p.meta_val->>'end')::timestamptz;
    IF NOT COALESCE(v_from IN ('P1', 'P2', 'P3') AND v_cd IN ('P2', 'P3', 'P4') AND v_from < v_cd AND v_end IS NOT NULL, FALSE) THEN
      RAISE EXCEPTION 'area_plan_upg: 상위 요금제 업그레이드가 아닙니다' USING ERRCODE = 'MPL01';
    END IF;
    SELECT prd_cd INTO v_prd FROM std_area_plan
     WHERE area_id = v_a AND plan_cd = v_from AND grnt_rsn_cd IN ('PAY', 'UPG') AND del_yn = 'N' AND strt_dtm < v_end
     ORDER BY end_dtm DESC LIMIT 1;
    v_end := GREATEST(v_end, v_p.apv_dtm + INTERVAL '1 day');
    INSERT INTO std_area_plan (area_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
    VALUES (v_a, v_cd, COALESCE(v_prd, 'M'), v_p.apv_dtm, v_end, 'UPG', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
    RETURNING * INTO v_r;
    RETURN v_r;
  END IF;

  SELECT * INTO v_f FROM sys_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_prd; -- 사용 개월수만(가격은 approve 때 검증, 이후 변경·사용 중지와 무관)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'area_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01';
  END IF;
  SELECT GREATEST(CURRENT_TIMESTAMP, COALESCE(max(end_dtm), CURRENT_TIMESTAMP)) INTO v_base
    FROM std_area_plan WHERE area_id = v_a AND plan_cd = v_cd AND del_yn = 'N';
  INSERT INTO std_area_plan (area_id, plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd, pymnt_id, regr_id, modr_id)
  VALUES (v_a, v_cd, v_prd, v_base, v_base + make_interval(months => v_f.use_mon_cnt), 'PAY', p_pymnt_id, v_p.usr_id::text, v_p.usr_id::text)
  RETURNING * INTO v_r;
  RETURN v_r;
END;
$$;

COMMIT;
