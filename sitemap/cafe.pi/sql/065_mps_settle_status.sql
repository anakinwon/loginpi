-- 판매자 정산 상태 추적 — 기존 release_txid 유무로만 구분되던 정산을 명시적 상태로 관리
-- UNSETTLED(미정산) / SETTLED(정산완료) / FAILED(정산실패) / NO_UID(판매자 미연동) / DISABLED(A2U 비활성)
-- DA-APPROVED: settle(정산) 도메인 _cd/_dtm 표준 준수, mps_order 가산 컬럼 (settleOrder 결과 1:1 매핑)

ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS settle_st_cd VARCHAR(20) NOT NULL DEFAULT 'UNSETTLED';

ALTER TABLE public.mps_order
  ADD COLUMN IF NOT EXISTS settle_dtm TIMESTAMPTZ;

ALTER TABLE public.mps_order DROP CONSTRAINT IF EXISTS chk_mps_order_settle_st;
ALTER TABLE public.mps_order
  ADD CONSTRAINT chk_mps_order_settle_st CHECK (
    settle_st_cd IN ('UNSETTLED','SETTLED','FAILED','NO_UID','DISABLED')
  );

COMMENT ON COLUMN public.mps_order.settle_st_cd IS '판매자 정산 상태: UNSETTLED 미정산 / SETTLED 정산완료 / FAILED 정산실패 / NO_UID 판매자 미연동 / DISABLED A2U 비활성';
COMMENT ON COLUMN public.mps_order.settle_dtm IS '판매자 정산(A2U 송금) 완료 일시';

-- 기존 데이터 backfill: 이미 송금된 건(release_txid 보유) = SETTLED, 송금일시는 최종수정시각으로 추정
UPDATE public.mps_order
   SET settle_st_cd = 'SETTLED',
       settle_dtm   = COALESCE(settle_dtm, mod_dtm)
 WHERE release_txid IS NOT NULL
   AND settle_st_cd <> 'SETTLED';
