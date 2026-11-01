'use client'

// 모니터링 관문 보드 — 감시 신호 14개(5범주)의 정상/주의/위험을 한눈에 + 지금 할 일·해결 방안(성능·SQL 튜닝·운영 안전 탭 딥링크) + 차트(ECharts, 지연 로드)
//  갱신 : fast(db_stats·activity·version) 60초, 탭 숨김이면 정지·복귀 시 60초 지났으면 즉시, RATE 면 주기 2배(최대 5분). slow 는 fast 응답 뒤 5분마다(대상 DB 동시 연결 3개 상한)
//  TIMEOUT 3연속이면 AVAIL 위험(서버는 1회를 확인 불가로 낸다). 실패하면 직전 값 유지 + '오래된 정보'. 로그인 게이트(redirect 금지), 호출은 piFetch
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { LinkPicker, type LinkSelection } from '@/components/link/link-picker'
import { LoginGate } from '@/components/login-gate'
import { BTN } from '@/components/ui'
import { readApi, type ApiErrorBody } from '@/lib/client-api'
import type { MetricCd } from '@/lib/monitor/rules'
import {
  hasTransient,
  type BoardFast,
  type BoardSlow,
  type SigId,
  type Signal,
} from '@/lib/monitor/signals'
import { RulesPanel, useMonErrText, type Prefill } from './rules-panel'
import { SCHEMA_MON_URL, SignalGrid, type Sel } from './signal-grid'
import { KpiNumbers, OverallCard, TodoList } from './status-summary'

const FAST_MS = 60_000
const SLOW_MS = 5 * 60_000
const MAX_MS = 5 * 60_000
const TIMEOUT_RISK = 3
const CARD = 'bg-surface rounded-2xl p-4'
const nf = (v: number | null, d = 1) =>
  v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d })

const ChartPanels = dynamic(() => import('./chart-panels'), {
  ssr: false,
  loading: () => <p className="text-muted-foreground text-sm">…</p>,
})

// 보드 오류 코드 → 빈/오류 상태 문구 키(monitor.board.empty.*)
const EMPTY_KEY: Record<string, string> = {
  CONN_UNSUPPORTED: 'unsupported',
  CONN_FAIL: 'connFail',
  LINK_DOWN: 'linkDown',
  LINK_AUTH: 'linkAuth',
  TIMEOUT: 'timeout',
  RATE: 'rate',
  RATE_LIMITED: 'rate',
}
const codeOf = (b: ApiErrorBody) =>
  b.code ?? (b.error === 'too_many_requests' ? 'RATE_LIMITED' : b.error)
const isRate = (c?: string) => c === 'RATE' || c === 'RATE_LIMITED'

export function MonitorView() {
  const t = useTranslations('monitor')
  return (
    <div className="w-full space-y-4 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm break-keep">
          {t('board.subtitle')}
        </p>
      </header>
      <LoginGate>{() => <MonitorBody />}</LoginGate>
    </div>
  )
}

type BoardState = {
  key: string
  fast: BoardFast | null
  slow: BoardSlow | null
  fastErr: ApiErrorBody | null
  slowErr: ApiErrorBody | null
  fastAt: number
  streak: number
  busy: boolean
}
const init = (key: string): BoardState => ({
  key,
  fast: null,
  slow: null,
  fastErr: null,
  slowErr: null,
  fastAt: 0,
  streak: 0,
  busy: true,
})

