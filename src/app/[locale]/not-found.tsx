'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

// 로케일 내 404 — notFound() 호출·미매칭 경로. 레이아웃/i18n 살아있는 정상 UI.
export default function LocaleNotFound() {
  const t = useTranslations('errorPage')

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-muted-foreground text-5xl font-bold">404</p>
      <h1 className="text-xl font-bold">{t('nfTitle')}</h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        {t('nfDesc')}
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-1 rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        {t('home')}
      </Link>
    </div>
  )
}
