'use client'

// 메인 화면 — 상단 바(기간·카테고리·검색·보기 전환) + 요금제 크기 버블 캔버스 ↔ 정렬 표(반응형 페이지네이션) + 범례.
// 데이터는 /api/bubbles 비동기 조회(기간·카테고리 변경 시 재조회, 검색은 받은 목록에서 즉시 필터). 공개 API라 fetch 사용
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { BubbleCanvas, TONE, toneOf } from './bubble-canvas'
import { Pagination } from './pagination'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import {
  BUBBLE_DAYS,
  LIMITS,
  PLAN_AREA, PLAN_COLOR,
  PLAN_BADGE,
  PLAN_CD,
  SITE_CTGR,
  type BubbleItem,
  type BubblePeriod,
  type BubbleResponse,
} from '@/lib/site'

type SortKey = 'size' | 'plan' | 'views' | 'chg'
const PERIODS = Object.keys(BUBBLE_DAYS) as BubblePeriod[]
const LEGEND = PLAN_CD.filter((p) => p !== 'NONE')

const seg = (on: boolean) =>
  `rounded-md px-2.5 py-1 text-sm font-medium ${on ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`

export function BubbleHome() {
  const t = useTranslations('bubble')
  const tp = useTranslations('plan')
  const tc = useTranslations('siteCtgr')
  const locale = useLocale()
  const router = useRouter()
  const errText = useApiErrorText()
  const [period, setPeriod] = useState<BubblePeriod>('day')
  const [ctgr, setCtgr] = useState('')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'bubble' | 'table'>('bubble')
  const [data, setData] = useState<BubbleResponse | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sp = new URLSearchParams({ period })
    if (ctgr) sp.set('ctgr', ctgr)
    const r = await readApi<BubbleResponse>(fetch(`/api/bubbles?${sp}`))
    if (r.ok) setData(r.data)
    else setError(r.body)
    setLoading(false)
  }, [period, ctgr])

  // 비동기 조회 — 렌더를 막지 않고 로딩 상태로 처리
  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    const all = data?.items ?? []
    return s
      ? all.filter(
          (it) => it.domain.includes(s) || it.name.toLowerCase().includes(s),
        )
      : all
  }, [data, q])

  const pctFmt = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'percent',
        signDisplay: 'exceptZero',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [locale],
  )
  const fmtPct = useCallback((c: number) => pctFmt.format(c / 100), [pctFmt])
  const fmtViews = useCallback(
    (it: BubbleItem) => t('views', { count: it.views }),
    [t],
  )
  const planName = useCallback((it: BubbleItem) => tp(it.plan), [tp])
  // 가상 샘플은 상세 페이지가 없으므로 이동 대신 안내(404 방지)
  const open = useCallback(
    (domain: string) => {
      if (!data?.items.some((it) => it.domain === domain && it.sample))
        return router.push(`/s/${domain}`)
      setToast(true)
    },
    [router, data],
  )
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(false), 2500)
    return () => clearTimeout(id)
  }, [toast])
  const hasSample = data?.items.some((it) => it.sample) ?? false

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <div
          role="group"
          aria-label={t('periodLabel')}
          className="flex rounded-lg bg-white/5 p-0.5"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              className={seg(period === p)}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
        <select
          value={ctgr}
          onChange={(e) => setCtgr(e.target.value)}
          aria-label={t('ctgrLabel')}
          className="rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-sm text-white"
        >
          <option value="">{t('ctgrAll')}</option>
          {SITE_CTGR.map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </select>
        {/* 선택한 카테고리 전용 페이지(/c/<ctgr>, 페이지네이션 목록) 진입 */}
        {ctgr && (
          <Link
            href={`/c/${ctgr.toLowerCase()}`}
            className="text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            {t('ctgrPage')} →
          </Link>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={50}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="order-last w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-sm text-white placeholder:text-white/40 sm:order-none sm:w-auto sm:max-w-56 sm:min-w-0 sm:flex-1"
        />
        <div
          role="group"
          aria-label={t('viewLabel')}
          className="ml-auto flex rounded-lg bg-white/5 p-0.5"
        >
          {(['bubble', 'table'] as const).map((v) => (
            <button
              key={v}
              className={seg(view === v)}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(v === 'bubble' ? 'viewBubble' : 'viewTable')}
            </button>
          ))}
        </div>
      </div>

      {(data?.demo || hasSample) && (
        <p className="bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
          {t(data?.demo ? 'demo' : 'sampleNote')}
        </p>
      )}
      {toast && (
        <p
          role="status"
          className="fixed bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-md bg-neutral-800 px-3 py-2 text-sm text-white shadow-lg"
        >
          {t('sampleToast')}
        </p>
      )}

      {error ? (
        <div className="p-4 text-sm text-red-300" role="alert">
          {errText(error)}
          <button className="btn ml-2" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : view === 'bubble' ? (
        <>
          <div
            className="relative h-[calc(100dvh-17rem)] min-h-[380px] sm:h-[calc(100dvh-9rem)]"
            aria-busy={loading}
          >
            {!data ? (
              <p className="p-4 text-sm text-white/60">{t('loading')}</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-white/60">{t('empty')}</p>
            ) : (
              <BubbleCanvas
                items={items}
                label={t('canvasLabel')}
                adLabel={t('ad')}
                ownLabel={t('own')}
                sampleLabel={t('sample')}
                planName={planName}
                fmtPct={fmtPct}
                fmtViews={fmtViews}
                onOpen={open}
              />
            )}
          </div>
          <Legend />
        </>
      ) : (
        <BubbleTable items={items} loading={loading || !data} fmtPct={fmtPct} />
      )}
    </div>
  )
}

// 범례 — 요금제별 버블 크기(면적 비율 그대로 축소). 크기 = 유료 노출이므로 광고 표기 병기
function Legend() {
  const t = useTranslations('bubble')
  const tp = useTranslations('plan')
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/10 px-2 py-2 text-[11px] text-white/70">
      <span className="font-semibold text-white/80">{t('legend')}</span>
      {LEGEND.map((p) => {
        const d = Math.sqrt(PLAN_AREA[p]) * 5
        return (
          <span key={p} className="flex items-center gap-1">
            <span
              className="inline-block rounded-full border border-white/30"
              style={{ width: d, height: d, background: PLAN_COLOR[p] }}
            />
            {tp(p)}
          </span>
        )
      })}
    </div>
  )
}

