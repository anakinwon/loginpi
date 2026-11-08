-- DA-APPROVED: 'ccy'(통화/currency, ISO 4217) · 'fx'(환율/foreign exchange) 표준약어 신규 등재 (2026-06-17)
--   MPS 직거래 판매자 자국통화 등록·표시 고도화. price_pi(정본 Pi가) + 등록시점 자국통화 스냅샷 병행.
--   ⚠️ 자국통화 금액은 '등록시점 고정 참고값' — 실시간 재환산 아님(Pi 가치평가 상시노출 회피, 등재 레드라인 준수).
--   표시는 NEXT_PUBLIC_FEATURE_PI_PRICE 플래그로 게이트. 저장은 항상 수행(이력 보존).

-- ──────────────────────────────────────────────────────────────
-- 1. mps_item — 등록 통화 스냅샷 (판매자 자국통화로 등록)
--    ccy_cd NULL = Pi 직접입력(법정화폐 미사용)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.mps_item
  ADD COLUMN IF NOT EXISTS ccy_cd      VARCHAR(3),                 -- 등록 통화코드(ISO 4217). NULL=Pi 직접입력
  ADD COLUMN IF NOT EXISTS ccy_amt     NUMERIC(18,2),              -- 판매자 입력 자국통화 표시가(등록시점 고정)
  ADD COLUMN IF NOT EXISTS fx_snap_dtm TIMESTAMPTZ;                -- 환율 스냅샷 일시(등록시점)

COMMENT ON COLUMN public.mps_item.ccy_cd      IS '등록 통화코드(ISO 4217). NULL=Pi 직접입력';
COMMENT ON COLUMN public.mps_item.ccy_amt     IS '판매자 입력 자국통화 표시가 — 등록시점 고정 참고값(실시간 재환산 아님)';
COMMENT ON COLUMN public.mps_item.fx_snap_dtm IS '환율 스냅샷 일시(등록시점)';

-- ──────────────────────────────────────────────────────────────
-- 2. mps_order — 주문(판매이력) 자국통화 스냅샷 (주문 시점 item 값 복사)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS ccy_cd  VARCHAR(3),                     -- 주문 시점 통화코드 스냅샷
  ADD COLUMN IF NOT EXISTS ccy_amt NUMERIC(18,2);                  -- 주문 시점 자국통화 금액 스냅샷

COMMENT ON COLUMN public.mps_order.ccy_cd  IS '주문 시점 통화코드 스냅샷(ISO 4217)';
COMMENT ON COLUMN public.mps_order.ccy_amt IS '주문 시점 자국통화 금액 스냅샷(order_price_pi 대응)';

-- ──────────────────────────────────────────────────────────────
-- 3. mps_txn_hist — 거래이력 자국통화 스냅샷 (pi_amt 대응 참고값)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.mps_txn_hist
  ADD COLUMN IF NOT EXISTS ccy_cd  VARCHAR(3),                     -- 거래 통화코드 스냅샷
  ADD COLUMN IF NOT EXISTS ccy_amt NUMERIC(18,2);                  -- pi_amt 대응 자국통화 참고값(입금 +, 출금 -)

COMMENT ON COLUMN public.mps_txn_hist.ccy_cd  IS '거래 통화코드 스냅샷(ISO 4217)';
COMMENT ON COLUMN public.mps_txn_hist.ccy_amt IS 'pi_amt 대응 자국통화 참고값(부호 동일: 입금 +, 출금 -)';
