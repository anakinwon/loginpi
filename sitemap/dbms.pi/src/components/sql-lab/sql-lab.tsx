'use client'

// SQL 튜닝 랩 화면(PRD 12 §2) — 로그인 게이트 → 연결·접속 선택(LinkPicker, URL ?link=&conn=) → SQL 입력
//  [실행계획] POST /api/sql-lab/explain → 트리·경고 / [점검] lint.ts(브라우저) + 표준 도메인 GET /api/sql-lab/domains / [저장] → 저장 계획 비교 / AI 권고 = 준비 중
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { LinkPicker, type LinkSelection } from '@/components/link/link-picker'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi } from '@/lib/client-api'
import { SQL_LAB_SEED } from '@/lib/sql-lab/seed'
import { lintSql, type Domain, type LintIssue } from '@/lib/sql-lab/lint'
import type { PlanNode, PlanWarning } from '@/lib/sql-lab/plan'
import { CARD, PlanTree, useLabErrorText, Warnings } from './plan-tree'
import { SavedPlans } from './saved-plans'

export function SqlLab() {
  return <LoginGate>{() => <Lab />}</LoginGate>
}

type ExplainRes = { plan: PlanNode; warnings: PlanWarning[]; ms: number }

function Lab() {
  const t = useTranslations('sqlLab')
  const errText = useLabErrorText()
  const sp = useSearchParams()
  const [sel, setSel] = useState<LinkSelection | null>(null)
  const linkId = sel ? sel.linkId : sp.get('link')
  const connId = sel ? sel.connId : sp.get('conn')

  const [sql, setSql] = useState('')
  // 다른 화면(느린 쿼리 출처)이 넘긴 쿼리문 1회 채움 — 읽고 바로 지움(SSR 불일치 피하려 effect 에서)
  useEffect(() => {
    const seed = sessionStorage.getItem(SQL_LAB_SEED)
    if (seed === null) return
    sessionStorage.removeItem(SQL_LAB_SEED)
    setSql(seed)
  }, [])
  const [busy, setBusy] = useState<'explain' | 'lint' | 'save' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<
    (ExplainRes & { sql: string; connId: string }) | null
  >(null)
  const [issues, setIssues] = useState<LintIssue[] | null>(null)
  const [domainsOff, setDomainsOff] = useState(false)
  const [name, setName] = useState('')
  const [savedTick, setSavedTick] = useState(0)
  const domainCache = useRef(new Map<string, Domain[]>())

  async function explain() {
    if (!linkId || !connId) return
    setBusy('explain')
    setErr(null)
    const r = await readApi<ExplainRes>(
      piFetch('/api/sql-lab/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, connId, sql }),
      }),
    )
    setBusy(null)
    if (r.ok) setResult({ ...r.data, sql, connId })
    else setErr(errText(r.body))
  }

  async function lint() {
    setBusy('lint')
    let domains: Domain[] = []
    let off = !linkId
    if (linkId) {
      const cached = domainCache.current.get(linkId)
      if (cached) domains = cached
      else {
        const r = await readApi<{ domains: Domain[] }>(
          piFetch(`/api/sql-lab/domains?link=${encodeURIComponent(linkId)}`),
        )
        if (r.ok) domainCache.current.set(linkId, (domains = r.data.domains))
        else off = true // 도메인 없이 기본 접미사 규칙으로 점검
      }
    }
    setDomainsOff(off)
    setIssues(lintSql(sql, domains))
    setBusy(null)
  }

  async function save() {
    if (!result || !linkId) return
    setBusy('save')
    setErr(null)
    const r = await readApi<{ plan_id: string }>(
      piFetch('/api/sql-lab/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId,
          connId: result.connId,
          sql: result.sql,
          plan: result.plan,
          name: name || undefined,
        }),
      }),
    )
    setBusy(null)
    if (r.ok) {
      setName('')
      setSavedTick((n) => n + 1)
    } else setErr(errText(r.body))
  }

  return (
    <div className="flex flex-col gap-4">
      <LinkPicker onChange={setSel} />
      <section className={CARD}>
        <label
          htmlFor="sql-lab-sql"
          className="mb-2 block text-sm font-semibold"
        >
          {t('sqlLabel')}
        </label>
        <textarea
          id="sql-lab-sql"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={8}
          maxLength={20000}
          spellCheck={false}
          placeholder={t('sqlPlaceholder')}
          className="bg-surface-raised w-full rounded-lg p-3 font-mono text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className={BTN_PRIMARY}
            disabled={!sql.trim() || !linkId || !connId || !!busy}
            onClick={() => void explain()}
          >
            {busy === 'explain' ? t('explaining') : t('explain')}
          </button>
          <button
            className={BTN}
            disabled={!sql.trim() || !!busy}
            onClick={() => void lint()}
          >
            {t('lint.run')}
          </button>
          {(!linkId || !connId) && (
            <span className="text-muted-foreground text-xs">
              {t('needLink')}
            </span>
          )}
        </div>
        {err && (
          <p className="text-danger mt-2 text-sm" role="alert">
            {err}
          </p>
        )}
      </section>

      {issues && <LintPanel issues={issues} domainsOff={domainsOff} />}

      {result && (
        <section className={CARD} aria-labelledby="sql-lab-plan">
          <h2 id="sql-lab-plan" className="mb-2 font-bold">
            {t('plan.title')}{' '}
            <span className="text-muted-foreground text-xs font-normal">
              {t('plan.summary', {
                cost: result.plan['Total Cost'] ?? 0,
                ms: result.ms,
              })}
            </span>
          </h2>
          <Warnings warnings={result.warnings} />
          <PlanTree root={result.plan} warnings={result.warnings} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder={t('saveName')}
              aria-label={t('saveName')}
              className="bg-surface-raised h-10 min-w-0 flex-1 rounded-lg px-3 text-sm"
            />
            <button
              className={BTN}
              disabled={!!busy}
              onClick={() => void save()}
            >
              {busy === 'save' ? t('saving') : t('save')}
            </button>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{t('saveNote')}</p>
        </section>
      )}

      {linkId && <SavedPlans key={`${linkId}:${savedTick}`} linkId={linkId} />}

      <section className={`${CARD} border border-dashed border-white/15`}>
        <h2 className="flex items-center gap-2 font-bold">
          {t('ai.title')}
          <span className="bg-surface-raised text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
            {t('ai.badge')}
          </span>
        </h2>
        <p className="text-muted-foreground mt-2 text-sm break-keep">
          {t('ai.body')}
        </p>
      </section>
    </div>
  )
}

function LintPanel({
  issues,
  domainsOff,
}: {
  issues: LintIssue[]
  domainsOff: boolean
}) {
  const t = useTranslations('sqlLab.lint')
  return (
    <section className={CARD} aria-labelledby="sql-lab-lint">
      <h2 id="sql-lab-lint" className="mb-2 font-bold">
        {t('title')}
      </h2>
      {domainsOff && (
        <p className="text-muted-foreground mb-2 text-xs">{t('domainsOff')}</p>
      )}
      {!issues.length ? (
        <p className="text-sm">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {issues.map((i) => (
            <li
              key={`${i.code}:${i.snippet}`}
              className="bg-surface-raised rounded-lg p-3"
            >
              <p
                className={
                  i.severity === 'warn'
                    ? 'text-danger font-semibold'
                    : 'font-semibold'
                }
              >
                {t(`codes.${i.code}`, {
                  column: i.column ?? '-',
                  expected: i.expected ? t(`types.${i.expected}`) : '-',
                })}
              </p>
              <code className="text-muted-foreground mt-1 block font-mono text-xs break-all">
                {i.snippet}
              </code>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
