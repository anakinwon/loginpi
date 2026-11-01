'use client'

// 저장한 실행계획 목록·비교(PRD 12 §2-2) — 펼칠 때 첫 쪽 조회(지연 조회), 20건 쪽 단위, 2건 골라 나란히 비교(diffPlans)
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { BTN } from '@/components/ui'
import { readApi } from '@/lib/client-api'
import { analyzePlan, diffPlans, type PlanNode } from '@/lib/sql-lab/plan'
import { CARD, PlanTree, useLabErrorText, Warnings } from './plan-tree'

type Item = { plan_id: string; conn_id: string; plan_nm: string | null; sql_hash: string; total_cost: number; reg_dtm: string }
type Detail = Item & { sql_txt: string; plan_json: PlanNode }

export function SavedPlans({ linkId }: { linkId: string }) {
  const t = useTranslations('sqlLab.saved')
  const errText = useLabErrorText()
  const [page, setPage] = useState(0) // 0 = 아직 안 읽음
  const [items, setItems] = useState<Item[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [pair, setPair] = useState<[Detail, Detail] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const q = `link=${encodeURIComponent(linkId)}`

  async function load(p: number) {
    setBusy(true)
    setErr(null)
    const r = await readApi<{ items: Item[]; hasNext: boolean }>(piFetch(`/api/sql-lab/plans?${q}&page=${p}`))
    setBusy(false)
    if (!r.ok) return setErr(errText(r.body))
    setItems(r.data.items)
    setHasNext(r.data.hasNext)
    setPage(p)
  }

  async function compare() {
    setBusy(true)
    setErr(null)
    const rs = await Promise.all(picked.map((id) => readApi<Detail>(piFetch(`/api/sql-lab/plans/${id}?${q}`))))
    setBusy(false)
    const bad = rs.find((r) => !r.ok)
    if (bad && !bad.ok) return setErr(errText(bad.body))
    const ds = rs.map((r) => (r.ok ? r.data : null)) as Detail[]
    // 먼저 저장한 계획을 왼쪽(전)으로
    ds.sort((a, b) => a.reg_dtm.localeCompare(b.reg_dtm))
    setPair([ds[0], ds[1]])
  }

  async function remove(id: string) {
    const r = await readApi(piFetch(`/api/sql-lab/plans/${id}?${q}`, { method: 'DELETE' }))
    if (!r.ok) return setErr(errText(r.body))
    setPicked((p) => p.filter((x) => x !== id))
    void load(page)
  }

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)))

  return (
    <section className={CARD}>
      <details onToggle={(e) => e.currentTarget.open && page === 0 && void load(1)}>
        <summary className="cursor-pointer font-bold">{t('title')}</summary>
        <div className="mt-3 flex flex-col gap-3">
          {err && (
            <p className="text-danger text-sm" role="alert">
              {err}
            </p>
          )}
          {page > 0 && !items.length && <p className="text-muted-foreground text-sm">{t('empty')}</p>}
          <ul className="flex flex-col gap-1 text-sm">
            {items.map((it) => (
              <li key={it.plan_id} className="bg-surface-raised flex flex-wrap items-center gap-2 rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  checked={picked.includes(it.plan_id)}
                  onChange={() => toggle(it.plan_id)}
                  aria-label={t('pick')}
                />
                <span className="min-w-0 flex-1 break-all">{it.plan_nm || it.sql_hash.slice(0, 8)}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {t('cost')} {it.total_cost} · {new Date(it.reg_dtm).toLocaleString()}
                </span>
                <button className="text-muted-foreground text-xs underline" onClick={() => void remove(it.plan_id)}>
                  {t('delete')}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN} disabled={busy || page <= 1} onClick={() => void load(page - 1)}>
              {t('prev')}
            </button>
            <span className="text-muted-foreground text-xs">{t('page', { page: Math.max(page, 1) })}</span>
            <button className={BTN} disabled={busy || !hasNext} onClick={() => void load(page + 1)}>
              {t('next')}
            </button>
            <button className={BTN} disabled={busy || picked.length !== 2} onClick={() => void compare()}>
              {t('compare')}
            </button>
            {picked.length !== 2 && <span className="text-muted-foreground text-xs">{t('pick2')}</span>}
          </div>
          {pair && <Diff a={pair[0]} b={pair[1]} />}
        </div>
      </details>
    </section>
  )
}

function Diff({ a, b }: { a: Detail; b: Detail }) {
  const t = useTranslations('sqlLab.diff')
  const d = diffPlans(a.plan_json, b.plan_json)
  const sameSql = a.sql_hash === b.sql_hash
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface-raised rounded-lg p-3 text-sm">
        <p className="font-semibold">
          {t('cost', { a: d.costA, b: d.costB, delta: d.delta > 0 ? `+${d.delta}` : d.delta, pct: d.pct ?? '-' })}
        </p>
        {!sameSql && <p className="text-muted-foreground mt-1 text-xs">{t('diffSql')}</p>}
        {d.scanChanges.length > 0 && (
          <ul className="mt-2 text-xs">
            {d.scanChanges.map((c) => (
              <li key={c.relation}>{t('scan', c)}</li>
            ))}
          </ul>
        )}
        {d.typeChanges.length > 0 && (
          <ul className="text-muted-foreground mt-2 text-xs">
            {d.typeChanges.map((c) => (
              <li key={c.nodeType}>{t('type', { nodeType: c.nodeType, a: c.a, b: c.b })}</li>
            ))}
          </ul>
        )}
        {!d.scanChanges.length && !d.typeChanges.length && <p className="text-muted-foreground mt-1 text-xs">{t('none')}</p>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[a, b].map((p, i) => (
          <div key={p.plan_id} className="min-w-0">
            <p className="mb-1 text-xs font-semibold">
              {i === 0 ? t('before') : t('after')} — {p.plan_nm || p.sql_hash.slice(0, 8)}
            </p>
            <Warnings warnings={analyzePlan(p.plan_json)} />
            <PlanTree root={p.plan_json} warnings={analyzePlan(p.plan_json)} />
          </div>
        ))}
      </div>
    </div>
  )
}
