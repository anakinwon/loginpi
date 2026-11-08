-- sql/097_event_reward_funding.sql (병렬 세션 096 충돌 회피 — 096→097 재할당)
-- DA-APPROVED: evt_ 이벤트 주제영역(044/095) + mint 보조금 발행(081) 기존 승인 연장 — PL/pgSQL 함수 교체 + 데이터, 스키마 변경 없음
--
-- 목적: 두 오픈베타 이벤트의 보상 재원 마련
--   #1 미션 이벤트   : 100명 × 5,000 Bean  (= 상한 500,000 Bean)
--   #2 매장 온보딩   : 100명 × 10,000 Bean (= 1,000,000 Bean)
--
-- 두 이벤트는 재원 정책이 구조적으로 다르다(2026-06-23 마스터 결정):
--   #1 미션(fn_evt_grant_bean_reward, sql/095): 지급 순간 동일액을 mint→apply 하는 just-in-time 발행.
--      → 사전 재원 풀 불필요(쌓으면 이중 발행). 발행=실지급으로 회계 항등식 유지.
--      → 본 파일은 '선착순 100명 한도' 가드만 추가(현재 095엔 정원 제한 없음).
--   #2 매장(fn_bean_campaign_approve, sql/084): 승인 시 mint 없이 REWARD_POOL 잔액에서 차감만.
--      → v_pool < reward_bean 이면 INSUFFICIENT_POOL 거부. 100명 전원 승인하려면 사전 재원 필수.
--      → REWARD_POOL에 1,000,000 Bean을 멱등 mint(같은 사유 발행 이력 없을 때만).
--
-- 멱등(돈·데이터 품질 양보없음):
--   #1 가드는 evt_event를 FOR UPDATE로 잠가 선착순 카운트를 직렬화(동시 지급에도 정확히 100 보장).
--   #2 mint는 bean_mint_log.reason_txt 고유 사유로 중복 발행 차단(마스터가 이미 충전했어도 안전).

-- ════════════════════════════════════════════════════════════════════
-- #1. 미션 이벤트 — just-in-time 유지 + 선착순 100명 한도 추가
--     시그니처 동일 유지 → CREATE OR REPLACE가 기존 함수를 교체(기존 호출 전부에 가드 적용).
--     정원은 함수 내부 상수(v_max_grant)로 둠(파라미터 추가 시 오버로드되어 옛 함수가 잔존하므로 금지).
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_evt_grant_bean_reward(
  p_event_id TEXT,
  p_user_id  UUID,
  p_bean_amt BIGINT DEFAULT 5000
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_grant CONSTANT INT := 100;   -- 선착순 정원(미션 이벤트 #1)
  v_required INT;
  v_done     INT;
  v_st       TEXT;
  v_paid_cnt INT;
  v_now      TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  IF p_bean_amt <= 0 THEN RETURN 'INVALID_AMT'; END IF;

  -- 1) 이벤트 + 기준 미션 수 확인 (FOR UPDATE: 선착순 카운트 직렬화)
  SELECT COALESCE(reward_mission_count_no, 10) INTO v_required
    FROM public.evt_event WHERE event_id = p_event_id AND del_yn = 'N'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NO_EVENT'; END IF;

  -- 2) 완료 미션 수 ≥ 기준 (논리삭제 제외)
  SELECT COUNT(*) INTO v_done FROM public.evt_user_mission
   WHERE event_id = p_event_id AND user_id = p_user_id AND del_yn = 'N';
  IF v_done < v_required THEN RETURN 'NOT_ELIGIBLE'; END IF;

  -- 3) 멱등 게이트: 보상 로그 행 잠금 후 상태 확인 (이중지급 절대 금지)
  SELECT reward_st_cd INTO v_st FROM public.evt_pi_reward_log
   WHERE event_id = p_event_id AND user_id = p_user_id
   FOR UPDATE;
  IF v_st = 'PAID' THEN RETURN 'ALREADY'; END IF;

  -- 3.5) 선착순 정원 가드 (NEW) — 본인은 아직 미PAID이므로 기존 PAID 수만 집계
  SELECT COUNT(*) INTO v_paid_cnt FROM public.evt_pi_reward_log
   WHERE event_id = p_event_id AND reward_st_cd = 'PAID' AND del_yn = 'N';
  IF v_paid_cnt >= v_max_grant THEN RETURN 'SOLD_OUT'; END IF;

  -- 4) 재원 확보(mint) → 지급(apply): 한 트랜잭션 내 POOL +amt -amt = 0, USER +amt (항등식 유지)
  PERFORM public.fn_bean_mint(p_bean_amt, 'REWARD_POOL', '오픈베타#1 이벤트 보상 재원', 'EVENT');
  PERFORM public.fn_bean_apply(
    p_user_id::text, 'REWARD', p_bean_amt, NULL, NULL,
    'EVENT_REWARD', p_event_id, '오픈베타#1 10미션 완주 보상', 'EVENT'
  );

  -- 5) 보상 로그 기록 (PAID) — UNIQUE(event_id,user_id) 멱등 upsert
  INSERT INTO public.evt_pi_reward_log
    (event_id, user_id, pi_uid, reward_amt, reward_st_cd, paid_dtm, regr_id, modr_id)
  VALUES
    (p_event_id, p_user_id, 'BEAN_GRANT', p_bean_amt, 'PAID', v_now, 'EVENT', 'EVENT')
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET reward_st_cd = 'PAID',
        reward_amt   = EXCLUDED.reward_amt,
        paid_dtm     = v_now,
        modr_id      = 'EVENT',
        mod_dtm      = v_now
   WHERE public.evt_pi_reward_log.reward_st_cd <> 'PAID';

  RETURN 'GRANTED';
