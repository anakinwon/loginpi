-- DA-APPROVED: cafe.pi와 무관한 외부 테이블 정리(물리 DROP 허용).
--   논리삭제(del_yn) 원칙은 cafe.pi 도메인 데이터에 적용되는 것이고, 아래 12개는
--   Supabase 스타터 예제 + 초기 프로토타입 잔재로 cafe.pi 도메인이 아니다.
--   판별 근거: ①우리 마이그레이션에 CREATE 없음(sql/008이 시스템컬럼 일괄적용 때
--   휩쓸어 ALTER만 함) ②코드에서 .from()으로 미사용 ③events·profiles는 auth.users를
--   FK 참조(Supabase 스타터 시그니처)하며 participants·settlements·role_logs가 이들을
--   FK로 참조하는 외부 클러스터 ④dept_info·*_info는 무접두 프로토타입.
--   cafe.pi 테이블이 이들을 FK로 참조하지 않음(의존성 0 확인)→ CASCADE 안전. (2026-06-28)
-- 정리 대상 제외: rpt_report(우리 것·sql/113), i18n_country·i18n_msg(우리 i18n 구버전 — 별도 검토).

DROP TABLE IF EXISTS
  public.role_logs,        -- 프로토타입 RBAC 로그(events·profiles FK) — cafe.pi RBAC=role_mst/role_perm와 무관
  public.participants,     -- 프로토타입(events FK)
  public.settlements,      -- 프로토타입(events FK) — cafe.pi 정산=mps_txn_hist
  public.events,           -- Supabase 스타터(auth.users FK)
  public.profiles,         -- Supabase 스타터(auth.users FK) — cafe.pi 사용자=sys_user
  public.instruments,      -- Supabase 퀵스타트 예제
  public.sync_log,         -- 프로토타입
  public.dept_info,        -- 프로토타입(무접두)
  public.order_info,       -- 프로토타입 — cafe.pi 주문=mps_order
  public.prod_info,        -- 프로토타입 — cafe.pi 상품=mps_item
  public.prod_catal_info,  -- 프로토타입
  public.user_info         -- 프로토타입 — cafe.pi 사용자=sys_user
CASCADE;
