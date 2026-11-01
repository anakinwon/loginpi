'use client'

// 모니터링 센터 화면(PRD 12절 4) — schema.pi 모니터 요약 읽기 연계(D7) : 앱 지표·DB 카드·URL 점검, 기간 30분~24시간, 30초 자동 새로고침,
//  임계치 규칙(dbm_mon_rule) 관리 + 화면 평가로 초과 강조(4-3), AI 장애 분석은 schema.pi 링크(4-4). 로그인 게이트(redirect 금지), 호출은 piFetch
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { LinkPicker } from '@/components/link/link-picker'
import { LoginGate } from '@/components/login-gate'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { evaluate, METRICS, OPS, PERIODS, type Breach, type MetricCd, type MonSummary, type OpCd, type PeriodMin, type Rule } from '@/lib/monitor/rules'

const REFRESH_MS = 30_000
const SCHEMA_MON_URL = 'https://schem.vercel.app'
const OP_SIGN: Record<OpCd, string> = { GT: '>', GE: '≥', LT: '<', LE: '≤' }
const CARD = 'bg-surface rounded-2xl p-4'
const fmt = (v: number | null, d = 1) => (v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d }))

type SummaryRes = { summary: MonSummary; areaNm: string; at: string }
type RulesRes = { rules: Rule[]; total: number; page: number; pageSize: number }

export function MonitorView() {
  const t = useTranslations('monitor')
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm break-keep">{t('collectNote')}</p>
      </header>
      <LoginGate>{() => <MonitorBody />}</LoginGate>
    </div>
  )
}

// 오류 본문 → 문구 : monitor.errors.<code>(LinkError 코드) → apiErrors.<code> → 서버 문구
function useErrText() {
  const t = useTranslations('monitor.errors')
  const api = useApiErrorText()
  return useCallback((b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : api(b)), [t, api])
}

function MonitorBody() {
  const t = useTranslations('monitor')
  const errText = useErrText()
  const linkId = useSearchParams().get('link')
  const [min, setMin] = useState<PeriodMin>(60)
  const [res, setRes] = useState<SummaryRes | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<Rule[]>([])
  const [rulesErr, setRulesErr] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    if (!linkId) return
    setLoading(true)
    const r = await readApi<SummaryRes>(piFetch(`/api/monitor/summary?link=${encodeURIComponent(linkId)}&min=${min}`))
    setLoading(false)
    if (r.ok) {
      setRes(r.data)
      setErr(null)
    } else setErr(errText(r.body))
  }, [linkId, min, errText])

  // ponytail: 규칙은 1쪽(50건)만 — 연결당 상한이 50이라 한 쪽에 다 들어감
  const loadRules = useCallback(async () => {
    if (!linkId) return
    const r = await readApi<RulesRes>(piFetch(`/api/monitor/rules?link=${encodeURIComponent(linkId)}&page=1`))
    if (r.ok) {
      setRules(r.data.rules)
      setRulesErr(null)
    } else setRulesErr(errText(r.body))
  }, [linkId, errText])

  useEffect(() => {
    void loadSummary()
    // 탭이 보일 때만 30초 주기 새로고침
    const id = setInterval(() => {
      if (!document.hidden) void loadSummary()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadSummary])
  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const breaches = useMemo(() => (res ? evaluate(rules, res.summary) : []), [rules, res])
  const hitTargets = useMemo(() => new Set(breaches.map((b) => b.target)), [breaches])

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
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t('period')} className="flex gap-1">
              {PERIODS.map((p) => (
                <button key={p} className={`${BTN} ${p === min ? 'ring-accent ring-2' : ''}`} aria-pressed={p === min} onClick={() => setMin(p)}>
                  {t(`periods.${p}`)}
                </button>
              ))}
            </div>
            <button className={BTN} disabled={loading} onClick={() => void loadSummary()}>
              {loading ? t('loading') : t('refresh')}
            </button>
            {res && <span className="text-muted-foreground text-xs">{t('updatedAt', { area: res.areaNm, time: new Date(res.at).toLocaleTimeString() })}</span>}
          </div>
          {err && (
            <p className="text-danger bg-surface rounded-2xl p-4 text-sm" role="alert">
              {err}
            </p>
          )}
          {breaches.length > 0 && <BreachList breaches={breaches} />}
          {res && <SummaryCards s={res.summary} hit={hitTargets} />}
          <RulesPanel linkId={linkId} rules={rules} err={rulesErr} conns={res?.summary.db.map((d) => d.connId) ?? []} reload={loadRules} />
        </>
      )}
      <p className={`${CARD} text-sm`}>
        {t('aiNote')}{' '}
        <a href={SCHEMA_MON_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
          {t('aiLink')}
        </a>
      </p>
    </div>
  )
}