function useBoard(sel: Sel | null) {
  const key = sel ? `${sel.linkId}:${sel.connId ?? ''}` : ''
  const [st, setSt] = useState<BoardState>(() => init(key))
  const kick = useRef<(force: boolean) => void>(() => {})

  useEffect(() => {
    if (!sel) return
    const qs = `link=${encodeURIComponent(sel.linkId)}${sel.connId ? `&conn=${encodeURIComponent(sel.connId)}` : ''}`
    let alive = true
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = FAST_MS
    let lastFast = 0
    let lastSlow = 0
    let streak = 0
    const patch = (p: Partial<BoardState>) =>
      alive &&
      setSt((s) => (s.key === key ? { ...s, ...p } : { ...init(key), ...p }))
    patch({})

    async function tick(force: boolean) {
      if (running || !alive) return
      clearTimeout(timer)
      if (document.hidden && !force) return // 복귀 때 onVis 가 다시 시작
      running = true
      patch({ busy: true })
      const f = force ? '&force=1' : ''
      if (sel!.connId) {
        const r = await readApi<BoardFast>(
          piFetch(`/api/monitor/board?${qs}&tier=fast${f}`),
        )
        if (!alive) return
        lastFast = Date.now()
        if (r.ok) {
          const av = r.data.signals.find((s) => s.id === 'AVAIL')
          streak = av?.reason === 'LINK_TIMEOUT' ? streak + 1 : 0
          delay = FAST_MS
          patch({ fast: r.data, fastErr: null, fastAt: lastFast, streak })
        } else {
          const c = codeOf(r.body)
          if (isRate(c)) delay = Math.min(delay * 2, MAX_MS)
          if (c === 'TIMEOUT') streak++
          patch({ fastErr: r.body, streak })
        }
      }
      // slow 는 fast 응답 뒤(동시 연결 상한) — 접속 없으면 URL·연계 상태만
      if (force || Date.now() - lastSlow >= SLOW_MS) {
        const r = await readApi<BoardSlow>(
          piFetch(`/api/monitor/board?${qs}&tier=slow${f}`),
        )
        if (!alive) return
        if (r.ok) {
          // 일부 조회 실패가 있으면 다음 주기(fast 주기)에 다시 — 서버도 짧게만 캐시
          lastSlow = hasTransient(r.data.errors)
            ? Date.now() - SLOW_MS + delay
            : Date.now()
          patch({ slow: r.data, slowErr: null })
        } else {
          if (isRate(codeOf(r.body))) delay = Math.min(delay * 2, MAX_MS)
          lastSlow = Date.now() - SLOW_MS + delay // 다음 주기에 다시
          patch({ slowErr: r.body })
        }
      }
      running = false
      patch({ busy: false })
      timer = setTimeout(() => void tick(false), delay)
    }
    const onVis = () => {
      if (document.hidden) return
      const wait = lastFast + delay - Date.now()
      clearTimeout(timer)
      if (wait <= 0) void tick(false)
      else timer = setTimeout(() => void tick(false), wait)
    }
    kick.current = (force) => void tick(force)
    document.addEventListener('visibilitychange', onVis)
    void tick(false)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
    // sel 은 key 로 대표(같은 선택이면 다시 시작하지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const cur = st.key === key ? st : init(key)
  const refresh = useCallback((force = true) => kick.current(force), [])
  return { ...cur, refresh }
}

function MonitorBody() {
  const t = useTranslations('monitor')
  const errText = useMonErrText()
  const [sel, setSel] = useState<Sel | null>(null)
  const [picked, setPicked] = useState(false)
  const [prefill, setPrefill] = useState<Prefill>(null)
  const onChange = useCallback((s: LinkSelection) => {
    setPicked(true)
    setSel((p) =>
      s.linkId
        ? p?.linkId === s.linkId && p.connId === s.connId
          ? p
          : { linkId: s.linkId, connId: s.connId }
        : null,
    )
  }, [])
  const b = useBoard(sel)

  // 신호 합치기 — TIMEOUT 3연속이면 AVAIL 위험으로 승격(클라이언트 계수, db_stats 의 AVAIL 만)
  const signals = useMemo(() => {
    const m = new Map<SigId, Signal>()
    for (const s of [...(b.fast?.signals ?? []), ...(b.slow?.signals ?? [])])
      m.set(s.id, s)
    const av = m.get('AVAIL')
    if (av && b.streak >= TIMEOUT_RISK)
      m.set('AVAIL', {
        ...av,
        lvl: 'RISK',
        reason: null,
        params: { ...av.params, code: 'TIMEOUT' },
      })
    return m
  }, [b.fast, b.slow, b.streak])

  const addRule = useCallback(
    (metricCd: MetricCd) =>
      setPrefill((p) => ({ metricCd, n: (p?.n ?? 0) + 1 })),
    [],
  )

  const err = b.fastErr ?? (sel && !sel.connId ? b.slowErr : null)
  const errCode = err ? codeOf(err) : undefined
  const errMsg = err
    ? errCode && EMPTY_KEY[errCode]
      ? t(`board.empty.${EMPTY_KEY[errCode]}`)
      : errText(err)
    : null
  const staleMin =
    b.fastAt && Date.now() - b.fastAt > 3 * FAST_MS
      ? Math.round((Date.now() - b.fastAt) / 60_000)
      : 0

  return (
    <div className="space-y-4">
      <LinkPicker onChange={onChange} />
      {picked && !sel && (
        <p className={`${CARD} text-sm`}>
          {t('noLink')}{' '}
          <Link href="/connect" className="text-accent underline">
            {t('goConnect')}
          </Link>
        </p>
      )}
      {sel && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className={BTN}
              disabled={b.busy}
              onClick={() => b.refresh(true)}
            >
              {b.busy ? t('board.refresh.busy') : t('board.refresh.now')}
            </button>
            {b.fastAt > 0 && (
              <span className="text-muted-foreground">
                {t('board.refresh.updated', {
                  time: new Date(b.fastAt).toLocaleTimeString(),
                })}
              </span>
            )}
            {staleMin > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">
                <span aria-hidden>▲ </span>
                {t('board.refresh.stale', { min: staleMin })}
              </span>
            )}
          </div>
          {!sel.connId && (
            <p className={`${CARD} text-sm break-keep`}>
              {t('board.empty.noConn')}
            </p>
          )}
          {errMsg && (
            <p
              className={`${CARD} text-sm break-keep text-red-400`}
              role="alert"
            >
              <span aria-hidden>✕ </span>
              {errMsg}
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <OverallCard signals={signals} />
            </div>
            <KpiNumbers kpi={b.fast?.kpi ?? null} />
          </div>
          <TodoList signals={signals} sel={sel} />
          <SignalGrid
            signals={signals}
            sel={sel}
            pending={{
              fast: !b.fast && !b.fastErr,
              slow: !b.slow && !b.slowErr,
            }}
            onAddRule={addRule}
          />
          {sel.connId && (
            <ChartPanels
              sel={sel}
              fast={b.fast}
              slow={b.slow}
              signals={signals}
            />
          )}
          <div className="space-y-3">
            <RulesPanel
              linkId={sel.linkId}
              connId={sel.connId}
              prefill={prefill}
              onChanged={() => b.refresh(true)}
            />
            <SchemaSvc slow={b.slow} />
            <p className={`${CARD} text-sm`}>
              {t('aiNote')}{' '}
              <a
                href={SCHEMA_MON_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                {t('aiLink')}
              </a>
            </p>
            <p className="text-muted-foreground text-xs break-keep">
              {t('board.aux.source')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// 보조 '연계 상태' — schema.pi 서비스 응답(앱 지표 4개, 최근 60분)
function SchemaSvc({ slow }: { slow: BoardSlow | null }) {
  const t = useTranslations('monitor')
  const a = slow?.app ?? null
  return (
    <details className={CARD}>
      <summary className="cursor-pointer font-bold">
        {t('board.aux.schemaSvc')}
      </summary>
      <p className="text-muted-foreground my-2 text-xs break-keep">
        {t('board.aux.schemaSvcNote')}
      </p>
      {!a ? (
        <p className="text-muted-foreground text-sm">
          {slow ? '—' : t('loading')}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['APP_TPS', nf(a.tps, 3)],
              ['APP_ERR_PCT', `${nf(a.errPct, 2)}%`],
              ['APP_SLOW_CNT', nf(a.slowCnt, 0)],
              ['APP_AVG_MS', nf(a.avgMs)],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground text-xs">
                {t(`metrics.${k}`)}
              </dt>
              <dd className="text-lg font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  )
}
