-- sql/100_campaign_telegram_test_gate.sql (병렬 세션 099_rep_shop 충돌 회피 — 099→100 재할당)
-- DA-APPROVED: 캠페인 자격(082/084/096) + msg_noti_outbox(064) 기존 승인 연장 — 함수 교체, 스키마 변경 없음
--   (shop_id 컬럼·UNIQUE 인덱스는 096_campaign_shop_based와 동일 정의 — IF NOT EXISTS 멱등)
--
-- 목적: 매장 온보딩 자격에 '텔레그램 실수신(테스트 거래 완료)' 검증 추가.
--   기존(084/096): require_telegram_yn='Y' → sys_user.tlgm_conn_yn='Y'(연동 여부)만 확인.
--   강화      : 연동 + msg_noti_outbox에 sent_yn='Y' 주문 알림 1건 이상(=실제 주문 알림 수신) 요구.
--   PPTX 요건 '텔레그램 알림 등록 후 거래 테스트'와 정합 — 등록=연동, 거래 테스트=실수신.
--
-- 신규 missing 코드: 'TELEGRAM_TEST' (연동은 됐으나 실수신 이력 없음 → 테스트 주문 받기 안내).
--   * 'TELEGRAM'(미연동)과 구분 → 판매자에게 다음 행동을 정확히 안내. 클라이언트 라벨 매핑 추가 필요.
--
-- ⚠️ 병렬 세션 충돌 주의:
--   본 파일은 096_campaign_shop_based(다른 세션, shop_id 추가)의 fn_bean_campaign_grant 정의를
--   흡수·확장한다(superset). 적용은 096 이후 또는 099 단독(자기완결) 모두 가능.
--   단 099 적용 이후 096을 재적용하면 텔레그램 강화가 사라지므로 금지 — 정본=099.

-- ── 1. shop_id 컬럼·인덱스 보장 (096과 동일, 멱등) ───────────────────
ALTER TABLE public.bean_campaign_grant
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.mps_shop(shop_id);

DROP INDEX IF EXISTS public.uq_campaign_grant;
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_grant
  ON public.bean_campaign_grant(campaign_cd, usr_id) WHERE del_yn = 'N';

-- ── 2. 신청 RPC 재정의 — (text,text) 오버로드 제거 후 (text,text,uuid) 재생성 ──
DROP FUNCTION IF EXISTS public.fn_bean_campaign_grant(text, text);

