'use client'

// 상단 헤더 — 홈·검색·내 사이트·관리(관리자만)·로그인 상태, 맨 오른쪽 끝에 언어 콤보(국기·환율)·π 시세칩(loginpi header.tsx 동일 배치, 표준 4.6절)
import { useLocale, useTranslations } from 'next-intl'
import { PiPriceChip } from '@pi/i18n/client'
import { Link } from '@/i18n/navigation'
import { AuthStatus } from './auth-status'
import { useAppUser } from './google-auth'
import { LanguageSwitcher } from './language-switcher'

// Pi 가치평가(통화·환율·π 시세) 표시 — 기본 표시, NEXT_PUBLIC_FEATURE_PI_PRICE='false' 면 숨김(loginpi override 손잡이와 같은 역할)
const showPiValuation = process.env.NEXT_PUBLIC_FEATURE_PI_PRICE !== 'false'

export function SiteHeader() {
  const t = useTranslations('nav')
  const locale = useLocale()
  // 통합 사용자(Pi 세션 OR Google 연동 세션) — 관리 메뉴 노출 판정
  const { user } = useAppUser()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MASTER'

  return (
    <header className="bg-background border-b border-white/10">
      {/* loginpi header.tsx 처럼 한 줄 고정(h-14, 줄바꿈 없음) — 폭이 모자라면 가운데 메뉴만 가로 스크롤, 오른쪽 끝 콤보·시세칩은 줄지 않음 */}
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="shrink-0 text-lg font-bold">
          sitemap.pi
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto text-sm whitespace-nowrap">
          <Link href="/search">{t('search')}</Link>
          <Link href="/my">{t('mySites')}</Link>
          <Link href="/link">{t('link')}</Link>
          {isAdmin && <Link href="/admin">{t('admin')}</Link>}
          {/* 로그인 상태(사용자명·로그인 버튼)도 스크롤 영역 안 — 모바일에서 숨기지 않음(Pi Browser 로그인 진입점) */}
          <div className="ms-auto">
            <AuthStatus />
          </div>
        </nav>
        {/* 맨 마지막 두 항목 = 언어 콤보 → π 시세칩(최우상단 고정, 하단·푸터 배치 금지) */}
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher locale={locale} showPiValuation={showPiValuation} />
          {showPiValuation && <PiPriceChip locale={locale} />}
        </div>
      </div>
    </header>
  )
}
