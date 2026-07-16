'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { routing } from '@/i18n/routing'
import { LOCALE_CURRENCY } from '@/lib/locale-currency'
import {
  LOCALE_COUNTRY,
  ACTIVE_COUNTRY_CODES,
  getAlpha2,
} from '@/lib/locale-country'
import { useApiMessage } from '@/hooks/use-api-error'
import { piFetch } from '@/lib/pi-fetch'

// routing.ts에 등록된 locale 집합 — 미등록 locale은 영어로 폴백 서비스됨
const ROUTING_LOCALES = new Set<string>(routing.locales)

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
  const ta = useTranslations('adminI18n')
  const resolveMsg = useApiMessage()

  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [translating, setTranslating] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  // 전체 자동 번역(순차) 상태 + 중단 플래그
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoProgress, setAutoProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const autoAbortRef = useRef(false)
  // 낙관적 업데이트: API 성공 즉시 비활성 목록에서 제거할 country_cd 집합
  const [activatedCountryCds, setActivatedCountryCds] = useState<Set<string>>(
    new Set(),
  )

  const [rates, setRates] = useState<Record<string, number>>({})
  const [piUsd, setPiUsd] = useState<number | null>(null)
  const [countries, setCountries] = useState<Country[]>([])
  const [ratesLoading, setRatesLoading] = useState(true)

  const loadStats = useCallback(() => {
    setLoading(true)
    piFetch('/api/admin/i18n/stats')
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
  // 자동 순차 루프에서도 안전하도록 모든 로직을 try 안에 두어 절대 throw하지 않는다.
  // (try 밖에서 throw하면 호출부 루프가 중단되어 다음 언어로 진행되지 않는다)
  async function translateAndSync(locale: string) {
    setTranslating(locale)
    let toastId: string | number | undefined
    try {
      const locStat = stats?.locales.find((l) => l.locale_cd === locale)
      const pendingKeys = locStat
        ? locStat.total - locStat.translated
        : (stats?.totalKeys ?? 0)
      // 소요시간 동적 산정 — 서버는 50개 키를 1회 Gemini 호출(배치)로 번역하고,
      // 배치 사이에만 4.5초 rate limit 대기(Gemini 무료 15 RPM). 키당 처리가 아님.
      // ETA = 배치당 처리 ~8초 + 배치 간 대기 4.5초 × (배치수-1)
      const batches = Math.max(Math.ceil(pendingKeys / 50), 1)
      const etaSec = Math.ceil(batches * 8 + (batches - 1) * 4.5)
      const etaText =
        etaSec >= 60
          ? ta('etaMin', { min: Math.ceil(etaSec / 60) })
          : ta('etaSec', { sec: etaSec })
      toastId = toast.loading(
        ta('translatingEta', {
          locale: locale.toUpperCase(),
          keys: pendingKeys,
          batches,
          eta: etaText,
        }),
      )
      const res = await piFetch('/api/admin/i18n/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const d = (await res.json()) as {
        translated?: number
        error?: string
        message?: string
        msgCode?: string
        params?: Record<string, string | number>
      }
      if (!res.ok) throw new Error(d.error ?? t('translateFail'))
      if (d.message) toast.info(resolveMsg(d, d.message), { id: toastId })
      else
        toast.success(t('translateSuccess', { count: d.translated ?? 0 }), {
          id: toastId,
        })

      setSyncing(locale)
      const syncRes = await piFetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      if (syncRes.ok)
        toast.success(
          `${locale.toUpperCase()} JSON ${t('syncSuccess', { count: 1 })}`,
        )
      loadStats()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tc('error'),
        toastId ? { id: toastId } : undefined,
      )
    } finally {
      setTranslating(null)
      setSyncing(null)
    }
  }

  // ── 전체 자동 번역 (미완료 locale 순차 처리) ─────────
  // 한 번 클릭으로 미완료 언어를 처음부터 끝까지 자동 순차 처리.
  // translateAndSync는 내부에서 에러를 toast로 처리하고 throw하지 않으므로,
  // 한 언어가 실패해도 루프가 멈추지 않고 다음 언어로 계속 진행한다.
  async function translateAndSyncAll() {
    const targets = (stats?.locales ?? []).filter(
      (l) => l.locale_cd !== 'ko' && l.pct < 100,
    )
    if (targets.length === 0) {
      toast.info(ta('autoNoPending'))
      return
    }
    const total = targets.length
    autoAbortRef.current = false
    setAutoRunning(true)
    setAutoProgress({ current: 0, total })
    try {
      // 서버 백그라운드로 시작 — 페이지를 떠나거나 브라우저를 닫아도
      // 서버(로컬 dev)가 after()로 끝까지 translate+sync를 진행한다.
      const res = await piFetch('/api/admin/i18n/translate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locales: targets.map((l) => l.locale_cd) }),
      })
      const d = (await res.json()) as { started?: number; error?: string }
      if (!res.ok) throw new Error(d.error ?? t('translateFail'))
      toast.success(ta('autoBgStarted', { count: d.started ?? total }))
      // 진행률은 별도 폴링으로 표시(서버 작업과 독립). 폴링을 멈춰도 서버는 계속 진행.
      void pollProgress(new Set(targets.map((l) => l.locale_cd)), total)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
      setAutoRunning(false)
      setAutoProgress(null)
    }
  }

  // 백그라운드 진행 폴링 — stats를 주기 조회해 대상 locale의 완료 수로 진행률 표시.
  async function pollProgress(targetCds: Set<string>, total: number) {
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000))
        if (autoAbortRef.current) break
        const fresh = (await piFetch('/api/admin/i18n/stats').then((r) =>
          r.json(),
        )) as StatsData
        setStats(fresh)
        const remaining = (fresh.locales ?? []).filter(
          (l) => targetCds.has(l.locale_cd) && l.pct < 100,
        ).length
        setAutoProgress({ current: total - remaining, total })
        if (remaining === 0) {
          toast.success(ta('autoDone', { count: total }))
          break
        }
      }
    } finally {
      setAutoRunning(false)
      setAutoProgress(null)
      autoAbortRef.current = false
    }
  }

  // 진행 표시 중단 — 폴링만 멈출 뿐 서버 백그라운드 번역은 계속된다.
  function stopAuto() {
    autoAbortRef.current = true
    toast.info(ta('autoStopPolling'))
  }

  // ── 전체 동기화 ────────────────────────────────────
  async function syncAll() {
    setSyncing('all')
    try {
      const res = await piFetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = (await res.json()) as {
        synced: string[]
        skipped: string[]
        errors: string[]
      }
      if (d.errors.length > 0)
        toast.error(`${tc('error')}: ${d.errors.join(', ')}`)
      if (d.synced.length > 0)
        toast.success(t('syncSuccess', { count: d.synced.length }))
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
    options?: { locale_nm?: string; country_cd?: string },
  ) {
    setToggling(locale_cd)
    try {
      const res = await piFetch('/api/admin/i18n/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale_cd, is_active, ...options }),
      })
      const d = (await res.json()) as {
        ok?: boolean
        error?: string
        routingUpdated?: boolean
      }
      if (!res.ok) throw new Error(d.error ?? ta('statusChangeFail'))

      if (is_active === 'Y') {
        if (d.routingUpdated) {
          // 로컬 개발 환경: routing.ts 자동 수정 성공 → 재배포만 하면 즉시 반영
          toast.success(ta('activatedDone', { locale: locale_cd }), {
            description: ta('routingAutoFixed'),
            duration: 5000,
          })
        } else {
          // Vercel 프로덕션 또는 routing.ts에 이미 등록된 경우
          toast.success(ta('activated', { locale: locale_cd }), {
            description: ta('routingAlready'),
            duration: 4000,
          })
        }
        // 비활성 목록에서 즉시 제거 (낙관적 업데이트)
        if (options?.country_cd) {
          setActivatedCountryCds(
            (prev) => new Set([...prev, options.country_cd!.toUpperCase()]),
          )
        }
      } else {
        toast.success(ta('deactivated', { locale: locale_cd }))
      }
      // 활성·비활성 목록 모두 갱신
      loadStats()
      loadCountries()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('errorOccurred'))
    } finally {
      setToggling(null)
    }
  }

  // 활성 locale_cd 집합 (비활성 목록에서 중복 제거용)
  const activeLocaleCds = new Set(stats?.locales.map((l) => l.locale_cd) ?? [])

  // 활성 locale의 alpha-2 country 코드 집합
  // i18n_cntry_mst.locale_cd가 null이어도 역방향으로 국가를 식별할 수 있음
  const activeAlpha2Codes = new Set(
    (stats?.locales ?? []).map((l) => getAlpha2(l.locale_cd).toUpperCase()),
  )

  // country_cd(대문자) → currency_cd 맵 (신규 활성화 locale 환율·시세 표시용)
  const countryCurrencyMap = new Map(
    countries.map((c) => [c.country_cd.toUpperCase(), c.currency_cd]),
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
      !activatedCountryCds.has(c.country_cd.toUpperCase()),
  )

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          {piUsd !== null && (
            <div className="border-border bg-muted/50 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm">
              <span className="font-serif italic">π</span>
              <span className="font-semibold tabular-nums">
                {piUsd.toFixed(4)}
              </span>
              <span className="text-muted-foreground text-xs">USDT</span>
            </div>
          )}
          {autoRunning ? (
            <>
              {autoProgress && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {ta('autoProgress', {
                    current: autoProgress.current,
                    total: autoProgress.total,
                  })}
                </span>
              )}
              <Button variant="destructive" size="sm" onClick={stopAuto}>
                {ta('autoStop')}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!!translating || !!syncing}
              onClick={translateAndSyncAll}
            >
              {ta('autoAll')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={syncing === 'all' || autoRunning}
            onClick={syncAll}
          >
            {syncing === 'all' ? t('syncing') : t('syncAll')}
          </Button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium">
              {t('stats.supportedLocales')}
            </p>
            <p className="mt-1 text-3xl font-bold">{stats.locales.length}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium">
              {t('stats.totalKeys')}
            </p>
            <p className="mt-1 text-3xl font-bold">{stats.totalKeys}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium">
              {t('stats.completed')}
            </p>
            <p className="mt-1 text-3xl font-bold">{stats.completed}</p>
            <p className="text-muted-foreground text-xs">
              {t('stats.completedOf', { count: stats.locales.length })}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium">
              {ta('inactiveCountries')}
            </p>
            <p className="mt-1 text-3xl font-bold">
              {ratesLoading ? '…' : inactiveCountries.length}
            </p>
            <p className="text-muted-foreground text-xs">{ta('planned')}</p>
          </div>
        </div>
      )}

      {/* ── 활성 언어 테이블 ── */}
      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="bg-muted/50 flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">{ta('activeLangs')}</span>
            <span className="text-muted-foreground text-xs">
              {ta('countItems', { count: stats?.locales.length ?? 0 })}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                {/* 1. 언어 */}
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.language')}
                </th>
                {/* 2. 1 USD = */}
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  1 USD =
                </th>
                {/* 3. π 시세 */}
                <th className="px-4 py-2 text-right font-medium">
                  <span className="font-serif italic">π</span> {ta('price')}
                </th>
                {/* 4. 활성/비활성 토글 */}
                <th className="px-4 py-2 text-center font-medium">
                  {ta('activeToggle')}
                </th>
                {/* 5. 번역 키 */}
                <th className="px-4 py-2 text-right font-medium">
                  {t('col.translatedKeys')}
                </th>
                {/* 6. 번역 + 동기화 */}
                <th className="px-4 py-2" />
                {/* 7. 진행률 */}
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.progress')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(stats?.locales ?? []).map((loc) => {
                const countryCode = getAlpha2(loc.locale_cd)
                // 신규 활성화 locale은 LOCALE_CURRENCY에 없으므로 countryCurrencyMap으로 폴백
                const currency =
                  LOCALE_CURRENCY[loc.locale_cd] ??
                  countryCurrencyMap.get(countryCode.toUpperCase())
                const rate = currency ? rates[currency] : undefined
                const piPrice =
                  piUsd !== null && rate ? piUsd * rate : undefined
                const isToggling = toggling === loc.locale_cd
                return (
                  <tr key={loc.locale_cd} className="hover:bg-muted/20">
                    {/* 1. 언어 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FlagIcon code={countryCode} className="text-xl" />
                        <div>
                          <p className="font-medium">{loc.locale_nm}</p>
                          <p className="text-muted-foreground text-xs uppercase">
                            {loc.locale_cd}
                          </p>
                          {!ROUTING_LOCALES.has(loc.locale_cd) && (
                            <span
                              title={[
                                `'${loc.locale_cd}'이 src/i18n/routing.ts에 없습니다.`,
                                '',
                                '해결 방법:',
                                `  src/i18n/routing.ts의 locales 배열에 '${loc.locale_cd}' 추가 후 재배포`,
                                '',
                                '※ 주요 국가 코드는 routing.ts에 선점 등록되어 있으므로',
                                '  이 메시지는 매우 희귀한 경우에만 표시됩니다.',
                              ].join('\n')}
                              className="inline-flex cursor-help items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                            >
                              {ta('routingMissing')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. 환율 */}
                    <td className="px-4 py-3 text-right">
                      {rate ? (
                        <span className="font-mono text-xs tabular-nums">
                          {fmtRate(rate)}{' '}
                          <span className="text-muted-foreground">
                            {currency}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* 3. π 시세 */}
                    <td className="px-4 py-3 text-right">
                      {piPrice ? (
                        <span className="font-mono text-xs tabular-nums">
                          <span className="font-serif italic">π</span>{' '}
                          {fmtRate(piPrice)}{' '}
                          <span className="text-muted-foreground">
                            {currency}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* 4. 활성/비활성 토글 */}
                    <td className="px-4 py-3 text-center">
                      {loc.locale_cd === 'ko' ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {ta('default')}
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleLocale(loc.locale_cd, 'N')}
                          disabled={isToggling}
                          className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                          title={ta('clickToDeactivate')}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {isToggling ? ta('processing') : ta('active')}
                        </button>
                      )}
                    </td>

                    {/* 5. 번역 키 */}
                    <td className="text-muted-foreground px-4 py-3 text-right text-xs tabular-nums">
                      {loc.translated} / {loc.total}
                    </td>

                    {/* 6. 번역 + 동기화 (100% 완료 시 비활성) */}
                    <td className="px-4 py-3">
                      {loc.locale_cd !== 'ko' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={
                            !!translating ||
                            !!syncing ||
                            autoRunning ||
                            loc.pct === 100
                          }
                          onClick={() => translateAndSync(loc.locale_cd)}
                        >
                          {translating === loc.locale_cd
                            ? t('translating')
                            : syncing === loc.locale_cd
                              ? t('syncingLocale')
                              : loc.pct === 100
                                ? ta('done')
                                : t('translate')}
                        </Button>
                      )}
                    </td>

                    {/* 7. 진행률 */}
                    <td className="w-36 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                          <div
                            className={`h-2 rounded-full transition-all ${loc.pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
                            style={{ width: `${loc.pct}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums">
                          {loc.pct}%
                        </span>
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
      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/50 flex items-center justify-between border-b px-4 py-2">
          <span className="text-muted-foreground text-sm font-semibold">
            {ta('allCountriesInactive')}
          </span>
          <span className="text-muted-foreground text-xs">
            {ratesLoading
              ? '…'
              : ta('countItems', { count: inactiveCountries.length })}
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/80 sticky top-0 z-10 border-b backdrop-blur-sm">
              <tr>
                {/* 1. 언어 */}
                <th className="text-muted-foreground px-4 py-2 text-left text-xs font-medium">
                  {ta('country')}
                </th>
                {/* 2. 1 USD = */}
                <th className="text-muted-foreground px-4 py-2 text-right text-xs font-medium">
                  1 USD =
                </th>
                {/* 3. π 시세 */}
                <th className="text-muted-foreground px-4 py-2 text-right text-xs font-medium">
                  <span className="font-serif italic">π</span> {ta('price')}
                </th>
                {/* 4. 활성화 버튼 */}
                <th className="text-muted-foreground px-4 py-2 text-center text-xs font-medium">
                  {ta('activate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ratesLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-muted-foreground px-4 py-8 text-center text-xs"
                  >
                    {ta('priceLoading')}
                  </td>
                </tr>
              ) : (
                inactiveCountries.map((c) => {
                  const rate = rates[c.currency_cd]
                  const piPrice =
                    piUsd !== null && rate ? piUsd * rate : undefined
                  // locale_cd 없는 국가: country_cd 기반으로 고유 locale_cd 파생
                  // (이미 활성인 코드와 충돌 시 "xx-XX" 형식으로 보완)
                  const derivedLocale =
                    c.locale_cd ??
                    (activeLocaleCds.has(c.country_cd.toLowerCase())
                      ? `${c.country_cd.toLowerCase()}-${c.country_cd.toUpperCase()}`
                      : c.country_cd.toLowerCase())
                  // 토글 진행 판정은 실제 토글 키(derivedLocale) 기준으로 한다.
                  // c.locale_cd(null 가능) 기준이면 toggling 초기값 null과 null===null이
                  // 성립해 locale_cd 없는 국가가 항상 "처리 중…"으로 오표시되는 버그가 생긴다.
                  const isToggling = toggling === derivedLocale
                  const canActivate = !activeLocaleCds.has(derivedLocale)
                  return (
                    <tr key={c.country_cd} className="hover:bg-muted/10">
                      {/* 1. 국가 */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <FlagIcon code={c.country_cd} className="text-base" />
                          <div className="min-w-0">
                            <p className="text-foreground/80 text-xs">
                              {c.country_eng_nm}
                            </p>
                            {c.country_mot_nm && (
                              <p className="text-muted-foreground/60 max-w-[200px] truncate text-[10px] leading-tight">
                                {c.country_mot_nm}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. 환율 */}
                      <td className="text-muted-foreground px-4 py-2 text-right font-mono text-xs">
                        {rate ? (
                          <>
                            {fmtRate(rate)}{' '}
                            <span className="text-muted-foreground/60">
                              {c.currency_cd}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* 3. π 시세 */}
                      <td className="text-muted-foreground px-4 py-2 text-right font-mono text-xs">
                        {piPrice ? (
                          <>
                            <span className="font-serif italic">π</span>{' '}
                            {fmtRate(piPrice)}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* 4. 활성화 버튼 */}
                      <td className="px-4 py-2 text-center">
                        {canActivate ? (
                          <button
                            onClick={() =>
                              toggleLocale(derivedLocale, 'Y', {
                                locale_nm: c.country_eng_nm,
                                country_cd: c.country_cd,
                              })
                            }
                            disabled={isToggling}
                            className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
                            title={ta('activateDerived', {
                              locale: derivedLocale,
                            })}
                          >
                            {isToggling ? (
                              <>
                                <svg
                                  className="h-3 w-3 animate-spin"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                  />
                                </svg>
                                {ta('processing')}
                              </>
                            ) : (
                              <>
                                <svg
                                  className="h-3 w-3"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M6 1v10M1 6l5-5 5 5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                {ta('activate')}
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/40 text-[11px]">
                            {ta('alreadyActive')}
                          </span>
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

      <p className="text-muted-foreground text-xs">
        {t('footnote1')}
        <br />
        {t('footnote2')}
      </p>
    </div>
  )
}
