import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { env } from '@/env'
import '../globals.css'
import 'flag-icons/css/flag-icons.min.css'
import { auth } from '@/auth'
import { ThemeProvider } from '@/components/theme-provider'
import { PiAuthProvider } from '@/components/pi-auth-provider'
import { ConsentGate } from '@/components/consent/consent-gate'
import { PiSdkScript } from '@/components/pi-sdk-script'
import { PageviewTracker } from '@/components/analytics/pageview-tracker'
import { Header } from '@/components/layout/header'
import { BottomNav } from '@/components/layout/bottom-nav'
import { StagingBanner } from '@/components/layout/staging-banner'
import { Toaster } from '@/components/ui/sonner'
import { getActiveUiTheme, buildThemeStyleCss } from '@/lib/ui-theme'
import { resolveDbTier } from '@/lib/db-env'
import { computeShowPiValuation } from '@/lib/feature-flags'
import { FeatureFlagProvider } from '@/components/feature-flag-provider'
import { getActiveFeeMode } from '@/lib/fee-resolver'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const APP_NAME = 'CafePi'
const APP_TITLE = 'CafePi — Pi 커뮤니티 카페 · 마켓플레이스'
const APP_DESC =
  'Pi Network 커뮤니티 카페에서 소통하고, 마켓플레이스에서 Pi로 거래하세요. Pi Browser에서 Pi 계정으로 로그인·결제할 수 있습니다.'

// 공유 링크 미리보기(OG/Twitter) + 기본 메타데이터 위생.
// 본문 다수가 인증·클라이언트 게이트라 SEO 색인 대상은 적지만, 링크 공유 시 미리보기 카드가 뜨도록 정비.
// 다국어 메타데이터(203 locale)는 과투자 → 한국어 기본값 단일 유지.
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  applicationName: APP_NAME,
  title: { default: APP_TITLE, template: `%s · ${APP_NAME}` },
  description: APP_DESC,
  icons: { icon: '/cafe_bean003.png', apple: '/cafe_bean003.png' },
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESC,
    url: '/',
    locale: 'ko_KR',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: APP_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_TITLE,
    description: APP_DESC,
    images: ['/api/og'],
  },
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await auth()
  const messages = await getMessages()

  // 활성 UI 테마가 '전체 적용(GLOBAL)'이면 :root에 색상 주입 (전 페이지).
  // 'ADMIN'이면 여기선 주입하지 않고 (admin)/layout이 스코프 주입한다.
  const activeTheme = await getActiveUiTheme()
  const globalThemeCss =
    activeTheme?.apply_scope_cd === 'GLOBAL'
      ? buildThemeStyleCss(activeTheme.theme_tokens, 'GLOBAL')
      : ''

  // 런타임 tier 판정 → Pi 가치평가(시세·환율) 노출 여부. 같은 빌드가 배포 환경별로 다르게 표시.
  // server 판정값을 client(통화콤보 등)엔 FeatureFlagProvider Context로 주입한다.
  const showPiValuation = computeShowPiValuation(
    resolveDbTier(),
    env.NEXT_PUBLIC_FEATURE_PI_PRICE,
  )

  // 활성 요금제 모드 — PI 모드면 마이크로 요금을 client에서 "무료"로 표시(서버 microFeeBean과 일관)
  const feeMode = await getActiveFeeMode()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        {/* 전체 적용 테마 색상 주입 (GLOBAL 범위) — 핵심 색만 바꿔 배경·글자는 유지 */}
        {globalThemeCss && (
          <style dangerouslySetInnerHTML={{ __html: globalThemeCss }} />
        )}
        {/* Staging 환경 표시 줄무늬 바 — tier=staging일 때만(운영선 null). 최상단 고정 노출 */}
        <StagingBanner />
        {/* onLoad는 이벤트 핸들러이므로 Client Component(PiSdkScript)로 분리.
            ※ <html> 직접 자식으로 두면 invalid DOM → hydration 불일치 → script 경고 발생 — 반드시 body 안에 배치 */}
        <PiSdkScript />
        <NextIntlClientProvider messages={messages}>
          <SessionProvider session={session}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
              enableColorScheme={false}
            >
              <PiAuthProvider>
                <Header />
                {/* pb-16: 하단 고정 BottomNav(h-16)에 콘텐츠가 가려지지 않도록 여백 확보 */}
                <main className="flex-1 pb-16">
                  <FeatureFlagProvider flags={{ showPiValuation, feeMode }}>
                    {children}
                  </FeatureFlagProvider>
                </main>
                <BottomNav />
                {/* 가입/이용 동의 전역 게이트 — 로그인 후 필수 동의 미완료 시 차단 모달 */}
                <ConsentGate />
                <PageviewTracker />
                <Toaster richColors />
              </PiAuthProvider>
            </ThemeProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
