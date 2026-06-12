// localStorage 기반 stale-while-revalidate 캐시 (클라이언트 전용)
// Pi Browser는 HTTP 캐시·쿠키 동작이 공식 문서에 보장되지 않음 (pi-platform-docs 확인 2026-06-12)
// — 유일하게 검증된 저장소는 localStorage (pi_token 운영 실적) → 목록 데이터 캐싱에 동일 경로 사용
// 사용 패턴: 마운트 시 readCache로 즉시 표시 → 네트워크 응답 도착 시 교체 + writeCache

interface CacheEntry<T> {
  at: number // 저장 시각 (epoch ms)
  data: T
}

// maxAgeMs 이내의 캐시만 반환 — 만료·파싱 실패·스토리지 불가 시 null
export function readCache<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (!entry || typeof entry.at !== 'number') return null
    if (Date.now() - entry.at > maxAgeMs) return null
    return entry.data
  } catch {
    return null
  }
}

// 저장 실패(쿼터 초과·프라이빗 모드)는 무시 — 캐시는 항상 best-effort
export function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ at: Date.now(), data } satisfies CacheEntry<T>),
    )
  } catch {
    /* 캐시 실패는 기능에 영향 없음 */
  }
}
