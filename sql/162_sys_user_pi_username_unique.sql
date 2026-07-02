-- 162_sys_user_pi_username_unique.sql
-- ⭐pi_username 유일성 DB 강제 (마스터 지시 2026-07-02)
--    "절대로 동일한 pi_username으로 2개 이상 계정을 만들지 마" — 코드 방어(users.ts
--    재바인딩 폴백)에 더해 DB 레벨에서 원천 차단한다.
--
-- 방식: 활성 행(del_yn='N') 부분 UNIQUE 인덱스
--   - 논리삭제 행은 제외 → del_yn 논리삭제 원칙과 공존 (비활성화된 옛 행이 이름을 점유하지 않음)
--   - pi_username IS NULL(Google 전용 계정)은 대상 외
--   - 이후 코드 결함으로 중복 INSERT가 시도되면 조용한 중복 계정 대신 즉시 에러(fail-loud)
--
-- ⛔ 운영 적용 순서 필수:
--   ① users.ts 재바인딩 폴백 코드 배포
--   ② sql/161 실행 (활성 중복 행 논리삭제 — 남아 있으면 아래 인덱스 생성이 실패한다)
--   ③ 본 파일 실행

create unique index if not exists ux_sys_user_pi_username_actv
  on public.sys_user (pi_username)
  where del_yn = 'N' and pi_username is not null;

-- 검증 ① — 인덱스 생성 확인
select indexname, indexdef
from pg_indexes
where tablename = 'sys_user'
  and indexname = 'ux_sys_user_pi_username_actv';

-- 검증 ② — 활성 중복이 0이어야 정상 (인덱스가 생성됐다면 항상 0)
select pi_username, count(*)
from sys_user
where del_yn = 'N' and pi_username is not null
group by pi_username
having count(*) > 1;
