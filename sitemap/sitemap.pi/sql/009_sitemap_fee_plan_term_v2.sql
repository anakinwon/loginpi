-- 009_sitemap_fee_plan_term_v2.sql — 요금제 기간 재확정 : PRM1 2년 · PRM2 3년 · VIP 5년 (마스터 확정 2026-10-11)
-- DA-APPROVED: 마스터 확정 2026-10-11 — 데이터 UPDATE 3행(use_mon_cnt), DDL 없음 (2026-10-11)
-- 선행 : 008. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 변경 : 단가는 그대로(마스터 지시 범위 = 기간). VIP 는 영구(NULL) → 60개월이라 10년 환산 경로를 더 쓰지 않는다.
--  · PRM1 36 → 24개월 (64.8 Pi, 1개월 3 Pi 기준 10% 할인)
--  · PRM2 60 → 36개월 (90 Pi, 17%)
--  · VIP NULL → 60개월 (270 Pi, 월 환산 4.5 Pi > 3 Pi → 할인 미표시)
BEGIN;

UPDATE fee_plan SET use_mon_cnt = 24 WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';
UPDATE fee_plan SET use_mon_cnt = 36 WHERE fee_plan_cd = 'REG_PRM2' AND del_yn = 'N';
UPDATE fee_plan SET use_mon_cnt = 60 WHERE fee_plan_cd = 'REG_VIP'  AND del_yn = 'N';

COMMIT;
