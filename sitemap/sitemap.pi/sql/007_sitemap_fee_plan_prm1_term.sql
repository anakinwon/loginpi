-- 007_sitemap_fee_plan_prm1_term.sql — 프리미엄1 기간 3년 확정 (마스터 확정 2026-10-11)
-- DA-APPROVED: 마스터 확정 2026-10-11 — 데이터 UPDATE 1행(use_mon_cnt), DDL 없음. 006 의 DA 후속(use_mon_cnt ↔ use_day_cnt)은 그대로 (2026-10-11)
-- 선행 : 006. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 변경 :
--  · PRM1 이용 개월수 12 → 36 (3년). 54 Pi / (3 Pi × 36개월) → 1개월 대비 50% 할인. PRD §3 "프리미엄1·기본2 기간 동일 [확인중]" 해소
--  · 영구(VIP) 할인은 마스터 확정으로 10년(120개월) 환산 표시 — 계산은 서버(regFeeDiscountPct), DB 변경 없음. 006 주석의 "영구 미표시"는 본 결정으로 대체
BEGIN;

UPDATE fee_plan SET use_mon_cnt = 36 WHERE fee_plan_cd = 'REG_PRM1' AND del_yn = 'N';

COMMIT;
