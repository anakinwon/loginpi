'use client'

// 클라이언트 로그인 게이트 — 서버는 redirect 하지 않고(Pi Browser 무한 루프 방지) 여기서 로그인 유도·재시도.
// 로그인 통합(마스터 지시 2026-10-11, cafe.pi 방식):
//  · Pi Browser : SDK authenticate(유일한 신뢰 신호, UA 판정 금지) → 실패 시 Pi Sign-In(OAuth, Client ID 설정 시)
//  · 일반 브라우저 : Google(NextAuth) 로그인 → Pi 계정 연동 코드 입력 후 통과(Google 만으로 계정 생성 없음)
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { startPiOAuth, usePiAuth, type PiSessionUser } from '@pi/auth/client'
import { env } from '@/env'
import {
  GoogleLoginButton,
  googleLoginEnabled,
  LinkCodeForm,
  useAppUser,
} from './google-auth'

// SDK 인증은 일반 브라우저에서 빠르게 null 이지만 지연 대비 상한(cafe.pi 와 같은 값)
const SDK_TIMEOUT_MS = 3000

// Pi 로그인 핸들러 — 게이트·헤더가 같은 순서(SDK → OAuth)로 동작하게 한 곳에 둔다
export function usePiLogin() {
  const { signIn } = usePiAuth()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const clientId = env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID

  async function login() {
    setBusy(true)
    try {
      const sdkUser = await Promise.race([
        signIn(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), SDK_TIMEOUT_MS),
        ),
      ])
      if (sdkUser) return // Pi Browser 로그인 완료 — provider 가 화면 갱신
      if (clientId) startPiOAuth(clientId, pathname || '/')
    } finally {
      setBusy(false)
    }
  }
  return { login, busy, oauthReady: !!clientId }
}

export function LoginGate({
  children,
}: {
  children: (user: PiSessionUser) => React.ReactNode
}) {
  const t = useTranslations('auth')
  const { user, isLoading, googleUnlinked, piError } = useAppUser()
  const { login, busy, oauthReady } = usePiLogin()

  if (isLoading && !user)
    return <p className="text-muted-foreground text-sm">{t('checking')}</p>
  if (user) return <>{children(user)}</>
  // Google 로그인은 됐지만 Pi 계정 미연동 → 연동 코드 입력
  if (googleUnlinked)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{t('linkRequired')}</p>
        <LinkCodeForm />
      </div>
    )
  return (
    <div className="card flex flex-col items-start gap-2">
      <p className="text-sm">{t('required')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void login()}
        >
          {busy ? t('authenticating') : t('signIn')}
        </button>
        {googleLoginEnabled && (
          <>
            <span className="text-muted-foreground text-xs">{t('or')}</span>
            <GoogleLoginButton />
          </>
        )}
      </div>
      {/* Pi OAuth·Google 둘 다 없는 환경만 Pi Browser 안내 */}
      {!oauthReady && !googleLoginEnabled && (
        <p className="text-muted-foreground text-xs">{t('openInPiBrowser')}</p>
      )}
      {piError && <p className="text-destructive text-xs">{piError}</p>}
    </div>
  )
}
