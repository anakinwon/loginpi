-- DA-APPROVED: fn_bean_campaign_grant 타입 캐스팅 수정 (2026-06-21)
-- 버그: sys_user.id·mps_shop.seller_id·mps_item.seller_id는 UUID 타입인데
--   p_usr_id(TEXT)와 직접 비교 → "operator does not exist: uuid = text" 에러.
-- 수정: 사용자 식별 비교를 컬럼::text = p_usr_id 로 캐스팅(bean 계열은 TEXT라 그대로).

CREATE OR REPLACE FUNCTION public.fn_bean_campaign_grant(
  p_usr_id      TEXT,
  p_campaign_cd TEXT DEFAULT 'SHOP_ONBOARD'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_camp        public.bean_campaign;
  v_granted_cnt INT;
  v_missing     TEXT[] := '{}';
  v_pool        BIGINT;
  v_mission_done INT;
  v_tlgm        BOOLEAN;
  v_new_bal     BIGINT;
BEGIN
  SELECT * INTO v_camp FROM public.bean_campaign
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_CAMPAIGN'); END IF;
  IF v_camp.active_yn <> 'Y'
     OR v_camp.start_dtm > CURRENT_TIMESTAMP
     OR (v_camp.end_dtm IS NOT NULL AND v_camp.end_dtm < CURRENT_TIMESTAMP) THEN
    RETURN jsonb_build_object('status','NOT_ACTIVE');
  END IF;

  IF EXISTS (SELECT 1 FROM public.bean_campaign_grant
              WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id AND del_yn = 'N') THEN
    RETURN jsonb_build_object('status','ALREADY_GRANTED');
  END IF;

  SELECT COUNT(*) INTO v_granted_cnt FROM public.bean_campaign_grant
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N';
  IF v_granted_cnt >= v_camp.max_grant_cnt THEN
    RETURN jsonb_build_object('status','SOLD_OUT','granted_cnt',v_granted_cnt,'max_cnt',v_camp.max_grant_cnt);
  END IF;

  -- 자격 검사 (UUID 컬럼은 ::text 캐스팅으로 비교)
  IF v_camp.require_shop_yn = 'Y'
     AND NOT EXISTS (SELECT 1 FROM public.mps_shop WHERE seller_id::text = p_usr_id AND del_yn = 'N') THEN
    v_missing := array_append(v_missing, 'SHOP');
  END IF;
  IF v_camp.require_item_yn = 'Y'
     AND NOT EXISTS (SELECT 1 FROM public.mps_item WHERE seller_id::text = p_usr_id AND del_yn = 'N') THEN
    v_missing := array_append(v_missing, 'ITEM');
  END IF;
  IF v_camp.require_telegram_yn = 'Y' THEN
    SELECT (tlgm_conn_yn = 'Y') INTO v_tlgm FROM public.sys_user WHERE id::text = p_usr_id;
    IF NOT COALESCE(v_tlgm, false) THEN v_missing := array_append(v_missing, 'TELEGRAM'); END IF;
  END IF;
  IF v_camp.require_mission_cnt > 0 THEN
    SELECT COUNT(*) INTO v_mission_done FROM public.evt_user_mission
     WHERE usr_id::text = p_usr_id AND del_yn = 'N';
    IF v_mission_done < v_camp.require_mission_cnt THEN v_missing := array_append(v_missing, 'MISSION'); END IF;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('status','NOT_ELIGIBLE','missing',to_jsonb(v_missing));
  END IF;

  SELECT bean_amt INTO v_pool FROM public.bean_token_wallet WHERE wallet_type = v_camp.src_wallet;
  IF COALESCE(v_pool, 0) < v_camp.reward_bean THEN
    RETURN jsonb_build_object('status','INSUFFICIENT_POOL');
  END IF;

  -- 지급(REWARD: REWARD_POOL- / USER+ / bean_txn) — bean 계열은 TEXT라 그대로
  PERFORM public.fn_bean_apply(
    p_usr_id, 'REWARD', v_camp.reward_bean, NULL, NULL,
    'CAMPAIGN', p_campaign_cd, v_camp.campaign_nm || ' 보상', 'SYSTEM'
  );
  INSERT INTO public.bean_campaign_grant (campaign_cd, usr_id, bean_amt)
  VALUES (p_campaign_cd, p_usr_id, v_camp.reward_bean);

  SELECT bean_amt INTO v_new_bal FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER';

  RETURN jsonb_build_object(
    'status','GRANTED','reward',v_camp.reward_bean,'balance',v_new_bal,
    'granted_cnt',v_granted_cnt + 1,'max_cnt',v_camp.max_grant_cnt
  );
END;
$$;
