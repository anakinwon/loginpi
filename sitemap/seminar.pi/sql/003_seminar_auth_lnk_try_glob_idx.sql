-- 003_seminar_auth_lnk_try_glob_idx.sql — 연동 코드 전체 실패 건수 조회 인덱스 (2026-10-25, 자동 보안 리뷰 HIGH : 계정 다수 동원 우회 차단)
-- DA-APPROVED: 마스터 지시 2026-10-25 "1번부터 진행"(연동 코드 보안 보강) — 인덱스 1개 추가, 테이블 무변경. DA 사후 리뷰 대상
-- 선행 : 002_seminar_auth_lnk_try.sql. 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
-- 사용 : POST /api/auth/link-complete 가 모든 Google 계정 합계 최근 15분 실패 건수를 세어 30건을 넘으면 429(GLOBAL_MAX)
BEGIN;

CREATE INDEX IF NOT EXISTS x_sys_auth_lnk_try_hist_02
  ON sys_auth_lnk_try_hist (prvd_cd, reg_dtm) WHERE succ_yn = 'N';

COMMIT;
