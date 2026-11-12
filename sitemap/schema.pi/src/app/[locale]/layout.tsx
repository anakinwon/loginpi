// schema.pi locale 레이아웃 — 다국어(@pi/i18n 표준 : <html lang dir>·메시지 Provider·저장 언어 적용)·전역 스타일·Pi SDK 로드·세션 Provider(Google NextAuth + Pi @pi/auth, 미완료 결제 복구 PiAuthRoot)·앱 모니터링 계측(Rum)
import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { PiSdkScript } from '@pi/auth/client'
import { getDir, PreferredLocaleScript } from '@pi/i18n'
import { WarpArrival } from '@pi/warp/client'
import { routing } from '@/i18n/routing'
import { PiAuthRoot } from './pi-auth-root'
import Rum from './rum'
import '../globals.css'

// 글꼴(2026-11-12 교체) — UI = Pretendard Variable(동적 서브셋, <head> CDN 링크 — 버전 고정), 코드·물리명 = IBM Plex Mono(칩·DDL 에만, preload 끔), 변수는 globals.css --font-ui·--font-code 가 받음
//  Plex Sans KR 을 뺀 이유 : 한글 조각이 늦게 와 swap 전 맑은 고딕과 한 문장 안에서 섞이고, Windows 힌팅이 약해 작은 크기·확대 배율에서 글자가 깨져 보임(마스터 지적)
const PRETENDARD_CSS = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
const plexMono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], display: 'swap', preload: false, variable: '--font-plex-mono' })

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
    <html lang={locale} dir={getDir(locale)} className={plexMono.variable}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href={PRETENDARD_CSS} crossOrigin="" />
      </head>
      <body className="min-h-screen antialiased">
        {/* 저장된 언어(preferred_locale) 적용 — 파싱 중 1회, 하이드레이션·Pi SDK·인증 시작 전(표준 6절) */}
        <PreferredLocaleScript locales={routing.locales} />
        {/* sitemap.pi 에서 워프로 넘어온 방문 = 음속에서 감속해 멈추는 도착 연출(@pi/warp, 2026-11-01) */}
        <WarpArrival />
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