CREATE OR REPLACE FUNCTION public.fn_bean_campaign_grant(
  p_usr_id      TEXT,
  p_campaign_cd TEXT DEFAULT 'SHOP_ONBOARD',
  p_shop_id     UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_camp         public.bean_campaign;
  v_missing      TEXT[] := '{}';
  v_mission_done INT;
  v_tlgm         BOOLEAN;
BEGIN
  SELECT * INTO v_camp FROM public.bean_campaign
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_CAMPAIGN'); END IF;
  IF v_camp.active_yn <> 'Y'
     OR v_camp.start_dtm > CURRENT_TIMESTAMP
     OR (v_camp.end_dtm IS NOT NULL AND v_camp.end_dtm < CURRENT_TIMESTAMP) THEN
    RETURN jsonb_build_object('status','NOT_ACTIVE');
  END IF;

  -- 멱등: 1인 1회 (usr_id 기준)
  IF EXISTS (
    SELECT 1 FROM public.bean_campaign_grant
     WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id AND del_yn = 'N'
  ) THEN RETURN jsonb_build_object('status','ALREADY_SUBMITTED'); END IF;

  -- 대표 매장 소유권 확인 (p_shop_id 지정 시)
  IF p_shop_id IS NOT NULL AND v_camp.require_shop_yn = 'Y' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.mps_shop
       WHERE shop_id = p_shop_id AND seller_id::text = p_usr_id AND del_yn = 'N'
    ) THEN
      v_missing := array_append(v_missing, 'SHOP');
    END IF;
  ELSIF v_camp.require_shop_yn = 'Y' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mps_shop WHERE seller_id::text = p_usr_id AND del_yn = 'N')
    THEN v_missing := array_append(v_missing, 'SHOP'); END IF;
  END IF;

  -- 상품 등록: seller 계정 단위
  IF v_camp.require_item_yn = 'Y'
     AND NOT EXISTS (SELECT 1 FROM public.mps_item WHERE seller_id::text = p_usr_id AND del_yn = 'N') THEN
    v_missing := array_append(v_missing, 'ITEM');
  END IF;

  -- 텔레그램: 연동 + 실제 주문 알림 수신(테스트 거래) 검증 ★강화★
  IF v_camp.require_telegram_yn = 'Y' THEN
    SELECT (tlgm_conn_yn = 'Y') INTO v_tlgm FROM public.sys_user WHERE id::text = p_usr_id;
    IF NOT COALESCE(v_tlgm, false) THEN
      v_missing := array_append(v_missing, 'TELEGRAM');         -- ① 미연동
    ELSIF NOT EXISTS (
      -- ② 연동O 이지만 실제 주문 알림 수신 이력(sent_yn='Y') 없음 → 테스트 거래 미완료
      SELECT 1 FROM public.msg_noti_outbox
       WHERE recv_usr_id::text = p_usr_id
         AND noti_chnl_cd = 'TELEGRAM'
         AND sent_yn = 'Y'
         AND del_yn = 'N'
    ) THEN
      v_missing := array_append(v_missing, 'TELEGRAM_TEST');
    END IF;
  END IF;

  -- 미션 완료 수
  IF v_camp.require_mission_cnt > 0 THEN
    SELECT COUNT(*) INTO v_mission_done FROM public.evt_user_mission
     WHERE usr_id::text = p_usr_id AND del_yn = 'N';
    IF v_mission_done < v_camp.require_mission_cnt THEN
      v_missing := array_append(v_missing, 'MISSION');
    END IF;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('status','NOT_ELIGIBLE','missing',to_jsonb(v_missing));
  END IF;

  -- 신청 등록 (PENDING, 지갑 무변동, shop_id 포함)
  INSERT INTO public.bean_campaign_grant (campaign_cd, usr_id, shop_id, bean_amt, grant_st_cd)
  VALUES (p_campaign_cd, p_usr_id, p_shop_id, v_camp.reward_bean, 'PENDING');

  RETURN jsonb_build_object('status','SUBMITTED','reward',v_camp.reward_bean);
END;
$$;

COMMENT ON FUNCTION public.fn_bean_campaign_grant IS
  '캠페인 신청(PENDING): 1인 1회(usr_id 기준). p_shop_id=대표 매장(선택). '
  '텔레그램 요건은 연동(tlgm_conn_yn) + 실수신(msg_noti_outbox.sent_yn=Y) 둘 다 검증. '
  'status: SUBMITTED/ALREADY_SUBMITTED/NOT_ELIGIBLE(missing: SHOP/ITEM/TELEGRAM/TELEGRAM_TEST/MISSION)/NOT_ACTIVE/NO_CAMPAIGN';

-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 후 수동)
-- ════════════════════════════════════════════════════════════════════
-- 1) 특정 판매자의 텔레그램 실수신 이력(있으면 TELEGRAM_TEST 통과)
--    SELECT order_id, sent_yn, sent_dtm, tlgm_msg_id FROM public.msg_noti_outbox
--     WHERE recv_usr_id = '<판매자_usr_id>'::uuid AND noti_chnl_cd='TELEGRAM' AND sent_yn='Y' AND del_yn='N';
-- 2) 자격 신청 시뮬레이션(미수신자는 missing에 TELEGRAM_TEST 포함되어야 함)
--    SELECT public.fn_bean_campaign_grant('<usr_id>', 'SHOP_ONBOARD', NULL);
--    -- 기대: 연동X → {"status":"NOT_ELIGIBLE","missing":["TELEGRAM"]}
--    --       연동O·실수신X → {"status":"NOT_ELIGIBLE","missing":["TELEGRAM_TEST"]}
--    --       연동O·실수신O → SHOP/ITEM/MISSION 충족 시 {"status":"SUBMITTED"}
