// dbms.pi 기능 메뉴 단일 소스 — 상단 기능 메뉴(feature-nav)·홈 기능 카드가 같이 쓴다(PRD 12절 대분류 10종을 4묶음으로)
//  group key = messages nav.groups.<key>, item key = nav.<key>·home.featDesc.<key>, href = 기능 페이지 경로
//  묶음(2026-11-01 마스터) : 모니터링(모니터링·성능·SQL 튜닝 = 감지 → 진단 → 수정) / 정합(정합·이행) / 레이크(파이프라인·분석) / 관리(연결·운영 안전·학습)
export const FEATURE_GROUPS = [
  {
    key: 'monitor',
    items: [
      { key: 'monitor', href: '/monitor' },
      { key: 'perf', href: '/perf' },
      { key: 'sqlLab', href: '/sql-lab' },
    ],
  },
  {
    key: 'drift',
    items: [
      { key: 'drift', href: '/drift' },
      { key: 'migration', href: '/migration' },
    ],
  },
  {
    key: 'lake',
    items: [
      { key: 'pipeline', href: '/pipeline' },
      { key: 'analytics', href: '/analytics' },
    ],
  },
  {
    key: 'admin',
    items: [
      { key: 'connect', href: '/connect' },
      { key: 'ops', href: '/ops' },
      { key: 'learn', href: '/learn' },
    ],
  },
] as const

// 현재 경로가 속한 기능(하위 경로 포함)
export const isActive = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`)
