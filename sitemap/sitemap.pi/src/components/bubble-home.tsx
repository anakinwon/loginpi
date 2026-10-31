'use client'

// 메인 화면 — 상단 바(기간·카테고리·검색·보기 전환) + 요금제 크기 버블 캔버스 ↔ 정렬 표(반응형 페이지네이션) + 범례.
// 데이터는 /api/bubbles 비동기 조회(기간·카테고리 변경 시 재조회, 검색은 받은 목록에서 즉시 필터). 공개 API라 fetch 사용
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { BubbleCanvas, TONE, toneOf } from './bubble-canvas'
import { LeaveDialog } from './leave-dialog'
import { Pagination } from './pagination'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import {
  BUBBLE_DAYS,
  LIMITS,
  PLAN_AREA,
  PLAN_COLOR,
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
  const te = useTranslations('efct')
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
  // 이동 안내 중인 외부 사이트 — desc 는 열릴 때만 /api/sites/<domain> 으로 지연 조회(undefined=조회 중, null=없음)
  const [leave, setLeave] = useState<{
    url: string
    domain: string
    name: string
    desc?: string | null
  } | null>(null)
  const td = useTranslations('detail')

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
  // 가상 샘플은 비어 있는 자리 — 상세 대신 "이 자리에 내 사이트를" 안내(/slot?plan=)로 등록 유도(마스터 지시 2026-10-11).
  // 연결 주소(url)가 지정된 사이트는 상세 대신 이동 안내 후 그 주소로(외부 이동은 클릭 + 안내 필수, MAINNET A-6)
  const open = useCallback(
    (domain: string) => {
      const it = data?.items.find((x) => x.domain === domain)
      if (it?.sample) return router.push(`/slot?plan=${it.plan}`)
      if (it?.url) {
        const next = { url: it.url, domain: it.domain, name: it.name }
        setLeave(next)
        void readApi<{ site: { site_desc: string | null } }>(
          fetch(`/api/sites/${encodeURIComponent(it.domain)}`),
        ).then((r) =>
          setLeave((cur) =>
            cur && cur.domain === next.domain
              ? { ...cur, desc: r.ok ? r.data.site.site_desc : null }
              : cur,
          ),
        )
        return
      }
      router.push(`/s/${domain}`)
    },
    [router, data],
  )

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

      {leave && (
        <LeaveDialog
          floating
          url={leave.url}
          name={leave.name}
          desc={leave.desc}
          onCancel={() => setLeave(null)}
        />
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
          {/* overflow-hidden 필수 — 배경 .sky-drift 가 1.18배까지 커지므로(켄 번즈) 잘라 주지 않으면 위로 상단 바, 아래로 범례를 덮는다(2026-10-14 마스터 지적 "로딩 후 위아래 공간") */}
          <div
            className="relative h-[calc(100dvh-17rem)] min-h-[380px] overflow-hidden sm:h-[calc(100dvh-9rem)]"
            aria-busy={loading}
          >
            {/* 배경 — NASA 이미지 라이브러리의 실제 은하수 사진(ISS iss073e0982679, 2025-10-25, NASA 미디어 사용 지침상 미국 내 저작권 비대상·출처 표기 권장 https://www.nasa.gov/nasa-brand-center/images-and-media/ 확인일 2026-10-14, 출처 링크는 범례. 마스터 지시 2026-10-14).
                <img object-cover> + srcSet 으로 어떤 화면 비율·크기에도 잘라 채우고(데스크톱·모바일), 960w 는 저밀도(DPR≤2)·좁은 화면용.
                CSS url() 배경 대신 요소를 쓴다 — srcSet 반응형 선택이 공짜이고 번들러 에셋 해석을 안 거친다(2026-10-14 dev 캐시 stale 사고 — `.next/dev` 삭제로 해결, 루트 docs/TROUBLESHOOT.md 2026-10-14). 움직임은 .sky-drift(globals.css 켄 번즈 120s). 동영상은 모바일 자동재생·데이터 때문에 보류 */}
            <img
              src="/sky/milky-way.webp"
              srcSet="/sky/milky-way-sm.webp 960w, /sky/milky-way.webp 1920w"
              sizes="100vw"
              alt=""
              aria-hidden
              decoding="async"
              className="sky-drift absolute inset-0 size-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-[#070a12]/45" aria-hidden />
            {!data ? (
              <p className="relative p-4 text-sm text-white/60">
                {t('loading')}
              </p>
            ) : items.length === 0 ? (
              <p className="relative p-4 text-sm text-white/60">{t('empty')}</p>
            ) : (
              <BubbleCanvas
                items={items}
                label={t('canvasLabel')}
                adLabel={t('ad')}
                ownLabel={t('own')}
                sampleLabel={t('sample')}
                sparkleLabel={t('sparkle')}
                effectLabel={(cd) => te(cd)}
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
      <a
        className="text-white/70 underline decoration-white/30 hover:text-white"
        href="https://images.nasa.gov/details/iss073e0982679"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('bgCredit')}
      </a>
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
  plan,
  children,
}: {
  sample?: boolean
  domain: string
  plan: string
  children: React.ReactNode
}) => (
  <Link
    // 샘플은 비어 있는 자리 → 등록 안내(/slot), 실사이트는 상세
    href={sample ? `/slot?plan=${plan}` : `/s/${domain}`}
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
            // 크기 레벨 — 요금제 순서(PLAN_CD) 기준 VIP=LV5 … BSC1=LV1, NONE(무료)=없음. 점 크기보다 상대 비교가 쉽다
            const lv = PLAN_CD.length - 1 - PLAN_CD.indexOf(it.plan)
            return (
              <tr key={it.id} className="border-b border-white/5">
                <td className="px-2 py-2 text-white/50">
                  {(page - 1) * size + i + 1}
                </td>
                <td className="max-w-0 px-2 py-2">
                  {/* 가상 샘플은 상세가 없으므로 링크 없이 표시 */}
                  <SiteLink
                    sample={it.sample}
                    domain={it.domain}
                    plan={it.plan}
                  >
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
                <td className="hidden px-2 py-2 whitespace-nowrap sm:table-cell">
                  {lv > 0 ? (
                    <span
                      className="rounded border px-1.5 text-xs font-bold tabular-nums"
                      style={{
                        color: PLAN_COLOR[it.plan],
                        borderColor: PLAN_COLOR[it.plan],
                      }}
                    >
                      LV{lv}
                    </span>
                  ) : (
                    <span className="text-white/40">—</span>
                  )}
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
