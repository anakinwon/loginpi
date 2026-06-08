'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { useSubscribePlan } from '@/hooks/use-subscribe-plan'
import { InlinePurchasePrompt } from './inline-purchase-prompt'

// 유료 기능 접근 게이트.
// /api/subscriptions/check로 권한을 확인해, 허용되면 children을 렌더하고
// 그렇지 않으면 잠금 CTA + 구독 결제(InlinePurchasePrompt)를 노출한다.
// 인증 호출은 piFetch(X-Pi-Token)로 Pi Browser 쿠키 비의존 경로를 지원한다.

type Feature = 'tip' | 'premiumTheme' | 'eventRoom' | 'ai'

interface CheckResult {
  tier: 'FREE' | 'PREMIUM' | 'BUSINESS'
  canTip: boolean
  canUsePremiumTheme: boolean
  canCreateEventRoom: boolean
  aiQuota: { remaining: number }
}

const FEATURE_LABEL: Record<Feature, string> = {
  tip: 'Pi Tip 보내기',
  premiumTheme: 'PREMIUM 테마',
  eventRoom: '이벤트 채팅방',
  ai: 'AI 봇',
}

function isAllowed(feature: Feature, c: CheckResult): boolean {
  switch (feature) {
    case 'tip':
      return c.canTip
    case 'premiumTheme':
      return c.canUsePremiumTheme
    case 'eventRoom':
      return c.canCreateEventRoom
    case 'ai':
      return c.aiQuota.remaining !== 0 // -1(무제한) 또는 양수면 허용
  }
}

interface SubscriptionGateProps {
  feature: Feature
  children: React.ReactNode
  // 잠금 시 유도할 유료 플랜 (기본: 월간 프리미엄 1π)
  planCd?: string
  planPi?: number
  // 권한 확인 중 표시할 노드 (기본: 스켈레톤)
  loadingFallback?: React.ReactNode
}

export function SubscriptionGate({
  feature,
  children,
  planCd = 'PREMIUM_MONTHLY',
  planPi = 1,
  loadingFallback,
}: SubscriptionGateProps) {
  const { isInPiBrowser } = usePiAuth()
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [promptOpen, setPromptOpen] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)
  const reloadCheck = useCallback(() => setReloadKey((k) => k + 1), [])

  // effect 본문의 동기 setState를 피하기 위해 fetch만 시작하고 상태는 비동기 콜백에서 갱신.
  // cancelled 가드로 언마운트 후 setState를 방지한다.
  useEffect(() => {
    let cancelled = false
    piFetch('/api/subscriptions/check')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CheckResult | null) => {
        if (!cancelled) {
          setCheck(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCheck(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const { subscribe, paying } = useSubscribePlan({
    planCd,
    onSuccess: useCallback(() => {
      setPromptOpen(false)
      reloadCheck()
    }, [reloadCheck]),
  })

  if (loading) {
    return (
      loadingFallback ?? (
        <div
          className='h-9 w-full animate-pulse rounded-xl bg-muted'
          aria-label='권한 확인 중'
        />
      )
    )
  }

  if (check && isAllowed(feature, check)) {
    return <>{children}</>
  }

  // 잠금 상태 — 클릭 시 구독 결제 프롬프트
  return (
    <>
      <button
        type='button'
        onClick={() => setPromptOpen(true)}
        className='inline-flex items-center gap-1.5 rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted'
      >
        🔒 {FEATURE_LABEL[feature]} 잠금 해제
      </button>

      <InlinePurchasePrompt
        isOpen={promptOpen}
        featureName={`🔒 ${FEATURE_LABEL[feature]}`}
        description={
          isInPiBrowser
            ? `PREMIUM 월 구독(${planPi}π)으로 모든 유료 기능을 이용하세요`
            : 'Pi Browser에서 구독 결제를 진행할 수 있습니다'
        }
        piAmount={planPi}
        onSinglePurchase={subscribe}
        onClose={() => {
          if (!paying) setPromptOpen(false)
        }}
      />
    </>
  )
}
