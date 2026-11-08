'use client'

import { useTranslations } from 'next-intl'
import { usePiAuth } from './pi-auth-provider'
import { PiUserCard } from './pi-user-card'
import { AccountLinkCard } from './account-link-card'

export function AccountIntegrationSection() {
  const { user: piUser, isLoading: piLoading, isInPiBrowser } = usePiAuth()
  const t = useTranslations('userMisc')
  const tc = useTranslations('common')

  const showPiSection = isInPiBrowser || !!piUser

  if (piLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('accountIntegration')}</h2>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <div className="border-muted-foreground h-3 w-3 animate-spin rounded-full border border-t-transparent" />
          {tc('loading')}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('accountIntegration')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showPiSection && (
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium">
              Pi Network
            </p>
            <PiUserCard />
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            {t('accountLink')}
          </p>
          <AccountLinkCard />
        </div>
      </div>
    </section>
  )
}
