'use client'

// 분석·레이크 화면(PRD 12절 8) — 8-2 KPI 대시보드(dbms 자체 건수·성능 수집 추이·schema.pi 모니터 헤드라인), 8-1 레이크 3층 설계(프로젝트 → 표준 칼럼명 매핑),
//  8-3 데이터셋 카탈로그(정의 = schema.pi, 여기는 적재 상태). 로그인 게이트(redirect 금지), 호출은 piFetch. 막대 = CSS(새 의존성 없음)
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { LinkPicker } from '@/components/link/link-picker'
import { useLinkErrText } from '@/components/link/link-api'
import { LoginGate } from '@/components/login-gate'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi, type ApiErrorBody } from '@/lib/client-api'
import { barPcts, KPI_KEYS, type Dataset, type KpiKey, type LakeTbl, type Project } from '@/lib/analytics/lake'
import type { MonSummary } from '@/lib/monitor/rules'

const SCHEMA_URL = 'https://schem.vercel.app'
const CARD = 'bg-surface rounded-2xl p-4'
const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d })

type KpiRes = {
  areaNm: string
  counts: Record<KpiKey, number | null>
  perfTrend: { day: string; cnt: number }[]
  mon: { summary: MonSummary | null; code: string | null }
  at: string
}
type DsRes = { items: Dataset[]; page: number; hasMore: boolean }

export function AnalyticsView() {
  const t = useTranslations('analytics')
  return (
    <div className="w-full space-y-4 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      </header>
      <p className="bg-surface-raised rounded-2xl p-3 text-xs break-keep" role="note">
        {t('storageNotice')}
      </p>
      <LoginGate>{() => <Body />}</LoginGate>
    </div>
  )
}

// 오류 문구 : analytics.errors.<code> → link2.errors.<code> → apiErrors
function useErrText() {
  const t = useTranslations('analytics.errors')
  const link = useLinkErrText()
  return useCallback((b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : link(b)), [t, link])
}

function Body() {
  const t = useTranslations('analytics')
  const linkId = useSearchParams().get('link')
  return (
    <div className="space-y-4">
      <LinkPicker needConn={false} />
      {!linkId ? (
        <p className={`${CARD} text-sm`}>
          {t('noLink')}{' '}
          <Link href="/connect" className="text-accent underline">
            {t('goConnect')}
          </Link>
        </p>
      ) : (
        // key = 연결 바뀌면 섹션 상태 초기화
        <div key={linkId} className="space-y-4">
          <KpiSection linkId={linkId} />
          <LakeSection linkId={linkId} />
          <CatalogSection linkId={linkId} />
        </div>
      )}
    </div>
  )
}

