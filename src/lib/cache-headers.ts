// 응답 캐시 헤더 빌더 — Vercel/CDN edge 캐싱.
//
// ⚠️ 보안 핵심: 공유 캐시(s-maxage / CDN-Cache-Control)는 응답이 **모든 뷰어에게 동일**할 때만
//    안전하다. 뷰어별로 다른 응답(관리자=원본 / 게스트=마스킹)을 공유 캐시에 담으면, 먼저
//    캐시된 관리자 PII가 이후 익명 게스트에게 그대로 서빙된다(공유 캐시 PII 유출).
//    → 캐시 적용 전 반드시 자문: "이 응답이 모든 뷰어에게 동일한가?"
//      YES → publicCacheHeaders / NO → viewerScopedCacheHeaders

// 뷰어 불변 응답: 모든 visitor가 공유하는 edge 캐시 (최고 효율).
export function publicCacheHeaders(maxAgeSec = 3600): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${maxAgeSec}, max-age=0, stale-while-revalidate=${maxAgeSec}`,
    'CDN-Cache-Control': `public, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec}`,
  }
}

// 뷰어 의존 응답(관리자=원본 / 게스트=마스킹):
//   - 관리자: private/no-store — 공유 캐시에 PII 저장 절대 금지
//   - 게스트(마스킹): edge 캐시 + Vary로 토큰·쿠키 보유(관리자/로그인) 요청과 캐시 버킷 분리
export function viewerScopedCacheHeaders(
  admin: boolean,
  maxAgeSec = 3600,
): Record<string, string> {
  if (admin) return { 'Cache-Control': 'private, no-store' }
  return { ...publicCacheHeaders(maxAgeSec), Vary: 'Cookie, X-Pi-Token' }
}
