// locale 레이아웃 — 다국어·Pi SDK 로드·Pi 인증 Provider·Google 세션·헤더를 전 페이지에 제공·애플리케이션 모니터링(sitemap.pi 동일)
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { PiSdkScript } from '@pi/auth/client'
import { getDir, PreferredLocaleScript } from '@pi/i18n'
import { MonRum } from '@/components/mon-rum'
import { PiAuthRoot } from '@/components/pi-auth-root'
import { SiteHeader } from '@/components/site-header'
import { routing } from '@/i18n/routing'
import '../globals.css'

// 사전 렌더는 ko·en 만 — 나머지 locale 은 첫 요청 때 렌더·캐시(67개 × 전 페이지 빌드 폭증 방지, 표준 7절)
export function generateStaticParams() {
  return [{ locale: 'ko' }, { locale: 'en' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'meta' })
  return { title: t('title'), description: t('description') }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html lang={locale} dir={getDir(locale)}>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {/* 저장된 언어(preferred_locale) 적용 — 파싱 중 1회, 하이드레이션·Pi SDK·인증 시작 전(전 경로 /s/* 포함, 표준 6절) */}
        <PreferredLocaleScript locales={routing.locales} />
        {/* <html> 직속이면 hydration 불일치 — 반드시 body 안 */}
        <PiSdkScript />
        <NextIntlClientProvider>
          {/* Google(NextAuth) 세션 — Pi 세션(PiAuthProvider)과 useAppUser 가 통합. 미설정 환경은 /api/auth/* 가 404 라 세션 null */}
          <SessionProvider>
            <PiAuthRoot>
              <SiteHeader />
              {/* 아래 여백 = 하단 고정 메뉴 바 높이(site-header BottomNav) — 마지막 내용이 가려지지 않게 */}
              <main className="mx-auto max-w-3xl px-4 py-6 pb-28 lg:max-w-none lg:px-8">
                {children}
              </main>
              {/* 애플리케이션 모니터링 계측 → schema.pi 모니터링(운영만, M5 2026-10-31) */}
              <MonRum />
            </PiAuthRoot>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
