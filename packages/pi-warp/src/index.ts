// @pi/warp 순수 규칙 — 출발 표시(sitemap.pi → 다른 사이트 URL 에 utm_source 붙이기)·도착 판정(표시 또는 referrer). 서버·클라이언트 공용, 훅 없음
//  표시는 마케팅 표준 파라미터라 등록된 외부 사이트도 무시한다(깨지지 않음). 도착 사이트는 판정 뒤 표시를 주소에서 지운다(새로고침 재생 방지)

export const WARP_PARAM = 'utm_source'
export const WARP_VALUE = 'sitemap.pi'
// sitemap.pi 배포 호스트 — referrer 로도 판정(표시가 없는 직접 링크 폴백). sitemap·sitemapst·sitemaps … .vercel.app, sitemap.pi
const SOURCE_HOST = /^(sitemap[a-z0-9-]*\.vercel\.app|sitemap\.pi)$/i

/** 떠나는 주소에 출발 표시 — 이미 utm_source 가 있으면 그대로(사이트의 기존 추적 보존), http(s) 아닌 주소·파싱 실패도 그대로 */
export function markWarp(url: string): string {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || u.searchParams.has(WARP_PARAM)) return url
    u.searchParams.set(WARP_PARAM, WARP_VALUE)
    return u.toString()
  } catch {
    return url
  }
}

/** 도착 판정 — 주소에 출발 표시가 있거나 referrer 가 sitemap.pi 호스트 */
export function isWarpArrival(href: string, referrer: string): boolean {
  try {
    if (new URL(href).searchParams.get(WARP_PARAM) === WARP_VALUE) return true
  } catch {
    /* 주소 파싱 실패 = 표시 없음 */
  }
  try {
    // 같은 호스트 referrer 는 무시 — sitemap.pi 자기 안의 이동(언어 변경·로그인 콜백)이 도착으로 오판되지 않게, 자기 자신 점프는 utm 표시로만 판정
    const r = new URL(referrer).hostname
    return SOURCE_HOST.test(r) && r !== new URL(href).hostname
  } catch {
    return false
  }
}

/** 출발 표시를 지운 주소(없으면 null = 바꿀 것 없음) — history.replaceState 용 */
export function stripWarp(href: string): string | null {
  try {
    const u = new URL(href)
    if (u.searchParams.get(WARP_PARAM) !== WARP_VALUE) return null
    u.searchParams.delete(WARP_PARAM)
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}
