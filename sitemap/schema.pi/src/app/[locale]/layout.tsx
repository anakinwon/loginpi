// schema.pi locale 레이아웃 — 다국어(@pi/i18n 표준 : <html lang dir>·메시지 Provider·저장 언어 적용)·전역 스타일·Pi SDK 로드·세션 Provider(Google NextAuth + Pi @pi/auth, 미완료 결제 복구 PiAuthRoot)·앱 모니터링 계측(Rum)
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { PiSdkScript } from '@pi/auth/client'
import { getDir, PreferredLocaleScript } from '@pi/i18n'
import { routing } from '@/i18n/routing'
import { PiAuthRoot } from './pi-auth-root'
import Rum from './rum'
import '../globals.css'

// 사전 렌더는 ko·en 만 — 나머지 locale 은 첫 요청 때 렌더·캐시(67개 × 전 페이지 빌드 폭증 방지, 표준 7절)
export function generateStaticParams() {
  return [{ locale: 'ko' }, { locale: 'en' }]
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'meta' })
  return { title: t('title'), description: t('description') }
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html lang={locale} dir={getDir(locale)}>
      <body className="min-h-screen antialiased">
        {/* 저장된 언어(preferred_locale) 적용 — 파싱 중 1회, 하이드레이션·Pi SDK·인증 시작 전(표준 6절) */}
        <PreferredLocaleScript locales={routing.locales} />
        <PiSdkScript />
        <NextIntlClientProvider>
          {/* Google 미설정 환경은 /api/auth/* 가 404 라 세션 null — Pi 로그인만 동작 */}
          <SessionProvider>
            <PiAuthRoot>{children}</PiAuthRoot>
            <Rum />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
