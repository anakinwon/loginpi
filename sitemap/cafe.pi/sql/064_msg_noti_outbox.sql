-- 064_msg_noti_outbox.sql
-- 판매자 주문 알림 (Telegram) — Outbox 패턴 기반 발송 대기함 + sys_user Telegram 연동 컬럼
-- PRD: docs/PRD_13_MSG.md (FR-MSG-01, FR-MSG-07)
-- DA 심사: da-team-leader 승인 (2026-06-18) — 표준단어 NOTI/OUTBOX/TLGM/CHNL/RECV/SENT/RTRY/REAS 신규 등록

-- ──────────────────────────────────────────────────────────────
-- (A) 신규 테이블: msg_noti_outbox (메시지 도메인 알림 발송 대기함)
-- ──────────────────────────────────────────────────────────────
-- DA-APPROVED: 신규 메시징 도메인 알림 아웃박스 테이블. Outbox 패턴 + 3계층 발송 아키텍처 구현 (2026-06-18)
--   표준단어 신규: NOTI(알림), OUTBOX(발송대기함), TLGM(Telegram), CHNL(채널), RECV(수신), SENT(발송), RTRY(재시도), REAS(사유)
--   컬럼명 표준: noti_id(PK), recv_usr_id(FK), noti_chnl_cd(VARCHAR), sent_yn/sent_dtm(발송상태), tlgm_msg_id(Phase 2)
--   시스템컬럼 4개+논리삭제 완전 준수. 인덱스: (sent_yn, del_yn), (order_id), (recv_usr_id, viewed_yn)

CREATE TABLE IF NOT EXISTS public.msg_noti_outbox (
  -- PK
  noti_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK & 멱등키
  order_id UUID NOT NULL REFERENCES public.mps_order(order_id) ON DELETE CASCADE,
  recv_usr_id UUID NOT NULL REFERENCES public.sys_user(id) ON DELETE CASCADE,

  -- 알림 채널 & 본문
  noti_chnl_cd VARCHAR(20) NOT NULL DEFAULT 'TELEGRAM'
    CHECK (noti_chnl_cd IN ('TELEGRAM', 'REALTIME', 'KAKAO')),
  noti_body TEXT NOT NULL,

  -- 발송 상태
  sent_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (sent_yn IN ('Y', 'N')),
  sent_dtm TIMESTAMPTZ,
  retry_cnt INT NOT NULL DEFAULT 0,
  fail_reas TEXT,

  -- Telegram Phase 2 (콜백 대응)
  tlgm_msg_id BIGINT,

  -- Pull 안전망 (앱 내 안읽은 뱃지)
  viewed_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (viewed_yn IN ('Y', 'N')),

  -- 논리삭제
  del_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,

  -- 시스템 컬럼 4개 (필수)
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_msg_noti_outbox_sent ON public.msg_noti_outbox(sent_yn, del_yn);
CREATE INDEX IF NOT EXISTS idx_msg_noti_outbox_order ON public.msg_noti_outbox(order_id);
CREATE INDEX IF NOT EXISTS idx_msg_noti_outbox_recv ON public.msg_noti_outbox(recv_usr_id, viewed_yn);

-- COMMENT
COMMENT ON TABLE public.msg_noti_outbox IS 'Outbox 패턴 기반 메시지 알림 발송 대기함. 주문 확정 시 INSERT → 3계층 발송(Realtime/Telegram/Pull) → sent_yn UPDATE. 멱등성: order_id + noti_chnl_cd 기준 1회 발송. (FR-MSG-01, Phase 1)';
COMMENT ON COLUMN public.msg_noti_outbox.noti_id IS '알림 ID (UUID, PK)';
COMMENT ON COLUMN public.msg_noti_outbox.order_id IS '주문 ID (FK → mps_order.order_id, 멱등키)';
COMMENT ON COLUMN public.msg_noti_outbox.recv_usr_id IS '수신자 사용자 ID (FK → sys_user.id, 판매자)';
COMMENT ON COLUMN public.msg_noti_outbox.noti_chnl_cd IS '알림 채널 코드 (TELEGRAM/REALTIME/KAKAO)';
COMMENT ON COLUMN public.msg_noti_outbox.noti_body IS '알림 본문 (JSON 스냅샷: order_id, item_nm, order_price_pi, buyer_alias, order_mthd_cd, reg_dtm)';
COMMENT ON COLUMN public.msg_noti_outbox.sent_yn IS '발송 여부 (Y/N, 기본 N)';
COMMENT ON COLUMN public.msg_noti_outbox.sent_dtm IS '발송 완료 일시 (TIMESTAMPTZ)';
COMMENT ON COLUMN public.msg_noti_outbox.retry_cnt IS '재시도 횟수 (INT, 기본 0, 최대 3회)';
COMMENT ON COLUMN public.msg_noti_outbox.fail_reas IS '발송 실패 사유 (Telegram API 에러 메시지)';
COMMENT ON COLUMN public.msg_noti_outbox.tlgm_msg_id IS 'Telegram 메시지 ID (BIGINT, Phase 2 콜백 대응용)';
COMMENT ON COLUMN public.msg_noti_outbox.viewed_yn IS '열람 여부 (Y/N, 기본 N, Pull 안전망 뱃지용)';
COMMENT ON COLUMN public.msg_noti_outbox.del_yn IS '논리삭제 여부 (Y/N, 기본 N)';
COMMENT ON COLUMN public.msg_noti_outbox.del_dtm IS '논리삭제 일시 (TIMESTAMPTZ)';

-- mod_dtm 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.fn_upd_msg_noti_outbox_mod_dtm() RETURNS TRIGGER AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msg_noti_outbox_mod_dtm ON public.msg_noti_outbox;
CREATE TRIGGER trg_msg_noti_outbox_mod_dtm
  BEFORE UPDATE ON public.msg_noti_outbox
  FOR EACH ROW EXECUTE FUNCTION public.fn_upd_msg_noti_outbox_mod_dtm();

-- ──────────────────────────────────────────────────────────────
-- (B) 기존 sys_user 확장: Telegram 연동 정보 3개 컬럼
-- ──────────────────────────────────────────────────────────────
-- DA-APPROVED: sys_user에 Telegram 연동 정보 3개 컬럼 추가. 판매자 Telegram 봇 온보딩 지원 (2026-06-18)
--   tlgm_chat_id (BIGINT): Telegram 사용자 고유 ID
--   tlgm_conn_yn (CHAR(1)): 연동 여부 (Y/N, 기본 N)
--   tlgm_conn_dtm (TIMESTAMPTZ): 연동 완료 시각

ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS tlgm_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS tlgm_conn_yn CHAR(1) NOT NULL DEFAULT 'N'
    CHECK (tlgm_conn_yn IN ('Y', 'N')),
  ADD COLUMN IF NOT EXISTS tlgm_conn_dtm TIMESTAMPTZ;

COMMENT ON COLUMN public.sys_user.tlgm_chat_id IS 'Telegram 사용자 ID (BIGINT, 봇 연동 시 @bot에서 수신)';
COMMENT ON COLUMN public.sys_user.tlgm_conn_yn IS 'Telegram 연동 여부 (Y/N, 기본 N)';
COMMENT ON COLUMN public.sys_user.tlgm_conn_dtm IS 'Telegram 연동 완료 일시 (TIMESTAMPTZ, 온보딩 완료 시 기록)';
