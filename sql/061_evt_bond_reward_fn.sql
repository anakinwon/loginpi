-- sql/061_evt_bond_reward_fn.sql
-- DA-APPROVED: evt_ 이벤트 주제영역 보상 지급 함수 — 044/048 승인 연장 적용 (2026-06-16)
--              테이블 생성 아님(PL/pgSQL 함수). 기존 evt_pi_reward_log·mps_seller_bond 사용.
--
-- 목적: 이벤트 10미션 완료자에게 판매보증금 1π를 "중복 없이" 지급하는 원자적 함수.
-- 중복 방지 3중 장치:
--   ① 단일 트랜잭션(RPC 1회 호출 = 1 트랜잭션) — 부분 실패 시 전체 롤백
--   ② FOR UPDATE 행 잠금 — 동일 사용자 동시 호출 직렬화
--   ③ reward_st_cd IN ('BONDED','PAID') 게이트 — 이미 지급(보증금/레거시 A2U) 시 즉시 차단
-- 반환: 'GRANTED'(신규 지급) | 'ALREADY'(이미 지급) | 'NOT_ELIGIBLE'(미완료) | 'NO_EVENT'

BEGIN;

CREATE OR REPLACE FUNCTION fn_evt_grant_bond_reward(
  p_event_id TEXT,
  p_user_id  UUID
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_required INT;
  v_done     INT;
  v_pi_uid   TEXT;
  v_now      TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_st       TEXT;
BEGIN
  -- 1) 이벤트 보상 기준 미션 수 조회
  SELECT reward_mission_count_no INTO v_required
    FROM evt_event WHERE event_id = p_event_id;
  IF v_required IS NULL THEN
    RETURN 'NO_EVENT';
  END IF;

  -- 2) 자격 검증: 완료(논리삭제 제외) 미션 수 >= 기준
  SELECT COUNT(*) INTO v_done FROM evt_user_mission
   WHERE event_id = p_event_id AND user_id = p_user_id AND del_yn = 'N';
  IF v_done < v_required THEN
    RETURN 'NOT_ELIGIBLE';
  END IF;

  -- 3) 멱등 게이트: 보상 로그 행을 잠그고(FOR UPDATE) 현재 상태 확인
  SELECT reward_st_cd INTO v_st FROM evt_pi_reward_log
   WHERE event_id = p_event_id AND user_id = p_user_id
   FOR UPDATE;

  -- 이미 지급(BONDED=보증금 적립 / PAID=레거시 A2U 송금)이면 중복 차단
  IF v_st IN ('BONDED', 'PAID') THEN
    RETURN 'ALREADY';
  END IF;

  SELECT pi_uid INTO v_pi_uid FROM sys_user WHERE id = p_user_id;

  -- 4) 보상 로그 → BONDED (없으면 생성, 동시 신규 삽입은 ON CONFLICT로 직렬화)
  --    WHERE 조건으로 BONDED/PAID 행은 갱신 대상에서 제외 → 동시성 안전망
  INSERT INTO evt_pi_reward_log
    (event_id, user_id, pi_uid, reward_amt, reward_st_cd, paid_dtm,
     fail_reason_tx, regr_id, modr_id)
  VALUES
    (p_event_id, p_user_id, COALESCE(v_pi_uid, 'BOND_GRANT'), 1.0, 'BONDED', v_now,
     NULL, 'SYSTEM', 'SYSTEM')
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET reward_st_cd   = 'BONDED',
        paid_dtm       = v_now,
        reward_amt     = 1.0,
        pi_uid         = COALESCE(EXCLUDED.pi_uid, evt_pi_reward_log.pi_uid),
        fail_reason_tx = NULL,
        modr_id        = 'SYSTEM',
        mod_dtm        = v_now
    WHERE evt_pi_reward_log.reward_st_cd NOT IN ('BONDED', 'PAID');

  -- 삽입도 갱신도 일어나지 않았다면(=경합에서 이미 BONDED/PAID 확정) 중복으로 간주
  IF NOT FOUND THEN
    RETURN 'ALREADY';
  END IF;

  -- 5) 판매보증금 적립: 1π + 지급준비금 0.1π
  --    seller_id UNIQUE → ON CONFLICT 원자적 적립. 논리삭제 계좌는 활성 복구.
  INSERT INTO mps_seller_bond
    (seller_id, bond_bal_pi, rsv_pi, cancel_cnt, regr_id, modr_id)
  VALUES
    (p_user_id::text, 1.0, 0.1, 0, 'SYSTEM', 'SYSTEM')
  ON CONFLICT (seller_id) DO UPDATE
    SET bond_bal_pi = mps_seller_bond.bond_bal_pi + 1.0,
        rsv_pi      = mps_seller_bond.rsv_pi + 0.1,
        del_yn      = 'N',
        del_dtm     = NULL,
        modr_id     = 'SYSTEM',
        mod_dtm     = v_now;

  RETURN 'GRANTED';
END;
$$;

COMMIT;
