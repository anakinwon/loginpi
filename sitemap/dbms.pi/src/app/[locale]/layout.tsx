// dbms.pi locale 레이아웃 — 다국어·저장 언어 적용·워프 도착 연출·Pi SDK 로드·Pi 인증 Provider·Google 세션·헤더를 전 페이지에 제공
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { PiSdkScript } from '@pi/auth/client'
import { getDir, PreferredLocaleScript } from '@pi/i18n'
import { WarpArrival } from '@pi/warp/client'
import { PiAuthRoot } from '@/components/pi-auth-root'
import { PlanNotice } from '@/components/plan/plan-notice'
import { SiteHeader } from '@/components/site-header'
import { routing } from '@/i18n/routing'
import { appUrl } from '@/lib/site-url'
import '../globals.css'

// 사전 렌더는 ko·en 만 — 나머지 locale 은 첫 요청 때 렌더·캐시(전 locale × 전 페이지 빌드 폭증 방지, 표준 7절)
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
  return {
    metadataBase: new URL(appUrl()),
    title: t('title'),
    description: t('description'),
  }
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
        {/* 저장된 언어(preferred_locale) 적용 — 파싱 중 1회, 하이드레이션·Pi SDK·인증 시작 전(표준 6절) */}
        <PreferredLocaleScript locales={routing.locales} />
        {/* sitemap.pi 에서 워프로 넘어온 방문 = 음속에서 감속해 멈추는 도착 연출(@pi/warp) */}
        <WarpArrival revealFlash />
        {/* <html> 직속이면 hydration 불일치 — 반드시 body 안 */}
        <PiSdkScript />
        <NextIntlClientProvider>
          {/* Google(NextAuth) 세션 — Pi 세션(PiAuthProvider)과 useAppUser 가 통합. 미설정 환경은 /api/auth/* 가 404 라 세션 null */}
          <SessionProvider>
            {/* Pi 인증 + 미완료 요금제 결제 복구(onIncompletePayment → complete·cancel, sql/035) */}
            <PiAuthRoot>
              <SiteHeader />
              {/* 아래 여백 = 하단 고정 메뉴 높이(feature-nav 가 :root --dbms-nav-h 갱신) + 24px */}
              <main className="w-full px-4 pt-6 pb-[calc(var(--dbms-nav-h,6rem)+1.5rem)] sm:px-6 lg:px-8">
                {children}
              </main>
              {/* 요금제 잠김·한도·schema.pi 만료 공통 안내(readApi 이벤트) */}
              <PlanNotice />
            </PiAuthRoot>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