function BreachList({ breaches }: { breaches: Breach[] }) {
  const t = useTranslations('monitor')
  return (
    <section className="border-danger rounded-2xl border p-4" role="alert">
      <h2 className="text-danger mb-2 font-bold">{t('breachTitle', { n: breaches.length })}</h2>
      <ul className="space-y-1 text-sm">
        {breaches.map((b, i) => (
          <li key={`${b.ruleId}-${b.target}-${i}`} className="break-all">
            {t(`metrics.${b.metricCd}`)} · {b.target} : {fmt(b.value, 2)} {OP_SIGN[b.opCd]} {fmt(b.thrVal, 2)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}

function SummaryCards({ s, hit }: { s: MonSummary; hit: Set<string> }) {
  const t = useTranslations('monitor')
  const ring = (k: string) => (hit.has(k) ? 'border-danger border' : 'border border-transparent')
  return (
    <div className="space-y-4">
      <section className={`${CARD} ${ring('app')}`}>
        <h2 className="mb-3 font-bold">{t('appTitle')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('metrics.APP_TPS')} value={fmt(s.app.tps, 3)} />
          <Stat label={t('metrics.APP_ERR_PCT')} value={`${fmt(s.app.errPct, 2)}%`} />
          <Stat label={t('metrics.APP_SLOW_CNT')} value={fmt(s.app.slowCnt, 0)} />
          <Stat label={t('metrics.APP_AVG_MS')} value={fmt(s.app.avgMs)} />
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-bold">{t('dbTitle')}</h2>
        {s.db.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {s.db.map((d) => (
              <div key={d.connId} className={`${CARD} ${ring(`db:${d.connId}`)}`}>
                <p className="mb-2 truncate font-mono text-xs">{d.connId}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label={t('metrics.DB_SESS_CNT')} value={fmt(d.sessCnt, 0)} />
                  <Stat label={t('metrics.DB_LOCK_WAIT_CNT')} value={fmt(d.lockWaitCnt, 0)} />
                  <Stat label={t('metrics.DB_CACHE_HIT_PCT')} value={d.cacheHitPct === null ? '—' : `${fmt(d.cacheHitPct, 2)}%`} />
                  <Stat label={t('metrics.DB_SIZE_MB')} value={fmt(d.dbSzMb)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className={`${CARD} ${ring('url')}`}>
        <h2 className="mb-2 font-bold">{t('urlTitle')}</h2>
        {s.url.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.url.map((u) => (
              <li key={u.url} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${hit.has(`url:${u.url}`) ? 'border-danger border' : ''}`}>
                <span className="min-w-0 truncate">{u.url}</span>
                <span className={`shrink-0 font-mono text-xs ${u.ok ? '' : 'text-danger'}`}>
                  {u.stsNo ?? '—'} · {fmt(u.rspMs, 0)}ms
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RulesPanel({ linkId, rules, err, conns, reload }: { linkId: string; rules: Rule[]; err: string | null; conns: string[]; reload: () => Promise<void> }) {
  const t = useTranslations('monitor')
  const errText = useErrText()
  const [metricCd, setMetricCd] = useState<MetricCd>('APP_ERR_PCT')
  const [opCd, setOpCd] = useState<OpCd>('GT')
  const [thr, setThr] = useState('')
  const [connId, setConnId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    setBusy(true)
    const r = await readApi(piFetch('/api/monitor/rules', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: linkId, ...body }) }))
    setBusy(false)
    setMsg(r.ok ? null : errText(r.body))
    if (r.ok) await reload()
    return r.ok
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(thr)
    if (thr.trim() === '' || !Number.isFinite(v)) return setMsg(t('thrInvalid'))
    if (await send('POST', { metricCd, opCd, thrVal: v, connId: metricCd.startsWith('DB_') && connId ? connId : null })) setThr('')
  }

  const field = 'bg-surface-raised h-10 rounded-lg px-2 text-sm'
  return (
    <section className={CARD}>
      <h2 className="mb-1 font-bold">{t('rulesTitle')}</h2>
      <p className="text-muted-foreground mb-3 text-xs break-keep">{t('rulesNote')}</p>
      <form onSubmit={(e) => void add(e)} className="mb-3 flex flex-wrap items-end gap-2">
        <select aria-label={t('metric')} className={field} value={metricCd} onChange={(e) => setMetricCd(e.target.value as MetricCd)}>
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {t(`metrics.${m}`)}
            </option>
          ))}
        </select>
        {metricCd.startsWith('DB_') && (
          <select aria-label={t('conn')} className={`${field} max-w-40`} value={connId} onChange={(e) => setConnId(e.target.value)}>
            <option value="">{t('allConns')}</option>
            {conns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select aria-label={t('op')} className={field} value={opCd} onChange={(e) => setOpCd(e.target.value as OpCd)}>
          {OPS.map((o) => (
            <option key={o} value={o}>
              {OP_SIGN[o]}
            </option>
          ))}
        </select>
        <input aria-label={t('threshold')} className={`${field} w-28`} inputMode="decimal" value={thr} onChange={(e) => setThr(e.target.value)} placeholder={t('threshold')} />
        <button className={BTN_PRIMARY} disabled={busy}>
          {t('addRule')}
        </button>
      </form>
      {(msg || err) && <p className="text-danger mb-2 text-sm">{msg ?? err}</p>}
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noRules')}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.ruleId} className="flex flex-wrap items-center justify-between gap-2">
              <span className={`min-w-0 break-all ${r.useYn === 'N' ? 'text-muted-foreground line-through' : ''}`}>
                {t(`metrics.${r.metricCd}`)}
                {r.connId ? ` (${r.connId})` : ''} {OP_SIGN[r.opCd]} {fmt(r.thrVal, 4)}
              </span>
              <span className="flex gap-1">
                <button className={BTN} disabled={busy} onClick={() => void send('PATCH', { ruleId: r.ruleId, useYn: r.useYn === 'Y' ? 'N' : 'Y' })}>
                  {r.useYn === 'Y' ? t('disable') : t('enable')}
                </button>
                <button className={BTN} disabled={busy} onClick={() => confirm(t('delConfirm')) && void send('PATCH', { ruleId: r.ruleId, del: true })}>
                  {t('delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
