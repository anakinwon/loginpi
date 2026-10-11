// locale 레이아웃 — 다국어·테마(next-themes class)·Pi SDK 로드·Pi 인증 Provider·헤더를 전 페이지에 제공
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'
import { PiAuthProvider, PiSdkScript } from '@pi/auth/client'
import { routing } from '@/i18n/routing'
import { SiteHeader } from '@/components/site-header'
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
    <html lang={locale} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {/* <html> 직속이면 hydration 불일치 — 반드시 body 안 */}
        <PiSdkScript />
        <NextIntlClientProvider>
          {/* 어두운 단일 테마 고정 — 기존 dark: 변형 클래스가 전 페이지에서 동작(globals.css 토큰과 짝) */}
          <ThemeProvider
            attribute="class"
            forcedTheme="dark"
            disableTransitionOnChange
          >
            {/* Google(NextAuth) 세션 — Pi 세션(PiAuthProvider)과 useAppUser 가 통합. 미설정 환경은 /api/auth/* 가 404 라 세션 null */}
            <SessionProvider>
              <PiAuthProvider>
                <SiteHeader />
                {/* 홈 버블처럼 data-fullbleed 자식이 있으면 폭 제한·여백 해제(:has 미지원 브라우저는 기존 폭으로 표시) */}
                <main className="mx-auto max-w-5xl px-4 py-6 has-[[data-fullbleed]]:max-w-none has-[[data-fullbleed]]:p-0">
                  {children}
                </main>
              </PiAuthProvider>
            </SessionProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
