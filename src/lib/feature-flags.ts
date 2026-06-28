// Pi 가치평가(시세·환율) 노출 여부 — 런타임 tier 기반 단일 판정.
//
// "같은 빌드가 배포 환경에 따라 다르게 보인다":
//   server가 resolveDbTier()로 런타임 판정한 결과를, client에는 FeatureFlagProvider Context로
//   주입한다. 빌드타임에 값이 박히는 NEXT_PUBLIC 토글에 의존하지 않으므로 staging·운영이
//   동일한 번들을 쓰면서도 표시가 달라진다.
//
// 이 파일은 client-safe(순수 함수)다 — db-env(server-only)를 import하지 않는다.

type Tier = 'dev' | 'staging' | 'prod'

/**
 * 헤더 Pi 시세칩 · 통화콤보 환율 숫자(법정화폐 가치평가) 노출 여부.
 * Pi 등재 레드라인 A-5(가치평가 노출 최소화) 대응 — 운영은 숨기고 staging·dev만 노출.
 *
 * @param tier 런타임 환경(resolveDbTier 결과). 운영=prod / 스테이징=staging / 개발=dev.
 * @param override 'true'/'false'면 tier를 무시한 강제 토글(긴급용). 평상시 미설정.
 * @returns true=노출 / false=숨김. 안전 기본: 운영·미상은 숨김, 'staging'·'dev'만 노출.
 */
export function computeShowPiValuation(tier: Tier, override?: string): boolean {
  if (override === 'true') return true
  if (override === 'false') return false
  return tier === 'staging' || tier === 'dev'
}
