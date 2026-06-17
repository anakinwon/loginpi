import { getLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { GoogleLoginButton } from '@/components/google-login-button'
import { PiLoginButton } from '@/components/pi-login-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrowserName } from '@/components/layout/browser-name'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { PiPriceChip } from '@/components/layout/pi-price-chip'
import { env } from '@/env'

// 상단 고정 헤더: 로고 · 계정명(로그인 버튼 내장) · 로그인/아웃 · 다국어 · Pi 시세.
// 메뉴 이동(Home·Cafe·Shop·나의정보/관리자)은 BottomNav가 담당한다.
export async function Header() {
  const locale = await getLocale()

  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm">
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
          <LanguageSwitcher locale={locale} />
          {/* Pi 시세 칩: Pi 정책(가치평가 노출 최소화) 대응 — 환경변수로 기본 비활성 */}
          {env.NEXT_PUBLIC_FEATURE_PI_PRICE === 'true' && (
            <PiPriceChip locale={locale} />
          )}
        </nav>
      </div>
    </header>
  )
}
