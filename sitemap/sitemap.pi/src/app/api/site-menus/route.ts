// 사이트 메뉴 지도 — GET /api/site-menus?locale=xx : 자사 사이트별 상위→하위 메뉴(경로·권한) + 그 언어 라벨.
// 데이터 = src/data/site-menus.json(scripts/gen-site-menus.mjs 자동 생성, DB 없음). 공개·정적이라 CDN 1시간 캐시
import { NextResponse, type NextRequest } from 'next/server'
import raw from '@/data/site-menus.json'
import type { MenuNode, SiteMenus } from '@/lib/site-menu'

type RawNode = Omit<MenuNode, 'l' | 'c'> & { k?: string; c?: RawNode[] }
type RawSite = {
  base: string
  menus: RawNode[]
  t: Record<string, Record<string, string>>
}

export function GET(req: NextRequest) {
  const lang = (req.nextUrl.searchParams.get('locale') ?? 'ko').split('-')[0]
  const sites = (raw as unknown as { sites: Record<string, RawSite> }).sites
  const out: SiteMenus = {}
  for (const [domain, s] of Object.entries(sites)) {
    // 라벨 : 그 언어 → 영어 → 한국어. '@' 키(푸터·그 밖의 화면)는 화면이 자체 번역으로 표시
    const label = (k?: string) =>
      !k || k.startsWith('@')
        ? undefined
        : (s.t[k]?.[lang] ?? s.t[k]?.en ?? s.t[k]?.ko)
    const map = (ns: RawNode[]): MenuNode[] =>
      ns.map(({ k, c, ...n }) => ({
        ...n,
        g: k?.startsWith('@') ? (k.slice(1) as MenuNode['g']) : undefined,
        l: label(k),
        c: c && map(c),
      }))
    out[domain] = { base: s.base, menus: map(s.menus) }
  }
  return NextResponse.json(out, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
