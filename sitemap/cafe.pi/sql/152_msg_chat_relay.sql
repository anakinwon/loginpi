-- 152_msg_chat_relay.sql
-- P2P 채팅 알림 & 봇 릴레이 (Phase 3 — 당근마켓 앱 푸시 대체)
-- PRD: docs/PRD_13_MSG.md §18 (FR-MSG-11~15)
-- 1단계(DB): 아웃박스 알림유형 확장 + 인용답장 라우팅 매핑 + 봇 활성방 포인터
--   앱 내 DM(msg_room room_tp_cd='D')을 채팅 본체로 재사용, 텔레그램은 오프라인 푸시 + 인용답장 릴레이.
--   Pi Browser WebView 푸시 부재를 기존 msg_noti_outbox→Telegram 파이프 확장으로 대체(하이브리드).

-- ──────────────────────────────────────────────────────────────
-- (A) msg_noti_outbox 확장 — 알림 유형 통합 + 채팅 방 연결
-- ──────────────────────────────────────────────────────────────
-- DA-APPROVED: 메시징 아웃박스에 알림유형·채팅방 컬럼 추가. 주문 전용 → 통합 알림 허브로 일반화 (2026-07-01)
--   표준단어 신규: RELAY(릴레이/중계), CUR(현재) — da-team-leader 등록 요청. 기존 NOTI/OUTBOX/TLGM/RECV/SENT 재사용.
--   noti_tp_cd(VARCHAR): ORDER(주문)/CHAT(채팅)/TXN_ST(거래상태)/FBCK(후기)
--   order_id NOT NULL 완화: CHAT/FBCK는 주문 없이 발생 — 유형별 필수값은 앱 레벨 보장(무FK 원칙)
--   room_id: CHAT 유형 대화방 연결 (msg_room.room_id 참조 — app 레벨 FK, 무FK 원칙 2026-07-01)

ALTER TABLE public.msg_noti_outbox
  ADD COLUMN IF NOT EXISTS noti_tp_cd VARCHAR(10) NOT NULL DEFAULT 'ORDER'
    CHECK (noti_tp_cd IN ('ORDER', 'CHAT', 'TXN_ST', 'FBCK')),
  ADD COLUMN IF NOT EXISTS room_id UUID; -- msg_room.room_id 참조 (app 레벨 FK — 무FK 원칙)

-- 채팅 알림은 주문 없이 발생 → order_id NOT NULL 완화 (기존 ORDER 알림은 계속 order_id를 채움)
ALTER TABLE public.msg_noti_outbox ALTER COLUMN order_id DROP NOT NULL;

-- 유형별 발송 대기 조회 + 채팅방 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_msg_noti_outbox_tp   ON public.msg_noti_outbox(noti_tp_cd, sent_yn, del_yn);
CREATE INDEX IF NOT EXISTS idx_msg_noti_outbox_room ON public.msg_noti_outbox(room_id) WHERE del_yn = 'N';

COMMENT ON COLUMN public.msg_noti_outbox.noti_tp_cd IS '알림 유형 (ORDER 주문 / CHAT 채팅 / TXN_ST 거래상태 / FBCK 후기) — 단일 아웃박스 통합 허브';
COMMENT ON COLUMN public.msg_noti_outbox.room_id    IS '채팅방 ID (FK → msg_room.room_id, CHAT 유형 전용, nullable)';
COMMENT ON COLUMN public.msg_noti_outbox.order_id   IS '주문 ID (FK → mps_order.order_id) — ORDER/TXN_ST 유형 필수, CHAT/FBCK는 NULL 허용';

-- ──────────────────────────────────────────────────────────────
-- (B) 신규 테이블: msg_tlgm_out — 텔레그램 발송 메시지 ↔ 채팅방 매핑 (인용답장 라우팅)
-- ──────────────────────────────────────────────────────────────
-- DA-APPROVED: 봇이 발송한 Telegram 메시지 ID를 room에 역매핑. 사용자의 인용답장(reply_to)을
--   정확한 대화방으로 라우팅(봇 창 하나·다중 대화 문제 해결). (2026-07-01)
--   표준단어: TLGM(Telegram)/OUT(발송)/SRC(원천)/RECV(수신) — 기존 등록 재사용. 시스템컬럼4 + 논리삭제 준수.
--   무FK 원칙(2026-07-01): 모든 참조는 app 레벨(REFERENCES 미사용) — 고아 정리는 앱에서.

