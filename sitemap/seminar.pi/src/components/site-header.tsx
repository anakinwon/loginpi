'use client'

// 상단 헤더 — 홈·계정 연동·개인정보 처리방침(전 페이지 공개 링크)·언어 전환·로그인 상태(Pi 세션 OR Google 연동 세션, useAppUser 통합)
import { useLocale, useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { AuthStatus } from './auth-status'

export function SiteHeader() {
  const t = useTranslations('nav')
  const tl = useTranslations('list')
  const locale = useLocale()
  const pathname = usePathname()

  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          seminar.pi
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/progress">{tl('progress')}</Link>
          <Link href="/link">{t('link')}</Link>
          <Link href="/privacy">{t('privacy')}</Link>
          <Link href={pathname} locale={locale === 'ko' ? 'en' : 'ko'}>
            {t('switchLocale')}
          </Link>
        </nav>
        <div className="ml-auto">
          <AuthStatus />
        </div>
      </div>
    </header>
  )
}
