'use client'

import { usePiAuth } from './pi-auth-provider'
import { PiUserCard } from './pi-user-card'
import { GoogleUserCard } from './google-user-card'
import { AccountLinkCard } from './account-link-card'

export function AccountIntegrationSection() {
  const { user: piUser, isLoading: piLoading, isInPiBrowser } = usePiAuth()

  const showPiSection = isInPiBrowser || !!piUser

  if (piLoading) {
    return (
      <section className='space-y-3'>
        <h2 className='text-lg font-semibold'>계정 통합</h2>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <div className='h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent' />
          로딩 중…
        </div>
      </section>
    )
  }

  return (
    <section className='space-y-3'>
      <h2 className='text-lg font-semibold'>계정 통합</h2>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {showPiSection && (
          <div>
            <p className='mb-2 text-xs font-medium text-muted-foreground'>Pi Network</p>
            <PiUserCard />
          </div>
        )}
        {!isInPiBrowser && (
          <div>
            <p className='mb-2 text-xs font-medium text-muted-foreground'>Google</p>
            <GoogleUserCard />
          </div>
        )}
        <div>
          <p className='mb-2 text-xs font-medium text-muted-foreground'>계정 연동</p>
          <AccountLinkCard />
        </div>
      </div>
    </section>
  )
}
