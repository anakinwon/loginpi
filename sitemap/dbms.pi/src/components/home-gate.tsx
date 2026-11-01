'use client'

// dbms.pi 홈 로그인 게이트 — 미로그인이면 공용 LoginGate(Pi 로그인 + Google 버튼), 로그인이면 환영 문구(redirect 금지 — Pi Browser 무한 루프).
//  Pi 세션(Pi Browser)이면 홈에서 바로 Google 연동용 6자리 코드 발급(PiLinkCodeIssuer) — /link 로 가는 메뉴가 없어 발급 버튼을 못 찾던 문제(2026-11-01 실기기)
import { useTranslations } from 'next-intl'
import { PiLinkCodeIssuer, useAppUser } from './google-auth'
import { LoginGate } from './login-gate'

export function HomeGate() {
  const t = useTranslations('home')
  const { source } = useAppUser()
  return (
    <LoginGate>
      {(user) => (
        <div className="flex flex-col gap-4">
          <p className="bg-surface rounded-2xl p-4 text-sm" role="status">
            {t('welcome', { name: user.displayName || user.username || '' })}
          </p>
          {source === 'pi' && <PiLinkCodeIssuer />}
        </div>
      )}
    </LoginGate>
  )
}
