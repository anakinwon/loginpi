'use client'

// 성능 관측 화면(PRD 12 §3) — 로그인 게이트 + 연결·접속 선택 + 탭 5개(수집·느린 쿼리·건강·용량·활동/락). 열린 탭만 조회(지연 조회), 목록은 페이지 단위
//  모든 호출 piFetch(Pi Browser X-Pi-Token). 연결 클라이언트 오류는 code 로 번역(perf.err → link2.errors → apiErrors)
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, type ApiErrorBody } from '@/lib/client-api'
import { LoginGate } from '@/components/login-gate'
import { LinkPicker, type LinkSelection } from '@/components/link/link-picker'
import { useLinkErrText } from '@/components/link/link-api'
import { BTN, BTN_PRIMARY } from '@/components/ui'

const TABS = ['collect', 'top', 'health', 'trend', 'activity'] as const
type Tab = (typeof TABS)[number]
type Sel = { linkId: string; connId: string }

const CARD = 'bg-surface rounded-2xl p-4 sm:p-5'
const TH =
  'text-muted-foreground px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap'
const TD = 'px-2 py-1.5 align-top'

const fmtNum = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 })
function fmtBytes(b: number | null) {
  if (b === null) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = b
  while (Math.abs(v) >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`
}
const fmtDtm = (s: string | null) => (s ? new Date(s).toLocaleString() : '-')

function useErrText() {
  const t = useTranslations('perf.err')
  const linkErr = useLinkErrText()
  return useCallback(
    (b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : linkErr(b)),
    [t, linkErr],
  )
}

// 탭 공용 조회 — sel·key 가 바뀔 때만, 렌더 비차단
function useGet<T>(url: string | null) {
  const errText = useErrText()
  const [state, setState] = useState<{
    url: string
    data?: T
    err?: string
    code?: string
  } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    void readApi<T>(piFetch(url)).then((r) => {
      if (!alive) return
      setState(
        r.ok
          ? { url, data: r.data }
          : { url, err: errText(r.body), code: r.body.code },
      )
    })
    return () => {
      alive = false
    }
  }, [url, errText])
  return state?.url === url ? state : null // 다른 url 의 이전 결과는 로딩으로
}

function Status({ s }: { s: { err?: string; code?: string } | null }) {
  const t = useTranslations('perf')
  if (!s) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (!s.err) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-danger text-sm" role="alert">
        {s.err}
      </p>
      {s.code === 'PGSS_MISSING' && <PgssGuide />}
    </div>
  )
}

function PgssGuide() {
  const t = useTranslations('perf.pgss')
  return (
    <div className="bg-surface-raised rounded-xl p-3 text-sm">
      <p className="font-semibold">{t('title')}</p>
      <p className="text-muted-foreground mt-1 break-keep">{t('body')}</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-xs">
        {'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;'}
      </pre>
      <p className="text-muted-foreground mt-1 text-xs break-keep">
        {t('note')}
      </p>
    </div>
  )
}

export function PerfView() {
  return <LoginGate>{() => <PerfInner />}</LoginGate>
}

function PerfInner() {
  const t = useTranslations('perf')
  const [sel, setSel] = useState<Sel | null>(null)
  // 모니터링 딥링크 ?tab= 초기값(목록 밖 값은 기본 탭)
  const tab0 = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(() =>
    (TABS as readonly string[]).includes(tab0 ?? '')
      ? (tab0 as Tab)
      : 'collect',
  )
  const [rev, setRev] = useState(0) // 수집 완료 시 다른 탭 재조회
  const onChange = useCallback((s: LinkSelection) => {
    setSel(s.linkId && s.connId ? { linkId: s.linkId, connId: s.connId } : null)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <LinkPicker onChange={onChange} />
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm ${tab === k ? 'bg-accent font-semibold text-white' : 'bg-surface-raised text-muted-foreground'}`}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {!sel ? (
        <p className={`${CARD} text-muted-foreground text-sm`}>
          {t('pickFirst')}
        </p>
      ) : (
        <section className={CARD} role="tabpanel">
          {tab === 'collect' && (
            <CollectTab sel={sel} onDone={() => setRev((r) => r + 1)} />
          )}
          {tab === 'top' && <TopTab sel={sel} rev={rev} />}
          {tab === 'health' && <HealthTab sel={sel} rev={rev} />}
          {tab === 'trend' && <TrendTab sel={sel} rev={rev} />}
          {tab === 'activity' && <ActivityTab sel={sel} />}
        </section>
      )}
    </div>
  )
}

