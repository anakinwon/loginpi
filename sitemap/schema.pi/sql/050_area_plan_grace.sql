-- 050_area_plan_grace.sql : 기존 분류체계 요금제4 1주일 유예(마스터 결정 2026-10-19) — 운영 배포 때 적용(유예 시작 = 적용 시각)
-- DA-APPROVED: 마스터 결정 2026-10-19 '배포 시 기존 분류체계 1주일 유예' — std_area_plan 데이터만(구조 변경 없음), 재적용해도 분류체계당 1행
BEGIN;

INSERT INTO std_area_plan (area_id, plan_cd, strt_dtm, end_dtm, grnt_rsn_cd, regr_id, modr_id)
SELECT a.area_id, 'P4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days', 'GRACE', 'MIGR', 'MIGR'
  FROM std_area a
 WHERE a.del_yn = 'N'
   AND NOT EXISTS (SELECT 1 FROM std_area_plan p WHERE p.area_id = a.area_id AND p.grnt_rsn_cd = 'GRACE');

COMMIT;
