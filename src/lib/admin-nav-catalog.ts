// 관리자 전체 메뉴 카탈로그 — 사이드바 항목의 단일 목록(팝업 선별 후보).
// 클라이언트/서버 공용 상수. 라벨은 한국어를 직접 보유한다(next-intl 컨텍스트 비의존
// → SSR/CSR 어디서든 안전). AdminQuickMenu(팝업)·/admin/quick-menu 관리 화면 공용.

export type AdminNavCatalogItem = {
  href: string
  label: string
  section: string // 'main' | 'std' | 'chat' | 'store' | 'event' | 'bean' | 'i18n' | 'ops'
}

// 섹션 표시 라벨
export const ADMIN_NAV_SECTIONS: Record<string, string> = {
  main: '기본',
  std: '데이터 표준',
  chat: '카페/채팅',
  store: '매장',
  event: '이벤트',
  bean: 'Bean',
  i18n: '다국어',
  ops: '운영',
}

export const ADMIN_NAV_CATALOG: AdminNavCatalogItem[] = [
  // ── 기본 ──
  { href: '/admin/monitor', label: '모니터링', section: 'main' },
  { href: '/admin/analytics', label: '분석', section: 'main' },
  { href: '/admin/stats', label: '통계', section: 'main' },
  { href: '/admin/users', label: '사용자', section: 'main' },
  { href: '/admin/consents', label: '동의 관리', section: 'main' },
  { href: '/admin/reports', label: '신고 관리', section: 'main' },
  { href: '/admin/payments', label: '결제', section: 'main' },
  { href: '/admin/links', label: '계정 연동', section: 'main' },
  { href: '/admin/board', label: '게시판', section: 'main' },
  { href: '/admin/batch', label: '배치', section: 'main' },
  { href: '/admin/logs', label: '로그', section: 'main' },
  { href: '/admin/checklist', label: '체크리스트', section: 'main' },
  { href: '/admin/mainnet', label: '메인넷', section: 'main' },
  // ── 데이터 표준 ──
  { href: '/admin/std/words', label: '표준 단어', section: 'std' },
  { href: '/admin/std/domains', label: '표준 도메인', section: 'std' },
  { href: '/admin/std/terms', label: '표준 용어', section: 'std' },
  { href: '/admin/std/ddl', label: '표준 DDL', section: 'std' },
  { href: '/admin/std/audit', label: '표준 감사', section: 'std' },
  { href: '/admin/std/approvals', label: '표준 승인', section: 'std' },
  // ── 카페/채팅 ──
  { href: '/admin/themes', label: '카페 테마', section: 'chat' },
  { href: '/admin/ui-themes', label: 'UI 테마', section: 'chat' },
  { href: '/admin/subscriptions', label: '구독', section: 'chat' },
  { href: '/admin/stickers', label: '스티커', section: 'chat' },
  { href: '/admin/store/settle', label: '정산', section: 'chat' },
  { href: '/admin/feedback', label: '후기', section: 'chat' },
  { href: '/admin/feedback/ctgr-items', label: '후기 평가항목', section: 'chat' },
  // ── 매장 ──
  { href: '/admin/store/categories', label: '상품 카테고리', section: 'store' },
  { href: '/admin/store/distance-cfg', label: '거리 설정', section: 'store' },
  // ── 이벤트 ──
  { href: '/admin/event/gifts', label: '이벤트 선물', section: 'event' },
  { href: '/admin/event/exclude', label: '이벤트 제외', section: 'event' },
  // ── Bean ──
  { href: '/admin/token', label: 'Bean 토큰', section: 'bean' },
  { href: '/admin/token/transactions', label: 'Bean 거래', section: 'bean' },
  { href: '/admin/token/wallets', label: 'Bean 지갑', section: 'bean' },
  { href: '/admin/token/top-users', label: 'Bean 상위', section: 'bean' },
  { href: '/admin/token/audit', label: 'Bean 감사', section: 'bean' },
  { href: '/admin/token/subscr-pricing', label: '구독 가격', section: 'bean' },
  { href: '/admin/token/fee-plan', label: '요금표', section: 'bean' },
  { href: '/admin/token/tip-presets', label: '팁 프리셋', section: 'bean' },
  { href: '/admin/campaign', label: '캠페인', section: 'bean' },
  // ── 다국어 ──
  { href: '/admin/i18n', label: '다국어', section: 'i18n' },
  // ── 운영 ──
  { href: '/admin/deploy', label: '배포', section: 'ops' },
  { href: '/admin/db-switch', label: 'DB 전환', section: 'ops' },
  { href: '/admin/fee-mode', label: '요금제 모드', section: 'ops' },
  { href: '/admin/open-promo', label: '오픈 프로모', section: 'ops' },
  { href: '/admin/quick-menu', label: '팝업 메뉴 설정', section: 'ops' },
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
