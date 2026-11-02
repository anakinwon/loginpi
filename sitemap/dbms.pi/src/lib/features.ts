// dbms.pi 기능 메뉴 단일 소스 — 하단 기능 메뉴(feature-nav)가 쓴다(PRD 12절 대분류 10종을 4묶음으로)
//  group key = messages nav.groups.<key>, item key = nav.<key>, href = 기능 페이지 경로
//  min = 그 기능을 쓸 최소 요금제(src/lib/plan-rules.ts PERM_MIN 과 같은 값 — 메뉴 '부터' 배지, 서버 검사는 requireLink)
//  묶음(2026-11-01 마스터) : 모니터링(모니터링·성능·SQL 튜닝 = 감지 → 진단 → 수정) / 정합(정합·이행) / 레이크(파이프라인·분석) / 관리(연결·운영 안전·학습·요금제)
export const FEATURE_GROUPS = [
  {
    key: 'monitor',
    items: [
      { key: 'monitor', href: '/monitor', min: 'FREE' },
      { key: 'perf', href: '/perf', min: 'FREE' },
      { key: 'sqlLab', href: '/sql-lab', min: 'FREE' },
    ],
  },
  {
    key: 'drift',
    items: [
      { key: 'drift', href: '/drift', min: 'D1' },
      { key: 'migration', href: '/migration', min: 'D3' },
    ],
  },
  {
    key: 'lake',
    items: [
      { key: 'pipeline', href: '/pipeline', min: 'D3' },
      { key: 'analytics', href: '/analytics', min: 'D3' },
    ],
  },
  {
    key: 'admin',
    items: [
      { key: 'connect', href: '/connect', min: 'FREE' },
      { key: 'ops', href: '/ops', min: 'D3' },
      { key: 'learn', href: '/learn', min: 'FREE' },
      { key: 'plan', href: '/plan', min: 'FREE' },
    ],
  },
] as const

// 현재 경로가 속한 기능(하위 경로 포함)
export const isActive = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`)
