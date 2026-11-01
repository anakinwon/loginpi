'use client'

// PiMig 화면 본체 — 연결(URL ?link=, LinkPicker) → 프로젝트 선택·계획 만들기(설계 스냅샷 고정) → 계획 목록(10건 페이지)
//  → 계획 상세 : 적재 순서(위상 정렬·단계·묶음)·묶음 크기/병렬도·컷오버 체크리스트·검증 SQL 생성. 실행 엔진 없음(D6). 모든 호출 piFetch
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { LinkPicker } from '@/components/link/link-picker'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import {
  buildPlan,
  CHECKLIST,
  clampOpts,
  LIMITS,
  verifyScript,
  type CheckKey,
  type Dialect,
  type Snapshot,
} from '@/lib/migration/plan'

type Project = { prjId: string; prjNm: string; trgtDbmsCd: string | null }
type PlanRow = { mig_plan_id: string; prj_id: string; prj_nm: string | null; plan_nm: string; sts_cd: string; mod_dtm: string }
type PlanList = { plans: PlanRow[]; total: number; page: number; pageSize: number }
type PlanDetail = PlanRow & { chnk_sz: number; prll_cnt: number; snap_json: Snapshot; chk_json: Partial<Record<CheckKey, boolean>> }

const INPUT = 'bg-surface-raised h-10 min-w-0 rounded-lg px-3 text-sm'
const JSON_HDR = { 'Content-Type': 'application/json' }

function useErr() {
  const t = useTranslations('migration')
  const apiText = useApiErrorText()
  // 연결·이행 오류 코드는 migration.errors 친절 문구, 나머지는 공용 apiErrors
  return useCallback(
    (b: ApiErrorBody) => (b.code && t.has(`errors.${b.code}`) ? t(`errors.${b.code}`) : apiText(b)),
    [t, apiText],
  )
}

