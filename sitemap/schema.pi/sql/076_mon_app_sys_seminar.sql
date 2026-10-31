-- 076_mon_app_sys_seminar.sql : 애플리케이션 모니터링 시스템코드에 SEMINAR(seminar.pi) 추가(2026-10-31, seminar.pi M5 모니터링)
--  075 의 CHECK(SCHEMA·CAFE·SITEMAP)를 같은 이름으로 다시 만든다 — 기존 행 값 변경 없음, @pi/mon SYSTEMS 와 같아야 함
-- DA-APPROVED: 마스터 위임 2026-10-31("물어보지 말고 권장사항 있으면 바로 진행") — 도메인 값 1개 추가(CHECK 재정의만), 칼럼·PK·인덱스 무변경
BEGIN;

ALTER TABLE mon_app_hist DROP CONSTRAINT IF EXISTS mon_app_hist_sys_cd_check;
ALTER TABLE mon_app_hist ADD CONSTRAINT mon_app_hist_sys_cd_check CHECK (sys_cd IN ('SCHEMA', 'CAFE', 'SITEMAP', 'SEMINAR'));
ALTER TABLE mon_app_evt_hist DROP CONSTRAINT IF EXISTS mon_app_evt_hist_sys_cd_check;
ALTER TABLE mon_app_evt_hist ADD CONSTRAINT mon_app_evt_hist_sys_cd_check CHECK (sys_cd IN ('SCHEMA', 'CAFE', 'SITEMAP', 'SEMINAR'));

COMMENT ON TABLE mon_app_hist IS '애플리케이션 모니터링 이력 — 시스템(schema.pi·cafe.pi·sitemap.pi·seminar.pi) API 분 × 경로 누적(브라우저 계측), 보관 7일';
COMMENT ON COLUMN mon_app_hist.sys_cd IS '시스템코드 : SCHEMA schema.pi · CAFE cafe.pi · SITEMAP sitemap.pi · SEMINAR seminar.pi';
COMMENT ON COLUMN mon_app_evt_hist.sys_cd IS '시스템코드 : SCHEMA schema.pi · CAFE cafe.pi · SITEMAP sitemap.pi · SEMINAR seminar.pi (다른 시스템은 usr_id 없음 — 사용자 체계가 다름)';

COMMIT;
