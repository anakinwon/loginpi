'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LOCALE_CURRENCY } from '@/lib/locale-currency'
import { ACTIVE_COUNTRY_CODES, getAlpha2 } from '@/lib/locale-country'

// 상품 가격 통화 선택 콤보 — 헤더 LanguageSwitcher와 동일한 시각·데이터(국기·통화·환율)를 쓰되,
// 로케일을 전환하지 않고 '이 상품의 통화'만 고르는 controlled 입력. value='PI'면 Pi 직접입력.

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

interface ComboCache {
  locales: ActiveLocale[]
  countries: Country[]
  rates: Record<string, number>
  ts: number
}

// 헤더 콤보와 동일한 저빈도 데이터 — 모듈 메모리 + sessionStorage TTL 캐시(첫 클릭 외 지연 0)
const CACHE_KEY = 'currencyCombo:v1'
const CACHE_TTL = 10 * 60 * 1000 // 10분 (환율 캐시 900s·countries revalidate와 정합)
let memCache: ComboCache | null = null

function readCache(): ComboCache | null {
  const fresh = (c: ComboCache | null) =>
    c && Date.now() - c.ts < CACHE_TTL ? c : null
  if (memCache) return fresh(memCache)
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ComboCache
    memCache = parsed
    return fresh(parsed)
  } catch {
    return null
  }
}
function writeCache(data: Omit<ComboCache, 'ts'>): void {
  const entry: ComboCache = { ...data, ts: Date.now() }
  memCache = entry
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // 용량 초과·차단 환경 → 메모리 캐시만으로 동작
  }
}

// 1 USD 기준 환율 포매팅 (헤더와 동일 규칙)
function fmtRate(rate: number | undefined): string {
  if (!rate) return '—'
  if (rate >= 1000)
    return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1) return rate.toFixed(2)
  return rate.toFixed(4)
}

