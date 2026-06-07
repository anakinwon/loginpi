'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { routing } from '@/i18n/routing'

// routing.ts에 등록된 locale 집합 — 미등록 locale은 영어로 폴백 서비스됨
const ROUTING_LOCALES = new Set<string>(routing.locales)

// locale_cd → alpha-2 국가코드 (fi fi-* CSS 플래그용)
const LOCALE_COUNTRY: Record<string, string> = {
  ko: 'kr', en: 'us', zh: 'cn', ja: 'jp', hi: 'in',
  vi: 'vn', af: 'za', fil: 'ph', th: 'th', id: 'id',
  ms: 'my', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', pt: 'pt', ar: 'eg',
  au: 'au',  // 호주: 영어권이지만 AUD 통화 분리를 위해 별도 locale
}

// locale_cd → 대표 통화코드
const LOCALE_CURRENCY: Record<string, string> = {
  ko: 'KRW', en: 'USD', zh: 'CNY', ja: 'JPY', hi: 'INR',
  vi: 'VND', af: 'ZAR', fil: 'PHP', th: 'THB', id: 'IDR',
  ms: 'MYR', es: 'EUR', fr: 'EUR', de: 'EUR', it: 'EUR',
  ru: 'RUB', pt: 'EUR', ar: 'EGP',
  au: 'AUD',
}

// 활성 locale에 대응하는 대문자 country_cd 집합
const ACTIVE_COUNTRY_CODES = new Set(
  Object.values(LOCALE_COUNTRY).map((c) => c.toUpperCase())
)

function fmtRate(rate: number | undefined): string {
  if (!rate) return '—'
  if (rate >= 1000) return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1) return rate.toFixed(2)
  return rate.toFixed(4)
}

function FlagIcon({ code, className = '' }: { code: string; className?: string }) {
  return <span className={`fi fi-${code.toLowerCase()} ${className}`} />
}

// locale_cd → alpha-2 국가 코드 변환 (fi fi-* CSS 클래스용)
// 정적 맵 우선, 없으면 BCP 47 마지막 세그먼트 추출 ("af-AF" → "af")
function getAlpha2(locale_cd: string): string {
  if (LOCALE_COUNTRY[locale_cd]) return LOCALE_COUNTRY[locale_cd]
  const parts = locale_cd.split('-')
  return parts[parts.length - 1].toLowerCase()
}

interface LocaleStat {
  locale_cd: string
  locale_nm: string
  flag_emoji: string
  translated: number
  total: number
  pct: number
}

interface StatsData {
  locales: LocaleStat[]
  totalKeys: number
  completed: number
}

interface Country {
  country_cd: string
  dis_ord_seq: number
  country_eng_nm: string
  country_mot_nm: string
  currency_cd: string
  locale_cd: string | null
}

