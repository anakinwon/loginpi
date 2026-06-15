-- sql/044_event_mission.sql
-- DA-APPROVED: evt_ 이벤트 주제영역 신규 등록 + JSON 컬럼(metadata_tx, required_action_cds_tx) 도메인 외 사용 인정 (2026-06-14)
-- Pi 요원 육성 이벤트 시스템 DB 스키마 (v2.0, 무코드 확장 아키텍처)
-- 테이블: evt_event, evt_action_log, evt_mission, evt_user_mission, evt_exclude, evt_gift_log
-- DA 표준: 시스템 컬럼 4개 + 논리삭제, 물리 DELETE 금지, evt_ 신규 주제영역

BEGIN;

-- ============================================================================
-- evt_event (이벤트 메타데이터)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_event (
  event_id VARCHAR(30) PRIMARY KEY,
  event_nm VARCHAR(200) NOT NULL,
  event_desc TEXT,
  start_dtm TIMESTAMPTZ NOT NULL,
  end_dtm TIMESTAMPTZ NOT NULL,
  active_yn CHAR(1) NOT NULL DEFAULT 'Y',
  reward_whitelist_yn CHAR(1) NOT NULL DEFAULT 'Y',
  reward_tier_system_yn CHAR(1) NOT NULL DEFAULT 'Y',
  reward_gift_top_no INT,
  reward_gift_url VARCHAR(500),
  reward_gift_send_method_cd VARCHAR(20) DEFAULT 'MANUAL',
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm TIMESTAMPTZ
);

CREATE INDEX idx_evt_event_active_dtm
  ON evt_event(active_yn, end_dtm DESC);

-- ============================================================================
-- evt_action_log (모든 비즈니스 행위 기록 — 미션·이벤트와 무관)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_action_log (
  evt_action_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES sys_user(id),
  action_cd VARCHAR(30) NOT NULL,
  action_dtm TIMESTAMPTZ NOT NULL,
  metadata_tx JSONB,
  regr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm TIMESTAMPTZ
);

CREATE INDEX idx_evt_action_log_user_action_dtm
  ON evt_action_log(user_id, action_cd, action_dtm DESC);

CREATE INDEX idx_evt_action_log_action_dtm
  ON evt_action_log(action_cd, action_dtm DESC);

-- ============================================================================
-- evt_mission (미션 정의 — 이벤트별)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_mission (
  evt_mission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(30) NOT NULL REFERENCES evt_event(event_id),
  mission_cd CHAR(3) NOT NULL,
  mission_nm VARCHAR(100) NOT NULL,
  skill_desc TEXT,
  complete_type_cd VARCHAR(20) NOT NULL,
  required_action_cds_tx JSONB NOT NULL,
  sequence_prior_mission_cd CHAR(3),
  sequence_delay_minutes_no INT,
  mission_ord INT,
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm TIMESTAMPTZ,
  UNIQUE (event_id, mission_cd) WHERE del_yn = 'N'
);

CREATE INDEX idx_evt_mission_event_del
  ON evt_mission(event_id, del_yn);

-- ============================================================================
-- evt_user_mission (사용자별 미션 완료 이력)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_user_mission (
  evt_user_mission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(30) NOT NULL REFERENCES evt_event(event_id),
  user_id UUID NOT NULL REFERENCES sys_user(id),
  mission_cd CHAR(3) NOT NULL,
  complete_dtm TIMESTAMPTZ NOT NULL,
  gift_sent_yn CHAR(1) NOT NULL DEFAULT 'N',
  gift_sent_dtm TIMESTAMPTZ,
  metadata_tx JSONB,
  regr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm TIMESTAMPTZ,
  UNIQUE (event_id, user_id, mission_cd) WHERE del_yn = 'N'
);

CREATE INDEX idx_evt_user_mission_event_user_del
  ON evt_user_mission(event_id, user_id, del_yn);

CREATE INDEX idx_evt_user_mission_event_complete_dtm
  ON evt_user_mission(event_id, complete_dtm DESC);

-- ============================================================================
-- evt_exclude (제외 대상자 관리)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_exclude (
  evt_exclude_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(30) NOT NULL REFERENCES evt_event(event_id),
  user_id UUID NOT NULL REFERENCES sys_user(id),
  exclude_reason_tx VARCHAR(200),
  regr_id TEXT NOT NULL,
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm TIMESTAMPTZ,
  UNIQUE (event_id, user_id) WHERE del_yn = 'N'
);