// 카테고리 페이지(/c/<ctgr>) 진입 링크 9종 — 구 홈 카테고리 그리드 대체(표 보기 상단)
function CtgrLinks() {
  const t = useTranslations('bubble')
  const tc = useTranslations('siteCtgr')
  return (
    <nav aria-label={t('ctgrBrowse')} className="mb-3 flex flex-wrap gap-1.5">
      {SITE_CTGR.map((c) => (
        <Link
          key={c}
          href={`/c/${c.toLowerCase()}`}
          className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/70 hover:border-white/40 hover:text-white"
        >
          {tc(c)}
        </Link>
      ))}
    </nav>
  )
}

const SiteLink = ({
  sample,
  domain,
  children,
}: {
  sample?: boolean
  domain: string
  children: React.ReactNode
}) =>
  sample ? (
    <span className="flex items-center gap-2">{children}</span>
  ) : (
    <Link
      href={`/s/${domain}`}
      className="flex items-center gap-2 hover:underline"
    >
      {children}
    </Link>
  )

// 표 보기 — 버블의 키보드·스크린리더 대안. 크기·요금제·조회수·증감 정렬 + 반응형 페이지네이션(클라이언트 페이지)
function BubbleTable({
  items,
  loading,
  fmtPct,
}: {
  items: BubbleItem[]
  loading: boolean
  fmtPct: (c: number) => string
}) {
  const t = useTranslations('bubble')
  const tp = useTranslations('plan')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: 'size',
    desc: true,
  })
  const [page, setPage] = useState(1)
  const size = LIMITS.pageSize

  const sorted = useMemo(() => {
    const rank = (it: BubbleItem) => PLAN_CD.indexOf(it.plan)
    const val: Record<SortKey, (it: BubbleItem) => number> = {
      size: (it) => PLAN_AREA[it.plan],
      plan: (it) => -rank(it),
      views: (it) => it.views,
      chg: (it) => it.chgPct,
    }
    const f = val[sort.key]
    return [...items].sort(
      (a, b) =>
        (sort.desc ? f(b) - f(a) : f(a) - f(b)) ||
        b.views - a.views ||
        a.domain.localeCompare(b.domain),
    )
  }, [items, sort])

  // 정렬·필터가 바뀌면 첫 페이지로
  useEffect(() => setPage(1), [items, sort])

  if (loading)
    return <p className="p-4 text-sm text-white/60">{t('loading')}</p>
  if (!items.length)
    return <p className="p-4 text-sm text-white/60">{t('empty')}</p>

  const rows = sorted.slice((page - 1) * size, page * size)
  const th = (key: SortKey, label: string, cls = '') => (
    <th
      className={`px-2 py-2 font-medium ${cls}`}
      aria-sort={
        sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'
      }
    >
      <button
        className="hover:text-white"
        onClick={() =>
          setSort((s) => ({
            key,
            desc: s.key === key ? !s.desc : true,
          }))
        }
      >
        {label}
        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4">
      <CtgrLinks />
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-white/60">
          <tr className="border-b border-white/10">
            <th className="w-8 px-2 py-2 font-medium">#</th>
            <th className="px-2 py-2 font-medium">{t('colSite')}</th>
            {th('size', t('colSize'), 'hidden sm:table-cell')}
            {th('plan', t('colPlan'))}
            {th('views', t('colViews'), 'text-right')}
            {th('chg', t('colChg'), 'text-right')}
          </tr>
        </thead>
        <tbody>
          {rows.map((it, i) => {
            const d = Math.sqrt(PLAN_AREA[it.plan]) * 5
            return (
              <tr key={it.id} className="border-b border-white/5">
                <td className="px-2 py-2 text-white/50">
                  {(page - 1) * size + i + 1}
                </td>
                <td className="max-w-0 px-2 py-2">
                  {/* 가상 샘플은 상세가 없으므로 링크 없이 표시 */}
                  <SiteLink sample={it.sample} domain={it.domain}>
                    {it.img ? (
                      <img
                        src={it.img}
                        alt=""
                        className="size-7 shrink-0 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold uppercase">
                        {it.domain[0]}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {it.domain}
                      </span>
                      <span className="block truncate text-xs text-white/50">
                        {it.name}
                      </span>
                    </span>
                  </SiteLink>
                </td>
                <td className="hidden px-2 py-2 sm:table-cell">
                  <span
                    className="inline-block rounded-full border border-white/50"
                    style={{ width: d, height: d }}
                  />
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {PLAN_BADGE[it.plan] && (
                    <span className="mr-1 rounded bg-amber-300/20 px-1 text-xs text-amber-200">
                      {t(it.sample ? 'sample' : it.own ? 'own' : 'ad')} ·{' '}
                      {PLAN_BADGE[it.plan]}
                    </span>
                  )}
                  <span className="hidden text-xs text-white/70 md:inline">
                    {tp(it.plan)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {it.views.toLocaleString()}
                </td>
                <td
                  className="px-2 py-2 text-right tabular-nums"
                  style={{ color: TONE[toneOf(it.chgPct)] }}
                >
                  {fmtPct(it.chgPct)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pagination
        page={page}
        total={sorted.length}
        pageSize={size}
        onChange={setPage}
      />
    </div>
  )
}
