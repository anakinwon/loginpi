// schema.pi 상단 헤더(서버 컴포넌트) — 모든 화면 공통. 맨 끝(최우상단) = 언어 콤보 → π 시세칩(loginpi header.tsx 동일 배치, 표준 4.6절 — 하단 메뉴·푸터 금지)
//  children = 콤보 앞에 둘 항목(로그인 상태 등). 높이 h-12 = globals.css --area-head-h(분류체계 고정 틀의 top)
import { getLocale } from 'next-intl/server'
import { PiPriceChip } from '@pi/i18n/client'
import { Link } from '@/i18n/navigation'
import { LanguageSwitcher } from './language-switcher'

export async function SiteHeader({ children }: { children?: React.ReactNode }) {
  const locale = await getLocale()
  // loginpi 의 시세 표시 스위치와 같은 역할 — 기본 표시, 'false' 만 숨김
  const showPiValuation = process.env.NEXT_PUBLIC_FEATURE_PI_PRICE !== 'false'
  return (
    <header className="sticky top-0 z-40 h-12 border-b bg-white/95 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:px-4 lg:px-5">
        <Link href="/" className="shrink-0 text-base font-bold">
          schema.pi
        </Link>
        <nav className="flex min-w-0 items-center gap-3">
          {children}
          <LanguageSwitcher locale={locale} showPiValuation={showPiValuation} />
          {showPiValuation && <PiPriceChip locale={locale} />}
        </nav>
      </div>
    </header>
  )
}
