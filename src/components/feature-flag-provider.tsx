'use client'

import { createContext, useContext, type ReactNode } from 'react'

// 서버(layout)가 런타임 tier로 판정한 기능 노출값을 client 트리에 공급한다.
// client 컴포넌트는 런타임 env(APP_TIER)를 직접 못 읽으므로, "같은 빌드, 배포 환경별 다른 표시"를
// client에서도 달성하기 위한 통로다. 값은 server에서 계산해 직렬화 가능한 boolean으로 내려온다.

export interface FeatureFlags {
  /** Pi 시세칩·통화콤보 환율 숫자 노출 여부 — 운영 숨김, staging/dev 노출 */
  showPiValuation: boolean
}

const FeatureFlagContext = createContext<FeatureFlags>({
  showPiValuation: false,
})

export function FeatureFlagProvider({
  flags,
  children,
}: {
  flags: FeatureFlags
  children: ReactNode
}) {
  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  )
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagContext)
}
