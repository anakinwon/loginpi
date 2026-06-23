-- DA-APPROVED: 캠페인 신청 시 대표 매장 지정 기록 (2026-06-23)
-- 보상 단위는 기존과 동일 — 사용자(usr_id) 기준 1인 1회
-- 변경: 신청 시 대표 매장 1개를 선택해 shop_id에 기록 (어떤 매장으로 참여했는지 추적)
-- UNIQUE INDEX (campaign_cd, usr_id) 유지 — 1인 1회 멱등 보장

-- ── 1. shop_id 컬럼 추가 (대표 매장 기록용, nullable) ─────────────────
ALTER TABLE public.bean_campaign_grant
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.mps_shop(shop_id);

COMMENT ON COLUMN public.bean_campaign_grant.shop_id IS
  '참여 대표 매장 ID — 1인 1회 원칙 유지, 어떤 매장으로 참여했는지 기록';

-- ── 2. UNIQUE INDEX 유지 (campaign_cd, usr_id) — 1인 1회 멱등 보장 ──
-- 기존 uq_campaign_grant 인덱스 구조 확인 후 재생성 (DROP 후 재생성)
DROP INDEX IF EXISTS public.uq_campaign_grant;
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_grant
  ON public.bean_campaign_grant(campaign_cd, usr_id) WHERE del_yn = 'N';

-- ── 3. 신청 RPC — 기존 시그니처(text, text) 제거 후 (text, text, uuid) 재생성 ──
-- 함수 오버로드 충돌 방지: 082/084에 등록된 (p_usr_id text, p_campaign_cd text) 삭제
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
  v_camp        public.bean_campaign;
  v_missing     TEXT[] := '{}';
  v_mission_done INT;
  v_tlgm        BOOLEAN;
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

  -- 텔레그램: seller 계정 단위
  IF v_camp.require_telegram_yn = 'Y' THEN
    SELECT (tlgm_conn_yn = 'Y') INTO v_tlgm FROM public.sys_user WHERE id::text = p_usr_id;
    IF NOT COALESCE(v_tlgm, false) THEN v_missing := array_append(v_missing, 'TELEGRAM'); END IF;
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
  '캠페인 신청(PENDING): 1인 1회(usr_id 기준). p_shop_id=대표 매장 기록용(선택). '
  'status: SUBMITTED/ALREADY_SUBMITTED/NOT_ELIGIBLE/NOT_ACTIVE/NO_CAMPAIGN';
