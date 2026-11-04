// 사이트 메뉴 지도 타입 — /api/site-menus 응답(표 탭 계층 트리). 원본 = src/data/site-menus.json(자동 생성)

// 권한 표시 : public 공개 / login 로그인 / admin 관리자 / plan 요금제(n = 필요 권한·요금제 코드) / owner 소유자
export type MenuAuth = 'public' | 'login' | 'admin' | 'plan' | 'owner'

export type MenuNode = {
  l?: string // 라벨(요청 언어, 없으면 영어·한국어 폴백)
  g?: 'footer' | 'etc' // 원 사이트에 라벨이 없는 묶음 — sitemap.pi 번역(siteMenu.*)으로 표시
  p?: string // 메뉴 경로(locale 접두사 없음, 동적 세그먼트 [x] 포함 가능)
  h?: string // 실제 링크 경로 — 동적 경로([x])일 때 가장 가까운 정적 상위 화면
  a: MenuAuth
  n?: string
  c?: MenuNode[]
}

export type SiteMenus = Record<string, { base: string; menus: MenuNode[] }>