CREATE INDEX idx_evt_exclude_event_user_del
  ON evt_exclude(event_id, user_id, del_yn);

-- ============================================================================
-- evt_gift_log (선물 발송 이력)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evt_gift_log (
  evt_gift_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(30) NOT NULL REFERENCES evt_event(event_id),
  user_id UUID NOT NULL REFERENCES sys_user(id),
  gift_rank_no INT NOT NULL,
  kakao_id VARCHAR(100),
  gift_send_status_cd VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  gift_sent_dtm TIMESTAMPTZ,
  gift_send_method_cd VARCHAR(20),
  metadata_tx JSONB,
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm TIMESTAMPTZ,
  UNIQUE (event_id, gift_rank_no) WHERE del_yn = 'N'
);

CREATE INDEX idx_evt_gift_log_event_status
  ON evt_gift_log(event_id, gift_send_status_cd);

-- ============================================================================
-- 시드 데이터: 첫 이벤트 (evt-20260614-001, Pi 요원 육성)
-- ============================================================================

INSERT INTO evt_event (
  event_id, event_nm, event_desc,
  start_dtm, end_dtm, active_yn,
  reward_whitelist_yn, reward_tier_system_yn,
  reward_gift_top_no, reward_gift_url, reward_gift_send_method_cd
) VALUES (
  'evt-20260614-001',
  'Pi 요원 육성 이벤트',
  '10가지 핵심 기능 미션을 완료하고 화이트리스트 요원이 되세요.',
  '2026-06-14 00:00:00+00:00',
  '2026-12-31 23:59:59+00:00',
  'Y',
  'Y', 'Y',
  10,
  'https://gift.kakao.com/product/11105359',
  'MANUAL'
) ON CONFLICT (event_id) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M1: 계정 통합
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M1', '계정 통합',
  '두 세계를 연결하는 기술',
  'MULTI_AND', '["account_link","google_link"]'::jsonb, 1
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M2: 프로필 완성
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M2', '프로필 완성',
  '요원 신원 확립',
  'SINGLE', '["profile_update"]'::jsonb, 2
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M3: PREMIUM 카페 + 자동번역
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M3', 'PREMIUM 카페 생성 + 자동번역',
  '프리미엄 공간 개설',
  'MULTI_AND', '["premium_cafe_create","cafe_translate_use"]'::jsonb, 3
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M4: Bean 전송 (M5와 순서 교환됨 — 2026-06-15)
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M4', 'Bean 전송 테스트(PiRC1)',
  '보상 전달 기술',
  'SINGLE', '["bean_send"]'::jsonb, 4
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M5: Pi Bet 생성 + 분배 (M4와 순서 교환됨 — 2026-06-15)
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M5', 'Pi Bet 생성 후 분배',
  '예측 게임 주관',
  'MULTI_AND', '["pibet_create","pibet_entry"]'::jsonb, 5
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M6: 채팅 멀티 기능 (3종 중 1개)
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M6', '채팅 멀티 기능 사용',
  '채팅 기술 완성',
  'MULTI_OR', '["voice_join","file_send","sticker_use"]'::jsonb, 6
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M7: 판매자 거래 취소
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M7', '판매자 거래 취소',
  '거래 협상 스킬',
  'SINGLE', '["seller_cancel"]'::jsonb, 7
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M8: 구매자 거래 취소
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M8', '구매자 거래 취소',
  '구매 결정 권리',
  'SINGLE', '["buyer_cancel"]'::jsonb, 8
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M9: 판매자 보증금 + 위치동의
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, mission_ord
) VALUES (
  'evt-20260614-001', 'M9', '판매자 보증금 + 위치동의',
  '신뢰 자본 확보',
  'MULTI_AND', '["bond_deposit","lbs_consent"]'::jsonb, 9
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

-- M10: 보증금 활성 거래 취소 수수료 (M9 후)
INSERT INTO evt_mission (
  event_id, mission_cd, mission_nm, skill_desc,
  complete_type_cd, required_action_cds_tx, sequence_prior_mission_cd, mission_ord
) VALUES (
  'evt-20260614-001', 'M10', '보증금 활성 거래 취소 수수료',
  '신뢰 기반 거래',
  'SEQUENCE', '["cancel_with_fee"]'::jsonb, 'M9', 10
) ON CONFLICT (event_id, mission_cd) DO UPDATE SET modr_id='ADMIN', mod_dtm=CURRENT_TIMESTAMP;

COMMIT;
