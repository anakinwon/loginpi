'use client'
// 클라이언트 로그인 게이트 — 서버는 redirect 하지 않고(Pi Browser 무한 루프 방지) 여기서 로그인 유도.
//  통합 사용자(useAppUser) = Pi 세션 OR Google 연동 세션. Google 로그인됐으나 미연동이면 연동 코드 입력 폼.
//  철칙 : UA 로 Pi Browser 를 판정하지 않는다. window.Pi.authenticate() 성공(provider 의 user)만 신뢰
//  표현 : 로그인 상자 = panel(확인 중에도 같은 자리·같은 최소 높이 — 화면 밀림 방지), 'Pi 로그인' = 화면 유일 주요(btn-3d)
import { LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { GoogleLoginButton, GoogleSignOutButton, LinkCheckFailed, LinkCodeForm, useAppUser } from './google-auth'

// 바깥 여백 = 부모가 main 이 아닐 때만(분류체계 레이아웃은 바깥 여백 없음 → 가장자리 붙음 방지, 홈은 main px-4 가 이미 있어 이중 여백 방지)
const BOX = 'panel flex min-h-40 max-w-md flex-col justify-center gap-3 p-5 [:not(main)>&]:m-4 lg:[:not(main)>&]:mx-6'

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, googleUnlinked, googleLinkError, piSignIn, piError } = useAppUser()
  const t = useTranslations('auth')
  if (user) return <>{children}</>
  if (isLoading) return <p className={`${BOX} text-sm text-ink-3`}>{t('checking')}</p>
  if (googleLinkError) return <LinkCheckFailed />
  if (googleUnlinked)
    return (
      <div className="flex max-w-md flex-col gap-2 [:not(main)>&]:m-4 lg:[:not(main)>&]:mx-6">
        <p className="text-sm text-ink-2">{t('googleUnlinked')}</p>
        <LinkCodeForm />
      </div>
    )
  return (
    <div className={BOX}>
      <p className="text-sm text-ink-2">{t('requiredHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-3d btn-lg w-full sm:w-auto" onClick={() => void piSignIn()}>
          {t('piSignIn')}
        </button>
        <GoogleLoginButton className="btn-key btn-lg w-full sm:w-auto" />
      </div>
      {piError && <p className="text-xs text-danger">{piError}</p>}
    </div>
  )
}

// 헤더 표시용 — 로그인 사용자명·계정 연동 링크·로그아웃(세션 종류별). 640 미만 = 로그아웃 아이콘 단추(이름은 sr-only 로 유지)
export function AuthStatus() {
  const { user, source, piSignOut } = useAppUser()
  const t = useTranslations('auth')
  if (!user) return null
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Link href="/link" className="max-w-24 truncate text-dense text-ink-2 hover:text-ink hover:underline">
        {user.username ?? user.displayName}
      </Link>
      {source === 'google' ? (
        <GoogleSignOutButton className="btn-ghost btn-sm" compact />
      ) : (
        <button type="button" className="btn-ghost btn-sm" title={t('signOut')} onClick={() => void piSignOut()}>
          <LogOut className="sm:hidden" aria-hidden />
          <span className="max-sm:sr-only">{t('signOut')}</span>
        </button>
      )}
    </span>
  )
}
