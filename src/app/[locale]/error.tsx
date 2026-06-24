'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

// 로케일 세그먼트 내 런타임 오류 경계 — 레이아웃(헤더/프로바이더/i18n) 살아있는 정상 UI.
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errorPage')

  useEffect(() => {
    console.error('[locale error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-4xl">⚠️</p>
      <h1 className="text-xl font-bold">{t('errTitle')}</h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        {t('errDesc')}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          {t('retry')}
        </button>
        <Link href="/" className="hover:bg-muted rounded-lg border px-4 py-2 text-sm">
          {t('home')}
        </Link>
      </div>
    </div>
  )
}
