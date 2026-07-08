'use client'

import { usePathname } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'
import { usePiBrowserUI } from '@/hooks/use-pi-browser-ui'
import { startPiOAuth } from '@/lib/pi-oauth'
import { env } from '@/env'

// Pi Sign-In(OAuth) 로그인 버튼 — **일반 브라우저 전용**.
// Pi Browser에서는 SDK authenticate 기반 PiLoginButton이 담당하므로 숨긴다.
// NEXT_PUBLIC_PI_OAUTH_CLIENT_ID 미설정 환경(redirect URI 미등록)에서는 미노출.
export function PiOAuthLoginButton() {
  const t = useTranslations('header')
  const locale = useLocale()
  const pathname = usePathname()
  const { user, isLoading } = usePiAuth()
  const inPiBrowser = usePiBrowserUI()
  const clientId = env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID

  // Pi Browser(SDK 경로 존재)·세션 보유·클라이언트 ID 부재 시 미노출
  if (inPiBrowser || user || !clientId) return null

  return (
    <Button
      onClick={() => startPiOAuth(clientId, pathname || `/${locale}`)}
      disabled={isLoading}
      size="sm"
      variant="outline"
      className="gap-1.5"
    >
      <span
        className="font-serif text-sm leading-none italic"
        aria-hidden="true"
      >
        π
      </span>
      {t('piLogin')}
    </Button>
  )
}
