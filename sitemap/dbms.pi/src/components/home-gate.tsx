'use client'

// dbms.pi 홈 로그인 게이트 — 미로그인이면 공용 LoginGate(Pi 로그인 + Google 버튼), 로그인이면 환영 문구만(redirect 금지 — Pi Browser 무한 루프)
import { useTranslations } from 'next-intl'
import { LoginGate } from './login-gate'

export function HomeGate() {
  const t = useTranslations('home')
  return (
    <LoginGate>
      {(user) => (
        <p className="bg-surface rounded-2xl p-4 text-sm" role="status">
          {t('welcome', { name: user.displayName || user.username || '' })}
        </p>
      )}
    </LoginGate>
  )
}