function FlagIcon({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  return <span className={`fi fi-${code.toLowerCase()} ${className}`} />
}

export function CurrencyCombo({
  value,
  onChange,
}: {
  value: string // 'PI' 또는 통화코드(ISO 4217)
  onChange: (ccy: string) => void
}) {
  const t = useTranslations('langSwitcher')
  const ts = useTranslations('store')
  // 환율 숫자(각국통화 가치평가) 노출 여부 — 헤더 시세칩과 동일 플래그.
  // 운영(cafepi)은 미설정 → 숨김. staging(loginpi)은 'true' → 노출. 통화 '선택'은 항상 유지.
  // Pi 등재 레드라인(A-5) 대응. docs/PRD_23_FUNC_TUNING.md §8.6
  const showRate = process.env.NEXT_PUBLIC_FEATURE_PI_PRICE === 'true'
  const [open, setOpen] = useState(false)
  const [locales, setLocales] = useState<ActiveLocale[]>(
    () => readCache()?.locales ?? [],
  )
  const [countries, setCountries] = useState<Country[]>(
    () => readCache()?.countries ?? [],
  )
  const [rates, setRates] = useState<Record<string, number>>(
    () => readCache()?.rates ?? {},
  )
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(readCache() !== null)

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
    const cached = readCache()
    if (cached) {
      setLocales(cached.locales)
      setCountries(cached.countries)
      setRates(cached.rates)
      loadedRef.current = true
      return
    }
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
      const bundle = {
        locales: cData.locales ?? [],
        countries: cData.countries ?? [],
        rates: rData.rates ?? {},
      }
      setLocales(bundle.locales)
      setCountries(bundle.countries)
      setRates(bundle.rates)
      writeCache(bundle)
      loadedRef.current = true
    } catch {
      // 실패 시 빈 데이터 유지 (Pi 직접입력은 여전히 가능)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    setOpen((prev) => !prev)
    void loadData()
  }

  function pick(ccy: string) {
    setOpen(false)
    onChange(ccy)
  }

  // country_cd(대문자) → currency_cd
  const countryCurrencyMap = new Map(
    countries.map((c) => [c.country_cd.toUpperCase(), c.currency_cd]),
  )
  const activeCountryCds = new Set(
    locales.map((l) => getAlpha2(l.locale_cd).toUpperCase()),
  )
  const inactiveCountries = countries.filter(
    (c) =>
      !ACTIVE_COUNTRY_CODES.has(c.country_cd.toUpperCase()) &&
      !activeCountryCds.has(c.country_cd.toUpperCase()),
  )

  // 트리거 국기 추정 — 활성 로케일(통화 일치) → 비활성 국가 순
  const triggerFlag = (() => {
    if (value === 'PI') return null
    const loc = locales.find(
      (l) =>
        (LOCALE_CURRENCY[l.locale_cd] ??
          countryCurrencyMap.get(getAlpha2(l.locale_cd).toUpperCase())) ===
        value,
    )
    if (loc) return getAlpha2(loc.locale_cd)
    const ctry = countries.find((c) => c.currency_cd === value)
    return ctry ? ctry.country_cd : null
  })()

  return (
    <div className="relative w-28 shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ts('form.priceCcy')}
        className="border-input bg-background hover:bg-muted/60 flex h-9 w-full items-center gap-1 rounded-md border px-2 text-sm transition-colors"
      >
        {value === 'PI' ? (
          <span className="font-serif italic">π</span>
        ) : triggerFlag ? (
          <FlagIcon code={triggerFlag} className="text-sm" />
        ) : null}
        <span className="text-xs font-medium">
          {value === 'PI' ? 'Pi' : value}
        </span>
        <svg
          className={`ml-auto h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
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

      {open && (
        <div
          role="listbox"
          aria-label={t('listLabel')}
          className="border-border bg-background absolute top-full left-0 z-50 mt-1 max-h-[440px] w-72 overflow-y-auto rounded-lg border shadow-xl"
        >
          {/* Pi 직접입력 (환전 없음) */}
          <button
            type="button"
            role="option"
            aria-selected={value === 'PI'}
            onClick={() => pick('PI')}
            className={[
              'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
              value === 'PI'
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/60',
            ].join(' ')}
          >
            <span className="w-5 text-center font-serif italic">π</span>
            <span className="flex-1 truncate text-xs font-medium">
              {ts('form.priceCcyPi')}
            </span>
          </button>

          {loading ? (
            <div className="text-muted-foreground flex items-center justify-center py-10 text-xs">
              …
            </div>
          ) : (
            <>
              {/* 활성 언어 통화 */}
              <div className="bg-muted/70 flex items-center gap-1.5 border-y px-3 py-1.5">
                <span className="text-foreground text-[11px] font-semibold">
                  {t('activeLangs')}
                </span>
                <span className="text-muted-foreground ml-auto text-[11px]">
                  {t('activeCount', { count: locales.length })}
                </span>
              </div>
              {locales.map((loc) => {
                const countryCode = getAlpha2(loc.locale_cd)
                const currency =
                  LOCALE_CURRENCY[loc.locale_cd] ??
                  countryCurrencyMap.get(countryCode.toUpperCase())
                if (!currency) return null
                const rate = rates[currency]
                const selected = currency === value
                return (
                  <button
                    key={loc.locale_cd}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(currency)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      selected
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
                      {currency}
                      {showRate ? ` ${fmtRate(rate)}` : ''}
                    </span>
                  </button>
                )
              })}

              {/* 전체 국가 통화 */}
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
                const selected = c.currency_cd === value
                return (
                  <button
                    key={c.country_cd}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(c.currency_cd)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      selected
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted/60',
                    ].join(' ')}
                  >
                    <FlagIcon
                      code={c.country_cd}
                      className="w-5 shrink-0 text-sm"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs">
                        {c.country_eng_nm}
                      </span>
                      {c.country_mot_nm && (
                        <span className="text-muted-foreground/50 truncate text-[10px] leading-tight">
                          {c.country_mot_nm}
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground/70 shrink-0 font-mono text-[11px]">
                      {c.currency_cd}
                      {showRate ? ` ${fmtRate(rate)}` : ''}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