export function MigrationPanel() {
  const t = useTranslations('migration')
  const errText = useErr()
  const linkId = useSearchParams().get('link')

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [prjId, setPrjId] = useState('')
  const [planNm, setPlanNm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState<PlanList | null>(null)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  // 연결이 바뀌면 프로젝트 목록 다시(비동기, 렌더 비차단)
  useEffect(() => {
    setProjects(null)
    setPrjId('')
    setOpenId(null)
    setErr(null)
    setPage(1)
    if (!linkId) return
    let off = false
    void readApi<{ projects: Project[] }>(piFetch(`/api/migration/projects?link=${encodeURIComponent(linkId)}`)).then((r) => {
      if (off) return
      if (r.ok) setProjects(r.data.projects)
      else setErr(errText(r.body))
    })
    return () => {
      off = true
    }
  }, [linkId, errText])

  const loadList = useCallback(async () => {
    if (!linkId) return setList(null)
    const r = await readApi<PlanList>(piFetch(`/api/migration/plans?link=${encodeURIComponent(linkId)}&page=${page}`))
    if (r.ok) setList(r.data)
  }, [linkId, page])
  useEffect(() => {
    void loadList()
  }, [loadList])

  async function create() {
    if (!linkId || !prjId) return
    setBusy(true)
    setErr(null)
    const prj = projects?.find((p) => p.prjId === prjId)
    const r = await readApi<{ planId: string }>(
      piFetch('/api/migration/plans', {
        method: 'POST',
        headers: JSON_HDR,
        body: JSON.stringify({ link: linkId, prjId, prjNm: prj?.prjNm, planNm: planNm.trim() || prj?.prjNm || prjId }),
      }),
    )
    setBusy(false)
    if (!r.ok) return setErr(errText(r.body))
    setPlanNm('')
    setOpenId(r.data.planId)
    if (page === 1) void loadList()
    else setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <LinkPicker needConn={false} />
      {!linkId && <p className="bg-surface text-muted-foreground rounded-2xl p-4 text-sm">{t('needLink')}</p>}

      {linkId && (
        <section className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
          <h2 className="font-bold">{t('newPlan')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-semibold">{t('project')}</span>
              <select className={INPUT} value={prjId} onChange={(e) => setPrjId(e.target.value)} disabled={!projects}>
                <option value="">{projects ? t('projectPick') : t('loading')}</option>
                {projects?.map((p) => (
                  <option key={p.prjId} value={p.prjId}>
                    {p.prjNm}
                    {p.trgtDbmsCd ? ` (${p.trgtDbmsCd})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-semibold">{t('planNm')}</span>
              <input className={INPUT} value={planNm} maxLength={100} placeholder={t('planNmHint')} onChange={(e) => setPlanNm(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN_PRIMARY} disabled={busy || !prjId} onClick={() => void create()}>
              {busy ? t('creating') : t('create')}
            </button>
            <span className="text-muted-foreground text-xs break-keep">{t('snapHint')}</span>
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
        </section>
      )}

      {linkId && list && list.total > 0 && (
        <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="font-bold">{t('plans')}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {list.plans.map((p) => (
              <li key={p.mig_plan_id}>
                <button
                  className={`flex w-full flex-wrap gap-x-3 rounded-lg px-2 py-1 text-left hover:bg-white/5 ${openId === p.mig_plan_id ? 'ring-accent ring-1' : ''}`}
                  onClick={() => setOpenId(p.mig_plan_id)}
                >
                  <span className="font-medium break-all">{p.plan_nm}</span>
                  <span className="text-muted-foreground break-all">{p.prj_nm ?? p.prj_id}</span>
                  <span className={p.sts_cd === 'READY' ? 'text-accent' : 'text-muted-foreground'}>{t(`sts.${p.sts_cd}`)}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{new Date(p.mod_dtm).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
          <Pager page={list.page} pages={Math.ceil(list.total / list.pageSize)} onPage={setPage} />
        </section>
      )}

      {linkId && openId && (
        <PlanView
          key={openId}
          linkId={linkId}
          planId={openId}
          onChanged={() => void loadList()}
          onDeleted={() => {
            setOpenId(null)
            void loadList()
          }}
        />
      )}

      <section className="bg-surface text-muted-foreground flex flex-col gap-1 rounded-2xl border border-dashed border-white/15 p-4 text-sm break-keep">
        <h2 className="text-foreground font-bold">{t('engine.title')}</h2>
        <p>{t('engine.body')}</p>
      </section>
    </div>
  )
}

function PlanView({ linkId, planId, onChanged, onDeleted }: { linkId: string; planId: string; onChanged: () => void; onDeleted: () => void }) {
  const t = useTranslations('migration')
  const errText = useErr()
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [opts, setOpts] = useState({ chunkSize: 10000, parallel: 4 })
  const [dialect, setDialect] = useState<Dialect>('PG')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let off = false
    void readApi<{ plan: PlanDetail }>(piFetch(`/api/migration/plans/${planId}?link=${encodeURIComponent(linkId)}`)).then((r) => {
      if (off) return
      if (!r.ok) return setErr(errText(r.body))
      setPlan(r.data.plan)
      setOpts({ chunkSize: r.data.plan.chnk_sz, parallel: r.data.plan.prll_cnt })
    })
    return () => {
      off = true
    }
  }, [linkId, planId, errText])

  // 순서·묶음은 스냅샷 + 옵션으로 화면에서 바로 계산(저장 전 미리보기)
  const computed = useMemo(() => (plan ? buildPlan(plan.snap_json, clampOpts(opts)) : null), [plan, opts])
  const script = useMemo(
    () => (plan && computed ? verifyScript(plan.snap_json, computed.order, dialect) : ''),
    [plan, computed, dialect],
  )

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setErr(null)
    const r = await readApi<{ plan: Partial<PlanDetail> }>(
      piFetch(`/api/migration/plans/${planId}`, { method: 'PATCH', headers: JSON_HDR, body: JSON.stringify({ link: linkId, ...body }) }),
    )
    setBusy(false)
    if (!r.ok) {
      setErr(errText(r.body))
      return false
    }
    setPlan((p) => (p ? { ...p, ...r.data.plan } : p))
    onChanged()
    return true
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr(t('copyFail'))
    }
  }

  if (!plan) return <p className={err ? 'text-danger text-sm' : 'text-muted-foreground text-sm'}>{err ?? t('loading')}</p>
  const chk = plan.chk_json ?? {}
  const allDone = CHECKLIST.every((k) => chk[k])
  const dirty = opts.chunkSize !== plan.chnk_sz || opts.parallel !== plan.prll_cnt
  const snap = plan.snap_json

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold break-all">{plan.plan_nm}</h2>
          <span className={plan.sts_cd === 'READY' ? 'text-accent text-sm' : 'text-muted-foreground text-sm'}>{t(`sts.${plan.sts_cd}`)}</span>
          <button
            className={`${BTN} ml-auto`}
            disabled={busy}
            onClick={() => {
              if (confirm(t('delConfirm'))) void patch({ del: true }).then((ok) => ok && onDeleted())
            }}
          >
            {t('del')}
          </button>
        </div>
        <p className="text-muted-foreground text-xs break-keep">
          {t('snapInfo', { tables: snap.tables.length, rels: snap.rels.length })}
          {snap.dropped > 0 && ` ${t('dropped', { n: snap.dropped })}`}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('chunkSize')}</span>
            <input
              type="number"
              className={`${INPUT} w-36`}
              min={LIMITS.chunkMin}
              max={LIMITS.chunkMax}
              step={1000}
              value={opts.chunkSize}
              onChange={(e) => setOpts((o) => ({ ...o, chunkSize: Number(e.target.value) }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('parallel')}</span>
            <input
              type="number"
              className={`${INPUT} w-24`}
              min={LIMITS.parallelMin}
              max={LIMITS.parallelMax}
              value={opts.parallel}
              onChange={(e) => setOpts((o) => ({ ...o, parallel: Number(e.target.value) }))}
            />
          </label>
          <button className={BTN} disabled={busy || !dirty} onClick={() => void patch(clampOpts(opts))}>
            {t('saveOpts')}
          </button>
        </div>
        <p className="text-muted-foreground text-xs break-keep">{t('optsHint')}</p>
        {err && <p className="text-danger text-sm">{err}</p>}
      </section>

      {computed && (
        <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="font-bold">{t('order')}</h2>
          <p className="text-muted-foreground text-xs break-keep">{t('orderHint')}</p>
          {computed.cycles.length > 0 && (
            <div className="text-danger text-sm break-keep">
              <p className="font-semibold">{t('cycles', { n: computed.cycles.length })}</p>
              <ul className="font-mono text-xs break-all">
                {computed.cycles.map((c, i) => (
                  <li key={i}>{c.join(' ↔ ')}</li>
                ))}
              </ul>
            </div>
          )}
          {computed.selfRefs.length > 0 && (
            <p className="text-muted-foreground text-xs break-all">
              {t('selfRefs')} : {computed.selfRefs.join(', ')}
            </p>
          )}
          <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
            {computed.levels.map((l) => (
              <li key={l.level} className="border-b border-white/5 pb-2">
                <p className="font-semibold">{t('level', { n: l.level + 1 })}</p>
                <ul className="flex flex-col gap-0.5 font-mono text-xs break-all">
                  {l.batches.map((b, i) => (
                    <li key={i}>
                      <span className="text-muted-foreground">#{i + 1} </span>
                      {b.join(', ')}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="font-bold">{t('checklist')}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {CHECKLIST.map((k) => (
            <li key={k}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  checked={!!chk[k]}
                  disabled={busy}
                  onChange={(e) => void patch({ chk: { [k]: e.target.checked } })}
                />
                <span className="break-keep">
                  <span className="font-semibold">{t(`chk.${k}.title`)}</span>
                  <span className="text-muted-foreground block text-xs">{t(`chk.${k}.desc`)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          {plan.sts_cd === 'READY' ? (
            <button className={BTN} disabled={busy} onClick={() => void patch({ stsCd: 'DRAFT' })}>
              {t('toDraft')}
            </button>
          ) : (
            <button className={BTN_PRIMARY} disabled={busy || !allDone} onClick={() => void patch({ stsCd: 'READY' })}>
              {t('toReady')}
            </button>
          )}
          {!allDone && <span className="text-muted-foreground text-xs">{t('readyNeedAll')}</span>}
        </div>
      </section>

      <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="font-bold">{t('verify')}</h2>
        <p className="text-muted-foreground text-xs break-keep">{t('verifyHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select className={INPUT} value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
            <option value="PG">PostgreSQL</option>
            <option value="ORACLE">Oracle · Tibero</option>
          </select>
          <button className={BTN} onClick={() => void copy()}>
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
        {dialect === 'ORACLE' && <p className="text-muted-foreground text-xs break-keep">{t('noHashOracle')}</p>}
        <textarea readOnly className="bg-surface-raised h-72 w-full rounded-lg p-3 font-mono text-xs" value={script} />
      </section>
    </div>
  )
}

// 반응형 페이지 이동 — 모바일 = 이전·현재/전체·다음, 데스크톱 = 번호도 표시(최대 7개)
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const t = useTranslations('migration')
  if (pages <= 1) return null
  const start = Math.max(1, Math.min(page - 3, pages - 6))
  const nums = Array.from({ length: Math.min(7, pages) }, (_, i) => start + i)
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label={t('plans')}>
      <button className={BTN} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('prev')}
      </button>
      <span className="px-2 sm:hidden">
        {page} / {pages}
      </span>
      {nums.map((n) => (
        <button
          key={n}
          className={`${BTN} hidden sm:inline-grid ${n === page ? 'ring-accent ring-2' : ''}`}
          aria-current={n === page ? 'page' : undefined}
          onClick={() => onPage(n)}
        >
          {n}
        </button>
      ))}
      <button className={BTN} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('next')}
      </button>
    </nav>
  )
}
