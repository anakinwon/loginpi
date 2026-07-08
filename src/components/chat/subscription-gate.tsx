'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { InlinePurchasePrompt } from './inline-purchase-prompt'

// 유료 기능 접근 게이트.
// /api/subscriptions/check로 권한을 확인해, 허용되면 children을 렌더하고
// 그렇지 않으면 잠금 CTA + Bean 구독(/subscribe) 유도 모달을 노출한다.
// 인증 호출은 piFetch(X-Pi-Token)로 Pi Browser 쿠키 비의존 경로를 지원한다.
// (레거시 Pi 구독 결제는 폐기 — PRD_15_FEE §1-6. 결제는 /subscribe의 Bean SPEND로 일원화)

type Feature = 'tip' | 'premiumTheme' | 'eventRoom' | 'ai'

interface CheckResult {
  tier: 'FREE' | 'PREMIUM' | 'BUSINESS'
  canTip: boolean
  canUsePremiumTheme: boolean
  canCreateEventRoom: boolean
  aiQuota: { remaining: number }
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
  // 권한 확인 중 표시할 노드 (기본: 스켈레톤)
  loadingFallback?: React.ReactNode
}

export function SubscriptionGate({
  feature,
  children,
  loadingFallback,
}: SubscriptionGateProps) {
  const t = useTranslations('chat')
  const featureLabel: Record<Feature, string> = {
    tip: t('gate.sendBean'),
    premiumTheme: t('gate.premiumTheme'),
    eventRoom: t('gate.eventCafe'),
    ai: t('gate.aiBot'),
  }
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [promptOpen, setPromptOpen] = useState(false)

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
  }, [])

  if (loading) {
    return (
      loadingFallback ?? (
        <div
          className="bg-muted h-9 w-full animate-pulse rounded-xl"
          aria-label={t('gate.checking')}
        />
      )
    )
  }

  if (check && isAllowed(feature, check)) {
    return <>{children}</>
  }

  // 잠금 상태 — 클릭 시 Bean 구독 유도 모달
  return (
    <>
      <button
        type="button"
        onClick={() => setPromptOpen(true)}
        className="text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-xl border border-dashed px-4 py-2 text-sm transition-colors"
      >
        🔒 {t('gate.unlockLabel', { label: featureLabel[feature] })}
      </button>

      <InlinePurchasePrompt
        isOpen={promptOpen}
        featureName={`🔒 ${featureLabel[feature]}`}
        description={t('gate.unlockDesc')}
        onClose={() => setPromptOpen(false)}
      />
    </>
  )
}
