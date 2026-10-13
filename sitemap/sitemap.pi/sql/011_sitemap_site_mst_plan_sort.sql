-- 011_sitemap_site_mst_plan_sort.sql — 관리 목록 정렬용 요금제 순위 컬럼 (마스터 지시 2026-10-13 : 비싼 요금제부터 → 결제일시 내림차순)
-- DA-APPROVED: 마스터 지시 2026-10-13 — site_mst 생성 컬럼 1개(plan_sort_no, plan_cd 파생) + 부분 인덱스 1개. 데이터 변경 없음 (2026-10-13)
-- 선행 : 010. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 설계 :
--  · plan_cd 는 코드값이라 ORDER BY 로 가격 순을 못 만든다(알파벳순은 NONE 이 중간에 끼임). PostgREST 는 CASE 정렬을 지원하지 않으므로
--    STORED 생성 컬럼으로 순위를 고정한다 — fee_plan.sort_no 와 순서는 같고 방향은 반대(sort_no 는 VIP=1 오름차순, 여기는 VIP 6 > PRM2 5 > PRM1 4 > BSC2 3 > BSC1 2 > NONE 1 내림차순). 요금제 체계 변경(PRD §3) 시 CASE 도 함께 갱신
--  · 인덱스는 관리 대기열 조회(site_sts_cd 필터 + plan_sort_no DESC, pay_dtm DESC) 전용 부분 인덱스
BEGIN;

ALTER TABLE site_mst
  ADD COLUMN IF NOT EXISTS plan_sort_no SMALLINT
  GENERATED ALWAYS AS (
    CASE plan_cd
      WHEN 'VIP'  THEN 6
      WHEN 'PRM2' THEN 5
      WHEN 'PRM1' THEN 4
      WHEN 'BSC2' THEN 3
      WHEN 'BSC1' THEN 2
      WHEN 'NONE' THEN 1
      ELSE 0
    END
  ) STORED;                                                              -- 요금제정렬순번(가격 내림차순 순위, plan_cd 파생)
COMMENT ON COLUMN site_mst.plan_sort_no IS '요금제 정렬순번 — plan_cd 파생 생성 컬럼(VIP 6 … NONE 1). 관리 목록 "비싼 요금제부터" 정렬 전용';

CREATE INDEX IF NOT EXISTS idx_site_mst_admin_ord
  ON site_mst (site_sts_cd, plan_sort_no DESC, pay_dtm DESC NULLS LAST)
  WHERE del_yn = 'N';

COMMIT;
