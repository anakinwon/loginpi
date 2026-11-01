'use client'

// DB 운영 안전 화면(PRD 12 §9) — 로그인 게이트 + 연결·접속 선택 + 진단 실행(읽기 전용) + 탭 5개(파라미터·계정권한·백업·복제·이력)
//  접속을 고르면 최근 진단 1건을 불러오고(원격 조회 없음), '진단 실행' 때만 schema.pi 조회. 점검표·이력은 그 탭을 열 때만 조회. 모든 호출 piFetch
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, type ApiErrorBody } from '@/lib/client-api'
import { LoginGate } from '@/components/login-gate'
import { LinkPicker, type LinkSelection } from '@/components/link/link-picker'
import { useLinkErrText } from '@/components/link/link-api'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import {
  MANUAL_CHECKS,
  type Finding,
  type Level,
  type ReplicaRow,
} from '@/lib/ops/params'

const TABS = ['params', 'audit', 'backup', 'repl', 'history'] as const
type Tab = (typeof TABS)[number]
type Sel = { linkId: string; connId: string }
type Section = {
  findings?: Finding[]
  error?: string | null
  truncated?: boolean
  arcError?: string | null
}
type Repl = {
  role?: string
  summary?: Finding
  replicas?: ReplicaRow[]
  error?: string | null
}
type Rslt = {
  version: string | null
  params: Section
  audit: Section
  backup: Section
  repl: Repl
}
type Run = {
  runId: string
  runDtm: string
  ok: number
  warn: number
  risk: number
  rslt?: Rslt
}

const CARD = 'bg-surface rounded-2xl p-4 sm:p-5'
const TH =
  'text-muted-foreground px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap'
const TD = 'px-2 py-1.5 align-top'
const LEVEL_CLS: Record<Level, string> = {
  OK: 'bg-emerald-500/15 text-emerald-400',
  WARN: 'bg-amber-500/15 text-amber-400',
  RISK: 'bg-red-500/15 text-red-400',
}
const fmtDtm = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : '-'
const qs = (sel: Sel, extra = '') =>
  `link=${sel.linkId}&conn=${encodeURIComponent(sel.connId)}${extra}`

function useErrText() {
  const t = useTranslations('ops.err')
  const linkErr = useLinkErrText()
  return useCallback(
    (b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : linkErr(b)),
    [t, linkErr],
  )
}

export function OpsView() {
  return <LoginGate>{() => <OpsInner />}</LoginGate>
}

