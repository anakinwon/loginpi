-- DA-APPROVED: 온보딩 캠페인 M4 조건 추가 (2026-06-23)
-- M1=매장가입 M2=상품등록 M3=텔레그램연동 M4=텔레그램알림확인

-- ── 1. sys_user: M4 알림 확인 컬럼 추가 ────────────────────────
ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS tlgm_alrt_cfm_yn CHAR(1) NOT NULL DEFAULT 'N';

COMMENT ON COLUMN public.sys_user.tlgm_alrt_cfm_yn IS
  'M4 텔레그램 알림 확인 여부 — 연동 시 웰컴 메시지 발송 성공으로 자동 Y 전환';

-- 기존 연동 사용자 백필 (연동=웰컴 메시지 이미 수신=M4 완료)
UPDATE public.sys_user
  SET tlgm_alrt_cfm_yn = 'Y'
  WHERE tlgm_conn_yn = 'Y';

-- ── 2. bean_campaign: M4 조건 컬럼 추가 ────────────────────────
ALTER TABLE public.bean_campaign
  ADD COLUMN IF NOT EXISTS require_tlgm_alrt_yn CHAR(1) NOT NULL DEFAULT 'N';

COMMENT ON COLUMN public.bean_campaign.require_tlgm_alrt_yn IS
  '캠페인 참여 조건: 텔레그램 알림 확인(M4) 필요 여부';

-- SHOP_ONBOARD 캠페인 M4 활성화
UPDATE public.bean_campaign
  SET require_tlgm_alrt_yn = 'Y'
  WHERE campaign_cd = 'SHOP_ONBOARD';

-- ── 3. fn_bean_campaign_grant 재생성 (M4 조건 포함) ───────────
DROP FUNCTION IF EXISTS public.fn_bean_campaign_grant(text, text, uuid);

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
  v_camp        public.bean_campaign;
  v_missing     TEXT[] := '{}';
  v_mission_done INT;
  v_tlgm        BOOLEAN;
  v_tlgm_alrt   BOOLEAN;
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

  -- M1 매장 가입: 대표 매장 소유권 확인 (p_shop_id 지정 시) 또는 보유 여부
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

  -- M2 상품 등록: seller 계정 단위
  IF v_camp.require_item_yn = 'Y'
     AND NOT EXISTS (SELECT 1 FROM public.mps_item WHERE seller_id::text = p_usr_id AND del_yn = 'N') THEN
    v_missing := array_append(v_missing, 'ITEM');
  END IF;

  -- M3 텔레그램 연동: seller 계정 단위
  IF v_camp.require_telegram_yn = 'Y' THEN
    SELECT (tlgm_conn_yn = 'Y') INTO v_tlgm FROM public.sys_user WHERE id::text = p_usr_id;
    IF NOT COALESCE(v_tlgm, false) THEN v_missing := array_append(v_missing, 'TELEGRAM'); END IF;
  END IF;

  -- M4 텔레그램 알림 확인: 웰컴 메시지 수신 여부
  IF v_camp.require_tlgm_alrt_yn = 'Y' THEN
    SELECT (tlgm_alrt_cfm_yn = 'Y') INTO v_tlgm_alrt FROM public.sys_user WHERE id::text = p_usr_id;
    IF NOT COALESCE(v_tlgm_alrt, false) THEN v_missing := array_append(v_missing, 'TELEGRAM_ALRT'); END IF;
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
  '캠페인 신청(PENDING): 1인 1회(usr_id 기준). M1~M4 조건 검증. '
  'status: SUBMITTED/ALREADY_SUBMITTED/NOT_ELIGIBLE/NOT_ACTIVE/NO_CAMPAIGN';
