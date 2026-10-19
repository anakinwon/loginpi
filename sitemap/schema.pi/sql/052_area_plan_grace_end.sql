-- 052_area_plan_grace_end.sql : 유예 기간 조기 종료(마스터 지시 2026-10-19 — 결제 안 된 권한 모두 제거) — sql/050 유예 행 논리 삭제, 결제(PAY) 기간만 남김
-- DA-APPROVED: 마스터 지시 2026-10-19 '결제 시에만 메뉴 사용' — std_area_plan 데이터만(구조 변경 없음, 물리 DELETE 없음), 재적용해도 같은 결과
BEGIN;

UPDATE std_area_plan
   SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP, modr_id = 'MIGR'
 WHERE grnt_rsn_cd = 'GRACE'
   AND del_yn = 'N';

COMMIT;
