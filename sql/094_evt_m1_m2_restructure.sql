-- sql/094_evt_m1_m2_restructure.sql (병렬 세션 번호 충돌로 091→094 재할당)
-- DA-APPROVED: evt_ 이벤트 주제영역 기존 승인(sql/044) 범위 내 DML(UPDATE)만 수행, 스키마 변경 없음
-- 목적: 오픈베타 #1 이벤트 미션 M1·M2 재구성
--   - M1: '계정 통합' → '계정 통합 + 프로필 완성'
--         (옛 M2의 별명·카톡ID 상태형 평가를 M1로 통합 — 선물 전달 자격이 본질)
--   - M2: '프로필 완성' → 'Bean Token 충전' (신규 — bean_charge 행위형)
--
-- 연계 코드 변경 (이 SQL과 함께 배포됨):
--   · src/lib/event.ts : M1 MULTI_AND 평가에 hasNickAndKakao() 상태 검증 추가,
--                        M2는 일반 bean_charge SINGLE (옛 상태형 특수처리 제거)
--   · src/app/api/payments/complete/route.ts : BEAN_CHARGE 완료 시 recordUserAction('bean_charge') 기록
--   · messages/ko.json·en.json : event.missions.M1·M2 + missionGoBean 라벨
--   · src/components/event/client-event-gate.tsx : M1→/profile, M2→/bean 링크
--
-- ⚠️ 운영 중 이벤트(evt-20260614-001) — 적용 직후 반드시 재평가 실행:
--     POST /api/admin/event/reeval  (관리자 '미션 재평가' 버튼 또는 cron)
--     · M1: 프로필(별명·카톡ID) 미입력자는 미완료로 회수될 수 있음
--     · M2: 옛 'profile_update' 완료 이력은 bean_charge 미충전 시 미완료로 회수,
--           실제 Bean 충전(BEAN_CHARGE 결제) 경험자만 신규 완료로 인정
--           (단, 충전 시점에 bean_charge 액션이 없던 과거 충전자는 evt_action_log에 미기록 →
--            소급이 필요하면 pi_pymnt(metadata.type='BEAN_CHARGE')에서 별도 백필 검토)

BEGIN;

-- M1: 계정 통합 + 프로필 완성 (옛 M2 상태형 통합)
UPDATE evt_mission SET
  mission_nm = '계정 통합 + 프로필 완성',
  skill_desc = '두 세계 연결 + 요원 신원 확립',
  complete_type_cd = 'MULTI_AND',
  required_action_cds_tx = '["account_link","google_link"]'::jsonb,
  mission_guide_desc = 'Pi·Google 로그인 연동 + 별명·카카오톡 ID 입력 (선물수령시 필요)',
  modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
WHERE event_id = 'evt-20260614-001' AND mission_cd = 'M1' AND del_yn = 'N';

-- M2: Bean Token 충전 (신규 — 옛 '프로필 완성' 폐기, bean_charge 행위형)
UPDATE evt_mission SET
  mission_nm = 'Bean Token 충전',
  skill_desc = '생태계 연료 확보',
  complete_type_cd = 'SINGLE',
  required_action_cds_tx = '["bean_charge"]'::jsonb,
  mission_guide_desc = 'Bean 토큰을 충전해서 Cafe 생성·참여·자동번역에 사용',
  modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
WHERE event_id = 'evt-20260614-001' AND mission_cd = 'M2' AND del_yn = 'N';

-- 검증 (적용 후 수동 확인용)
--   SELECT mission_cd, mission_nm, complete_type_cd, required_action_cds_tx, mission_guide_desc
--     FROM evt_mission
--    WHERE event_id='evt-20260614-001' AND mission_cd IN ('M1','M2') AND del_yn='N'
--    ORDER BY mission_ord;

COMMIT;
