'use client'

import { signIn, useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { usePiBrowserUI } from '@/hooks/use-pi-browser-ui'
import { usePiAuth } from '@/components/pi-auth-provider'

export function GoogleLoginButton() {
  const t = useTranslations('header')
  const { data: session, status } = useSession()
  // Pi Browser 판정에 UA 폴백 포함 — 인증 완료 전에도 Pi Browser면 Google UI 숨김
  const inPiBrowser = usePiBrowserUI()
  const { user: piUser } = usePiAuth()

  // 일반 브라우저(PC·모바일)는 Google 세션으로만 관리한다 → Pi Browser가 아니면
  // 계정 종류(통합/Google 전용)와 무관하게 항상 Google UI를 표시한다.
  //   로그인 전: "구글 로그인" 버튼 / 로그인 후: Google 계정명(별명) 링크.
  // ⚠️ piLoading·piUser로 게이팅하지 않는다:
  //   - piLoading: 일반 브라우저도 Pi SDK가 window.Pi를 정의해 최대 20s true 유지 → 버튼 사라짐.
  //   - piUser: Pi 연동 통합 계정이 Google 로그인하면 uid가 채워져(=pi_uid) 헤더가 통째로 사라짐.
  //   Google UI 노출 여부는 오직 isInPiBrowser(Pi Browser 여부)로만 판정한다.
  if (inPiBrowser) return null
  if (status === 'loading') return null

  // Pi Sign-In(OAuth) 세션만 있는 경우(NextAuth 세션 없음) — 계정명 표시는
  // PiOAuthLoginButton이 담당하므로 Google 로그인 버튼을 숨긴다 (2026-07-08).
  // ⚠️ 통합계정이 Google로 로그인한 케이스는 session.user가 존재해 이 분기를 타지 않음
  //    (아래 기존 주의사항의 'piUser 게이팅 금지'는 그 케이스에 한정된 경고).
  if (!session?.user && piUser) return null

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        {/* 별명 클릭 → /profile(로그아웃 기능 포함). 헤더 로그아웃 버튼은 제거. */}
        <Link
          href="/profile"
          className="inline-block max-w-[45vw] truncate align-middle text-sm font-medium whitespace-nowrap text-[navy] hover:underline dark:text-blue-300"
        >
          {session.user.name ?? session.user.email}
        </Link>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => signIn('google')}
      className="gap-1.5"
    >
      <GoogleIcon />
      {t('googleLogin')}
    </Button>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
