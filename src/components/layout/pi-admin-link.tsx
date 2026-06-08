'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// Pi Browser 전용 관리자 링크
// form POST는 Pi Browser WebView에서 ERR_CONNECTION_ABORTED로 차단됨.
// pi-code → pi-callback(HTML) 흐름으로 쿠키를 안정적으로 설정한 뒤 이동.
export function PiAdminLink() {
  const { user, isInPiBrowser, piAccessToken } = usePiAuth()
  const t = useTranslations('header')
  const params = useParams()
  const locale = (params.locale as string) ?? 'ko'

  const handleClick = useCallback(async () => {
    if (!piAccessToken) return
    const to = `/${locale}/admin`
    try {
      const res = await fetch('/api/auth/pi-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: piAccessToken, to }),
      })
      if (!res.ok) return
      const { redirectUrl } = (await res.json()) as { redirectUrl: string }
      window.location.href = redirectUrl
    } catch {}
  }, [locale, piAccessToken])

  if (!isInPiBrowser) return null
  if (!user || !piAccessToken || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return null

  return (
    <button
      onClick={handleClick}
      className='text-muted-foreground hover:text-foreground text-sm transition-colors'
    >
      {t('admin')}
    </button>
  )
}
