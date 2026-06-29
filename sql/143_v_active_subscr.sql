-- DA-APPROVED: 통합 구독 뷰 — Bean 결제(bean_subscr) + Pi 결제(msg_subscr) 활성 구독 단일 소스 (2026-06-29)
--   배경: 구독 시스템 이원화(Bean 신규 / Pi 레거시)로 권한(chat-auth)·프로필(getMySubscriptions)이
--         bean_subscr만 봐서 활성 Pi 구독자가 누락(estell6 등). 두 경로 유효성을 동시 체크하도록 통합.
--   매핑: msg_subscr.plan_cd='PREMIUM_MONTHLY' → prod_ctgr_cd='PICAFE'/grade='GENERAL'/cycle='M'.
--   뷰가 활성 필터(del_yn='N' AND expire_dtm > now()) 내장 → 조회부는 usr_id만 걸면 됨.

CREATE OR REPLACE VIEW public.v_active_subscr AS
-- ① Bean 결제 구독 (현행)
SELECT
  usr_id::text                                   AS usr_id,
  prod_ctgr_cd,
  grade_cd,
  bill_cycle_cd,
  fee_plan_cd,
  expire_dtm,
  auto_renew_yn,
  'BEAN'::text                                   AS pay_src
FROM public.bean_subscr
WHERE del_yn = 'N' AND expire_dtm > now()

UNION ALL

-- ② Pi 결제 구독 (레거시 msg_subscr) — PyCafé PREMIUM으로 정규화
SELECT
  usr_id::text                                   AS usr_id,
  'PICAFE'::varchar(24)                          AS prod_ctgr_cd,
  'GENERAL'::varchar(10)                         AS grade_cd,
  (CASE WHEN plan_cd LIKE '%YEARLY%' THEN 'Y' ELSE 'M' END)::varchar(8) AS bill_cycle_cd,
  plan_cd::varchar(20)                           AS fee_plan_cd,     -- Pi 구독은 bean fee_plan 없음 → plan_cd 참조
  expire_dtm,
  auto_renew_yn,
  'PI'::text                                     AS pay_src
FROM public.msg_subscr
WHERE del_yn = 'N' AND expire_dtm > now();

COMMENT ON VIEW public.v_active_subscr IS
  '통합 활성 구독(Bean+Pi 결제) 단일 소스 — chat-auth·프로필이 두 경로 유효성 동시 체크. PRD_24·구독 이원화 통합';

-- 검증:
--   SELECT usr_id, prod_ctgr_cd, bill_cycle_cd, pay_src, expire_dtm FROM public.v_active_subscr ORDER BY pay_src;
--   SELECT count(*) FILTER (WHERE pay_src='BEAN') AS bean, count(*) FILTER (WHERE pay_src='PI') AS pi FROM public.v_active_subscr;
