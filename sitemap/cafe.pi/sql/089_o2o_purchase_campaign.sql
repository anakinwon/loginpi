-- DA-APPROVED: O2O 구매 완료 보상 캠페인 시드 — bean_campaign DML (2026-06-22)
-- 목적: 오프라인 매장(O2O) 첫 구매 완료(DONE) 시 구매자에게 Bean 보상을 자동 신청(PENDING).
--       관리자 승인으로 실지급. 1인 1회(UNIQUE campaign_cd,usr_id 가드).
--
-- 트리거 위치(TS): mps-order.ts markPickup() · autoCompleteReadyOrders()
--   → db.rpc('fn_bean_campaign_grant', { p_usr_id: buyerId, p_campaign_cd: 'O2O_PURCHASE' })
--
-- reward_bean: 잠정 10 Bean (= 0.1 Pi). PRD_15_FEE 미정의 → 관리자가 bean_campaign 행 직접 수정.
-- max_grant_cnt: 9999 (선착순 한도 — 사실상 무제한, 필요 시 조정)
-- src_wallet: REWARD_POOL (fn_bean_campaign_approve → fn_bean_apply('REWARD') 경로)
-- require_*: 모두 'N' — 자격 검사 없음(구매 완료 자체가 자격, TS 레벨에서 호출 통제)

BEGIN;

INSERT INTO public.bean_campaign (
  campaign_cd,
  campaign_nm,
  reward_bean,
  max_grant_cnt,
  src_wallet,
  require_shop_yn,
  require_item_yn,
  require_telegram_yn,
  require_mission_cnt,
  active_yn,
  regr_id,
  modr_id
)
VALUES (
  'O2O_PURCHASE',
  'O2O 첫 구매 완료 보상',
  10,
  9999,
  'REWARD_POOL',
  'N',
  'N',
  'N',
  0,
  'Y',
  'ADMIN',
  'ADMIN'
)
ON CONFLICT (campaign_cd) DO NOTHING;

COMMIT;

-- ============================================================================
-- 적용 후 검증
-- ============================================================================
-- SELECT campaign_cd, campaign_nm, reward_bean, max_grant_cnt, active_yn
--   FROM public.bean_campaign
--  WHERE campaign_cd = 'O2O_PURCHASE';
