-- sql/095_fn_evt_grant_bean_reward.sql (병렬 세션 번호 충돌로 092→095 재할당)
-- DA-APPROVED: evt_ 이벤트 주제영역 기존 승인(044) 연장 — PL/pgSQL 함수, 스키마 변경 없음
-- 목적: 오픈베타 #1 이벤트 보상을 1π 판매보증금 → 5,000 Bean 지급으로 전환
--   기존 fn_evt_grant_bond_reward(sql/061, 보증금)와 동일한 멱등 보장 + Bean 회계 정합성 확보
--
-- 회계 정합성 (메모리: 돈·데이터 품질 양보없음):
--   fn_bean_apply('REWARD')는 USER+ / REWARD_POOL- 인데, POOL 잔액 부족 시 GREATEST(0,…)
--   클램프로 항등식이 깨진다(sql/077 L98 경고). → 지급 직전 fn_bean_mint로 동일액을 POOL에
--   선충전하여, 한 트랜잭션 내 POOL +amt(mint) -amt(apply) = 0, USER +amt(발행=보유증가) 보장.
--
-- 멱등 (이중지급 절대 금지):
--   evt_pi_reward_log 행을 FOR UPDATE로 잠그고 reward_st_cd='PAID'면 ALREADY 반환.
--   ⚠️ 레거시 'BONDED'(1π 보증금 수령자)는 PAID가 아니므로 Bean도 지급된다(보상 전환 정책).
--      1π를 이미 받은 완주자에게 Bean 추가 지급을 원치 않으면 게이트에 'BONDED'를 추가할 것.

CREATE OR REPLACE FUNCTION public.fn_evt_grant_bean_reward(
  p_event_id TEXT,
  p_user_id  UUID,
  p_bean_amt BIGINT DEFAULT 5000
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_required INT;
  v_done     INT;
  v_st       TEXT;
  v_now      TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  IF p_bean_amt <= 0 THEN RETURN 'INVALID_AMT'; END IF;

  -- 1) 이벤트 + 기준 미션 수 확인
  SELECT COALESCE(reward_mission_count_no, 10) INTO v_required
    FROM public.evt_event WHERE event_id = p_event_id AND del_yn = 'N';
  IF NOT FOUND THEN RETURN 'NO_EVENT'; END IF;

  -- 2) 완료 미션 수 ≥ 기준 (논리삭제 제외)
  SELECT COUNT(*) INTO v_done FROM public.evt_user_mission
   WHERE event_id = p_event_id AND user_id = p_user_id AND del_yn = 'N';
  IF v_done < v_required THEN RETURN 'NOT_ELIGIBLE'; END IF;

  -- 3) 멱등 게이트: 보상 로그 행 잠금 후 상태 확인
  SELECT reward_st_cd INTO v_st FROM public.evt_pi_reward_log
   WHERE event_id = p_event_id AND user_id = p_user_id
   FOR UPDATE;
  IF v_st = 'PAID' THEN RETURN 'ALREADY'; END IF;

  -- 4) 재원 확보(mint) → 지급(apply) : 한 트랜잭션 내 POOL +amt -amt = 0, USER +amt (항등식 유지)
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
  '오픈베타#1 10미션 완주자에게 5,000 Bean 지급(멱등). mint+apply로 회계 항등식 보장.';

-- 검증 (적용 후 수동)
--   SELECT public.fn_evt_grant_bean_reward('evt-20260614-001', '<user_uuid>'::uuid);  -- GRANTED|ALREADY|NOT_ELIGIBLE
--   SELECT wallet_type, bean_amt FROM bean_token_wallet WHERE wallet_type IN ('REWARD_POOL','FOUNDATION','PLATFORM');
