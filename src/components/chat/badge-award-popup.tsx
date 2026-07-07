'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useThemeName } from './use-theme-name'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { BADGE_UPGRADE_BEAN } from '@/lib/bean-fee'
import { useMicroFeeLabel } from '@/components/feature-flag-provider'

// TASK-062 Trigger 7: 활동 배지 강화 팝업
// 배지 자동 수여 시 축하 + "배지 강화 10 Bean" 단건 구매 유도
// PRD_15_FEE §1-6 #7: Pi 직접결제(FEATURE_ADDON) → Bean SPEND 전환

export interface BadgeAwardInfo {
  badge_id: string
  theme_cd: string
  theme_nm: string
  theme_emoji: string
}

interface BadgeAwardPopupProps {
  badge: BadgeAwardInfo | null
  onUpgraded: () => void
  onClose: () => void
}

export function BadgeAwardPopup({
  badge,
  onUpgraded,
  onClose,
}: BadgeAwardPopupProps) {
  const [paying, setPaying] = useState(false)
  const router = useRouter()
  const t = useTranslations('chat.badgePopup')
  const tn = useThemeName()
  // PI 모드(메인넷 등재 기간)면 배지 강화 무료 — 서버 microFeeBean과 일관된 표시
  const feeLabel = useMicroFeeLabel(BADGE_UPGRADE_BEAN)

  if (!badge) return null

  async function upgrade() {
    if (!badge) return
    setPaying(true)
    try {
      const res = await piFetch('/api/badges/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badge_id: badge.badge_id,
          theme_cd: badge.theme_cd,
        }),
      })

      if (res.ok) {
        toast.success(
          t('upgraded', { emoji: badge.theme_emoji, theme: tn(badge.theme_cd, badge.theme_nm) }),
        )
        onUpgraded()
        return
      }

      const data = await res.json().catch(() => ({}))
      if (res.status === 402 && data.requiresBean) {
        toast.error(t('beanShort'))
        onClose()
        router.push('/bean')
        return
      }
      if (res.status === 409) {
        toast.info(t('alreadyUpgraded'))
        onClose()
        return
      }
      toast.error(data.error ?? t('upgradeFail'))
    } catch {
      toast.error(t('networkError'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-2xl p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-5xl">{badge.theme_emoji}</div>
        <div className="mb-2 text-2xl">🏅</div>
        <h3 className="text-base font-semibold">{t('acquiredTitle', { theme: tn(badge.theme_cd, badge.theme_nm) })}</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('acquiredDesc', { theme: tn(badge.theme_cd, badge.theme_nm) })}
        </p>

        <div className="mt-4 rounded-xl bg-gradient-to-r from-amber-100 to-yellow-100 p-3 text-xs text-amber-800 dark:from-amber-900/40 dark:to-yellow-900/40 dark:text-amber-200">
          {t('upgradeBenefit')}
        </div>

        <div className="mt-4 space-y-2.5">
          <button
            onClick={upgrade}
            disabled={paying}
            className="bg-primary text-primary-foreground w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {paying ? t('processing') : t('upgradeBtn', { fee: feeLabel })}
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground w-full pt-1 text-sm"
          >
            {t('later')}
          </button>
        </div>
      </div>
    </div>
  )
}
