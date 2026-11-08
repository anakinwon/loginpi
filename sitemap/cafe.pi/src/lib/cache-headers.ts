// 응답 캐시 헤더 빌더 — Vercel/CDN edge 캐싱.
//
// ⚠️ 보안 핵심: 공유 캐시(s-maxage / CDN-Cache-Control)는 응답이 **모든 뷰어에게 동일**할 때만
//    안전하다. 뷰어별로 다른 응답(관리자=원본 / 게스트=마스킹)을 공유 캐시에 담으면, 먼저
//    캐시된 관리자 PII가 이후 익명 게스트에게 그대로 서빙된다(공유 캐시 PII 유출).
//    → 캐시 적용 전 반드시 자문: "이 응답이 모든 뷰어에게 동일한가?"
//      YES → publicCacheHeaders / NO → viewerScopedCacheHeaders

// 뷰어 불변 응답: 모든 visitor가 공유하는 edge 캐시 (최고 효율).
//   사용처: 개인 식별 정보 없는 집계(DAU/WAU/MAU·지역분포·퍼널·코호트·페이지뷰 등).
export function publicCacheHeaders(maxAgeSec = 3600): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${maxAgeSec}, max-age=0, stale-while-revalidate=${maxAgeSec}`,
    'CDN-Cache-Control': `public, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec}`,
  }
}

// 뷰어 의존 응답(관리자=원본 / 게스트=마스킹):
//   - 관리자: private, no-store — 공유 캐시에 PII 저장 절대 금지(원본·실명·결제정보 보호).
//   - 게스트(마스킹): edge 캐시 + Vary로 인증 요청과 캐시 버킷 분리.
//     ※ Vary는 **실제 요청에 실리는 헤더**여야 한다. 관리자 판정은 pi_session 쿠키 /
//       X-Pi-Token 헤더(Pi Browser) / Google 세션 쿠키로 하므로 'Cookie, X-Pi-Token'.
//       (X-Admin-User 같은 가상 헤더는 요청에 없어 Vary가 무력화 → 관리자가 게스트 캐시를
//        받는 버그가 됨)
export function viewerScopedCacheHeaders(
  admin: boolean,
  maxAgeSec = 3600,
): Record<string, string> {
  if (admin) return { 'Cache-Control': 'private, no-store' }
  return { ...publicCacheHeaders(maxAgeSec), Vary: 'Cookie, X-Pi-Token' }
}
