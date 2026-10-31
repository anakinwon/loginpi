'use client'
// 클라이언트 로그인 게이트 — 서버는 redirect 하지 않고(Pi Browser 무한 루프 방지) 여기서 로그인 유도.
//  통합 사용자(useAppUser) = Pi 세션 OR Google 연동 세션. Google 로그인됐으나 미연동이면 연동 코드 입력 폼.
//  철칙 : UA 로 Pi Browser 를 판정하지 않는다. window.Pi.authenticate() 성공(provider 의 user)만 신뢰
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { GoogleLoginButton, GoogleSignOutButton, LinkCheckFailed, LinkCodeForm, useAppUser } from './google-auth'

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, googleUnlinked, googleLinkError, piSignIn, piError } = useAppUser()
  const t = useTranslations('auth')
  if (user) return <>{children}</>
  if (isLoading) return <p className="text-sm text-gray-600">{t('checking')}</p>
  if (googleLinkError) return <LinkCheckFailed />
  if (googleUnlinked)
    return (
      <div className="mt-6 flex flex-col gap-2">
        <p className="text-sm">{t('googleUnlinked')}</p>
        <LinkCodeForm />
      </div>
    )
  return (
    <div className="mt-6 flex flex-col items-start gap-2 rounded border border-gray-200 p-4">
      <p className="text-sm">{t('requiredHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded bg-black px-3 py-1.5 text-sm text-white" onClick={() => void piSignIn()}>
          {t('piSignIn')}
        </button>
        <GoogleLoginButton />
      </div>
      {piError && <p className="text-xs text-red-600">{piError}</p>}
    </div>
  )
}

// 헤더 표시용 — 로그인 사용자명·계정 연동 링크·로그아웃(세션 종류별)
export function AuthStatus() {
  const { user, source, piSignOut } = useAppUser()
  const t = useTranslations('auth')
  if (!user) return null
  return (
    <span className="flex items-center gap-2 text-sm text-gray-600">
      <Link href="/link" className="hover:underline">
        {user.username ?? user.displayName}
      </Link>
      {source === 'google' ? (
        <GoogleSignOutButton />
      ) : (
        <button type="button" className="underline" onClick={() => void piSignOut()}>
          {t('signOut')}
        </button>
      )}
    </span>
  )
}