export default function I18nPage() {
  const t = useTranslations('admin.i18n')
  const tc = useTranslations('common')

  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [translating, setTranslating] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  // 낙관적 업데이트: API 성공 즉시 비활성 목록에서 제거할 country_cd 집합
  const [activatedCountryCds, setActivatedCountryCds] = useState<Set<string>>(new Set())

  const [rates, setRates] = useState<Record<string, number>>({})
  const [piUsd, setPiUsd] = useState<number | null>(null)
  const [countries, setCountries] = useState<Country[]>([])
  const [ratesLoading, setRatesLoading] = useState(true)

  const loadStats = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/i18n/stats')
      .then((r) => r.json())
      .then((d: StatsData) => setStats(d))
      .finally(() => setLoading(false))
  }, [])

  const loadCountries = useCallback(() => {
    fetch('/api/i18n/countries')
      .then((r) => r.json())
      .then((d: { countries: Country[] }) => setCountries(d.countries ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    setRatesLoading(true)
    Promise.all([
      fetch('/api/exchange-rates').then((r) => r.json()),
      fetch('/api/pi-price').then((r) => r.json()),
      fetch('/api/i18n/countries').then((r) => r.json()),
    ])
      .then(([rateData, piData, cData]) => {
        setRates((rateData as { rates: Record<string, number> }).rates ?? {})
        setPiUsd((piData as { usd: number | null }).usd ?? null)
        setCountries((cData as { countries: Country[] }).countries ?? [])
      })
      .catch(() => {})
      .finally(() => setRatesLoading(false))
  }, [loadStats])

  // ── 번역 + 동기화 ──────────────────────────────────
  async function translateAndSync(locale: string) {
    const locStat = stats?.locales.find((l) => l.locale_cd === locale)
    const pendingKeys = locStat ? locStat.total - locStat.translated : (stats?.totalKeys ?? 0)
    setTranslating(locale)
    const toastId = toast.loading(
      `${locale.toUpperCase()} ${t('translating')} (${pendingKeys}개 키, 최대 2분 소요)`
    )
    try {
      const res = await fetch('/api/admin/i18n/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const d = (await res.json()) as { translated?: number; error?: string; message?: string }
      if (!res.ok) throw new Error(d.error ?? t('translateFail'))
      if (d.message) toast.info(d.message, { id: toastId })
      else toast.success(t('translateSuccess', { count: d.translated ?? 0 }), { id: toastId })

      setSyncing(locale)
      const syncRes = await fetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      if (syncRes.ok) toast.success(`${locale.toUpperCase()} JSON ${t('syncSuccess', { count: 1 })}`)
      loadStats()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'), { id: toastId })
    } finally {
      setTranslating(null)
      setSyncing(null)
    }
  }

  // ── 전체 동기화 ────────────────────────────────────
  async function syncAll() {
    setSyncing('all')
    try {
      const res = await fetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = (await res.json()) as { synced: string[]; skipped: string[]; errors: string[] }
      if (d.errors.length > 0) toast.error(`${tc('error')}: ${d.errors.join(', ')}`)
      if (d.synced.length > 0) toast.success(t('syncSuccess', { count: d.synced.length }))
      else if (d.errors.length === 0) toast.info(t('syncNoData'))
      loadStats()
    } catch {
      toast.error(t('syncFail'))
    } finally {
      setSyncing(null)
    }
  }

  // ── 활성 / 비활성 토글 ─────────────────────────────
  async function toggleLocale(
    locale_cd: string,
    is_active: 'Y' | 'N',
    options?: { locale_nm?: string; country_cd?: string }
  ) {
    setToggling(locale_cd)
    try {
      const res = await fetch('/api/admin/i18n/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale_cd, is_active, ...options }),
      })
      const d = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(d.error ?? '상태 변경 실패')

      if (is_active === 'Y') {
        toast.success(`${locale_cd} 활성화됨`, {
          description: 'i18n/routing.ts의 locales 배열에 추가 후 재배포 필요. 그 전까지 영어(EN)로 폴백 서비스됩니다.',
          duration: 6000,
        })
        // 비활성 목록에서 즉시 제거 (낙관적 업데이트)
        if (options?.country_cd) {
          setActivatedCountryCds((prev) => new Set([...prev, options.country_cd!.toUpperCase()]))
        }
      } else {
        toast.success(`${locale_cd} 비활성화됨`)
      }
      // 활성·비활성 목록 모두 갱신
      loadStats()
      loadCountries()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setToggling(null)
    }
  }

  // 활성 locale_cd 집합 (비활성 목록에서 중복 제거용)
  const activeLocaleCds = new Set(stats?.locales.map((l) => l.locale_cd) ?? [])

  // 활성 locale의 alpha-2 country 코드 집합
  // i18n_cntry_mst.locale_cd가 null이어도 역방향으로 국가를 식별할 수 있음
  const activeAlpha2Codes = new Set(
    (stats?.locales ?? []).map((l) => getAlpha2(l.locale_cd).toUpperCase())
  )

  // country_cd(대문자) → currency_cd 맵 (신규 활성화 locale 환율·시세 표시용)
  const countryCurrencyMap = new Map(
    countries.map((c) => [c.country_cd.toUpperCase(), c.currency_cd])
  )

  // 비활성 국가 필터 (4중 조건):
  //  ① 정적 ACTIVE_COUNTRY_CODES(원래 18개)에 없고
  //  ② 동적 activeLocaleCds에도 없고
  //  ③ 활성 locale의 alpha-2 코드에도 없고  ← null locale_cd 국가 처리
  //  ④ 방금 낙관적으로 활성화한 country_cd도 아닌 항목
  const inactiveCountries = countries.filter(
    (c) =>
      !ACTIVE_COUNTRY_CODES.has(c.country_cd.toUpperCase()) &&
      !(c.locale_cd && activeLocaleCds.has(c.locale_cd)) &&
      !activeAlpha2Codes.has(c.country_cd.toUpperCase()) &&
      !activatedCountryCds.has(c.country_cd.toUpperCase())
  )

  return (
    <div className='space-y-6'>

      {/* ── 헤더 ── */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>{t('title')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{t('desc')}</p>
        </div>
        <div className='flex items-center gap-2'>
          {piUsd !== null && (
            <div className='flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm'>
              <span className='font-serif italic'>π</span>
              <span className='tabular-nums font-semibold'>{piUsd.toFixed(4)}</span>
              <span className='text-xs text-muted-foreground'>USDT</span>
            </div>
          )}
          <Button variant='outline' size='sm' disabled={syncing === 'all'} onClick={syncAll}>
            {syncing === 'all' ? t('syncing') : t('syncAll')}
          </Button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      {stats && (
        <div className='grid grid-cols-4 gap-4'>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>{t('stats.supportedLocales')}</p>
            <p className='mt-1 text-3xl font-bold'>{stats.locales.length}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>{t('stats.totalKeys')}</p>
            <p className='mt-1 text-3xl font-bold'>{stats.totalKeys}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>{t('stats.completed')}</p>
            <p className='mt-1 text-3xl font-bold'>{stats.completed}</p>
            <p className='text-muted-foreground text-xs'>{t('stats.completedOf', { count: stats.locales.length })}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>비활성 국가</p>
            <p className='mt-1 text-3xl font-bold'>{ratesLoading ? '…' : inactiveCountries.length}</p>
            <p className='text-muted-foreground text-xs'>지원 예정</p>
          </div>
        </div>
      )}

      {/* ── 활성 언어 테이블 ── */}
      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : (
        <div className='overflow-hidden rounded-lg border'>
          <div className='flex items-center justify-between border-b bg-muted/50 px-4 py-2'>
            <span className='text-sm font-semibold'>활성 언어</span>
            <span className='text-xs text-muted-foreground'>{stats?.locales.length}개</span>
          </div>
          <table className='w-full text-sm'>
            <thead className='border-b bg-muted/30'>
              <tr>
                {/* 1. 언어 */}
                <th className='px-4 py-2 text-left font-medium'>{t('col.language')}</th>
                {/* 2. 1 USD = */}
                <th className='px-4 py-2 text-right font-medium text-muted-foreground'>1 USD =</th>
                {/* 3. π 시세 */}
                <th className='px-4 py-2 text-right font-medium'>
                  <span className='font-serif italic'>π</span> 시세
                </th>
                {/* 4. 활성/비활성 토글 */}
                <th className='px-4 py-2 text-center font-medium'>활성/비활성</th>
                {/* 5. 번역 키 */}
                <th className='px-4 py-2 text-right font-medium'>{t('col.translatedKeys')}</th>
                {/* 6. 번역 + 동기화 */}
                <th className='px-4 py-2' />
                {/* 7. 진행률 */}
                <th className='px-4 py-2 text-left font-medium'>{t('col.progress')}</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {(stats?.locales ?? []).map((loc) => {
                const countryCode = getAlpha2(loc.locale_cd)
                // 신규 활성화 locale은 LOCALE_CURRENCY에 없으므로 countryCurrencyMap으로 폴백
                const currency = LOCALE_CURRENCY[loc.locale_cd] ?? countryCurrencyMap.get(countryCode.toUpperCase())
                const rate = currency ? rates[currency] : undefined
                const piPrice = piUsd !== null && rate ? piUsd * rate : undefined
                const isToggling = toggling === loc.locale_cd
                return (
                  <tr key={loc.locale_cd} className='hover:bg-muted/20'>

                    {/* 1. 언어 */}
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        <FlagIcon code={countryCode} className='text-xl' />
                        <div>
                          <p className='font-medium'>{loc.locale_nm}</p>
                          <p className='text-muted-foreground text-xs uppercase'>{loc.locale_cd}</p>
                          {!ROUTING_LOCALES.has(loc.locale_cd) && (
                            <span
                              title='i18n/routing.ts의 locales 배열에 추가 후 재배포 필요. 현재는 영어(EN)로 폴백 서비스됩니다.'
                              className='inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400'
                            >
                              ⚠ 라우팅 미등록
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. 환율 */}
                    <td className='px-4 py-3 text-right'>
                      {rate ? (
                        <span className='font-mono text-xs tabular-nums'>
                          {fmtRate(rate)}{' '}
                          <span className='text-muted-foreground'>{currency}</span>
                        </span>
                      ) : <span className='text-muted-foreground text-xs'>—</span>}
                    </td>

                    {/* 3. π 시세 */}
                    <td className='px-4 py-3 text-right'>
                      {piPrice ? (
                        <span className='font-mono text-xs tabular-nums'>
                          <span className='font-serif italic'>π</span>{' '}
                          {fmtRate(piPrice)}{' '}
                          <span className='text-muted-foreground'>{currency}</span>
                        </span>
                      ) : <span className='text-muted-foreground text-xs'>—</span>}
                    </td>

                    {/* 4. 활성/비활성 토글 */}
                    <td className='px-4 py-3 text-center'>
                      {loc.locale_cd === 'ko' ? (
                        <span className='inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'>
                          기본
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleLocale(loc.locale_cd, 'N')}
                          disabled={isToggling}
                          className='inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                          title='클릭하여 비활성화'
                        >
                          <span className='h-1.5 w-1.5 rounded-full bg-current' />
                          {isToggling ? '처리 중…' : '활성'}
                        </button>
                      )}
                    </td>

                    {/* 5. 번역 키 */}
                    <td className='px-4 py-3 text-right text-xs tabular-nums text-muted-foreground'>
                      {loc.translated} / {loc.total}
                    </td>

                    {/* 6. 번역 + 동기화 (100% 완료 시 비활성) */}
                    <td className='px-4 py-3'>
                      {loc.locale_cd !== 'ko' && (
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-7 text-xs'
                          disabled={!!translating || !!syncing || loc.pct === 100}
                          onClick={() => translateAndSync(loc.locale_cd)}
                        >
                          {translating === loc.locale_cd
                            ? t('translating')
                            : syncing === loc.locale_cd
                              ? t('syncingLocale')
                              : loc.pct === 100
                                ? '완료'
                                : t('translate')}
                        </Button>
                      )}
                    </td>

                    {/* 7. 진행률 */}
                    <td className='w-36 px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        <div className='bg-muted h-2 flex-1 overflow-hidden rounded-full'>
                          <div
                            className={`h-2 rounded-full transition-all ${loc.pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
                            style={{ width: `${loc.pct}%` }}
                          />
                        </div>
                        <span className='w-9 text-right text-xs tabular-nums'>{loc.pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 비활성 국가 테이블 ── */}
      <div className='overflow-hidden rounded-lg border'>
        <div className='flex items-center justify-between border-b bg-muted/50 px-4 py-2'>
          <span className='text-sm font-semibold text-muted-foreground'>전체 국가 (비활성)</span>
          <span className='text-xs text-muted-foreground'>
            {ratesLoading ? '…' : `${inactiveCountries.length}개`}
          </span>
        </div>

        <div className='max-h-96 overflow-y-auto'>
          <table className='w-full text-sm'>
            <thead className='sticky top-0 z-10 border-b bg-muted/80 backdrop-blur-sm'>
              <tr>
                {/* 1. 언어 */}
                <th className='px-4 py-2 text-left text-xs font-medium text-muted-foreground'>국가</th>
                {/* 2. 1 USD = */}
                <th className='px-4 py-2 text-right text-xs font-medium text-muted-foreground'>1 USD =</th>
                {/* 3. π 시세 */}
                <th className='px-4 py-2 text-right text-xs font-medium text-muted-foreground'>
                  <span className='font-serif italic'>π</span> 시세
                </th>
                {/* 4. 활성화 버튼 */}
                <th className='px-4 py-2 text-center text-xs font-medium text-muted-foreground'>활성화</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {ratesLoading ? (
                <tr>
                  <td colSpan={4} className='px-4 py-8 text-center text-xs text-muted-foreground'>
                    환율 · 시세 불러오는 중…
                  </td>
                </tr>
              ) : (
                inactiveCountries.map((c) => {
                  const rate = rates[c.currency_cd]
                  const piPrice = piUsd !== null && rate ? piUsd * rate : undefined
                  const isToggling = toggling === c.locale_cd
                  // locale_cd 없는 국가: country_cd 기반으로 고유 locale_cd 파생
                  // (이미 활성인 코드와 충돌 시 "xx-XX" 형식으로 보완)
                  const derivedLocale = c.locale_cd ?? (
                    activeLocaleCds.has(c.country_cd.toLowerCase())
                      ? `${c.country_cd.toLowerCase()}-${c.country_cd.toUpperCase()}`
                      : c.country_cd.toLowerCase()
                  )
                  const canActivate = !activeLocaleCds.has(derivedLocale)
                  return (
                    <tr key={c.country_cd} className='hover:bg-muted/10'>

                      {/* 1. 국가 */}
                      <td className='px-4 py-2'>
                        <div className='flex items-center gap-2'>
                          <FlagIcon code={c.country_cd} className='text-base' />
                          <div className='min-w-0'>
                            <p className='text-xs text-foreground/80'>{c.country_eng_nm}</p>
                            {c.country_mot_nm && (
                              <p className='max-w-[200px] truncate text-[10px] leading-tight text-muted-foreground/60'>
                                {c.country_mot_nm}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. 환율 */}
                      <td className='px-4 py-2 text-right font-mono text-xs text-muted-foreground'>
                        {rate ? (
                          <>{fmtRate(rate)} <span className='text-muted-foreground/60'>{c.currency_cd}</span></>
                        ) : '—'}
                      </td>

                      {/* 3. π 시세 */}
                      <td className='px-4 py-2 text-right font-mono text-xs text-muted-foreground'>
                        {piPrice ? (
                          <><span className='font-serif italic'>π</span> {fmtRate(piPrice)}</>
                        ) : '—'}
                      </td>

                      {/* 4. 활성화 버튼 */}
                      <td className='px-4 py-2 text-center'>
                        {canActivate ? (
                          <button
                            onClick={() =>
                              toggleLocale(derivedLocale, 'Y', {
                                locale_nm: c.country_eng_nm,
                                country_cd: c.country_cd,
                              })
                            }
                            disabled={isToggling}
                            className='inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40'
                            title={`${derivedLocale} 활성화`}
                          >
                            {isToggling ? (
                              <>
                                <svg className='h-3 w-3 animate-spin' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                                  <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                                  <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
                                </svg>
                                처리 중…
                              </>
                            ) : (
                              <>
                                <svg className='h-3 w-3' viewBox='0 0 12 12' fill='none' aria-hidden='true'>
                                  <path d='M6 1v10M1 6l5-5 5 5' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                                </svg>
                                활성화
                              </>
                            )}
                          </button>
                        ) : (
                          <span className='text-[11px] text-muted-foreground/40'>이미 활성</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className='text-muted-foreground text-xs'>
        {t('footnote1')}
        <br />
        {t('footnote2')}
      </p>
    </div>
  )
}
