'use client'

// 로그인 상태 표시 — Pi Browser 실기기 로그인 검증용 최소 UI(인증 시도는 PiAuthProvider가 자동 수행)
import { useTranslations } from 'next-intl'
import { usePiAuth } from '@pi/auth/client'

export function AuthStatus() {
  const t = useTranslations('auth')
  const { user, isLoading, error } = usePiAuth()

  if (isLoading) return <p className="text-sm">{t('checking')}</p>
  if (user)
    return (
      <p className="text-sm">
        {t('signedIn', { name: user.username ?? user.displayName })}
      </p>
    )
  return (
    <p className="text-sm">
      {t('signedOut')}
      {error && <span className="text-destructive block">{error}</span>}
    </p>
  )
}
