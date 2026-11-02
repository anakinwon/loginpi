-- 021_sitemap_own_site_ship.sql — 자사 사이트 워프 우주선 지정 : PyCafé™(cafe.pi) = a SAUCER(기본, ship_cd NULL) · sitemap.pi = c BRIDGE · seminar.pi = d TWIN · schema.pi = e DAGGER · dbms.pi = f CROSS (마스터 지시 2026-11-03, b 미사용)
-- DA-APPROVED: 마스터 지시 2026-11-03 자사 사이트 우주선 지정 — 데이터 UPDATE 만(DDL 0·새 코드값 0, 020 CHECK 4종 안의 값), 물리 DELETE 없음
--   지정 키 = 도메인 자연키(site_dom_nm) + own_site_yn='Y' + del_yn='N' + 점유 상태(ux_site_mst_site_dom_nm_actv 와 같은 조건 → 도메인당 최대 1행).
--     site_id 는 gen_random_uuid() 라 dev·stg·prod 값이 다르다 → 쓰지 않는다(이 파일은 db-migrate 로 3 tier 모두 적용)
--   자사 사이트는 결제 없이 노출(020 규칙 : IN_USE AND ship_cd AND (ship_pay_dtm OR own_site_yn='Y')) → ship_pymnt_id·ship_pay_dtm 은 NULL 그대로
--   건너뜀(갱신 안 함) : own_site_yn='N'·논리삭제·점유 상태 아님·도메인 없음·이미 우주선 결제됨(ship_pymnt_id 있음)·이미 같은 값(재실행 무해, mod_dtm 도 안 바뀜)
--     → 적용 후 아래 검증 SELECT 로 확인. IN_USE 가 아니면 ship_cd 가 들어가도 노출되지 않는다(사용 단계 복귀 시 바로 노출)
--   PyCafé™ 계열 사이트 행은 cafe.pi 1행뿐(001 시드) — SAUCER 는 기본값(NULL)이라 다른 도메인이 생겨도 할 일 없음
-- 선행 : 020(ship_cd 칼럼·CHECK). 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod — 020 다음 순서로 같은 실행에서 적용
-- 롤백(참고) : 020 직후 값은 NULL(신규 칼럼) —
--   UPDATE site_mst SET ship_cd = NULL, modr_id = 'ADMIN' WHERE own_site_yn = 'Y' AND del_yn = 'N' AND ship_pymnt_id IS NULL AND site_dom_nm IN ('sitemap.pi', 'seminar.pi', 'schema.pi', 'dbms.pi');
BEGIN;

UPDATE site_mst m
   SET ship_cd = v.ship_cd,
       modr_id = 'ADMIN'                  -- mod_dtm 은 trg_site_mst_mod_dtm(001) 이 갱신
  FROM (VALUES
    ('cafe.pi',    NULL::VARCHAR(10)),    -- a SAUCER(기본) — PyCafé™
    ('sitemap.pi', 'BRIDGE'),             -- c
    ('seminar.pi', 'TWIN'),               -- d
    ('schema.pi',  'DAGGER'),             -- e
    ('dbms.pi',    'CROSS')               -- f
  ) AS v (site_dom_nm, ship_cd)
 WHERE m.site_dom_nm = v.site_dom_nm
   AND m.own_site_yn = 'Y'
   AND m.del_yn = 'N'
   AND m.site_sts_cd IN ('APPLYING', 'PAID', 'IN_USE', 'USED', 'SUSPENDED')
   AND m.ship_pymnt_id IS NULL
   AND m.ship_cd IS DISTINCT FROM v.ship_cd;

COMMIT;

-- 검증(적용 후, 5행 기대) : want ≠ ship_cd 거나 m.* 가 비면 이 파일이 건너뛴 행 — 관리 화면에서 직접 지정
--  SELECT v.site_dom_nm, v.want, m.ship_cd, m.own_site_yn, m.site_sts_cd, m.ship_pymnt_id,
--         (m.site_sts_cd = 'IN_USE' AND m.ship_cd IS NOT NULL AND (m.ship_pay_dtm IS NOT NULL OR m.own_site_yn = 'Y')) AS ship_shown
--    FROM (VALUES ('cafe.pi', NULL), ('sitemap.pi', 'BRIDGE'), ('seminar.pi', 'TWIN'), ('schema.pi', 'DAGGER'), ('dbms.pi', 'CROSS')) AS v (site_dom_nm, want)
--    LEFT JOIN site_mst m ON m.site_dom_nm = v.site_dom_nm AND m.del_yn = 'N' AND m.own_site_yn = 'Y'
--   ORDER BY 1;
