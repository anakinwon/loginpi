-- 164_quick_menu_add_payments.sql
-- 관리자 플로팅 팝업(AdminQuickMenu)에 "결제"(/admin/payments) 항목 추가 (DML only, 멱등)
-- 배경: A2U 환불 운영(2026-07-02 메인넷 지갑 신청)으로 결제 내역 상시 접근 필요.
-- 이미 활성 노출 중이면 아무것도 하지 않는다. 순서는 현재 목록의 맨 뒤.

insert into public.sys_quick_menu (menu_href, sort_ord, use_yn, del_yn, regr_id, modr_id)
select '/admin/payments',
       coalesce((select max(sort_ord) from public.sys_quick_menu where del_yn = 'N'), 0) + 10,
       'Y', 'N', 'ADMIN', 'ADMIN'
where not exists (
  select 1 from public.sys_quick_menu
  where del_yn = 'N' and menu_href = '/admin/payments'
);

-- 검증 — /admin/payments 활성 1행이 보여야 정상
select menu_href, sort_ord, use_yn, del_yn
from public.sys_quick_menu
where del_yn = 'N'
order by sort_ord;
