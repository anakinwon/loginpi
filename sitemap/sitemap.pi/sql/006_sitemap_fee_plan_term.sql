-- 006_sitemap_fee_plan_term.sql — 요금표 기간·1개월 기준단가 (마스터 지시 2026-10-11 : 요금제에 기간과 1달 요금 대비 할인폭 표시)
-- DA-APPROVED: 마스터 지시 2026-10-11 — fee_plan 컬럼 2개 추가(use_mon_cnt·mon_pi_amt). 표준단어 `mon`(개월) 신규 사용 — DA 사후 리뷰 대상 (2026-10-11)
-- 선행 : 004 → 005. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 설계 :
--  · use_mon_cnt : 이용 개월수. NULL = 영구(VIP). 표시만 담당 — 만료 처리는 Phase 2(PRD §3-1 기간제)
--  · mon_pi_amt  : 1개월 기준 단가(Pi). 할인율 = 1 - pi_amt / (mon_pi_amt × 개월수) 를 서버(getRegFees)가 계산, 영구(NULL)는 할인 미표시(PRD §3-1 "—")
--  · 시드는 PRD §3-1 1개월 3 Pi 기준(BSC1 6개월 17% · BSC2 12개월 25% · PRM2 5년 40% · VIP 영구 미표시).
--  · DA 후속 : 기간 컬럼은 DA 사전 D3·Phase 2 모델이 use_day_cnt(일수)로 정해 둠 — Phase 2 fee_plan 통합 때 하나로 합침, prod 적용 전 da-governance-expert 리뷰(docs/HANDOFF.md §6)
--    PRM1(1년 54 Pi)은 3 Pi 기준이면 월 환산이 1개월 단가를 넘어 할인 없음 — PRD §3 "프리미엄1·기본2 가격 차이 [확인중 : 마스터]" 그대로, 확정 시 UPDATE 로 반영
BEGIN;

ALTER TABLE fee_plan ADD COLUMN IF NOT EXISTS use_mon_cnt INTEGER;                           -- 이용개월수 (NULL = 영구)
ALTER TABLE fee_plan ADD COLUMN IF NOT EXISTS mon_pi_amt  NUMERIC(18,7) NOT NULL DEFAULT 0;  -- 1개월 기준단가(Pi, 할인율 분모. 0 = 할인 미표시)
COMMENT ON COLUMN fee_plan.use_mon_cnt IS '이용 개월수 — NULL 은 영구. 표시용(만료 처리는 Phase 2)';
COMMENT ON COLUMN fee_plan.mon_pi_amt  IS '1개월 기준 단가(Pi) — 할인율 분모. 0 이면 할인 미표시';

ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_use_mon_cnt_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_use_mon_cnt_check CHECK (use_mon_cnt IS NULL OR use_mon_cnt > 0);
ALTER TABLE fee_plan DROP CONSTRAINT IF EXISTS fee_plan_mon_pi_amt_check;
ALTER TABLE fee_plan ADD  CONSTRAINT fee_plan_mon_pi_amt_check CHECK (mon_pi_amt >= 0);

-- 시드 — PRD §3 요금제 기간(VIP 영구 / PRM2 5년 / PRM1 1년 / BSC2 12개월 / BSC1 6개월), 1개월 기준 3 Pi(PRD §3-1)
UPDATE fee_plan SET use_mon_cnt = NULL, mon_pi_amt = 3 WHERE fee_plan_cd = 'REG_VIP'  AND del_yn = 'N';
UPDATE fee_plan SET use_mon_cnt = 60,   mon_pi_amt = 3 WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET use_mon_cnt = 12,   mon_pi_amt = 3 WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET use_mon_cnt = 12,   mon_pi_amt = 3 WHERE fee_plan_cd = 'REG_BSC2' AND del_yn = 'N';
UPDATE fee_plan SET use_mon_cnt = 6,    mon_pi_amt = 3 WHERE fee_plan_cd = 'REG_BSC1' AND del_yn = 'N';

COMMIT;
