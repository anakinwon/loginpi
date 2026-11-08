-- DA-APPROVED: sys_quick_menu — 관리자 하단 플로팅 팝업(AdminQuickMenu)에 노출할 메뉴 선별 설정.
--   menu_href는 admin-nav-catalog.ts의 카탈로그 키(문자열)로, 다른 테이블을 참조하지 않아 FK 없음.
--   관리 화면(/admin/quick-menu)에서 카탈로그 항목을 골라 저장한다. (2026-07-01)

CREATE TABLE IF NOT EXISTS public.sys_quick_menu (
  menu_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_href TEXT        NOT NULL,                       -- 카탈로그 href 키 (예: /admin/monitor)
  sort_ord  SMALLINT    NOT NULL DEFAULT 0,             -- 팝업 내 표시 순서
  use_yn    CHAR(1)     NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  del_yn    CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm   TIMESTAMPTZ,
  regr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.sys_quick_menu           IS '관리자 플로팅 팝업 메뉴 선별 설정 (AdminQuickMenu)';
COMMENT ON COLUMN public.sys_quick_menu.menu_href IS '카탈로그 href 키 (admin-nav-catalog.ts) — FK 없음(문자열 키)';

CREATE INDEX IF NOT EXISTS idx_sys_quick_menu_sort
  ON public.sys_quick_menu(sort_ord) WHERE del_yn = 'N';

-- 시드 — 현재 하드코딩 기본 14개 (없을 때만)
INSERT INTO public.sys_quick_menu (menu_href, sort_ord, regr_id, modr_id)
SELECT v.href, v.ord, 'ADMIN', 'ADMIN'
FROM (VALUES
  ('/admin/monitor', 10),
  ('/admin/stats', 20),
  ('/admin/users', 30),
  ('/admin/payments', 40),
  ('/admin/links', 50),
  ('/admin/board', 60),
  ('/admin/themes', 70),
  ('/admin/ui-themes', 80),
  ('/admin/feedback', 90),
  ('/admin/campaign', 100),
  ('/admin/token', 110),
  ('/admin/i18n', 120),
  ('/admin/fee-mode', 130),
  ('/admin/open-promo', 140)
) AS v(href, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.sys_quick_menu WHERE del_yn = 'N');
