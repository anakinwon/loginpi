'use client'

// 계정 연동 패널 — 세션 종류별 분기 : Pi 세션 = 코드 발급 / Google 미연동 = 코드 입력 / Google 연동됨 = 완료 표시 / 없음 = 로그인 안내
import { useTranslations } from 'next-intl'
import {
  LinkCodeForm,
  PiLinkCodeIssuer,
  googleLoginEnabled,
  useAppUser,
} from './google-auth'
import { LoginGate } from './login-gate'

export function LinkPanel() {
  const t = useTranslations('link')
  const { user, source, isLoading, googleUnlinked } = useAppUser()

  if (isLoading && !user)
    return <p className="text-muted-foreground text-sm">{t('checking')}</p>
  if (googleUnlinked) return <LinkCodeForm />
  if (user && source === 'google')
    return (
      <p className="card text-sm" role="status">
        {t('linked', { name: user.username ?? user.displayName })}
      </p>
    )
  if (user && source === 'pi')
    return (
      <>
        {googleLoginEnabled ? (
          <PiLinkCodeIssuer />
        ) : (
          <p className="card text-sm">{t('googleOff')}</p>
        )}
      </>
    )
  // 미로그인 — 공용 게이트(Pi 로그인 + Google 버튼)
  return <LoginGate>{() => null}</LoginGate>
}
