-- sql/087_evt_m5_redefine_subscr.sql
-- DA-APPROVED: evt_ 주제영역(044에서 승인) DML 정정 — DDL 없음 (2026-06-22)
-- 목적: M5 미션 정의를 옛 Pi Bet(베팅) 행위에서 '구독 신청 + 이벤트 카페 생성'으로 정합.
--
-- 배경:
--   - Pi 등재 레드라인(도박 금지)으로 Pi Bet/베팅 기능이 코드에서 완전히 제거됨.
--   - 화면 안내(messages/*.json event.missions.M5)와 행위 훅(recordUserAction)은 이미
--     'subscr_apply'(구독 신청) + 'event_cafe_create'(이벤트 카페 생성)로 재정의 완료.
--   - 그러나 evt_mission(DB)만 옛 required_action_cds_tx=["pibet_create","pibet_entry"]에
--     멈춰 있어, 사용자는 절대 발생하지 않는 베팅 행위를 요구받아 M5를 영구 완료 불가.
--     → 누구도 10/10 달성 불가 → 선착순 선물(getTop10ForGift, count===10) 영구 미작동.
--
-- 효과: complete_type_cd는 MULTI_AND 유지(두 행위 모두 필요). event.ts 평가 엔진은
--   complete_type_cd로 분기하므로 코드 변경 없이 자동 동작한다. DB fallback 텍스트
--   (mission_nm·skill_desc·mission_guide_desc)도 i18n과 일치하도록 함께 갱신.

BEGIN;

UPDATE evt_mission
SET
  mission_nm = 'Pi구독서비스(PiRC2) 신청 후 이벤트 방 만들기',
  skill_desc = '프리미엄 구독 + 이벤트 공간 개설',
  required_action_cds_tx = '["subscr_apply","event_cafe_create"]'::jsonb,
  complete_type_cd = 'MULTI_AND',
  mission_guide_desc = 'PiRC2 구독 신청 후, Business 플랜으로 이벤트 전용 Cafe를 생성하세요',
  modr_id = 'ADMIN',
  mod_dtm = CURRENT_TIMESTAMP
WHERE event_id = 'evt-20260614-001'
  AND mission_cd = 'M5'
  AND del_yn = 'N';

COMMIT;

-- ============================================================================
-- 적용 후 검증 (참고용 — 수동 실행)
-- ============================================================================
-- 1) M5 정의가 새 행위로 바뀌었는지 확인
--    SELECT mission_cd, complete_type_cd, required_action_cds_tx, mission_nm
--      FROM evt_mission
--     WHERE event_id='evt-20260614-001' AND mission_cd='M5' AND del_yn='N';
--
-- 2) 기존 사용자 재평가 트리거 (구독+이벤트카페 행위를 이미 한 사용자 소급 반영):
--    /admin/event 페이지 → '🔄 미션 재평가' 버튼  (또는 POST /api/admin/event/reeval)
--    → reevaluateAllActiveUsers()가 evt_action_log 보유 사용자를 전수 재평가한다.
