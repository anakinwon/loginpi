-- 161_pi_uid_rebind_cleanup.sql
-- ⭐운영 전용 — Pi uid 재발급 사고(2026-07-02)로 생성된 중복 계정 정리 (DML only, DDL 없음)
--
-- 배경: Pi uid는 (포털 앱 × 테스트넷/메인넷) scoped 값이라 sandbox 플립·메인넷 앱 작업 시
-- 전 사용자 uid가 재발급되고, upsertPiUser(onConflict: pi_uid)가 신규 행을 만들었다.
-- 코드 근본수정(users.ts — pi_username 불변 키 폴백 재바인딩)과 함께 적용한다.
--
-- ⛔ 실행 순서 필수: 코드(재바인딩 폴백) 배포 → sql/163(rejoin_dtm·del_rsn_cd DDL) → 이 SQL.
--    (코드보다 먼저 지우면 다음 로그인에서 중복 행이 또 생기고,
--     163 이전에 실행하면 del_rsn_cd 컬럼이 없어 실패한다)
-- ⛔ 실행 전 반드시 [1] 진단으로 중복 행에 결제·동의·자산이 붙었는지 확인할 것.
--    물리 DELETE 금지 — 논리삭제(del_yn)만 사용한다.

-- [1] 진단 — 활성 중복 계정 목록 (pi_username당 활성 행 2개 이상)
select s.pi_username,
       s.id,
       s.pi_uid,
       s.reg_dtm,
       s.last_login_dtm,
       (select count(*) from pi_pymnt p where p.user_id = s.id) as pymnt_cnt
from sys_user s
where s.del_yn = 'N'
  and s.pi_username is not null
  and s.pi_username in (
    select pi_username from sys_user
    where del_yn = 'N' and pi_username is not null
    group by pi_username having count(*) > 1
  )
order by s.pi_username, s.reg_dtm;

-- [2] anakin2 중복 행(uid 재발급으로 생성된 빈 계정) 논리삭제
-- 원본 = ad41d0a7-a1fe-47a8-952e-7adc520e313e (유지)
-- 중복 = bdc3e9c2-9231-4ac4-83ef-a5b80fabc4ea (아래에서 비활성화)
--
-- pi_uid는 'DEL:' 접두로 치환해 UNIQUE 점유를 해제한다 — 다음 로그인 때 폴백 로직이
-- 동일 uid를 원본 행(ad41d0a7)에 충돌 없이 재바인딩하기 위한 선행 조건 (원값 이력 보존).
update sys_user
set del_yn     = 'Y',
    del_dtm    = now(),
    del_rsn_cd = 'SYS_DUP', -- uid 재발급 중복정리 (이력 사유 — 부활 판정 기준)
    pi_uid     = 'DEL:' || pi_uid,
    modr_id    = 'ADMIN',
    mod_dtm    = now()
where id = 'bdc3e9c2-9231-4ac4-83ef-a5b80fabc4ea'
  and del_yn = 'N';

-- [3] 검증 — anakin2는 활성 1행(원본)만 남아야 한다
select id, pi_uid, pi_username, del_yn, reg_dtm
from sys_user
where pi_username = 'anakin2'
order by reg_dtm;

-- [4] (선택) [1]에서 발견된 다른 사용자의 중복 행도 동일 패턴으로 개별 처리:
--   ① pymnt_cnt·동의·자산이 원본에만 있는지 확인 (중복 행에 데이터가 붙었으면 마스터 판단 필요)
--   ② update sys_user set del_yn='Y', del_dtm=now(), del_rsn_cd='SYS_DUP',
--        pi_uid='DEL:'||pi_uid, modr_id='ADMIN', mod_dtm=now()
--      where id='<중복 행 id>' and del_yn='N';
