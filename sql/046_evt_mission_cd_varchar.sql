-- sql/046_evt_mission_cd_varchar.sql
-- DA-APPROVED: evt_ 미션 코드 컬럼 CHAR(3) → VARCHAR(10) 전환 (텍스트형 CHAR 금지 규칙 정합, 2026-06-15)
-- 목적: CHAR(3) 후행 공백 패딩('M9 ')으로 인한 PostgREST .eq() 매칭 실패 근본 해소
--   - evt_mission.mission_cd / sequence_prior_mission_cd
--   - evt_user_mission.mission_cd
-- USING TRIM(...)으로 기존 저장값의 공백을 제거하면서 타입 전환.
-- partial unique index(idx_evt_mission_unique, idx_evt_user_mission_unique)는
-- ALTER COLUMN TYPE 시 Postgres가 자동 재구축한다(predicate는 del_yn 기준이라 무영향).

BEGIN;

-- evt_mission: 미션 코드 + 선행 미션 코드(SEQUENCE 매칭용)
ALTER TABLE evt_mission
  ALTER COLUMN mission_cd TYPE VARCHAR(10) USING TRIM(mission_cd),
  ALTER COLUMN sequence_prior_mission_cd TYPE VARCHAR(10) USING TRIM(sequence_prior_mission_cd);

-- evt_user_mission: 사용자 완료 미션 코드
ALTER TABLE evt_user_mission
  ALTER COLUMN mission_cd TYPE VARCHAR(10) USING TRIM(mission_cd);

COMMIT;
