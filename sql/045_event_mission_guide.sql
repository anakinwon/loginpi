-- sql/045_event_mission_guide.sql
-- 이벤트 미션 안내문 + 데이터 정정 (v2.1)
-- 1. evt_mission.mission_guide_desc 컬럼 추가 (다국어 지원: i18n 키 또는 직접 텍스트)
-- 2. mission_cd 공백 정리 (M1 →  → M1)
-- 3. 미션 정의 현행화 (M1~M10 최종 확정)

BEGIN;

-- ============================================================================
-- 1. evt_mission 테이블: mission_guide_desc 컬럼 추가
-- ============================================================================
ALTER TABLE evt_mission
ADD COLUMN IF NOT EXISTS mission_guide_desc TEXT;

-- ============================================================================
-- 2. mission_cd 공백 정리 (기존 데이터 UPDATE)
-- ============================================================================
UPDATE evt_mission
SET mission_cd = TRIM(mission_cd)
WHERE mission_cd ~ '\s+$';

-- ============================================================================
-- 3. 미션 정의 현행화: 기존 데이터 UPDATE + 안내문 추가
-- ============================================================================
UPDATE evt_mission
SET
  mission_guide_desc = CASE
    WHEN mission_cd = 'M1' THEN 'Pi 브라우저 로그인 + Google 로그인 (둘 다 완료)'
    WHEN mission_cd = 'M2' THEN '통합 계정에 별명 + 카카오톡 ID 입력'
    WHEN mission_cd = 'M3' THEN 'PiCafe에서 PREMIUM Cafe 생성 + 자동번역 기능 사용'
    WHEN mission_cd = 'M4' THEN 'Cafe에서 Pi Bet 생성 후 참여자에게 분배'
    WHEN mission_cd = 'M5' THEN '채팅 내 Bean을 1인 이상에게 전송'
    WHEN mission_cd = 'M6' THEN '스티커 이용 / 파일 전송 / 음성채널 이용 중 1가지 이상'
    WHEN mission_cd = 'M7' THEN 'PiShop에 내 상품 등록 후 거래중 판매자 거래 취소'
    WHEN mission_cd = 'M8' THEN 'PiShop에서 타인 상품 구매 후 구매자 거래 취소'
    WHEN mission_cd = 'M9' THEN 'PiShop 판매자 보증금 1Pi 이상 예치 + 위치 기반 서비스 동의'
    WHEN mission_cd = 'M10' THEN '(M9 후) 7·8번을 다시 수행 — 보증금 활성 상태에서 취소수수료 경험'
    ELSE mission_guide_desc
  END,
  modr_id = 'ADMIN',
  mod_dtm = CURRENT_TIMESTAMP
WHERE event_id = 'evt-20260614-001'
AND del_yn = 'N'
AND mission_cd IN ('M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10');

COMMIT;
