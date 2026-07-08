-- DA-APPROVED: 캠페인 보상 PI모드 전환 (PRD_24 §0 잔여 — 보상 A2U 이벤트·캠페인, 2026-07-08)
--   PI 요금모드에서 캠페인 보상은 Bean 지급 대신 Pi A2U 실송금으로 전환한다.
--   ⭐ 관리자 승인 게이트(마스터 결정 2026-07-08): 무인 cron은 신청(PENDING)까지만,
--     실송금은 관리자 승인 행동(approve·grant-all 버튼)에서만 발생한다.
--   구성: ① bean_campaign_pi_reward_log — A2U 송금 멱등 추적(fbck_pi_reward_log 미러)
--         ② fn_bean_campaign_approve p_mode 추가 — PI모드는 Bean 지급 생략·승인 전이만
-- DA 표준: 시스템4 + del_yn. FK 무설계 관례(campaign_cd·usr_id 참조 컬럼만).

-- ── ① 캠페인 보상 Pi A2U 송금 멱등 로그 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bean_campaign_pi_reward_log (
  camp_pi_log_id UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_cd    TEXT          NOT NULL,                 -- 캠페인 코드(bean_campaign)
  usr_id         TEXT          NOT NULL,                 -- 보상 수령자
  pi_uid         TEXT,                                   -- Pi Network UID(송금 시점 스냅샷)
  pi_amt         NUMERIC(18,7) NOT NULL CHECK (pi_amt > 0), -- 송금액(Pi, Bean÷100)
  payment_id     TEXT,                                   -- Pi A2U 결제 식별자(완료 시)
  reward_st_cd   VARCHAR(10)   NOT NULL DEFAULT 'PENDING'
                 CHECK (reward_st_cd IN ('PENDING','PAID','FAILED')),
  fail_reason_tx TEXT,                                   -- 실패 사유(재시도 진단)
  paid_dtm       TIMESTAMPTZ,                            -- 송금 완료 시각
  del_yn         CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT          NOT NULL DEFAULT 'SYSTEM',
  reg_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT          NOT NULL DEFAULT 'SYSTEM',
  mod_dtm        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_bean_campaign_pi_reward UNIQUE (campaign_cd, usr_id) -- 캠페인×사용자 1회 지급(멱등)
);

COMMENT ON TABLE  public.bean_campaign_pi_reward_log              IS '캠페인 보상 Pi A2U 송금 멱등 로그 — PI모드 실송금 추적(관리자 승인 게이트). PRD_24 §0';
COMMENT ON COLUMN public.bean_campaign_pi_reward_log.pi_amt       IS '송금액(Pi) = 보상 Bean ÷ 100 (1π=100 Bean)';
COMMENT ON COLUMN public.bean_campaign_pi_reward_log.reward_st_cd IS 'PENDING(대기)·PAID(완료)·FAILED(실패, cron 재시도)';

-- 미송금(PENDING/FAILED) 대기분 재시도 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_bean_campaign_pi_reward_pending
  ON public.bean_campaign_pi_reward_log(reward_st_cd)
  WHERE del_yn = 'N' AND reward_st_cd IN ('PENDING','FAILED');

-- ── ② fn_bean_campaign_approve — p_mode 추가 재정의 ─────────────────────────
--   기존 3-인자 시그니처는 DROP(4-인자 DEFAULT와 오버로드 모호성 방지). 기존 호출은
--   p_mode 생략 시 DEFAULT 'BEAN'으로 완전 호환.
--   PI모드: Bean 재원 검사·fn_bean_apply를 생략하고 승인 상태만 전이 + reward_bean 반환
--   → 앱 레이어가 bean_campaign_pi_reward_log 기록 + A2U 실송금(관리자 승인 시점).
DROP FUNCTION IF EXISTS public.fn_bean_campaign_approve(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_bean_campaign_approve(
  p_usr_id      TEXT,
  p_campaign_cd TEXT,
  p_admin_id    TEXT,
  p_mode        TEXT DEFAULT 'BEAN'
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

  IF p_mode = 'PI' THEN
    -- PI모드: Bean 지급 없음(재원 검사 불요) — 승인 상태만 전이.
    -- 실 Pi 송금은 앱 레이어(bean_campaign_pi_reward_log 멱등 + A2U)가 담당.
    UPDATE public.bean_campaign_grant
       SET grant_st_cd = 'APPROVED', apprv_admin_id = p_admin_id,
           apprv_dtm = CURRENT_TIMESTAMP, modr_id = p_admin_id, mod_dtm = CURRENT_TIMESTAMP
     WHERE grant_id = v_grant_id;

    RETURN jsonb_build_object('status','APPROVED','mode','PI','reward',v_camp.reward_bean,
      'approved_cnt',v_approved_cnt + 1,'max_cnt',v_camp.max_grant_cnt);
  END IF;

  -- ── BEAN모드(기존 경로 무변경) ──
  -- 재원 사전 확인 (빠른 실패용 advisory read — FOR UPDATE 미사용)
  --   ※ 과발행 차단의 진짜 보증은 fn_bean_apply REWARD의 CHECK(bean_amt>=0) 롤백(클램프 제거).
  SELECT bean_amt INTO v_pool FROM public.bean_token_wallet
   WHERE wallet_type = v_camp.src_wallet;
  IF COALESCE(v_pool, 0) < v_camp.reward_bean THEN
    RETURN jsonb_build_object('status','INSUFFICIENT_POOL');
  END IF;

  -- 지급(REWARD: src_wallet- / USER+ / bean_txn) — 검사 지갑 = 차감 지갑 (P0-1)
  PERFORM public.fn_bean_apply(
    p_usr_id, 'REWARD', v_camp.reward_bean, NULL, NULL,
    'CAMPAIGN', p_campaign_cd, v_camp.campaign_nm || ' 승인 지급', p_admin_id,
    v_camp.src_wallet
  );
  UPDATE public.bean_campaign_grant
     SET grant_st_cd = 'APPROVED', apprv_admin_id = p_admin_id,
         apprv_dtm = CURRENT_TIMESTAMP, modr_id = p_admin_id, mod_dtm = CURRENT_TIMESTAMP
   WHERE grant_id = v_grant_id;

  SELECT bean_amt INTO v_new_bal FROM public.bean_token_wallet
   WHERE usr_id = p_usr_id AND wallet_type = 'USER';

  RETURN jsonb_build_object('status','APPROVED','mode','BEAN','reward',v_camp.reward_bean,
    'balance',v_new_bal,'approved_cnt',v_approved_cnt + 1,'max_cnt',v_camp.max_grant_cnt);
END;
$$;

COMMENT ON FUNCTION public.fn_bean_campaign_approve(TEXT, TEXT, TEXT, TEXT) IS
  '캠페인 승인·지급 — BEAN모드=Bean 원자 지급(기존) / PI모드=승인 전이만(실송금은 앱 A2U, 관리자 게이트). PRD_24 §0';

-- 검증:
--   SELECT public.fn_bean_campaign_approve('<usr>','SHOP_ONBOARD','ADMIN','BEAN'); -- 기존 동작
--   SELECT public.fn_bean_campaign_approve('<usr>','SHOP_ONBOARD','ADMIN','PI');   -- Bean 이동 0 확인
--   SELECT reward_st_cd, count(*) FROM public.bean_campaign_pi_reward_log WHERE del_yn='N' GROUP BY reward_st_cd;
