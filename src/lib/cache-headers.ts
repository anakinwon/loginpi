/**
 * 응답 캐싱 헤더 헬퍼
 * 마스터 지시(2026-06-25): 뷰어별 응답 분기 구조를 반영하여 안전한 캐싱 제공
 *
 * ⚠️ 주의: 뷰어마다 다른 응답(마스킹/admin 분기)은 publicCacheHeaders() 금지
 * → viewerScopedCacheHeaders(admin)를 사용해 admin=private, guest=마스킹분만 캐시
 */

/**
 * 공개 응답 캐싱 — 모든 visitor에게 동일한 응답
 *
 * 사용처:
 * - 개인 식별 정보 없는 집계(DAU/WAU/MAU·지역분포·활동유형 분포 등)
 * - 공개 통계(총주문건수·평균 주문간격 등)
 * - 개인별 분기 없는 응답
 *
 * @param maxAgeSec Vercel edge caching 초 단위 (기본 3600=60분)
 * @returns Cache-Control + CDN-Cache-Control 헤더 객체
 */
export function publicCacheHeaders(maxAgeSec: number = 3600) {
  return {
    'Cache-Control': `s-maxage=${maxAgeSec}, max-age=0, stale-while-revalidate=${maxAgeSec}`,
    'CDN-Cache-Control': `max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec}`,
  }
}

/**
 * 뷰어 의존 캐싱 — 관리자/게스트별로 다른 응답
 *
 * 원리:
 * - admin=true: private(관리자만 캐시, 다른 유저와 공유 금지)
 * - admin=false: 뷰어 무관 부분만 public 캐시 + Vary 헤더로 분리
 *
 * 사용처:
 * - RFM 세그먼트(관리자: 실명·usr_id | 게스트: 마스킹)
 * - Top 고객(관리자: 전체 | 게스트: 비식별 지표만)
 * - 개인 정보 포함 분석
 *
 * @param admin 관리자 여부
 * @param maxAgeSec admin=false 시 게스트 캐시 초 (기본 600=10분, admin은 private)
 * @returns Cache-Control + Vary 헤더 객체
 */
export function viewerScopedCacheHeaders(
  admin: boolean,
  maxAgeSec: number = 600,
): Record<string, string> {
  if (admin) {
    // 관리자: 비공유 캐시 (private) — 다른 사용자와 응답 공유 금지
    return {
      'Cache-Control': 'private, max-age=600',
      'Vary': 'X-Admin-User',
    }
  }

  // 게스트: 마스킹된 응답만 캐시 (10분 짧은 캐시)
  return {
    'Cache-Control': `s-maxage=${maxAgeSec}, max-age=0, stale-while-revalidate=${maxAgeSec}`,
    'CDN-Cache-Control': `max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec}`,
    'Vary': 'X-Admin-User', // 뷰어에 따라 응답 다름 명시
  }
}
