'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePiAuth } from '@/components/pi-auth-provider'

export function BoardChatLinks() {
  const t = useTranslations('header')
  const { isInPiBrowser } = usePiAuth()

  if (isInPiBrowser) return null

  return (
    <>
      <Link
        href='/board'
        className='text-muted-foreground hover:text-foreground text-sm transition-colors'
      >
        {t('board')}
      </Link>
      <Link
        href='/chat'
        className='text-muted-foreground hover:text-foreground text-sm transition-colors'
      >
        채팅
      </Link>
    </>
  )
}