const qs = (sel: Sel, extra = '') =>
  `link=${encodeURIComponent(sel.linkId)}&conn=${encodeURIComponent(sel.connId)}${extra}`

// 3-1 수집 — 버튼 1회 = 스냅샷 1건
function CollectTab({ sel, onDone }: { sel: Sel; onDone: () => void }) {
  const t = useTranslations('perf.collect')
  const errText = useErrText()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{
    ok: boolean
    text: string
    code?: string
  } | null>(null)

  async function run() {
    setBusy(true)
    setMsg(null)
    const r = await readApi<{
      clctDtm: string
      pgss: boolean
      qryCnt: number
      tblCnt: number
      idxCnt: number
    }>(
      piFetch('/api/perf/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sel),
      }),
    )
    setBusy(false)
    if (r.ok) {
      setMsg({
        ok: true,
        text: t('done', {
          dtm: fmtDtm(r.data.clctDtm),
          qry: r.data.qryCnt,
          tbl: r.data.tblCnt,
          idx: r.data.idxCnt,
        }),
        code: r.data.pgss ? undefined : 'PGSS_MISSING',
      })
      onDone()
    } else setMsg({ ok: false, text: errText(r.body), code: r.body.code })
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      <button
        className={BTN_PRIMARY}
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? t('running') : t('run')}
      </button>
      {msg && (
        <p className={`text-sm ${msg.ok ? '' : 'text-danger'}`} role="status">
          {msg.text}
        </p>
      )}
      {msg?.code === 'PGSS_MISSING' && <PgssGuide />}
    </div>
  )
}

type TopRow = {
  qryId: string
  qryTxt: string | null
  calls: number
  totalMs: number
  meanMs: number
  rows: number
  reset: boolean
}
type TopRes = {
  clctDtm: string | null
  prevDtm: string | null
  pgss: boolean
  rows: TopRow[]
  total: number
  page: number
  pageSize: number
}