function Bar({ label, value, pct, muted }: { label: string; value: string; pct: number; muted?: boolean }) {
  return (
    <li className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-sm">
      <span className="truncate">{label}</span>
      <span className="bg-surface-raised h-3 overflow-hidden rounded-full" aria-hidden="true">
        <span className={`block h-full rounded-full ${muted ? 'bg-muted' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-muted-foreground w-14 text-right tabular-nums">{value}</span>
    </li>
  )
}

function KpiSection({ linkId }: { linkId: string }) {
  const t = useTranslations('analytics')
  const errText = useErrText()
  const [res, setRes] = useState<KpiRes | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await readApi<KpiRes>(piFetch(`/api/analytics/kpi?link=${encodeURIComponent(linkId)}`))
    setLoading(false)
    if (r.ok) {
      setRes(r.data)
      setErr(null)
    } else setErr(errText(r.body))
  }, [linkId, errText])

  useEffect(() => {
    void load()
  }, [load])

  const vals = res ? KPI_KEYS.map((k) => res.counts[k]) : []
  const pcts = barPcts(vals)
  const trendPcts = res ? barPcts(res.perfTrend.map((d) => d.cnt)) : []
  const trendAny = res?.perfTrend.some((d) => d.cnt > 0)
  const mon = res?.mon.summary

  return (
    <section className="space-y-3" aria-labelledby="anl-kpi">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="anl-kpi" className="text-lg font-bold">
          {t('kpi.title')}
        </h2>
        <button className={BTN} disabled={loading} onClick={() => void load()}>
          {loading ? t('loading') : t('refresh')}
        </button>
        {res && (
          <span className="text-muted-foreground text-xs">
            {t('kpi.updatedAt', { area: res.areaNm, time: new Date(res.at).toLocaleTimeString() })}
          </span>
        )}
      </div>
      {err && (
        <p className={`${CARD} text-danger text-sm`} role="alert">
          {err}
        </p>
      )}
      {!res && !err && <p className="text-muted-foreground text-sm">{t('loading')}</p>}
      {res && (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {KPI_KEYS.map((k, i) => (
              <li key={k} className={CARD}>
                <p className="text-muted-foreground text-xs">{t(`kpi.keys.${k}`)}</p>
                <p className="text-2xl font-extrabold tabular-nums">
                  {vals[i] === null ? <span className="text-muted-foreground text-sm">{t('kpi.notBuilt')}</span> : fmt(vals[i], 0)}
                </p>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={CARD}>
              <h3 className="mb-2 text-sm font-semibold">{t('kpi.countsChart')}</h3>
              <ul className="space-y-1.5">
                {KPI_KEYS.map((k, i) => (
                  <Bar
                    key={k}
                    label={t(`kpi.keys.${k}`)}
                    value={vals[i] === null ? t('kpi.notBuilt') : fmt(vals[i], 0)}
                    pct={pcts[i]}
                    muted={vals[i] === null}
                  />
                ))}
              </ul>
            </div>
            <div className={CARD}>
              <h3 className="mb-2 text-sm font-semibold">{t('kpi.trendTitle')}</h3>
              {trendAny ? (
                <ol className="flex h-28 items-end gap-1" aria-label={t('kpi.trendTitle')}>
                  {res.perfTrend.map((d, i) => (
                    <li
                      key={d.day}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                      title={t('kpi.trendItem', { day: d.day, cnt: d.cnt })}
                    >
                      <span className="sr-only">{t('kpi.trendItem', { day: d.day, cnt: d.cnt })}</span>
                      <span className="bg-accent block w-full rounded-t" style={{ height: `${trendPcts[i]}%` }} aria-hidden="true" />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">{t('kpi.trendEmpty')}</p>
              )}
            </div>
          </div>
          <div className={CARD}>
            <h3 className="mb-2 text-sm font-semibold">{t('kpi.monTitle')}</h3>
            {mon ? (
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Stat label={t('kpi.monTps')} value={fmt(mon.app.tps, 2)} />
                <Stat label={t('kpi.monErr')} value={`${fmt(mon.app.errPct)}%`} />
                <Stat label={t('kpi.monAvg')} value={fmt(mon.app.avgMs, 0)} />
                <Stat label={t('kpi.monDb')} value={fmt(mon.db.length, 0)} />
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('kpi.monFail', { msg: errText({ code: res.mon.code ?? 'LINK_DOWN' }) })}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  )
}

function LakeSection({ linkId }: { linkId: string }) {
  const t = useTranslations('analytics')
  const errText = useErrText()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [prjId, setPrjId] = useState('')
  const [tables, setTables] = useState<LakeTbl[] | null>(null)
  const [cnfm, setCnfm] = useState<number | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const base = `/api/analytics/lake?link=${encodeURIComponent(linkId)}`

  // 이벤트형 조회(버튼) — 화면 진입 때 schema.pi 를 부르지 않는다
  async function loadProjects() {
    setBusy(true)
    const r = await readApi<{ projects: Project[] }>(piFetch(base))
    setBusy(false)
    if (r.ok) {
      setProjects(r.data.projects)
      setErr(null)
    } else setErr(errText(r.body))
  }

  async function pickProject(id: string) {
    setPrjId(id)
    setTables(null)
    setSel(new Set())
    setMsg(null)
    if (!id) return
    setBusy(true)
    const r = await readApi<{ tables: LakeTbl[]; cnfmPct: number }>(piFetch(`${base}&prj=${encodeURIComponent(id)}`))
    setBusy(false)
    if (r.ok) {
      setTables(r.data.tables)
      setCnfm(r.data.cnfmPct)
      setErr(null)
    } else setErr(errText(r.body))
  }

  async function save() {
    setBusy(true)
    const prjNm = projects?.find((p) => p.prjId === prjId)?.prjNm ?? null
    const r = await readApi<{ saved: number }>(
      piFetch('/api/analytics/datasets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ link: linkId, prjId, prjNm, tblNms: [...sel] }),
      }),
    )
    setBusy(false)
    if (r.ok) {
      setMsg(t('lake.saved', { cnt: r.data.saved }))
      setErr(null)
      setSel(new Set())
      window.dispatchEvent(new Event('analytics:datasets'))
    } else setErr(errText(r.body))
  }

  function toggle(tbl: string) {
    setSel((s) => {
      const n = new Set(s)
      if (n.has(tbl)) n.delete(tbl)
      else n.add(tbl)
      return n
    })
  }

  const layers = [
    { k: 'raw', ex: 'raw_<tbl>' },
    { k: 'std', ex: 'std_<tbl>' },
    { k: 'cur', ex: 'cur_<tbl>' },
  ] as const
  // 한 번에 담을 수 있는 테이블 상한(POST 검증과 같음)
  const allTbls = (tables ?? []).slice(0, 100).map((x) => x.tblNm)

  return (
    <section className="space-y-3" aria-labelledby="anl-lake">
      <h2 id="anl-lake" className="text-lg font-bold">
        {t('lake.title')}
      </h2>
      <ol className="grid gap-2 sm:grid-cols-3">
        {layers.map((l, i) => (
          <li key={l.k} className={`${CARD} space-y-1`}>
            <p className="text-sm font-semibold">
              {i + 1}. {t(`lake.${l.k}`)}
            </p>
            <p className="text-muted-foreground text-xs break-keep">{t(`lake.${l.k}Desc`)}</p>
            <code className="text-xs">{l.ex}</code>
          </li>
        ))}
      </ol>
      <div className={`${CARD} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {projects === null ? (
            <button className={BTN} disabled={busy} onClick={() => void loadProjects()}>
              {busy ? t('loading') : t('lake.loadProjects')}
            </button>
          ) : projects.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('lake.noProjects')}</p>
          ) : (
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">{t('lake.project')}</span>
              <select
                className="bg-surface-raised h-10 max-w-full min-w-0 rounded-lg px-3 text-sm"
                value={prjId}
                disabled={busy}
                onChange={(e) => void pickProject(e.target.value)}
              >
                <option value="">{t('lake.pickProject')}</option>
                {projects.map((p) => (
                  <option key={p.prjId} value={p.prjId}>
                    {p.prjNm}
                    {p.trgtDbmsCd ? ` · ${p.trgtDbmsCd}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {cnfm !== null && tables && <span className="text-muted-foreground text-xs">{t('lake.conform', { pct: cnfm })}</span>}
        </div>
        {err && (
          <p className="text-danger text-sm" role="alert">
            {err}
          </p>
        )}
        {msg && (
          <p className="text-sm" role="status">
            {msg}
          </p>
        )}
        {tables && tables.length === 0 && <p className="text-muted-foreground text-sm">{t('lake.noTables')}</p>}
        {tables && tables.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sel.size > 0 && sel.size === allTbls.length}
                  onChange={(e) => setSel(e.target.checked ? new Set(allTbls) : new Set())}
                />
                {t('lake.selectAll')}
              </label>
              <span className="text-muted-foreground text-xs">{t('lake.selected', { cnt: sel.size })}</span>
              <button className={`${BTN_PRIMARY} ml-auto`} disabled={busy || sel.size === 0 || sel.size > 100} onClick={() => void save()}>
                {t('lake.save')}
              </button>
            </div>
            <ul className="space-y-2">
              {tables.map((tb) => (
                <li key={tb.tblNm} className="bg-surface-raised rounded-xl p-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      aria-label={tb.tblNm}
                      checked={sel.has(tb.tblNm)}
                      onChange={() => toggle(tb.tblNm)}
                    />
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm break-all">
                        {t('lake.tableSummary', { tbl: tb.tblNm, std: tb.stdNm, cnt: tb.cols.length, pct: tb.cnfmPct })}
                        {tb.entNm ? ` · ${tb.entNm}` : ''}
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="py-1 pr-2 font-medium">{t('lake.colSrc')}</th>
                              <th className="py-1 pr-2 font-medium">{t('lake.colStd')}</th>
                              <th className="py-1 pr-2 font-medium">{t('lake.colType')}</th>
                              <th className="py-1 font-medium">{t('lake.colOk')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tb.cols.map((c) => (
                              <tr key={c.colNm} className="border-border border-t">
                                <td className="py-1 pr-2 font-mono break-all">
                                  {c.colNm}
                                  {c.pk && <span className="text-accent ml-1">{t('lake.pk')}</span>}
                                </td>
                                <td className="py-1 pr-2 font-mono break-all">{c.stdNm}</td>
                                <td className="py-1 pr-2">{c.phyTpNm ?? '—'}</td>
                                <td className={`py-1 ${c.conform ? '' : 'text-danger'}`}>{c.conform ? t('lake.ok') : t('lake.ng')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

function CatalogSection({ linkId }: { linkId: string }) {
  const t = useTranslations('analytics')
  const errText = useErrText()
  const [page, setPage] = useState(1)
  const [res, setRes] = useState<DsRes | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await readApi<DsRes>(piFetch(`/api/analytics/datasets?link=${encodeURIComponent(linkId)}&page=${page}`))
    if (r.ok) {
      setRes(r.data)
      setErr(null)
    } else setErr(errText(r.body))
  }, [linkId, page, errText])

  useEffect(() => {
    void load()
    // 레이크 설계 추가 후 목록 갱신
    const on = () => void load()
    window.addEventListener('analytics:datasets', on)
    return () => window.removeEventListener('analytics:datasets', on)
  }, [load])

  async function remove(ds: Dataset) {
    if (!window.confirm(t('catalog.removeConfirm', { tbl: ds.tblNm }))) return
    setBusy(true)
    const r = await readApi<{ ok: true }>(
      piFetch('/api/analytics/datasets', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ link: linkId, dsId: ds.dsId, del: true }),
      }),
    )
    setBusy(false)
    if (r.ok) void load()
    else setErr(errText(r.body))
  }

  return (
    <section className="space-y-3" aria-labelledby="anl-cat">
      <h2 id="anl-cat" className="text-lg font-bold">
        {t('catalog.title')}
      </h2>
      <div className={`${CARD} flex flex-wrap items-center gap-2 text-sm`}>
        <p className="min-w-0 flex-1 break-keep">{t('catalog.schemaCard')}</p>
        <a href={SCHEMA_URL} target="_blank" rel="noopener noreferrer" className="text-accent shrink-0 underline">
          {t('catalog.openSchema')}
        </a>
      </div>
      {err && (
        <p className={`${CARD} text-danger text-sm`} role="alert">
          {err}
        </p>
      )}
      {!res && !err && <p className="text-muted-foreground text-sm">{t('loading')}</p>}
      {res && res.items.length === 0 && page === 1 && <p className={`${CARD} text-muted-foreground text-sm`}>{t('catalog.empty')}</p>}
      {res && res.items.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {res.items.map((ds) => (
            <li key={ds.dsId} className={`${CARD} space-y-1 text-sm`}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-semibold break-all">{ds.tblNm}</p>
                <span
                  className={`bg-surface-raised shrink-0 rounded-full px-2 py-0.5 text-xs ${ds.loadStsCd === 'FAIL' ? 'text-danger' : ''}`}
                >
                  {t(`catalog.status.${ds.loadStsCd}`)}
                </span>
              </div>
              <p className="text-muted-foreground text-xs break-all">
                {ds.prjNm ?? ds.prjId} · {ds.rawNm} → {ds.stdNm} → {ds.curNm}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('lake.tableSummary', { tbl: ds.tblNm, std: ds.stdNm, cnt: ds.colCnt, pct: ds.cnfmPct })}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {ds.lstLoadDtm
                    ? t('catalog.lastLoad', { time: new Date(ds.lstLoadDtm).toLocaleString() })
                    : t('catalog.neverLoaded')}
                </span>
                <button className="text-muted-foreground ml-auto text-xs underline" disabled={busy} onClick={() => void remove(ds)}>
                  {t('catalog.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {res && (page > 1 || res.hasMore) && (
        <nav className="flex items-center justify-center gap-2" aria-label={t('catalog.title')}>
          <button className={BTN} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('catalog.prev')}
          </button>
          <span className="text-muted-foreground text-xs">{t('catalog.page', { page })}</span>
          <button className={BTN} disabled={!res.hasMore} onClick={() => setPage((p) => p + 1)}>
            {t('catalog.next')}
          </button>
        </nav>
      )}
    </section>
  )
}
