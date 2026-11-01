// dbms.pi 기능 대분류 10종(PRD 12절) 목록 — 상단 기능 메뉴(feature-nav)·홈 기능 카드가 같이 쓰는 단일 소스
//  key = messages nav.<key>·home.featDesc.<key>, href = 기능 페이지 경로
//  순서 = 작업 흐름 : 연결(전제) → 모니터링(이상 감지) → 성능(원인 진단) → SQL 튜닝(수정) → 그 밖(2026-11-01 마스터)
export const FEATURES = [
  { key: 'connect', href: '/connect' },
  { key: 'monitor', href: '/monitor' },
  { key: 'perf', href: '/perf' },
  { key: 'sqlLab', href: '/sql-lab' },
  { key: 'drift', href: '/drift' },
  { key: 'migration', href: '/migration' },
  { key: 'pipeline', href: '/pipeline' },
  { key: 'analytics', href: '/analytics' },
  { key: 'ops', href: '/ops' },
  { key: 'learn', href: '/learn' },
] as const
