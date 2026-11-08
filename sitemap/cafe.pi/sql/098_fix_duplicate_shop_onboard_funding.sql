-- sql/098_fix_duplicate_shop_onboard_funding.sql
-- DA-APPROVED: mint 보조금 발행(081) 기존 승인 연장 — 데이터 정정(회수), 스키마 변경 없음
--
-- 문제: 매장 선착순 온보딩 재원이 이중 발행됨 (2026-06-23 검증에서 발견)
--   6/21: 1,000,000  '매장 선착순 온보딩 보상 캠페인 재원 (100매장 × 10,000 Bean)'  ← 기존 정본(유지)
--   6/23: 1,000,000  '매장 선착순 온보딩 보상 재원(100×10,000)'                     ← sql/097이 중복 발행
--   원인: 097의 멱등 가드가 reason_txt 정확일치만 검사 → 문구가 다른 기존 건을 못 걸러 재발행.
--
-- 정정(돈·데이터 품질 양보없음): 097이 발행한 6/23 건만 정확히 회수.
--   ① REWARD_POOL -1,000,000  ② 해당 mint_log 논리삭제(발행 총량에서 제외 → 항등식 복원)
--   멱등: 6/23 건이 이미 논리삭제됐으면(재실행) 대상 0건 → 변동 없음.
--   주의: 6/21 정본은 보존. 회수액은 '회수 대상 mint_log.bean_amt' 실값으로만 차감(임의값 금지).

DO $$
DECLARE
  v_dup_amt BIGINT;
BEGIN
  -- 정정 대상: 097이 발행한 6/23 건(논리삭제 안 된 것)
  SELECT bean_amt INTO v_dup_amt
    FROM public.bean_mint_log
   WHERE reason_txt = '매장 선착순 온보딩 보상 재원(100×10,000)'
     AND del_yn = 'N'
   ORDER BY reg_dtm DESC
   LIMIT 1;

  IF v_dup_amt IS NULL THEN
    RAISE NOTICE '정정 대상 없음 — 이미 회수되었거나 중복 발행이 존재하지 않음';
    RETURN;
  END IF;

  -- ① REWARD_POOL에서 중복분 회수 (실발행액만큼만)
  UPDATE public.bean_token_wallet
     SET bean_amt = bean_amt - v_dup_amt,
         modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
   WHERE wallet_type = 'REWARD_POOL';

  -- ② 중복 mint 로그 논리삭제 (발행 총량 집계에서 제외 → 대차대조표 정합 복원)
  UPDATE public.bean_mint_log
     SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP,
         modr_id = 'ADMIN', mod_dtm = CURRENT_TIMESTAMP
   WHERE reason_txt = '매장 선착순 온보딩 보상 재원(100×10,000)'
     AND del_yn = 'N';

  RAISE NOTICE '중복 발행 % Bean 회수 완료 (6/21 정본 1건만 유지)', v_dup_amt;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 후 수동)
-- ════════════════════════════════════════════════════════════════════
-- 1) 매장 온보딩 재원 mint 활성 이력이 6/21 정본 1건만 남는지
--    SELECT bean_amt, reason_txt, reg_dtm FROM public.bean_mint_log
--     WHERE reason_txt LIKE '매장 선착순 온보딩%' AND del_yn='N' ORDER BY reg_dtm;
-- 2) REWARD_POOL 잔액이 1,000,000 감소했는지(정정 전 2,001,424 → 1,001,424 예상)
--    SELECT wallet_type, bean_amt FROM public.bean_token_wallet WHERE wallet_type='REWARD_POOL';
