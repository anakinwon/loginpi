// 관리자 전체 메뉴 카탈로그 — 사이드바 항목의 단일 목록(팝업 선별 후보).
// 클라이언트/서버 공용 상수. 라벨은 i18n 키(admin.nav 하위)로 보유하고, 표시 측이
// t()로 해석한다(사이드바와 동일 키 재사용 → 라벨 일관성 + 다국어 지원).
// AdminQuickMenu(팝업)·/admin/quick-menu 관리 화면 공용.

export type AdminNavCatalogItem = {
  href: string
  labelKey: string // admin.nav 하위 번역 키 (예: 'monitor' → t('monitor'))
  section: string // 'main' | 'std' | 'chat' | 'store' | 'event' | 'bean' | 'i18n' | 'ops'
}

// 섹션 표시 라벨 키 (admin.nav 하위)
export const ADMIN_NAV_SECTION_KEYS: Record<string, string> = {
  main: 'mainSection',
  std: 'stdSection',
  chat: 'chatSection',
  store: 'storeSection',
  event: 'eventSection',
  bean: 'beanSection',
  i18n: 'i18nSection',
  ops: 'opsSection',
}

export const ADMIN_NAV_CATALOG: AdminNavCatalogItem[] = [
  // ── 기본 ──
  { href: '/admin/monitor', labelKey: 'monitor', section: 'main' },
  { href: '/admin/analytics', labelKey: 'analytics', section: 'main' },
  { href: '/admin/stats', labelKey: 'stats', section: 'main' },
  { href: '/admin/users', labelKey: 'users', section: 'main' },
  { href: '/admin/consents', labelKey: 'consents', section: 'main' },
  { href: '/admin/reports', labelKey: 'reports', section: 'main' },
  { href: '/admin/payments', labelKey: 'payments', section: 'main' },
  { href: '/admin/links', labelKey: 'links', section: 'main' },
  { href: '/admin/board', labelKey: 'board', section: 'main' },
  { href: '/admin/batch', labelKey: 'batch', section: 'main' },
  { href: '/admin/logs', labelKey: 'logs', section: 'main' },
  { href: '/admin/checklist', labelKey: 'checklist', section: 'main' },
  { href: '/admin/mainnet', labelKey: 'mainnet', section: 'main' },
  // ── 데이터 표준 ──
  { href: '/admin/std/words', labelKey: 'stdWords', section: 'std' },
  { href: '/admin/std/domains', labelKey: 'stdDomains', section: 'std' },
  { href: '/admin/std/terms', labelKey: 'stdTerms', section: 'std' },
  { href: '/admin/std/ddl', labelKey: 'stdDdl', section: 'std' },
  { href: '/admin/std/audit', labelKey: 'stdAudit', section: 'std' },
  { href: '/admin/std/approvals', labelKey: 'stdApprovals', section: 'std' },
  // ── 카페/채팅 ──
  { href: '/admin/themes', labelKey: 'themes', section: 'chat' },
  { href: '/admin/ui-themes', labelKey: 'uiThemes', section: 'chat' },
  { href: '/admin/subscriptions', labelKey: 'subscriptions', section: 'chat' },
  { href: '/admin/stickers', labelKey: 'stickers', section: 'chat' },
  { href: '/admin/store/settle', labelKey: 'settle', section: 'chat' },
  { href: '/admin/feedback', labelKey: 'feedback', section: 'chat' },
  {
    href: '/admin/feedback/ctgr-items',
    labelKey: 'feedbackCtgrItems',
    section: 'chat',
  },
  // ── 매장 ──
  {
    href: '/admin/store/categories',
    labelKey: 'storeCategories',
    section: 'store',
  },
  {
    href: '/admin/store/distance-cfg',
    labelKey: 'storeDistCfg',
    section: 'store',
  },
  // ── 이벤트 ──
  { href: '/admin/event/gifts', labelKey: 'eventGifts', section: 'event' },
  { href: '/admin/event/exclude', labelKey: 'eventExclude', section: 'event' },
  // ── Bean ──
  { href: '/admin/token', labelKey: 'beanToken', section: 'bean' },
  { href: '/admin/token/transactions', labelKey: 'beanTxn', section: 'bean' },
  { href: '/admin/token/wallets', labelKey: 'beanWallets', section: 'bean' },
  { href: '/admin/token/top-users', labelKey: 'beanTopUsers', section: 'bean' },
  { href: '/admin/token/audit', labelKey: 'beanAudit', section: 'bean' },
  {
    href: '/admin/token/subscr-pricing',
    labelKey: 'subscrPricing',
    section: 'bean',
  },
  { href: '/admin/token/fee-plan', labelKey: 'beanFeePlan', section: 'bean' },
  {
    href: '/admin/token/tip-presets',
    labelKey: 'beanTipPresets',
    section: 'bean',
  },
  { href: '/admin/campaign', labelKey: 'campaign', section: 'bean' },
  // ── 다국어 ──
  { href: '/admin/i18n', labelKey: 'i18n', section: 'i18n' },
  // ── 운영 ──
  { href: '/admin/deploy', labelKey: 'deploy', section: 'ops' },
  { href: '/admin/db-switch', labelKey: 'dbSwitch', section: 'ops' },
  { href: '/admin/fee-mode', labelKey: 'feeMode', section: 'ops' },
  { href: '/admin/open-promo', labelKey: 'openPromo', section: 'ops' },
  { href: '/admin/quick-menu', labelKey: 'quickMenu', section: 'ops' },
]

// href → 카탈로그 항목 매핑 (팝업 렌더 시 라벨 해석용)
export const ADMIN_NAV_BY_HREF = new Map(
  ADMIN_NAV_CATALOG.map((it) => [it.href, it]),
)

// DB 미설정 시 팝업 기본 노출 항목 (현재 하드코딩 14개)
export const DEFAULT_QUICK_MENU_HREFS = [
  '/admin/monitor',
  '/admin/stats',
  '/admin/users',
  '/admin/payments',
  '/admin/links',
  '/admin/board',
  '/admin/themes',
  '/admin/ui-themes',
  '/admin/feedback',
  '/admin/campaign',
  '/admin/token',
  '/admin/i18n',
  '/admin/fee-mode',
  '/admin/open-promo',
]
