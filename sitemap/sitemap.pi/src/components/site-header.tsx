'use client'

// 상단 헤더 — 홈·검색·내 사이트·관리(관리자만)·언어 전환·로그인 상태
import { useLocale, useTranslations } from 'next-intl'
import { usePiAuth } from '@pi/auth/client'
import { Link, usePathname } from '@/i18n/navigation'
import { AuthStatus } from './auth-status'

export function SiteHeader() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const pathname = usePathname()
  const { user } = usePiAuth()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MASTER'

  return (
    <header className="bg-background border-b border-white/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          sitemap.pi
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/search">{t('search')}</Link>
          <Link href="/me">{t('mySites')}</Link>
          {isAdmin && <Link href="/admin">{t('admin')}</Link>}
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
