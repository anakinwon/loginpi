-- 071_area_plan_trial.sql : 새 분류체계 7일 체험(요금제4) 소급 — 요금제 행이 하나도 없는 분류체계(결제·체험 이력 없음)에 지금부터 7일 GRACE 부여
--  새로 만드는 분류체계는 POST /api/areas 가 같은 행을 만든다(마스터 지시 2026-10-22). sql/052 로 유예가 끝난 기존 분류체계는 행이 있어 제외
-- DA-APPROVED: 마스터 지시 2026-10-22 '새 분류체계 7일 체험(P4)' — std_area_plan 데이터만(구조 변경 없음), 재적용해도 추가 행 없음
BEGIN;

INSERT INTO std_area_plan (area_id, plan_cd, strt_dtm, end_dtm, grnt_rsn_cd, regr_id, modr_id)
SELECT a.area_id, 'P4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days', 'GRACE', 'MIGR', 'MIGR'
  FROM std_area a
 WHERE a.del_yn = 'N'
   AND NOT EXISTS (SELECT 1 FROM std_area_plan p WHERE p.area_id = a.area_id);

COMMIT;
