-- DA-APPROVED: 캠페인 지급을 '신청 → 관리자 승인 → 지급' 2단계로 전환 (2026-06-21)
-- 자격 충족만으로 자동 지급 금지. 신청은 PENDING 등록(지갑 무변동),
-- 실제 REWARD 지급은 관리자 승인(APPROVED 전이) 시점에만 발생. 선착순 100은 승인 기준.

-- ── 1. 상태 컬럼 추가 ─────────────────────────────────────────────
ALTER TABLE public.bean_campaign_grant
  ADD COLUMN IF NOT EXISTS grant_st_cd   VARCHAR(10) NOT NULL DEFAULT 'PENDING'
    CHECK (grant_st_cd IN ('PENDING','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS apprv_admin_id TEXT,
  ADD COLUMN IF NOT EXISTS apprv_dtm      TIMESTAMPTZ;

COMMENT ON COLUMN public.bean_campaign_grant.grant_st_cd IS 'PENDING(신청·대기) / APPROVED(승인·지급완료) / REJECTED(거절). 지급은 APPROVED 전이 시에만';

-- ── 2. 신청 RPC (지급 X, PENDING 등록만) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bean_campaign_grant(
  p_usr_id      TEXT,
  p_campaign_cd TEXT DEFAULT 'SHOP_ONBOARD'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_camp     public.bean_campaign;
  v_missing  TEXT[] := '{}';
  v_mission_done INT;
  v_tlgm     BOOLEAN;
BEGIN
  SELECT * INTO v_camp FROM public.bean_campaign
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_CAMPAIGN'); END IF;
  IF v_camp.active_yn <> 'Y'
     OR v_camp.start_dtm > CURRENT_TIMESTAMP
     OR (v_camp.end_dtm IS NOT NULL AND v_camp.end_dtm < CURRENT_TIMESTAMP) THEN
    RETURN jsonb_build_object('status','NOT_ACTIVE');
  END IF;

  -- 멱등: 기존 신청/승인 있으면 차단 (REJECTED 포함 — 1인 1회)
  IF EXISTS (SELECT 1 FROM public.bean_campaign_grant
              WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id AND del_yn = 'N') THEN
    RETURN jsonb_build_object('status','ALREADY_SUBMITTED');
  END IF;

  -- 자격 검사 (UUID 컬럼 ::text 캐스팅)
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

  -- 신청 등록 (PENDING — 지갑 무변동)
  INSERT INTO public.bean_campaign_grant (campaign_cd, usr_id, bean_amt, grant_st_cd)
  VALUES (p_campaign_cd, p_usr_id, v_camp.reward_bean, 'PENDING');

  RETURN jsonb_build_object('status','SUBMITTED','reward',v_camp.reward_bean);
END;
$$;

-- ── 3. 승인 RPC (PENDING → APPROVED + 지급) — 관리자 전용 ─────────────
CREATE OR REPLACE FUNCTION public.fn_bean_campaign_approve(
  p_usr_id      TEXT,
  p_campaign_cd TEXT,
  p_admin_id    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_camp        public.bean_campaign;
  v_grant_id    UUID;
  v_approved_cnt INT;
  v_pool        BIGINT;
  v_new_bal     BIGINT;
BEGIN
  SELECT * INTO v_camp FROM public.bean_campaign
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N' FOR UPDATE;  -- 선착순 직렬화
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_CAMPAIGN'); END IF;

  -- 대상 PENDING 신청 확인
  SELECT grant_id INTO v_grant_id FROM public.bean_campaign_grant
   WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id
     AND grant_st_cd = 'PENDING' AND del_yn = 'N';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_PENDING'); END IF;

  -- 선착순: 이미 승인된 수 < 한도
  SELECT COUNT(*) INTO v_approved_cnt FROM public.bean_campaign_grant
   WHERE campaign_cd = p_campaign_cd AND grant_st_cd = 'APPROVED' AND del_yn = 'N';
  IF v_approved_cnt >= v_camp.max_grant_cnt THEN
    RETURN jsonb_build_object('status','SOLD_OUT','approved_cnt',v_approved_cnt,'max_cnt',v_camp.max_grant_cnt);
  END IF;

  -- 재원 확인
  SELECT bean_amt INTO v_pool FROM public.bean_token_wallet WHERE wallet_type = v_camp.src_wallet;
  IF COALESCE(v_pool, 0) < v_camp.reward_bean THEN
    RETURN jsonb_build_object('status','INSUFFICIENT_POOL');
  END IF;

  -- 지급(REWARD: REWARD_POOL- / USER+ / bean_txn)
  PERFORM public.fn_bean_apply(
    p_usr_id, 'REWARD', v_camp.reward_bean, NULL, NULL,
    'CAMPAIGN', p_campaign_cd, v_camp.campaign_nm || ' 승인 지급', p_admin_id
  );
  UPDATE public.bean_campaign_grant
     SET grant_st_cd = 'APPROVED', apprv_admin_id = p_admin_id,
         apprv_dtm = CURRENT_TIMESTAMP, modr_id = p_admin_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE grant_id = v_grant_id;

  SELECT bean_amt INTO v_new_bal FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER';

  RETURN jsonb_build_object('status','APPROVED','reward',v_camp.reward_bean,
    'balance',v_new_bal,'approved_cnt',v_approved_cnt + 1,'max_cnt',v_camp.max_grant_cnt);
END;
$$;

-- ── 4. 거절 RPC (PENDING → REJECTED) — 관리자 전용 ───────────────────
CREATE OR REPLACE FUNCTION public.fn_bean_campaign_reject(
  p_usr_id      TEXT,
  p_campaign_cd TEXT,
  p_admin_id    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cnt INT;
BEGIN
  UPDATE public.bean_campaign_grant
     SET grant_st_cd = 'REJECTED', apprv_admin_id = p_admin_id,
         apprv_dtm = CURRENT_TIMESTAMP, modr_id = p_admin_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id
     AND grant_st_cd = 'PENDING' AND del_yn = 'N';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt = 0 THEN RETURN jsonb_build_object('status','NOT_PENDING'); END IF;
  RETURN jsonb_build_object('status','REJECTED');
END;
$$;
