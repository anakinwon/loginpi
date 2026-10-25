// locale 레이아웃 — 다국어·Pi SDK 로드·Pi 인증 Provider·Google 세션·헤더를 전 페이지에 제공(sitemap.pi 동일, 모니터링은 M5 에서)
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { PiSdkScript } from '@pi/auth/client'
import { PiAuthRoot } from '@/components/pi-auth-root'
import { SiteHeader } from '@/components/site-header'
import { routing } from '@/i18n/routing'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
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
    <html lang={locale}>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {/* <html> 직속이면 hydration 불일치 — 반드시 body 안 */}
        <PiSdkScript />
        <NextIntlClientProvider>
          {/* Google(NextAuth) 세션 — Pi 세션(PiAuthProvider)과 useAppUser 가 통합. 미설정 환경은 /api/auth/* 가 404 라 세션 null */}
          <SessionProvider>
            <PiAuthRoot>
              <SiteHeader />
              <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
            </PiAuthRoot>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