// 3-2 느린 쿼리 Top-N — 최근 2회 수집 증감
function TopTab({ sel, rev }: { sel: Sel; rev: number }) {
  const t = useTranslations('perf.top')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<'total' | 'mean' | 'calls'>('total')
  const s = useGet<TopRes>(
    `/api/perf/top?${qs(sel, `&page=${page}&sort=${sort}&r=${rev}`)}`,
  )
  const d = s?.data
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-muted-foreground" htmlFor="perf-sort">
          {t('sort')}
        </label>
        <select
          id="perf-sort"
          className="bg-surface-raised h-9 rounded-lg px-2"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort)
            setPage(1)
          }}
        >
          <option value="total">{t('sortTotal')}</option>
          <option value="mean">{t('sortMean')}</option>
          <option value="calls">{t('sortCalls')}</option>
        </select>
      </div>
      <Status s={s} />
      {d && !d.clctDtm && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {d?.clctDtm && (
        <>
          <p className="text-muted-foreground text-xs">
            {d.prevDtm
              ? t('range', { from: fmtDtm(d.prevDtm), to: fmtDtm(d.clctDtm) })
              : t('first', { dtm: fmtDtm(d.clctDtm) })}
          </p>
          {!d.pgss && <PgssGuide />}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('query')}</th>
                  <th className={`${TH} text-right`}>{t('calls')}</th>
                  <th className={`${TH} text-right`}>{t('totalMs')}</th>
                  <th className={`${TH} text-right`}>{t('meanMs')}</th>
                  <th className={`${TH} text-right`}>{t('rows')}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.qryId} className="border-t border-white/5">
                    <td className={`${TD} max-w-md`}>
                      <code className="line-clamp-3 text-xs break-all">
                        {r.qryTxt ?? r.qryId}
                      </code>
                      {r.reset && (
                        <span className="text-muted-foreground text-xs">
                          {t('reset')}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>{fmtNum(r.calls)}</td>
                    <td className={`${TD} text-right`}>{fmtNum(r.totalMs)}</td>
                    <td className={`${TD} text-right`}>{fmtNum(r.meanMs)}</td>
                    <td className={`${TD} text-right`}>{fmtNum(r.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={d.page}
            total={d.total}
            size={d.pageSize}
            onPage={setPage}
          />
        </>
      )}
    </div>
  )
}

function Pager({
  page,
  total,
  size,
  onPage,
}: {
  page: number
  total: number
  size: number
  onPage: (p: number) => void
}) {
  const t = useTranslations('perf')
  const last = Math.max(1, Math.ceil(total / size))
  if (last <= 1) return null
  return (
    <nav
      className="flex items-center justify-center gap-2 text-sm"
      aria-label={t('pager')}
    >
      <button
        className={BTN}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ‹
      </button>
      <span className="text-muted-foreground">
        {page} / {last}
      </span>
      <button
        className={BTN}
        disabled={page >= last}
        onClick={() => onPage(page + 1)}
      >
        ›
      </button>
    </nav>
  )
}

type HealthRes = {
  clctDtm: string | null
  unusedIdx: { idxNm: string; tblNm: string; szByte: number | null }[]
  fullScan: {
    tblNm: string
    fullScan: number
    liveTup: number
    ratio: number
  }[]
  dead: { tblNm: string; deadTup: number; liveTup: number; ratio: number }[]
}

// 3-3 테이블·인덱스 건강
function HealthTab({ sel, rev }: { sel: Sel; rev: number }) {
  const t = useTranslations('perf.health')
  const s = useGet<HealthRes>(`/api/perf/health?${qs(sel, `&r=${rev}`)}`)
  const d = s?.data
  const pct = (r: number) => `${(r * 100).toFixed(0)}%`
  return (
    <div className="flex flex-col gap-4">
      <Status s={s} />
      {d && !d.clctDtm && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {d?.clctDtm && (
        <>
          <p className="text-muted-foreground text-xs">
            {t('basis', { dtm: fmtDtm(d.clctDtm) })}
          </p>
          <List
            title={t('unusedIdx')}
            hint={t('unusedIdxHint')}
            items={d.unusedIdx.map((i) => [
              i.idxNm,
              i.tblNm,
              fmtBytes(i.szByte),
            ])}
            none={t('none')}
          />
          <List
            title={t('fullScan')}
            hint={t('fullScanHint')}
            items={d.fullScan.map((r) => [
              r.tblNm,
              `${fmtNum(r.fullScan)} ${t('scans')}`,
              pct(r.ratio),
            ])}
            none={t('none')}
          />
          <List
            title={t('dead')}
            hint={t('deadHint')}
            items={d.dead.map((r) => [
              r.tblNm,
              `${fmtNum(r.deadTup)} / ${fmtNum(r.liveTup)}`,
              pct(r.ratio),
            ])}
            none={t('none')}
          />
        </>
      )}
    </div>
  )
}

function List({
  title,
  hint,
  items,
  none,
}: {
  title: string
  hint: string
  items: string[][]
  none: string
}) {
  return (
    <div>
      <h3 className="font-semibold">
        {title}{' '}
        <span className="text-muted-foreground text-xs font-normal">
          ({items.length})
        </span>
      </h3>
      <p className="text-muted-foreground mb-1 text-xs break-keep">{hint}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{none}</p>
      ) : (
        <ul className="divide-y divide-white/5 text-sm">
          {items.map((c) => (
            <li
              key={c.join('|')}
              className="flex flex-wrap justify-between gap-x-3 py-1"
            >
              <span className="font-mono break-all">{c[0]}</span>
              <span className="text-muted-foreground">
                {c.slice(1).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type TrendRes = {
  points: { t: number; bytes: number }[]
  limitGb: number
  perDay: number | null
  daysLeft: number | null
}

// 3-4 용량 추이·예측 — 막대(최근 30일) + 임계 도달 예상일
function TrendTab({ sel, rev }: { sel: Sel; rev: number }) {
  const t = useTranslations('perf.trend')
  const [limitGb, setLimitGb] = useState(8)
  const s = useGet<TrendRes>(
    `/api/perf/trend?${qs(sel, `&limitGb=${limitGb}&r=${rev}`)}`,
  )
  const d = s?.data
  const max = d ? Math.max(1, ...d.points.map((p) => p.bytes)) : 1
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('limit')}</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          className="bg-surface-raised h-9 w-24 rounded-lg px-2"
          defaultValue={limitGb}
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (v > 0) setLimitGb(v)
          }}
        />
        GB
      </label>
      <Status s={s} />
      {d && d.points.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {d && d.points.length > 0 && (
        <>
          <div
            className="flex h-32 items-end gap-px"
            aria-label={t('chart')}
            role="img"
          >
            {d.points.map((p) => (
              <div
                key={p.t}
                title={`${fmtDtm(new Date(p.t).toISOString())} · ${fmtBytes(p.bytes)}`}
                className="bg-accent/70 min-w-0.5 flex-1 rounded-t"
                style={{ height: `${Math.max(2, (p.bytes / max) * 100)}%` }}
              />
            ))}
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">{t('now')}</dt>
              <dd>{fmtBytes(d.points[d.points.length - 1].bytes)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('perDay')}</dt>
              <dd>{d.perDay === null ? t('needMore') : fmtBytes(d.perDay)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('daysLeft', { gb: d.limitGb })}
              </dt>
              <dd>
                {d.daysLeft === null
                  ? t('noGrowth')
                  : t('days', { n: Math.floor(d.daysLeft) })}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  )
}

type Grid = { cols: string[]; rows: unknown[][]; ms: number }

// 3-5 활동·락 — 실시간(저장 안 함), 새로고침 버튼
function ActivityTab({ sel }: { sel: Sel }) {
  const t = useTranslations('perf.activity')
  const [n, setN] = useState(0)
  const s = useGet<{ activity: Grid; locks: Grid }>(
    `/api/perf/activity?${qs(sel, `&n=${n}`)}`,
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className={BTN} onClick={() => setN((x) => x + 1)}>
          {t('refresh')}
        </button>
        <span className="text-muted-foreground text-xs">{t('live')}</span>
      </div>
      <Status s={s} />
      {s?.data && (
        <>
          <GridView
            title={t('sessions')}
            g={s.data.activity}
            none={t('none')}
          />
          <GridView title={t('locks')} g={s.data.locks} none={t('none')} />
        </>
      )}
    </div>
  )
}

function GridView({
  title,
  g,
  none,
}: {
  title: string
  g: Grid
  none: string
}) {
  return (
    <div>
      <h3 className="mb-1 font-semibold">
        {title}{' '}
        <span className="text-muted-foreground text-xs font-normal">
          ({g.rows.length} · {g.ms}ms)
        </span>
      </h3>
      {g.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{none}</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {g.cols.map((c) => (
                  <th key={c} className={TH}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  {r.map((v, j) => (
                    <td key={j} className={`${TD} max-w-xs break-all`}>
                      {v === null ? '-' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
