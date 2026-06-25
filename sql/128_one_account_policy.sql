-- 128_one_account_policy.sql
-- 1인 1계정 원칙 적용: Google 이메일 기준 중복 계정 정리
--
-- 배경: 사용자가 Google 계정과 Pi 계정을 별도로 생성하면
--   동일인에 대해 sys_user 행이 2개 생길 수 있다.
--   연동(link-complete) 완료 후에도 Google-only 고아 행이 남아 혼란을 야기.
--
-- 조건: pi_uid IS NOT NULL 행이 존재하는 google_email에 대해
--       pi_uid IS NULL (Google 전용) 중복 행을 논리 삭제.
--
-- 주의: google_id UNIQUE 제약을 유지하기 위해 삭제 대상의 google_id를 NULL로 먼저 초기화.
--       이 값은 Pi 행이 나중에 받을 수 있도록 해제한다.
--
-- 실행 전 영향 대상 미리 확인 (읽기 전용):
-- SELECT id, google_email, google_id, pi_uid
-- FROM sys_user
-- WHERE del_yn = 'N'
--   AND pi_uid IS NULL
--   AND google_email IS NOT NULL
--   AND google_email IN (
--     SELECT google_email FROM sys_user
--     WHERE del_yn = 'N' AND pi_uid IS NOT NULL AND google_email IS NOT NULL
--   );

UPDATE sys_user
SET
  google_id = NULL,                    -- UNIQUE 제약 선해제 (Pi 행이 동일 google_id를 받을 수 있도록)
  del_yn    = 'Y',
  del_dtm   = CURRENT_TIMESTAMP,
  modr_id   = 'SYSTEM',
  mod_dtm   = CURRENT_TIMESTAMP
WHERE del_yn = 'N'
  AND pi_uid IS NULL
  AND google_email IS NOT NULL
  AND google_email IN (
    SELECT google_email
    FROM sys_user
    WHERE del_yn = 'N'
      AND pi_uid IS NOT NULL
      AND google_email IS NOT NULL
  );
