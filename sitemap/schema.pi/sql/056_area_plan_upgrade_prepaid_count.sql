-- 056_area_plan_upgrade_prepaid_count.sql : 선결제 중 업그레이드 반영을 견적에 든 선결제 수만큼으로 제한(보안 검토 2026-10-19)
--  055 는 reg_dtm < 승인 시각으로 거름 — approve 견적 계산과 원장 기록(apv_dtm) 사이에 반영된 선결제가 차액 없이 상위 요금제로 바뀔 틈
--  approve 가 서버 견적의 선결제 수를 meta_val.pre 에 기록 → 시작이 이른 순서로 그 수만큼만 바꿈(선결제는 항상 마지막 종료 뒤에 붙으므로 이른 N개 = 견적에 든 기간)
--  pre 없음(이 배포 전 승인된 결제) = 055 동작 그대로(LIMIT NULL = 제한 없음)
-- DA-APPROVED: 마스터 지시 2026-10-19 선결제 업그레이드 보안 보완 — fn_area_plan_grant 본문만(구조 변경 없음)
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
  v_t    std_area_plan;
  v_m    INT;
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
    -- 선결제(승인 시각 뒤 시작하는 이전 요금제 결제 기간) = 상위 요금제로 바꿔 새 주기 종료일 뒤로 차례로 이어 붙임(차액은 approve 견적에 포함)
    v_base := v_r.end_dtm;
    FOR v_t IN SELECT * FROM std_area_plan WHERE area_id = v_a AND plan_cd = v_from AND grnt_rsn_cd = 'PAY' AND strt_dtm > v_p.apv_dtm AND reg_dtm < v_p.apv_dtm AND del_yn = 'N' ORDER BY strt_dtm LIMIT (v_p.meta_val->>'pre')::int LOOP
      -- 견적에 든 선결제 수(meta pre)만 + reg_dtm < 승인 시각(승인 뒤 반영된 선결제가 차액 없이 올라가는 경합 차단, 보안 검토 2026-10-19)
      SELECT use_mon_cnt INTO v_m FROM sys_fee_plan WHERE plan_cd = v_cd AND prd_cd = v_t.prd_cd;
      IF NOT FOUND THEN RAISE EXCEPTION 'area_plan_fee: 요금제가 없습니다' USING ERRCODE = 'MPL01'; END IF;
      UPDATE std_area_plan SET plan_cd = v_cd, strt_dtm = v_base, end_dtm = v_base + make_interval(months => v_m), modr_id = v_p.usr_id::text
        WHERE area_plan_id = v_t.area_plan_id;
      v_base := v_base + make_interval(months => v_m);
    END LOOP;
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
