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
// 상단 헤더: 로고 · 계정명(로그인 버튼 내장) · 로그인/아웃 · 다국어 · Pi 시세.
// 메뉴 이동(Home·Cafe·Shop·나의정보/관리자)은 BottomNav가 담당한다.
// 셸(HeaderShell, client)이 Pi Browser 전용 플로팅/자동숨김을 처리하고, 내용은 server에서 렌더.
export async function Header() {
  const locale = await getLocale()

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
          <LanguageSwitcher locale={locale} />
          {/* 시세·각국통화 칩: Pi 가치평가 노출 = 등재 레드라인(A-5) 대응으로 기본 숨김.
              노출하려면 NEXT_PUBLIC_FEATURE_PI_PRICE='true' 한 줄만 켜면 됨(재배포). docs/PRD_23_FUNC_TUNING.md §8.6 */}
          {env.NEXT_PUBLIC_FEATURE_PI_PRICE === 'true' && (
            <PiPriceChip locale={locale} />
          )}
        </nav>
      </div>
    </HeaderShell>
  )
}