function OpsInner() {
  const t = useTranslations('ops')
  const errText = useErrText()
  const [sel, setSel] = useState<Sel | null>(null)
  // 모니터링 딥링크 ?tab= 초기값(목록 밖 값은 기본 탭)
  const tab0 = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(() =>
    (TABS as readonly string[]).includes(tab0 ?? '') ? (tab0 as Tab) : 'params',
  )
  const [run, setRun] = useState<{ key: string; run: Run | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rev, setRev] = useState(0)
  const key = sel ? qs(sel) : ''

  const onChange = useCallback((s: LinkSelection) => {
    setSel(s.linkId && s.connId ? { linkId: s.linkId, connId: s.connId } : null)
    setErr(null)
  }, [])

  // 접속 선택 시 최근 진단 1건(dbms DB 만, 원격 조회 없음)
  useEffect(() => {
    if (!sel) return
    let alive = true
    const k = qs(sel)
    void readApi<{ run: Run | null }>(
      piFetch(`/api/ops/runs?${k}&latest=1`),
    ).then((r) => {
      if (!alive) return
      if (r.ok) setRun({ key: k, run: r.data.run })
      else setErr(errText(r.body))
    })
    return () => {
      alive = false
    }
  }, [sel, errText])

  async function diagnose() {
    if (!sel) return
    setBusy(true)
    setErr(null)
    const r = await readApi<Run>(
      piFetch('/api/ops/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sel),
      }),
    )
    setBusy(false)
    if (r.ok) {
      setRun({ key: qs(sel), run: r.data })
      setRev((v) => v + 1)
    } else setErr(errText(r.body))
  }

  const cur = run?.key === key ? run.run : undefined
  return (
    <div className="flex flex-col gap-4">
      <LinkPicker onChange={onChange} />
      {!sel ? (
        <p className={`${CARD} text-muted-foreground text-sm`}>
          {t('pickFirst')}
        </p>
      ) : (
        <>
          <div className={`${CARD} flex flex-wrap items-center gap-3`}>
            <button
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() => void diagnose()}
            >
              {busy ? t('running') : t('run')}
            </button>
            {cur === undefined ? (
              <span className="text-muted-foreground text-sm">
                {t('loading')}
              </span>
            ) : cur === null ? (
              <span className="text-muted-foreground text-sm">
                {t('noRun')}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t('lastRun', { dtm: fmtDtm(cur.runDtm) })}
                </span>
                <Badge level="RISK" text={`${t('level.RISK')} ${cur.risk}`} />
                <Badge level="WARN" text={`${t('level.WARN')} ${cur.warn}`} />
                <Badge level="OK" text={`${t('level.OK')} ${cur.ok}`} />
              </div>
            )}
            <p className="text-muted-foreground w-full text-xs break-keep">
              {t('readOnly')}
            </p>
            {cur?.rslt?.version && (
              <p className="text-muted-foreground w-full truncate text-xs">
                {cur.rslt.version}
              </p>
            )}
            {err && (
              <p className="text-danger w-full text-sm" role="alert">
                {err}
              </p>
            )}
          </div>
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
          <section className={CARD} role="tabpanel">
            {tab !== 'history' && cur === null && (
              <p className="text-muted-foreground text-sm">{t('noRun')}</p>
            )}
            {tab === 'params' && cur?.rslt && (
              <Findings sec={cur.rslt.params} note={t('paramsNote')} />
            )}
            {tab === 'audit' && cur?.rslt && (
              <Findings sec={cur.rslt.audit} note={t('auditNote')} />
            )}
            {tab === 'backup' && (
              <>
                {cur?.rslt && <Findings sec={cur.rslt.backup} />}
                <ManualChecks sel={sel} />
              </>
            )}
            {tab === 'repl' && cur?.rslt && <ReplView repl={cur.rslt.repl} />}
            {tab === 'history' && (
              <History
                sel={sel}
                rev={rev}
                onPick={(r) => {
                  setRun({ key, run: r })
                  setTab('params')
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Badge({ level, text }: { level: Level; text?: string }) {
  const t = useTranslations('ops.level')
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${LEVEL_CLS[level]}`}
    >
      {text ?? t(level)}
    </span>
  )
}

function SecErr({ code }: { code: string }) {
  const errText = useErrText()
  return (
    <p className="text-danger text-sm" role="alert">
      {errText({ code })}
    </p>
  )
}

function Findings({ sec, note }: { sec: Section; note?: string }) {
  const t = useTranslations('ops')
  if (sec.error) return <SecErr code={sec.error} />
  const fs = sec.findings ?? []
  return (
    <div className="flex flex-col gap-3">
      {note && (
        <p className="text-muted-foreground text-xs break-keep">{note}</p>
      )}
      {sec.truncated && (
        <p className="text-xs text-amber-400">{t('truncated')}</p>
      )}
      {sec.arcError && <SecErr code={sec.arcError} />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>{t('col.level')}</th>
              <th className={TH}>{t('col.item')}</th>
              <th className={TH}>{t('col.value')}</th>
              <th className={TH}>{t('col.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {fs.map((f, i) => (
              <tr key={`${f.rule}-${i}`} className="border-t border-white/5">
                <td className={TD}>
                  <Badge level={f.level} />
                </td>
                <td className={`${TD} font-mono text-xs whitespace-nowrap`}>
                  {f.name ?? t(`item.${f.rule}`)}
                </td>
                <td className={`${TD} font-mono text-xs`}>{f.value ?? '-'}</td>
                <td className={`${TD} break-keep`}>
                  {t(`rules.${f.rule}`)}
                  {f.targets && f.targets.length > 0 && f.level !== 'OK' && (
                    <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                      {f.targets.join(', ')}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type Chk = {
  chkCd: string
  done: boolean
  memoTxt: string | null
  modDtm: string
}

function ManualChecks({ sel }: { sel: Sel }) {
  const t = useTranslations('ops')
  const errText = useErrText()
  const k = qs(sel)
  const [state, setState] = useState<{
    key: string
    items: Record<string, Chk>
    err?: string
  } | null>(null)
  const [memo, setMemo] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void readApi<{ items: Chk[] }>(piFetch(`/api/ops/checks?${k}`)).then(
      (r) => {
        if (!alive) return
        setState(
          r.ok
            ? {
                key: k,
                items: Object.fromEntries(
                  r.data.items.map((c) => [c.chkCd, c]),
                ),
              }
            : { key: k, items: {}, err: errText(r.body) },
        )
        setMemo({})
      },
    )
    return () => {
      alive = false
    }
  }, [k, errText])

  async function save(chkCd: string, done: boolean, memoTxt: string | null) {
    setSaving(chkCd)
    const r = await readApi<{ item: Chk }>(
      piFetch('/api/ops/checks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...sel, chkCd, done, memoTxt }),
      }),
    )
    setSaving(null)
    setState((s) =>
      s && s.key === k
        ? r.ok
          ? {
              ...s,
              items: { ...s.items, [chkCd]: r.data.item },
              err: undefined,
            }
          : { ...s, err: errText(r.body) }
        : s,
    )
  }

  const cur = state?.key === k ? state : null
  return (
    <div className="mt-5 flex flex-col gap-2">
      <h2 className="font-semibold">{t('manual.title')}</h2>
      <p className="text-muted-foreground text-xs break-keep">
        {t('manual.intro')}
      </p>
      {!cur ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {MANUAL_CHECKS.map((cd) => {
            const c = cur.items[cd]
            const m = memo[cd] ?? c?.memoTxt ?? ''
            return (
              <li
                key={cd}
                className="bg-surface-raised flex flex-col gap-2 rounded-xl p-3"
              >
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={!!c?.done}
                    disabled={saving === cd}
                    onChange={(e) => void save(cd, e.target.checked, m || null)}
                  />
                  <span className="break-keep">{t(`manual.items.${cd}`)}</span>
                </label>
                <div className="flex min-w-0 gap-2">
                  <input
                    className="bg-surface h-9 min-w-0 flex-1 rounded-lg px-3 text-sm"
                    maxLength={500}
                    placeholder={t('manual.memo')}
                    value={m}
                    onChange={(e) =>
                      setMemo((x) => ({ ...x, [cd]: e.target.value }))
                    }
                  />
                  <button
                    className={BTN}
                    disabled={saving === cd || m === (c?.memoTxt ?? '')}
                    onClick={() => void save(cd, !!c?.done, m || null)}
                  >
                    {t('manual.save')}
                  </button>
                </div>
                {c && (
                  <p className="text-muted-foreground text-xs">
                    {t('manual.updated', { dtm: fmtDtm(c.modDtm) })}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {cur?.err && (
        <p className="text-danger text-sm" role="alert">
          {cur.err}
        </p>
      )}
    </div>
  )
}

function ReplView({ repl }: { repl: Repl }) {
  const t = useTranslations('ops')
  if (repl.error) return <SecErr code={repl.error} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs break-keep">
        {t('replNote')}
      </p>
      {repl.summary && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge level={repl.summary.level} />
          <span className="text-muted-foreground">
            {t(`role.${repl.role ?? 'unknown'}`)}
          </span>
          <span className="break-keep">{t(`rules.${repl.summary.rule}`)}</span>
        </div>
      )}
      {repl.replicas && repl.replicas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('col.level')}</th>
                <th className={TH}>{t('col.standby')}</th>
                <th className={TH}>{t('col.state')}</th>
                <th className={TH}>{t('col.sync')}</th>
                <th className={TH}>{t('col.lag')}</th>
              </tr>
            </thead>
            <tbody>
              {repl.replicas.map((r, i) => (
                <tr key={`${r.appNm}-${i}`} className="border-t border-white/5">
                  <td className={TD}>
                    <Badge level={r.level} />
                  </td>
                  <td className={`${TD} font-mono text-xs`}>
                    {r.appNm}
                    {r.clientAddr && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {r.clientAddr}
                      </span>
                    )}
                  </td>
                  <td className={TD}>{r.state ?? '-'}</td>
                  <td className={TD}>{r.syncState ?? '-'}</td>
                  <td className={`${TD} font-mono text-xs`}>
                    {r.lagSec === null
                      ? t('lagIdle')
                      : `${r.lagSec.toFixed(1)}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function History({
  sel,
  rev,
  onPick,
}: {
  sel: Sel
  rev: number
  onPick: (r: Run) => void
}) {
  const t = useTranslations('ops')
  const errText = useErrText()
  const [page, setPage] = useState(1)
  const url = `/api/ops/runs?${qs(sel, `&page=${page}`)}#${rev}`
  const [state, setState] = useState<{
    url: string
    items: Run[]
    hasMore: boolean
    err?: string
  } | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void readApi<{ items: Run[]; hasMore: boolean }>(
      piFetch(url.split('#')[0]),
    ).then((r) => {
      if (!alive) return
      setState(
        r.ok
          ? { url, ...r.data }
          : { url, items: [], hasMore: false, err: errText(r.body) },
      )
    })
    return () => {
      alive = false
    }
  }, [url, errText])

  async function open(runId: string) {
    setOpening(runId)
    const r = await readApi<{ run: Run | null }>(
      piFetch(`/api/ops/runs?${qs(sel, `&id=${runId}`)}`),
    )
    setOpening(null)
    if (r.ok && r.data.run) onPick(r.data.run)
  }

  const cur = state?.url === url ? state : null
  if (!cur)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (cur.err)
    return (
      <p className="text-danger text-sm" role="alert">
        {cur.err}
      </p>
    )
  return (
    <div className="flex flex-col gap-3">
      {cur.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noRun')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cur.items.map((r) => (
            <li key={r.runId}>
              <button
                className="bg-surface-raised flex w-full flex-wrap items-center gap-2 rounded-xl p-3 text-left text-sm disabled:opacity-50"
                disabled={opening === r.runId}
                onClick={() => void open(r.runId)}
              >
                <span className="text-muted-foreground mr-auto">
                  {fmtDtm(r.runDtm)}
                </span>
                <Badge level="RISK" text={`${t('level.RISK')} ${r.risk}`} />
                <Badge level="WARN" text={`${t('level.WARN')} ${r.warn}`} />
                <Badge level="OK" text={`${t('level.OK')} ${r.ok}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <nav
        aria-label={t('pager')}
        className="flex items-center justify-center gap-2"
      >
        <button
          className={BTN}
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {t('prev')}
        </button>
        <span className="text-muted-foreground text-sm">{page}</span>
        <button
          className={BTN}
          disabled={!cur.hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('next')}
        </button>
      </nav>
    </div>
  )
}
