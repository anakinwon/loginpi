'use client'

// dbms.pi 상단 헤더 — 로고 · 로그인 상태(Pi 세션 OR Google 연동 세션, useAppUser 통합) · 맨 오른쪽 끝 = 언어 콤보(국기·환율) → π 시세칩
//  (loginpi header.tsx 와 같은 순서, 다국어 표준 4.6 — 언어 콤보는 하단 바·푸터 금지). 그 아래 줄 = 기능 메뉴(FeatureNav)
import { useLocale } from 'next-intl'
import { PiPriceChip } from '@pi/i18n/client'
import { Link } from '@/i18n/navigation'
import { AuthStatus } from './auth-status'
import { FeatureNav } from './feature-nav'
import { LanguageSwitcher } from './language-switcher'

// Pi 가치(언어 콤보 Pi 환산·π 시세칩) — 기본 표시, 'false' 면 숨김(loginpi override 와 같은 이름)
const SHOW_PI_VALUATION = process.env.NEXT_PUBLIC_FEATURE_PI_PRICE !== 'false'

export function SiteHeader() {
  const locale = useLocale()
  return (
    <header className="border-b border-white/10">
      {/* 모바일 = 1줄 로고 + 언어 콤보·시세칩(최우상단 고정), 2줄 로그인 상태(오른쪽 정렬) — 360px 가로 스크롤 방지.
          sm 이상 = 한 줄 : 로고 … 로그인 상태 · 언어 콤보 · 시세칩 */}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 font-mono text-lg font-bold tracking-tight">
          dbms<span className="text-accent">.pi</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:order-last sm:ml-0">
          <LanguageSwitcher locale={locale} showPiValuation={SHOW_PI_VALUATION} />
          {SHOW_PI_VALUATION && <PiPriceChip locale={locale} />}
        </div>
        {/* 긴 사용자명·긴 locale 라벨이면 버튼 단위로 다음 줄로 넘김(버튼 글자 자체는 안 꺾음) */}
        <nav className="order-last flex w-full min-w-0 justify-end sm:order-none sm:ml-auto sm:w-auto [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap [&>span]:flex-wrap [&>span]:justify-end">
          <AuthStatus />
        </nav>
      </div>
      <FeatureNav />
    </header>
  )
}