CREATE TABLE IF NOT EXISTS public.msg_tlgm_out (
  -- PK
  tlgm_out_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 매핑 대상 (app 레벨 FK — 무FK 원칙)
  room_id      UUID   NOT NULL,   -- msg_room.room_id
  recv_usr_id  UUID   NOT NULL,   -- sys_user.id (수신자)
  recv_chat_id BIGINT NOT NULL,   -- 수신자 Telegram chat_id
  tlgm_msg_id  BIGINT NOT NULL,   -- 봇이 발송한 message_id (인용답장 라우팅 키)
  src_msg_id   UUID,              -- 미러링 원천 msg_msg.msg_id (nullable)

  -- 논리삭제
  del_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,

  -- 시스템 컬럼 4개 (필수)
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 인용답장 라우팅 핵심 인덱스: (수신자 chat_id, 봇 발송 msg_id) → room 역조회
CREATE INDEX IF NOT EXISTS idx_msg_tlgm_out_route ON public.msg_tlgm_out(recv_chat_id, tlgm_msg_id) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_msg_tlgm_out_room  ON public.msg_tlgm_out(room_id) WHERE del_yn = 'N';

COMMENT ON TABLE  public.msg_tlgm_out              IS '봇이 발송한 Telegram 메시지 ↔ 채팅방 역매핑. 사용자의 인용답장(reply_to.message_id)을 정확한 msg_room으로 라우팅. (PRD_13 §18-6, FR-MSG-13)';
COMMENT ON COLUMN public.msg_tlgm_out.tlgm_out_id  IS '매핑 ID (UUID, PK)';
COMMENT ON COLUMN public.msg_tlgm_out.room_id      IS '대화방 ID (FK → msg_room.room_id)';
COMMENT ON COLUMN public.msg_tlgm_out.recv_usr_id  IS '수신자 사용자 ID (FK → sys_user.id) — 이 텔레그램 메시지를 받은 사용자';
COMMENT ON COLUMN public.msg_tlgm_out.recv_chat_id IS '수신자 Telegram chat_id (BIGINT)';
COMMENT ON COLUMN public.msg_tlgm_out.tlgm_msg_id  IS '봇이 발송한 Telegram message_id (BIGINT, 인용답장 라우팅 키)';
COMMENT ON COLUMN public.msg_tlgm_out.src_msg_id   IS '미러링 원천 메시지 ID (FK → msg_msg.msg_id, nullable)';
COMMENT ON COLUMN public.msg_tlgm_out.del_yn       IS '논리삭제 여부 (Y/N, 기본 N)';
COMMENT ON COLUMN public.msg_tlgm_out.del_dtm      IS '논리삭제 일시 (TIMESTAMPTZ)';

-- mod_dtm 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.fn_upd_msg_tlgm_out_mod_dtm() RETURNS TRIGGER AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msg_tlgm_out_mod_dtm ON public.msg_tlgm_out;
CREATE TRIGGER trg_msg_tlgm_out_mod_dtm
  BEFORE UPDATE ON public.msg_tlgm_out
  FOR EACH ROW EXECUTE FUNCTION public.fn_upd_msg_tlgm_out_mod_dtm();

-- ──────────────────────────────────────────────────────────────
-- (C) sys_user 확장 — 봇 창 활성 대화방 포인터 (라우팅 폴백)
-- ──────────────────────────────────────────────────────────────
-- DA-APPROVED: 텔레그램 봇 창에서 인용답장 없이 보낼 때 라우팅할 '현재 대화방' 포인터 (2026-07-01)
--   표준단어 신규: RELAY(릴레이/중계), CUR(현재) — da-team-leader 등록 요청. 무FK 원칙(app 레벨 참조).

ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS cur_relay_room_id UUID; -- msg_room.room_id 참조 (app 레벨 FK — 무FK 원칙)

COMMENT ON COLUMN public.sys_user.cur_relay_room_id IS '텔레그램 봇 창 현재 대화방 (인용답장 없을 때 라우팅 폴백, msg_room.room_id — app 레벨 FK)';
