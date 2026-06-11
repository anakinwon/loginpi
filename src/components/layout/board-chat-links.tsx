'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export function BoardChatLinks() {
  const t = useTranslations('header')

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
        카페
      </Link>
      <Link
        href='/store'
        className='text-muted-foreground hover:text-foreground text-sm transition-colors'
      >
        {t('shop')}
      </Link>
    </>
  )
}
