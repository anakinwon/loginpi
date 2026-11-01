'use client'

// AI 튜닝 권고 패널(PRD 12 §2-4, P40~P42) — 저장 계획 선택 → 권고 만들기(AI, 키 없으면 규칙) → 승인/반려(연결 소유자)
//  → 적용 뒤 같은 SQL 을 다시 EXPLAIN·저장한 후 계획을 골라 효과 측정(측정 없이는 적용 완료 불가). 펼칠 때 첫 쪽 조회(지연 조회), 20건 쪽 단위
//  DDL 은 제안 텍스트만 — 실제 적용은 schema.pi DDL 실행(P10) 안내 링크
import { useEffect, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi } from '@/lib/client-api'
import {
  aftPlanError,
  effectPct,
  type TunItem,
  type TunStatus,
} from '@/lib/sql-lab/tune'
import { CARD, useLabErrorText } from './plan-tree'

const SCHEMA_URL = 'https://schem.vercel.app'

type Plan = {
  plan_id: string
  conn_id: string
  plan_nm: string | null
  sql_hash: string
  total_cost: number
  reg_dtm: string
}
type Tun = {
  tun_id: string
  conn_id: string
  plan_id: string
  sql_hash: string
  engn_cd: 'AI' | 'RULE'
  rcmd_json: TunItem[]
  tun_sts_cd: TunStatus
  bfr_cost: number
  aprv_dtm: string | null
  aft_plan_id: string | null
  aft_cost: number | null
  msr_dtm: string | null
  reg_dtm: string
}
type Page<T> = { items: T[]; hasNext: boolean }

const STS_CLS: Record<TunStatus, string> = {
  RCMD: 'bg-sky-500/15 text-sky-300',
  APRV: 'bg-amber-500/15 text-amber-400',
  RJCT: 'text-muted-foreground border border-white/20',
  APLD: 'bg-emerald-500/15 text-emerald-400',
}
const BADGE = 'rounded-full px-2 py-0.5 text-xs font-medium'

const planLabel = (p: Plan) =>
  `${p.plan_nm || p.sql_hash.slice(0, 8)} · ${p.total_cost} · ${new Date(p.reg_dtm).toLocaleString()}`

