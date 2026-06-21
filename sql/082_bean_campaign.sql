-- DA-APPROVED: 매장 온보딩 보상 캠페인 — 선착순 자동 지급 (2026-06-21)
-- 자격(AND): 매장 가입 + 상품 1개+ + 텔레그램 연동 (+ 오픈미션 N개, 현재 0=면제)
-- → 선착순 max_grant_cnt 명에게 reward_bean 지급(src_wallet=REWARD_POOL).
--   멱등: bean_campaign_grant UNIQUE(campaign_cd,usr_id). 동시성: 캠페인 행 FOR UPDATE.
--   지급 회계: fn_bean_apply('REWARD') 재사용(REWARD_POOL- / USER+ / bean_txn 기록).

-- ── 1. 캠페인 정의 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_campaign (
  campaign_cd        TEXT         PRIMARY KEY,
  campaign_nm        TEXT         NOT NULL,
  reward_bean        BIGINT       NOT NULL CHECK (reward_bean > 0),
  max_grant_cnt      INT          NOT NULL CHECK (max_grant_cnt > 0),  -- 선착순 한도
  src_wallet         VARCHAR(16)  NOT NULL DEFAULT 'REWARD_POOL'
                       CHECK (src_wallet IN ('PLATFORM','FOUNDATION','REWARD_POOL')),
  require_shop_yn     CHAR(1)      NOT NULL DEFAULT 'Y',   -- 매장 가입 필요
  require_item_yn     CHAR(1)      NOT NULL DEFAULT 'Y',   -- 상품 1개+ 필요
  require_telegram_yn CHAR(1)      NOT NULL DEFAULT 'Y',   -- 텔레그램 연동 필요
  require_mission_cnt INT          NOT NULL DEFAULT 0,     -- 완료해야 할 오픈미션 수(0=면제)
  active_yn          CHAR(1)       NOT NULL DEFAULT 'Y',
  start_dtm          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_dtm            TIMESTAMPTZ,
  del_yn             CHAR(1)       NOT NULL DEFAULT 'N',
  del_dtm            TIMESTAMPTZ,
  regr_id            TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id            TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE public.bean_campaign IS '보상 캠페인 정의 — 자격 조건·선착순 한도·건당 보상·재원 지갑';

-- ── 2. 지급 로그 (멱등 키 + 선착순 카운트) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_campaign_grant (
  grant_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_cd  TEXT         NOT NULL,
  usr_id       TEXT         NOT NULL,
  bean_amt     BIGINT       NOT NULL,
  del_yn       CHAR(1)      NOT NULL DEFAULT 'N',
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 1인 1회 멱등 — 활성 지급 기준 유니크
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_grant
  ON public.bean_campaign_grant(campaign_cd, usr_id) WHERE del_yn = 'N';
COMMENT ON TABLE public.bean_campaign_grant IS '캠페인 지급 로그 — 멱등(campaign_cd,usr_id) + 선착순 카운트 소스';

-- ── 3. 원자적 자격검사 + 선착순 지급 RPC ────────────────────────────
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
  -- 캠페인 조회 + 행 잠금(선착순 동시성 직렬화)
  SELECT * INTO v_camp FROM public.bean_campaign
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_CAMPAIGN'); END IF;
  IF v_camp.active_yn <> 'Y'
     OR v_camp.start_dtm > CURRENT_TIMESTAMP
     OR (v_camp.end_dtm IS NOT NULL AND v_camp.end_dtm < CURRENT_TIMESTAMP) THEN
    RETURN jsonb_build_object('status','NOT_ACTIVE');
  END IF;

  -- 멱등: 이미 받았으면 종료
  IF EXISTS (SELECT 1 FROM public.bean_campaign_grant
              WHERE campaign_cd = p_campaign_cd AND usr_id = p_usr_id AND del_yn = 'N') THEN
    RETURN jsonb_build_object('status','ALREADY_GRANTED');
  END IF;

  -- 선착순 한도
  SELECT COUNT(*) INTO v_granted_cnt FROM public.bean_campaign_grant
   WHERE campaign_cd = p_campaign_cd AND del_yn = 'N';
  IF v_granted_cnt >= v_camp.max_grant_cnt THEN
    RETURN jsonb_build_object('status','SOLD_OUT','granted_cnt',v_granted_cnt,'max_cnt',v_camp.max_grant_cnt);
  END IF;

  -- 자격 검사 (미충족 조건 수집)
  IF v_camp.require_shop_yn = 'Y'
     AND NOT EXISTS (SELECT 1 FROM public.mps_shop WHERE seller_id = p_usr_id AND del_yn = 'N') THEN
    v_missing := array_append(v_missing, 'SHOP');
  END IF;
  IF v_camp.require_item_yn = 'Y'
     AND NOT EXISTS (SELECT 1 FROM public.mps_item WHERE seller_id = p_usr_id AND del_yn = 'N') THEN
    v_missing := array_append(v_missing, 'ITEM');
  END IF;
  IF v_camp.require_telegram_yn = 'Y' THEN
    SELECT (tlgm_conn_yn = 'Y') INTO v_tlgm FROM public.sys_user WHERE id = p_usr_id;
    IF NOT COALESCE(v_tlgm, false) THEN v_missing := array_append(v_missing, 'TELEGRAM'); END IF;
  END IF;
  IF v_camp.require_mission_cnt > 0 THEN
    SELECT COUNT(*) INTO v_mission_done FROM public.evt_user_mission
     WHERE usr_id = p_usr_id AND del_yn = 'N';
    IF v_mission_done < v_camp.require_mission_cnt THEN v_missing := array_append(v_missing, 'MISSION'); END IF;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('status','NOT_ELIGIBLE','missing',to_jsonb(v_missing));
  END IF;

  -- 재원 확인
  SELECT bean_amt INTO v_pool FROM public.bean_token_wallet WHERE wallet_type = v_camp.src_wallet;
  IF COALESCE(v_pool, 0) < v_camp.reward_bean THEN
    RETURN jsonb_build_object('status','INSUFFICIENT_POOL');
  END IF;

  -- 지급: REWARD 거래(REWARD_POOL- / USER+ / bean_txn 기록) — 기존 fn_bean_apply 재사용
  PERFORM public.fn_bean_apply(
    p_usr_id, 'REWARD', v_camp.reward_bean, NULL, NULL,
    'CAMPAIGN', p_campaign_cd, v_camp.campaign_nm || ' 보상', 'SYSTEM'
  );
  -- 멱등 로그(선착순 카운트 소스)
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

COMMENT ON FUNCTION public.fn_bean_campaign_grant IS
  '캠페인 자격검사+선착순+멱등+지급 원자 처리. status: GRANTED/ALREADY_GRANTED/SOLD_OUT/NOT_ELIGIBLE/INSUFFICIENT_POOL/NOT_ACTIVE/NO_CAMPAIGN';

-- ── 4. 캠페인 시드: 매장 선착순 온보딩 (100매장 × 10,000 Bean) ─────────
INSERT INTO public.bean_campaign
  (campaign_cd, campaign_nm, reward_bean, max_grant_cnt, src_wallet,
   require_shop_yn, require_item_yn, require_telegram_yn, require_mission_cnt)
VALUES
  ('SHOP_ONBOARD', '매장 선착순 온보딩 보상', 10000, 100, 'REWARD_POOL', 'Y', 'Y', 'Y', 0)
ON CONFLICT (campaign_cd) DO NOTHING;
