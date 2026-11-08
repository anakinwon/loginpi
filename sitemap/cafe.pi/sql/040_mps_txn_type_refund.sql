-- DA-APPROVED: mps_txn_hist 거래유형(chk_txn_type)에 A2U 환불·취소보상 추가
-- 배경: 구매자 취소 A2U 환불 구현(lib/mps-refund.ts) 시 REFUND_IN(구매자 환불)·
--       CANCEL_FEE_IN(판매자 취소수수료 보상) 유형 사용. 기존 제약은 REFUND만 허용해
--       송금은 성공했으나 장부 INSERT가 차단되던 문제 → 유형 확장.
-- (Supabase 적용 완료 — 2026-06-13)

ALTER TABLE public.mps_txn_hist DROP CONSTRAINT IF EXISTS chk_txn_type;
ALTER TABLE public.mps_txn_hist ADD CONSTRAINT chk_txn_type
  CHECK (txn_type_cd IN (
    'ESCROW_IN',     -- 구매자 → 에스크로 입금
    'RELEASE_OUT',   -- 판매자 정산 출금
    'AUTO_RELEASE',  -- 자동 정산
    'REFUND',        -- (레거시) 환불
    'FEE',           -- 취소수수료 공제(음수)
    'REFUND_IN',     -- 구매자 취소 환불 입금(A2U)
    'CANCEL_FEE_IN'  -- 판매자 취소수수료 보상 수령(A2U)
  ));
