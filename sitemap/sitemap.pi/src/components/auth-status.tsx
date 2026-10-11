'use client'

// 헤더 로그인 상태 — 통합 사용자(Pi 세션 OR Google 연동 세션) 표시. 미로그인은 Pi 로그인(SDK→OAuth) + Google 버튼,
// Google 로그인됐으나 미연동이면 계정 연동(/link) 안내. UA 판정 없음(cafe.pi 규칙)
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import {
  GoogleLoginButton,
  GoogleSignOutButton,
  googleLoginEnabled,
  useAppUser,
} from './google-auth'
import { usePiLogin } from './login-gate'

export function AuthStatus() {
  const t = useTranslations('auth')
  const { user, source, isLoading, googleUnlinked, piError } = useAppUser()
  const { login, busy } = usePiLogin()

  if (isLoading && !user) return <p className="text-sm">{t('checking')}</p>
  if (user)
    return (
      <span className="flex items-center gap-2 text-sm">
        <Link href="/link" className="hover:underline">
          {t('signedIn', { name: user.username ?? user.displayName })}
        </Link>
        {source === 'google' && <GoogleSignOutButton />}
      </span>
    )
  if (googleUnlinked)
    return (
      <Link href="/link" className="btn text-sm">
        {t('linkNeeded')}
      </Link>
    )
  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        className="btn text-sm"
        disabled={busy}
        onClick={() => void login()}
      >
        {busy ? t('authenticating') : t('signIn')}
      </button>
      {googleLoginEnabled && <GoogleLoginButton className="btn text-sm" />}
      {piError && <span className="text-destructive text-xs">{piError}</span>}
    </span>
  )
}