export function TunePanel({
  linkId,
  savedTick,
}: {
  linkId: string
  savedTick: number
}) {
  const t = useTranslations('sqlLab.ai')
  const locale = useLocale()
  const errText = useLabErrorText()
  const [page, setPage] = useState(0) // 0 = 아직 안 읽음
  const [tunes, setTunes] = useState<Tun[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [planId, setPlanId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const q = `link=${encodeURIComponent(linkId)}`

  async function loadTunes(p: number) {
    const r = await readApi<Page<Tun>>(
      piFetch(`/api/sql-lab/tunes?${q}&page=${p}`),
    )
    if (!r.ok) return setErr(errText(r.body))
    setTunes(r.data.items)
    setHasNext(r.data.hasNext)
    setPage(p)
  }

  // 권고 대상 후보 = 최근 저장 계획 20건
  async function loadPlans() {
    const r = await readApi<Page<Plan>>(
      piFetch(`/api/sql-lab/plans?${q}&page=1`),
    )
    if (!r.ok) return setErr(errText(r.body))
    setPlans(r.data.items)
  }

  async function open() {
    setBusy(true)
    setErr(null)
    await Promise.all([loadTunes(1), loadPlans()])
    setBusy(false)
  }

  // 위에서 계획을 새로 저장하면 후보만 다시 읽는다(펼친 뒤에만)
  useEffect(() => {
    if (page > 0 && savedTick > 0) void loadPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTick])

  async function create() {
    if (!planId) return
    setBusy(true)
    setErr(null)
    const r = await readApi<{ item: Tun }>(
      piFetch('/api/sql-lab/tunes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, planId, locale }),
      }),
    )
    if (!r.ok) setErr(errText(r.body))
    else setPlanId('')
    // 성공·이미 있음(TUN_EXISTS) 둘 다 목록 첫 쪽에서 보이게
    await loadTunes(1)
    setBusy(false)
  }

  const replace = (it: Tun) =>
    setTunes((ts) => ts.map((x) => (x.tun_id === it.tun_id ? it : x)))

  async function remove(id: string) {
    setErr(null)
    const r = await readApi(
      piFetch(`/api/sql-lab/tunes/${id}?${q}`, { method: 'DELETE' }),
    )
    if (!r.ok) return setErr(errText(r.body))
    void loadTunes(page)
  }

  return (
    <section className={CARD}>
      <details
        onToggle={(e) => e.currentTarget.open && page === 0 && void open()}
      >
        <summary className="cursor-pointer font-bold">{t('title')}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted-foreground text-sm break-keep">
            {t('intro')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              aria-label={t('pickPlan')}
              className="bg-surface-raised h-10 w-full min-w-0 rounded-lg px-3 text-sm sm:w-auto sm:flex-1"
            >
              <option value="">{t('pickPlan')}</option>
              {plans.map((p) => (
                <option key={p.plan_id} value={p.plan_id}>
                  {planLabel(p)}
                </option>
              ))}
            </select>
            <button
              className={BTN_PRIMARY}
              disabled={busy || !planId}
              onClick={() => void create()}
            >
              {busy ? t('creating') : t('create')}
            </button>
          </div>
          {page > 0 && !plans.length && (
            <p className="text-muted-foreground text-xs">{t('noPlans')}</p>
          )}
          <p className="text-muted-foreground text-xs">{t('note')}</p>
          {err && (
            <p className="text-danger text-sm" role="alert">
              {err}
            </p>
          )}
          {page > 0 && !tunes.length && (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
          <ul className="flex flex-col gap-3">
            {tunes.map((it) => (
              <TuneCard
                key={it.tun_id}
                tun={it}
                linkId={linkId}
                onChange={replace}
                onRemove={() => void remove(it.tun_id)}
                onError={setErr}
              />
            ))}
          </ul>
          {page > 0 && (page > 1 || hasNext) && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={BTN}
                disabled={busy || page <= 1}
                onClick={() => void loadTunes(page - 1)}
              >
                {t('prev')}
              </button>
              <span className="text-muted-foreground text-xs">
                {t('page', { page })}
              </span>
              <button
                className={BTN}
                disabled={busy || !hasNext}
                onClick={() => void loadTunes(page + 1)}
              >
                {t('next')}
              </button>
            </div>
          )}
        </div>
      </details>
    </section>
  )
}

function TuneCard({
  tun,
  linkId,
  onChange,
  onRemove,
  onError,
}: {
  tun: Tun
  linkId: string
  onChange: (t: Tun) => void
  onRemove: () => void
  onError: (msg: string | null) => void
}) {
  const t = useTranslations('sqlLab.ai')
  const errText = useLabErrorText()
  const [busy, setBusy] = useState(false)
  // 효과 측정 후보 = 같은 접속·같은 SQL·전 계획 아님·승인 이후 저장(서버도 같은 조건으로 다시 막는다)
  const [cands, setCands] = useState<Plan[] | null>(null)
  const [aftId, setAftId] = useState('')
  const q = `link=${encodeURIComponent(linkId)}`

  async function act(a: 'approve' | 'reject' | 'measure') {
    setBusy(true)
    onError(null)
    const r = await readApi<{ item: Tun }>(
      piFetch(`/api/sql-lab/tunes/${tun.tun_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId,
          act: a,
          aftPlanId: a === 'measure' ? aftId : undefined,
        }),
      }),
    )
    setBusy(false)
    if (r.ok) onChange(r.data.item)
    else onError(errText(r.body))
  }

  async function loadCands() {
    setBusy(true)
    onError(null)
    const r = await readApi<Page<Plan>>(
      piFetch(`/api/sql-lab/plans?${q}&page=1&hash=${tun.sql_hash}`),
    )
    setBusy(false)
    if (!r.ok) return onError(errText(r.body))
    setCands(r.data.items.filter((p) => !aftPlanError(tun, p)))
  }

  const pct =
    tun.aft_cost != null ? effectPct(tun.bfr_cost, tun.aft_cost) : null

  return (
    <li className="bg-surface-raised rounded-lg p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`${BADGE} ${tun.engn_cd === 'AI' ? 'bg-violet-500/15 text-violet-300' : 'bg-white/10'}`}
        >
          {t(`engn.${tun.engn_cd}`)}
        </span>
        <span className={`${BADGE} ${STS_CLS[tun.tun_sts_cd]}`}>
          {t(`sts.${tun.tun_sts_cd}`)}
        </span>
        <span className="text-muted-foreground min-w-0 flex-1 font-mono text-xs break-all">
          {t('cost')} {tun.bfr_cost} · {new Date(tun.reg_dtm).toLocaleString()}
        </span>
        <button
          className="text-muted-foreground text-xs underline"
          onClick={onRemove}
          disabled={busy}
        >
          {t('delete')}
        </button>
      </div>

      {!tun.rcmd_json.length ? (
        <p className="text-muted-foreground mt-2 text-xs">{t('noItems')}</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {tun.rcmd_json.map((it, i) => (
            <Rcmd key={i} item={it} />
          ))}
        </ol>
      )}

      {tun.tun_sts_cd === 'RCMD' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={BTN}
            disabled={busy}
            onClick={() => void act('approve')}
          >
            {t('approve')}
          </button>
          <button
            className={BTN}
            disabled={busy}
            onClick={() => void act('reject')}
          >
            {t('reject')}
          </button>
        </div>
      )}

      {tun.tun_sts_cd === 'APRV' && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-muted-foreground text-xs break-keep">
            {t('measureHint')}
          </p>
          {cands === null ? (
            <button
              className={`${BTN} self-start`}
              disabled={busy}
              onClick={() => void loadCands()}
            >
              {t('findAfter')}
            </button>
          ) : !cands.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">{t('noAfter')}</p>
              <button
                className={BTN}
                disabled={busy}
                onClick={() => void loadCands()}
              >
                {t('reload')}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={aftId}
                onChange={(e) => setAftId(e.target.value)}
                aria-label={t('pickAfter')}
                className="bg-surface h-10 w-full min-w-0 rounded-lg px-3 text-sm sm:w-auto sm:flex-1"
              >
                <option value="">{t('pickAfter')}</option>
                {cands.map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>
                    {planLabel(p)}
                  </option>
                ))}
              </select>
              <button
                className={BTN_PRIMARY}
                disabled={busy || !aftId}
                onClick={() => void act('measure')}
              >
                {t('measure')}
              </button>
            </div>
          )}
        </div>
      )}

      {tun.tun_sts_cd === 'APLD' && tun.aft_cost != null && (
        <p
          className={`mt-3 font-semibold ${pct != null && pct < 0 ? 'text-emerald-400' : ''}`}
        >
          {t('effect', {
            bfr: tun.bfr_cost,
            aft: tun.aft_cost,
            pct: pct == null ? '-' : pct > 0 ? `+${pct}` : String(pct),
          })}{' '}
          <span className="text-muted-foreground text-xs font-normal">
            {pct == null
              ? ''
              : pct < 0
                ? t('better')
                : pct > 0
                  ? t('worse')
                  : t('same')}
          </span>
        </p>
      )}
    </li>
  )
}

function Rcmd({ item }: { item: TunItem }) {
  const t = useTranslations('sqlLab.ai')
  const p = item.params ?? {}
  const text = item.code
    ? t(`rule.${item.code}`, {
        relation: p.relation ?? '-',
        column: p.column ?? '-',
        rows: p.rows ?? '-',
        kb: p.kb ?? '-',
      })
    : null
  return (
    <li className="bg-surface rounded-lg p-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`${BADGE} bg-white/10`}>{t(`kind.${item.kind}`)}</span>
        <span className="font-semibold break-keep">{text ?? item.title}</span>
      </p>
      {!text && item.reason && (
        <p className="text-muted-foreground mt-1 text-xs break-keep">
          {item.reason}
        </p>
      )}
      {item.ddl && (
        <Code label={t('ddl')} code={item.ddl}>
          <a
            href={SCHEMA_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent text-xs underline"
          >
            {t('runDdl')}
          </a>
        </Code>
      )}
      {item.sql && <Code label={t('rewrite')} code={item.sql} />}
    </li>
  )
}

function Code({
  label,
  code,
  children,
}: {
  label: string
  code: string
  children?: ReactNode
}) {
  const t = useTranslations('sqlLab.ai')
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 복사 권한이 없는 브라우저(일부 WebView) — 코드 블록을 직접 선택해 복사
    }
  }
  return (
    <div className="mt-2">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{label}</span>
        <button className="underline" onClick={() => void copy()}>
          {copied ? t('copied') : t('copy')}
        </button>
        {children}
      </div>
      <pre className="bg-surface-raised overflow-x-auto rounded p-2 font-mono text-xs break-all whitespace-pre-wrap select-all">
        {code}
      </pre>
    </div>
  )
}
