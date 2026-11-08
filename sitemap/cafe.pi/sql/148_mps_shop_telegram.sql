-- DA-APPROVED: 매장별 Telegram 주문 알림 연동 — 매장(mps_shop)당 1:1 chat_id (2026-06-30)
--   기존엔 sys_user.tlgm_chat_id(사용자당 1개)라 한 판매자의 모든 매장이 같은 Telegram으로 알림.
--   매장마다 별도 Telegram(다른 담당자/채널)으로 받도록 mps_shop에 연동 컬럼을 둔다.
--   발송: 주문→매장(shop_id)→mps_shop.tlgm_chat_id 우선, 매장 미연동 시 판매자 sys_user 폴백.
-- DA 표준: _yn(CHAR(1) Y/N), _dtm(TIMESTAMPTZ). 기존 sys_user.tlgm_* 명명과 일치.

ALTER TABLE public.mps_shop
  ADD COLUMN IF NOT EXISTS tlgm_chat_id  BIGINT,
  ADD COLUMN IF NOT EXISTS tlgm_conn_yn  CHAR(1)     NOT NULL DEFAULT 'N'
    CHECK (tlgm_conn_yn IN ('Y','N')),
  ADD COLUMN IF NOT EXISTS tlgm_conn_dtm TIMESTAMPTZ;

COMMENT ON COLUMN public.mps_shop.tlgm_chat_id  IS '매장 주문 알림 Telegram chat_id (매장당 1:1 연동)';
COMMENT ON COLUMN public.mps_shop.tlgm_conn_yn  IS 'Telegram 연동 여부 Y/N — 단발성 바인딩 가드(webhook 원자 갱신)';
COMMENT ON COLUMN public.mps_shop.tlgm_conn_dtm IS 'Telegram 연동 일시';
