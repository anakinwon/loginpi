import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import '../globals.css'
import 'flag-icons/css/flag-icons.min.css'
import { auth } from '@/auth'
import { ThemeProvider } from '@/components/theme-provider'
import { PiAuthProvider } from '@/components/pi-auth-provider'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Next.js Starter Kit',
  description: 'Next.js 16 + Tailwind CSS v4 + shadcn/ui 스타터킷',
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Pi SDK — sync 로드로 하이드레이션 전 window.Pi 보장 (pi-auth-provider가 마운트 시 1회만 체크).
            Next.js 16: html을 소유한 레이아웃의 명시적 <head>에 raw script가 beforeInteractive의 대체 패턴.
            SRI(integrity)·crossOrigin 미적용 사유: 버전 고정 URL이 없는 벤더 자동 업데이트 SDK —
            해시 고정 시 Pi Network의 SDK 갱신 시점에 로드가 조용히 실패해 인증·결제 전체가 중단됨 (Stripe.js/v3와 동일 정책).
            crossOrigin은 CDN의 CORS 헤더(ACAO) 지원이 확인되지 않아 미적용 — CORS 모드는 헤더 부재 시 실행 차단됨 */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- 의도된 sync 로드: beforeInteractive 대체 (위 주석 참조) */}
        <script src='https://sdk.minepi.com/pi-sdk.js' />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <SessionProvider session={session}>
            <ThemeProvider
              attribute='class'
              defaultTheme='system'
              enableSystem
              disableTransitionOnChange
            >
              <PiAuthProvider>
                <Header />
                <main className='flex-1'>{children}</main>
                <Footer />
                <Toaster richColors />
              </PiAuthProvider>
            </ThemeProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
