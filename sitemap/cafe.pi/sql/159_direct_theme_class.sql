-- 159_direct_theme_class.sql
-- '직거래'를 일반(BASIC)·프리미엄(PREMIUM)과 별개인 3번째 분류(theme_tp_cd='DIRECT')로 승격.
-- 목적: "내 카페" 목록에서 직거래방을 프리미엄보다 상단에 별도 서브섹션으로 노출(chat-list-view).
-- msg_room.theme_cd='DIRECT' 방들은 msg_theme 조인으로 자동 반영(방 데이터 변경 불필요).

-- DA-APPROVED: msg_theme.theme_tp_cd 분류에 'DIRECT' 추가 + 직거래 테마 분류 전환 (2026-07-01)
--   기존 CHECK IN('BASIC','PREMIUM') → IN('BASIC','PREMIUM','DIRECT'). additive(기존 값 영향 없음).
--   getRoomGrade는 PREMIUM 외 전부 GENERAL(else)이라 DIRECT→GENERAL(요금 0)로 자동 안전. D룸은 요금 로직 미적용.

ALTER TABLE public.msg_theme DROP CONSTRAINT IF EXISTS msg_theme_theme_tp_cd_check;
ALTER TABLE public.msg_theme ADD CONSTRAINT msg_theme_theme_tp_cd_check
  CHECK (theme_tp_cd IN ('BASIC', 'PREMIUM', 'DIRECT'));

-- 직거래 테마를 DIRECT 분류로 전환 (sql/158에서 BASIC으로 생성됨)
UPDATE public.msg_theme
  SET theme_tp_cd = 'DIRECT', mod_dtm = CURRENT_TIMESTAMP
  WHERE theme_cd = 'DIRECT';
