'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'

const isDev = process.env.NODE_ENV !== 'production'

export function PiLoginButton() {
  const t = useTranslations('header')
  const { user, isLoading, isInPiBrowser, signIn, devLogin, error } =
    usePiAuth()
  const useDevLogin = isDev && !isInPiBrowser

  if (!isInPiBrowser) return null

  if (user) {
    const isDevSession = user.uid.startsWith('dev_')
    const displayLabel =
      user.nick_nm ?? (user.username ? `@${user.username}` : user.displayName)
    return (
      <div className="flex items-center gap-2">
        {/* 별명 클릭 → /profile(로그아웃 기능 포함). 헤더 로그아웃 버튼은 제거.
            Pi Browser 좁은 폭에서 별명이 여러 줄로 개행되지 않도록 nowrap+truncate */}
        <Link
          href="/profile"
          className="inline-block max-w-[45vw] truncate align-middle text-sm font-medium whitespace-nowrap text-[navy] hover:underline dark:text-blue-300"
        >
          {displayLabel}
          {isDevSession && (
            <span className="text-muted-foreground ml-1 text-xs">(dev)</span>
          )}
        </Link>
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={() => (useDevLogin ? devLogin() : signIn())}
        disabled={isLoading}
        size="sm"
        className="gap-1.5"
      >
        <span
          className="font-serif text-sm leading-none italic"
          aria-hidden="true"
        >
          π
        </span>
        {isLoading
          ? t('piAuthenticating')
          : useDevLogin
            ? t('piLoginDev')
            : t('piLogin')}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  )
}
