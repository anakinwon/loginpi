// dbms.pi 기능 대분류 10종(PRD 12절) 목록 — 상단 기능 메뉴(feature-nav)·홈 기능 카드가 같이 쓰는 단일 소스
//  key = messages nav.<key>·home.featDesc.<key>, href = 기능 페이지 경로
export const FEATURES = [
  { key: 'connect', href: '/connect' },
  { key: 'sqlLab', href: '/sql-lab' },
  { key: 'perf', href: '/perf' },
  { key: 'monitor', href: '/monitor' },
  { key: 'drift', href: '/drift' },
  { key: 'migration', href: '/migration' },
  { key: 'pipeline', href: '/pipeline' },
  { key: 'analytics', href: '/analytics' },
  { key: 'ops', href: '/ops' },
  { key: 'learn', href: '/learn' },
] as const