END;
$$;

COMMENT ON FUNCTION public.fn_evt_grant_bean_reward IS
  '오픈베타#1 10미션 완주자에게 5,000 Bean 지급(멱등) — 선착순 100명 한도. mint+apply로 회계 항등식 보장.';

-- ════════════════════════════════════════════════════════════════════
-- #2. 매장 선착순 온보딩 — 캠페인 정의 보장 + REWARD_POOL 1,000,000 Bean 멱등 충전
-- ════════════════════════════════════════════════════════════════════

-- 2-1) SHOP_ONBOARD 캠페인 정의 보장 (sql/082 시드 — 이미 있으면 무시)
INSERT INTO public.bean_campaign
  (campaign_cd, campaign_nm, reward_bean, max_grant_cnt, src_wallet,
   require_shop_yn, require_item_yn, require_telegram_yn, require_mission_cnt,
   active_yn, regr_id, modr_id)
VALUES
  ('SHOP_ONBOARD', '매장 선착순 온보딩 보상', 10000, 100, 'REWARD_POOL',
   'Y', 'Y', 'Y', 0, 'Y', 'ADMIN', 'ADMIN')
ON CONFLICT (campaign_cd) DO NOTHING;

-- 2-2) 재원 충전 — 100 × 10,000 = 1,000,000 Bean (멱등: 동일 사유 발행 이력 없을 때만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bean_mint_log
     WHERE reason_txt = '매장 선착순 온보딩 보상 재원(100×10,000)' AND del_yn = 'N'
  ) THEN
    PERFORM public.fn_bean_mint(
      1000000, 'REWARD_POOL', '매장 선착순 온보딩 보상 재원(100×10,000)', 'ADMIN'
    );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 검증 (적용 후 수동)
-- ════════════════════════════════════════════════════════════════════
-- 1) REWARD_POOL 잔액(매장 온보딩 재원 1,000,000 이상이어야 100명 전원 승인 가능)
--    SELECT wallet_type, bean_amt FROM public.bean_token_wallet WHERE wallet_type = 'REWARD_POOL';
-- 2) 매장 온보딩 재원 발행 이력 1건(멱등 — 재실행해도 1건 유지)
--    SELECT bean_amt, reason_txt, reg_dtm FROM public.bean_mint_log
--     WHERE reason_txt LIKE '매장 선착순 온보딩%' ORDER BY reg_dtm DESC;
-- 3) SHOP_ONBOARD 캠페인 규칙 확인(reward_bean=10000, max_grant_cnt=100)
--    SELECT campaign_cd, reward_bean, max_grant_cnt, active_yn FROM public.bean_campaign WHERE campaign_cd='SHOP_ONBOARD';
-- 4) 미션 이벤트 선착순 가드 동작(101번째부터 SOLD_OUT)
--    SELECT public.fn_evt_grant_bean_reward('<event_id>', '<user_uuid>'::uuid);  -- GRANTED|ALREADY|NOT_ELIGIBLE|SOLD_OUT|NO_EVENT
-- 5) 미션 이벤트 지급 누계(PAID 수 ≤ 100)
--    SELECT COUNT(*) FROM public.evt_pi_reward_log WHERE event_id='<event_id>' AND reward_st_cd='PAID' AND del_yn='N';
