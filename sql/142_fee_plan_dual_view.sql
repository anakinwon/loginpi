-- DA-APPROVED: 1:100 매핑 뷰 + bean_txn.pi_amt 의미 확장 (PRD_24 §5·§10, v0.3, 2026-06-29)
--   단일출처(bean_fee_plan.amt_bean) 유지 + Pi는 파생계산(÷100). 별도 Pi 테이블 금지(sync 버그).
--   Bean 정수라 ÷100은 항상 소수 2자리 이내 → 1:100 완벽 매핑 수학적 보장.

-- ── 1. v_fee_plan_dual — Bean·Pi 1:100 동시 표시 (관리 화면·요금 조회) ────────
--   SPEND(요금) + REWARD(FBCK_REWARD FR_1~5) 전체 포함 → 보상도 1:100 가시화.
CREATE OR REPLACE VIEW public.v_fee_plan_dual AS
SELECT
  fee_plan_cd,
  subscr_div_cd,
  prod_ctgr_cd,
  fee_knd_cd,
  grade_cd,
  bill_cycle_cd,
  amt_bean,                              -- 정본(Bean 정수)
  ROUND(amt_bean / 100.0, 2) AS amt_pi,  -- 파생(1:100, Bean 정수 → 항상 소수 2자리)
  qty_limit,
  fee_plan_desc,
  use_yn,
  sort_ord
FROM public.bean_fee_plan
WHERE del_yn = 'N'
ORDER BY sort_ord;

COMMENT ON VIEW public.v_fee_plan_dual IS
  '요금제 Bean·Pi 1:100 매핑 동시 표시 — bean_fee_plan 파생(amt_pi=amt_bean÷100). 단일출처 유지. PRD_24 §5·§10-3';

-- ── 2. bean_txn.pi_amt 의미 확장 (COMMENT만 — 컬럼·타입·데이터 무변경) ───────
--   기존: CHARGE 시 지불 Pi 스냅샷. 확장: PI 요금제 모드의 SPEND/REWARD Pi 환산값도 병기.
COMMENT ON COLUMN public.bean_txn.pi_amt IS
  'Pi 금액 — ① CHARGE 시 지불 Pi(기존) ② PI 요금제 모드의 SPEND/REWARD Pi 환산값 병기(PRD_24 v0.3, 1:100). Bean 전용 거래는 NULL';

-- 검증:
--   SELECT fee_plan_cd, amt_bean, amt_pi FROM public.v_fee_plan_dual WHERE prod_ctgr_cd='FBCK_REWARD';
--   SELECT fee_plan_cd, amt_bean, amt_pi FROM public.v_fee_plan_dual ORDER BY sort_ord;
