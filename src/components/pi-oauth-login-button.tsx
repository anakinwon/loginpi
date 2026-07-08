'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'
import { usePiBrowserUI } from '@/hooks/use-pi-browser-ui'
import { startPiOAuth } from '@/lib/pi-oauth'
import { env } from '@/env'

// Pi Sign-In(OAuth) 로그인 버튼 — **일반 브라우저 전용**.
// Pi Browser에서는 SDK authenticate 기반 PiLoginButton이 담당하므로 UA로 숨긴다.
// ⚠️ 실기기 Pi Browser UA가 패턴과 달라 감지가 실패할 수 있으므로(8bf8752 사고 계열),
//    클릭 시점에 SDK 인증을 먼저 시도(유일 신뢰 신호 = authenticate 성공)하고
//    실패한 경우에만 OAuth로 진행한다 — Pi Browser에서 눌러도 SDK 로그인으로 자기교정.
//    (Pi의 OAuth 인가 페이지는 Pi Browser 내 접속을 미지원 — 안내만 뜨고 막힘)
// NEXT_PUBLIC_PI_OAUTH_CLIENT_ID 미설정 환경(redirect URI 미등록)에서는 미노출.
export function PiOAuthLoginButton() {
  const t = useTranslations('header')
  const locale = useLocale()
  const pathname = usePathname()
  const { user, isLoading, signIn } = usePiAuth()
  const inPiBrowser = usePiBrowserUI()
  const [busy, setBusy] = useState(false)
  const clientId = env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID

  // Pi Browser(SDK 경로 존재)·세션 보유·클라이언트 ID 부재 시 미노출
  if (inPiBrowser || user || !clientId) return null

  async function handleClick() {
    if (!clientId) return
    setBusy(true)
    try {
      // 1차: SDK 인증 시도 (Pi Browser면 여기서 로그인 완료 — OAuth 불필요)
      //   일반 브라우저는 빠르게 실패(null)하지만, 혹시 모를 지연 대비 3초 상한.
      const sdkUser = await Promise.race([
        signIn(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ])
      if (sdkUser) return // Pi Browser 로그인 성공 — provider가 화면 갱신
      // 2차: 일반 브라우저 → Pi Sign-In(OAuth) 인가 페이지로 이동
      startPiOAuth(clientId, pathname || `/${locale}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading || busy}
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
