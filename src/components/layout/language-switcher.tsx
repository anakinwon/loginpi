'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'

// locale_cd → alpha-2 국가코드 (fi fi-* CSS 플래그 아이콘용)
const LOCALE_COUNTRY: Record<string, string> = {
  ko: 'kr', en: 'us', zh: 'cn', ja: 'jp', hi: 'in',
  vi: 'vn', af: 'za', fil: 'ph', th: 'th', id: 'id',
  ms: 'my', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', pt: 'pt', ar: 'eg',
}

// locale_cd → 대표 통화코드 (i18n_cntry_mst join 대신 정적 선언)
const LOCALE_CURRENCY: Record<string, string> = {
  ko: 'KRW', en: 'USD', zh: 'CNY', ja: 'JPY', hi: 'INR',
  vi: 'VND', af: 'ZAR', fil: 'PHP', th: 'THB', id: 'IDR',
  ms: 'MYR', es: 'EUR', fr: 'EUR', de: 'EUR', it: 'EUR',
  ru: 'RUB', pt: 'EUR', ar: 'EGP',
}

// 활성 locale에 대응하는 country_cd 집합 (대문자)
const ACTIVE_COUNTRY_CODES = new Set(
  Object.values(LOCALE_COUNTRY).map((c) => c.toUpperCase())
)

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
  if (rate >= 1000) return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1) return rate.toFixed(2)
  return rate.toFixed(4)
}

// flag-icons CSS 아이콘 (fi fi-{alpha2})
function FlagIcon({ code, className = '' }: { code: string; className?: string }) {
  return <span className={`fi fi-${code.toLowerCase()} ${className}`} />
}

// locale_cd → alpha-2 국가 코드 (정적 맵 우선, 없으면 BCP 47 마지막 세그먼트)
function getAlpha2(locale_cd: string): string {
  if (LOCALE_COUNTRY[locale_cd]) return LOCALE_COUNTRY[locale_cd]
  const parts = locale_cd.split('-')
  return parts[parts.length - 1].toLowerCase()
}

export function LanguageSwitcher({ locale }: { locale: string }) {
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
      const cData = (await cRes.json()) as { locales: ActiveLocale[]; countries: Country[] }
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
    else loadedRef.current = false  // 닫을 때 초기화 → 다음 열기 시 최신 데이터 로드
  }

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next })
    setOpen(false)
  }

  // country_cd(대문자) → currency_cd 맵 (신규 활성화 locale 환율 표시용)
  const countryCurrencyMap = new Map(
    countries.map((c) => [c.country_cd.toUpperCase(), c.currency_cd])
  )

  // 비활성 목록 필터:
  //  정적 ACTIVE_COUNTRY_CODES + 동적 activeLocales의 alpha2 코드 모두 제외
  const activeCountryCds = new Set(
    activeLocales.map((l) => getAlpha2(l.locale_cd).toUpperCase())
  )
  const inactiveCountries = countries.filter(
    (c) =>
      !ACTIVE_COUNTRY_CODES.has(c.country_cd.toUpperCase()) &&
      !activeCountryCds.has(c.country_cd.toUpperCase())
  )

  const currentCountry = getAlpha2(locale)

  return (
    <div className='relative' ref={containerRef}>

      {/* ── 트리거 버튼 ── */}
      <button
        onClick={toggle}
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label='언어 선택'
        className='flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
      >
        <FlagIcon code={currentCountry} className='text-sm' />
        <span className='text-xs font-medium uppercase'>{locale}</span>
        <svg
          className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox='0 0 12 12'
          fill='none'
          aria-hidden='true'
        >
          <path d='M2 4.5l4 4 4-4' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
      </button>

      {/* ── 드롭다운 ── */}
      {open && (
        <div
          role='listbox'
          aria-label='언어 목록'
          className='absolute right-0 top-full z-50 mt-1 w-72 max-h-[440px] overflow-y-auto rounded-lg border border-border bg-background shadow-xl'
        >
          {loading ? (
            <div className='flex items-center justify-center py-10 text-xs text-muted-foreground'>
              불러오는 중…
            </div>
          ) : (
            <>
              {/* ── 활성 언어 섹션 ── */}
              <div className='flex items-center gap-1.5 border-b bg-muted/70 px-3 py-1.5'>
                <span className='text-[11px] font-semibold text-foreground'>활성 언어</span>
                <span className='ml-auto text-[11px] text-muted-foreground'>{activeLocales.length}개</span>
              </div>

              {activeLocales.map((loc) => {
                const countryCode = getAlpha2(loc.locale_cd)
                const currency = LOCALE_CURRENCY[loc.locale_cd] ?? countryCurrencyMap.get(countryCode.toUpperCase())
                const rate = currency ? rates[currency] : undefined
                const isCurrent = loc.locale_cd === locale
                return (
                  <button
                    key={loc.locale_cd}
                    role='option'
                    aria-selected={isCurrent}
                    onClick={() => switchLocale(loc.locale_cd)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      isCurrent
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted/60',
                    ].join(' ')}
                  >
                    <FlagIcon code={countryCode} className='w-5 shrink-0 text-sm' />
                    <span className='flex-1 truncate text-xs font-medium'>{loc.locale_nm}</span>
                    <span className='shrink-0 font-mono text-[11px] text-muted-foreground'>
                      {currency ? `${currency} ${fmtRate(rate)}` : ''}
                    </span>
                    {isCurrent && (
                      <svg className='h-3.5 w-3.5 shrink-0 text-primary' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
                        <path d='M2 7l4 4 6-6' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                      </svg>
                    )}
                  </button>
                )
              })}

              {/* ── 구분선 · 비활성 국가 ── */}
              <div className='flex items-center gap-1.5 border-y bg-muted/70 px-3 py-1.5'>
                <span className='text-[11px] font-semibold text-muted-foreground'>전체 국가</span>
                <span className='ml-auto text-[11px] text-muted-foreground'>{inactiveCountries.length}개 · 비활성</span>
              </div>

              {inactiveCountries.map((c) => {
                const rate = rates[c.currency_cd]
                return (
                  <div
                    key={c.country_cd}
                    className='flex cursor-default select-none items-center gap-2 px-3 py-2'
                  >
                    {/* 플래그는 선명하게 유지 */}
                    <FlagIcon code={c.country_cd} className='w-5 shrink-0 text-sm' />
                    {/* 이름은 2줄: 영문 + 현지명 */}
                    <div className='flex min-w-0 flex-1 flex-col'>
                      <span className='truncate text-xs text-muted-foreground'>
                        {c.country_eng_nm}
                      </span>
                      {c.country_mot_nm && (
                        <span className='truncate text-[10px] leading-tight text-muted-foreground/50'>
                          {c.country_mot_nm}
                        </span>
                      )}
                    </div>
                    {/* 통화 + 환율 */}
                    <span className='shrink-0 font-mono text-[11px] text-muted-foreground/70'>
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
