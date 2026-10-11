'use client'

// 헤더 로그인 상태 — 로그인 시 계정명, 아니면 로그인 버튼(SDK → OAuth 순서는 usePiLogin 이 담당, cafe.pi 와 동일)
import { useTranslations } from 'next-intl'
import { usePiAuth } from '@pi/auth/client'
import { usePiLogin } from './login-gate'

export function AuthStatus() {
  const t = useTranslations('auth')
  const { user, isLoading, error } = usePiAuth()
  const { login, busy } = usePiLogin()

  if (isLoading) return <p className="text-sm">{t('checking')}</p>
  if (user)
    return (
      <p className="text-sm">
        {t('signedIn', { name: user.username ?? user.displayName })}
      </p>
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
      {error && <span className="text-destructive text-xs">{error}</span>}
    </span>
  )
}
