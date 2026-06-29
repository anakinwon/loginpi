import { getLocale } from 'next-intl/server'
import { env } from '@/env'
import { Link } from '@/i18n/navigation'
import { GoogleLoginButton } from '@/components/google-login-button'
import { PiLoginButton } from '@/components/pi-login-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrowserName } from '@/components/layout/browser-name'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { PiPriceChip } from '@/components/layout/pi-price-chip'
import { HeaderShell } from '@/components/layout/header-shell'
import { resolveDbTier } from '@/lib/db-env'
import { computeShowPiValuation } from '@/lib/feature-flags'
// 상단 헤더: 로고 · 계정명(로그인 버튼 내장) · 로그인/아웃 · 다국어 · Pi 시세.
// 메뉴 이동(Home·Cafe·Shop·나의정보/관리자)은 BottomNav가 담당한다.
// 셸(HeaderShell, client)이 Pi Browser 전용 플로팅/자동숨김을 처리하고, 내용은 server에서 렌더.
export async function Header() {
  const locale = await getLocale()
  // 런타임 tier로 시세칩 노출 분기 — 운영(prod) 숨김, staging/dev 노출. 같은 빌드, 환경별 표시.
  const showPiValuation = computeShowPiValuation(
    resolveDbTier(),
    env.NEXT_PUBLIC_FEATURE_PI_PRICE,
  )

  return (
    <HeaderShell>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-foreground font-semibold tracking-tight">
          <BrowserName />
        </Link>
        <nav className="flex items-center gap-3">
          {/* 계정명·로그아웃 버튼은 각 로그인 버튼 컴포넌트가 세션 상태에 따라 렌더 */}
          <GoogleLoginButton />
          <PiLoginButton />
          <span className="hidden md:inline-flex">
            <ThemeToggle />
          </span>
          <LanguageSwitcher locale={locale} showPiValuation={showPiValuation} />
          {/* 시세칩: Pi 가치평가 노출 = 등재 레드라인(A-5) 대응. 런타임 tier로 분기 —
              운영(prod) 숨김 / staging·dev 노출. 같은 빌드가 배포 환경별로 다르게 표시.
              긴급 override는 NEXT_PUBLIC_FEATURE_PI_PRICE='true'/'false'. docs/PRD_23_FUNC_TUNING.md §8.6 */}
          {showPiValuation && <PiPriceChip locale={locale} />}
        </nav>
      </div>
    </HeaderShell>
  )
}
