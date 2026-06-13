'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'
import { LOCALE_CURRENCY } from '@/lib/locale-currency'
import {
  LOCALE_COUNTRY,
  ACTIVE_COUNTRY_CODES,
  getAlpha2,
} from '@/lib/locale-country'

interface ActiveLocale {
  locale_cd: string
  locale_nm: string
  flag_emoji: string
  sort_ord: number
}

interface Country {
  country_cd: string
  dis_ord_seq: number
  country_eng_nm: string
  country_mot_nm: string
  currency_cd: string
}

// 1 USD 기준 환율 포매팅
function fmtRate(rate: number | undefined): string {
  if (!rate) return '—'
  if (rate >= 1000)
    return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1) return rate.toFixed(2)
  return rate.toFixed(4)
}

// flag-icons CSS 아이콘 (fi fi-{alpha2})
function FlagIcon({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  return <span className={`fi fi-${code.toLowerCase()} ${className}`} />
}

export function LanguageSwitcher({ locale }: { locale: string }) {
  const t = useTranslations('langSwitcher')
  const tc = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [activeLocales, setActiveLocales] = useState<ActiveLocale[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [rates, setRates] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  async function loadData() {
    if (loadedRef.current) return
    setLoading(true)
    try {
      const [cRes, rRes] = await Promise.all([
        fetch('/api/i18n/countries'),
        fetch('/api/exchange-rates'),
      ])
      const cData = (await cRes.json()) as {
        locales: ActiveLocale[]
        countries: Country[]
      }
      const rData = (await rRes.json()) as { rates: Record<string, number> }
      setActiveLocales(cData.locales ?? [])
      setCountries(cData.countries ?? [])
      setRates(rData.rates ?? {})
      loadedRef.current = true
    } catch {
      // 실패 시 빈 데이터 유지
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) loadData()
    else loadedRef.current = false // 닫을 때 초기화 → 다음 열기 시 최신 데이터 로드
  }

  async function switchLocale(next: string) {
    setOpen(false)
    if (next === locale) return
    // ── admin 경로: Pi Browser 무반응 방지 ──────────────────────────────────
    // Pi Browser는 Set-Cookie를 저장하지 않으므로, 티켓 없는 하드 네비게이션은 새 locale의
    // 첫 서버 요청이 미인증(getSessionUser null) → ClientAdminGate만 렌더된다. 이후 게이트가
    // soft router.replace로 재인증을 시도하지만 Pi Browser WebView에서 이 2차 재렌더가 안정적으로
    // 잡히지 않아 'checking' 상태로 멈춰 무반응처럼 보인다.
    // → 전환 시점에 _pit 티켓을 직접 발급받아 URL에 실어 하드 네비게이션하면, 미들웨어가
    //   첫 요청부터 x-pit-ticket 헤더로 변환해 인증된 admin UI를 즉시 렌더한다(게이트 왕복 제거).
    //   일반 브라우저는 piFetch가 401이어도 쿠키로 인증되므로 티켓 없이 이동해도 정상 동작한다.
    if (pathname.startsWith('/admin')) {
      let target = `/${next}${pathname}`
      try {
        const res = await piFetch('/api/admin/pit-ticket', { method: 'POST' })
        if (res.ok) {
          const { ticket } = (await res.json()) as { ticket?: string }
          if (ticket) target += `?_pit=${encodeURIComponent(ticket)}`
        }
      } catch {
        // 티켓 발급 실패 → 티켓 없이 이동, 쿠키 인증 또는 게이트가 처리
      }
      window.location.assign(target)
      return
    }
    router.replace(pathname, { locale: next })
  }

  // country_cd(대문자) → currency_cd 맵 (신규 활성화 locale 환율 표시용)
  const countryCurrencyMap = new Map(
    countries.map((c) => [c.country_cd.toUpperCase(), c.currency_cd]),
  )

  // 비활성 목록 필터:
  //  정적 ACTIVE_COUNTRY_CODES + 동적 activeLocales의 alpha2 코드 모두 제외
  const activeCountryCds = new Set(
    activeLocales.map((l) => getAlpha2(l.locale_cd).toUpperCase()),
  )
  const inactiveCountries = countries.filter(
    (c) =>
      !ACTIVE_COUNTRY_CODES.has(c.country_cd.toUpperCase()) &&
      !activeCountryCds.has(c.country_cd.toUpperCase()),
  )

  const currentCountry = getAlpha2(locale)

  return (
    <div className="relative" ref={containerRef}>
      {/* ── 트리거 버튼 ── */}
      <button
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('label')}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors"
      >
        <FlagIcon code={currentCountry} className="text-sm" />
        <span className="text-xs font-medium uppercase">{locale}</span>
        <svg
          className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 4.5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── 드롭다운 ── */}
      {open && (
        <div
          role="listbox"
          aria-label={t('listLabel')}
          // 모바일: 뷰포트 기준 풀폭(fixed inset-x-2)으로 왼쪽 잘림 방지
          // 데스크톱(sm+): 기존 버튼 우측 정렬 드롭다운으로 복귀
          className="border-border bg-background fixed inset-x-2 top-[3.75rem] z-50 mx-auto max-h-[70vh] w-auto max-w-sm overflow-y-auto rounded-lg border shadow-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1 sm:max-h-[440px] sm:w-72 sm:max-w-none"
        >
          {loading ? (
            <div className="text-muted-foreground flex items-center justify-center py-10 text-xs">
              {tc('fetching')}
            </div>
          ) : (
            <>
              {/* ── 활성 언어 섹션 ── */}
              <div className="bg-muted/70 flex items-center gap-1.5 border-b px-3 py-1.5">
                <span className="text-foreground text-[11px] font-semibold">
                  {t('activeLangs')}
                </span>
                <span className="text-muted-foreground ml-auto text-[11px]">
                  {t('activeCount', { count: activeLocales.length })}
                </span>
              </div>

              {activeLocales.map((loc) => {
                const countryCode = getAlpha2(loc.locale_cd)
                const currency =
                  LOCALE_CURRENCY[loc.locale_cd] ??
                  countryCurrencyMap.get(countryCode.toUpperCase())
                const rate = currency ? rates[currency] : undefined
                const isCurrent = loc.locale_cd === locale
                return (
                  <button
                    key={loc.locale_cd}
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => switchLocale(loc.locale_cd)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      isCurrent
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted/60',
                    ].join(' ')}
                  >
                    <FlagIcon
                      code={countryCode}
                      className="w-5 shrink-0 text-sm"
                    />
                    <span className="flex-1 truncate text-xs font-medium">
                      {loc.locale_nm}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                      {currency ? `${currency} ${fmtRate(rate)}` : ''}
                    </span>
                    {isCurrent && (
                      <svg
                        className="text-primary h-3.5 w-3.5 shrink-0"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 7l4 4 6-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                )
              })}

              {/* ── 구분선 · 비활성 국가 ── */}
              <div className="bg-muted/70 flex items-center gap-1.5 border-y px-3 py-1.5">
                <span className="text-muted-foreground text-[11px] font-semibold">
                  {t('allCountries')}
                </span>
                <span className="text-muted-foreground ml-auto text-[11px]">
                  {t('inactiveCount', { count: inactiveCountries.length })}
                </span>
              </div>

              {inactiveCountries.map((c) => {
                const rate = rates[c.currency_cd]
                return (
                  <div
                    key={c.country_cd}
                    className="flex cursor-default items-center gap-2 px-3 py-2 select-none"
                  >
                    {/* 플래그는 선명하게 유지 */}
                    <FlagIcon
                      code={c.country_cd}
                      className="w-5 shrink-0 text-sm"
                    />
                    {/* 이름은 2줄: 영문 + 현지명 */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-muted-foreground truncate text-xs">
                        {c.country_eng_nm}
                      </span>
                      {c.country_mot_nm && (
                        <span className="text-muted-foreground/50 truncate text-[10px] leading-tight">
                          {c.country_mot_nm}
                        </span>
                      )}
                    </div>
                    {/* 통화 + 환율 */}
                    <span className="text-muted-foreground/70 shrink-0 font-mono text-[11px]">
                      {c.currency_cd} {fmtRate(rate)}
                    </span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
