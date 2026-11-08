-- sql/098_evt_bean_charge_backfill.sql
-- DA-APPROVED: evt_ 이벤트 주제영역 기존 승인(044) 연장 — evt_action_log DML(INSERT)만, 스키마 변경 없음
-- 목적: M2(Bean Token 충전) 미션 — bean_charge 액션 훅(payments/complete) 배포 이전에
--   충전한 사용자(anakin2·cclemong·anakin3 등)는 evt_action_log에 bean_charge 기록이 없어
--   M2가 미완료로 남는다. 실제 충전 원장(bean_txn CHARGE)을 근거로 소급 기록한다.
--
-- 멱등: 이미 bean_charge 기록이 있는 사용자(신규 충전자)는 NOT EXISTS로 건너뜀 → 재실행 안전.
-- 시각 보정: 충전이 이벤트 시작 전이면 평가(action_dtm >= start_dtm)에서 누락되므로
--   GREATEST(MIN(충전시각), 이벤트 시작)으로 보정 → '충전 경험 있으면 M2 인정'.
-- 적용 후: 반드시 재평가 실행 — POST /api/admin/event/reeval (관리자 '미션 재평가' 버튼)

BEGIN;

INSERT INTO public.evt_action_log
  (user_id, action_cd, action_dtm, metadata_tx, regr_id, modr_id)
SELECT
  su.id,
  'bean_charge',
  GREATEST(
    MIN(t.reg_dtm),
    (SELECT start_dtm FROM public.evt_event WHERE event_id = 'evt-20260614-001')
  ),
  jsonb_build_object('backfill', true, 'src', 'bean_txn'),
  'BACKFILL',
  'BACKFILL'
FROM public.bean_txn t
JOIN public.sys_user su ON su.id::text = t.usr_id
WHERE t.txn_tp_cd = 'CHARGE'
  AND t.del_yn = 'N'
  AND NOT EXISTS (
    SELECT 1 FROM public.evt_action_log a
     WHERE a.user_id = su.id AND a.action_cd = 'bean_charge' AND a.del_yn = 'N'
  )
GROUP BY su.id;

COMMIT;

-- 검증 (적용 후 수동) — 소급 대상 확인
--   SELECT su.pi_username,
--     (SELECT COALESCE(SUM(bean_amt),0) FROM bean_txn t WHERE t.usr_id=su.id::text AND t.txn_tp_cd='CHARGE' AND t.del_yn='N') AS charged,
--     (SELECT COUNT(*) FROM evt_action_log a WHERE a.user_id=su.id AND a.action_cd='bean_charge' AND a.del_yn='N') AS bean_charge_log
--   FROM sys_user su WHERE su.pi_username IN ('anakin2','cclemong','anakin3');
