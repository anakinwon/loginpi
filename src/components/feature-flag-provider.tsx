'use client'

import { createContext, useContext, type ReactNode } from 'react'

// 서버(layout)가 런타임 tier로 판정한 기능 노출값을 client 트리에 공급한다.
// client 컴포넌트는 런타임 env(APP_TIER)를 직접 못 읽으므로, "같은 빌드, 배포 환경별 다른 표시"를
// client에서도 달성하기 위한 통로다. 값은 server에서 계산해 직렬화 가능한 boolean으로 내려온다.

export interface FeatureFlags {
  /** Pi 시세칩·통화콤보 환율 숫자 노출 여부 — 운영 숨김, staging/dev 노출 */
  showPiValuation: boolean
  /** 활성 요금제 모드(BEAN|PI) — PI 모드면 마이크로 요금은 "무료"로 표시 (PRD_24 §0) */
  feeMode: 'BEAN' | 'PI'
  /** 운영(메인넷) 환경 여부 — 홈 백서·매뉴얼 기본 펼침, 대시보드·Event 숨김(computeIsProd) */
  isProd: boolean
}

const FeatureFlagContext = createContext<FeatureFlags>({
  showPiValuation: false,
  feeMode: 'BEAN',
  isProd: false,
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

/** 활성 요금제 모드 — PI면 마이크로 요금 무료. 표시용 단축 hook. */
export function useFeeMode(): 'BEAN' | 'PI' {
  return useContext(FeatureFlagContext).feeMode
}

/** 마이크로 요금 라벨 — PI 모드면 '무료', 아니면 'N Bean'. (표시 전용, 실제 차감은 서버 microFeeBean) */
export function useMicroFeeLabel(beanAmt: number): string {
  return useContext(FeatureFlagContext).feeMode === 'PI'
    ? '무료'
    : `${beanAmt} Bean`
}
