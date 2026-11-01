'use client'

// 7-2 파이프라인 정의 — 목록(10건 페이지) + 편집기(원천 → 변환 0~N → 대상 직선 단계, cron 일정, 대상 설명). 상태 DRAFT 고정(D6)
//  사전 점검에서 넘어온 초안(seed)이 오면 새 정의로 연다. 검사 규칙은 lib/pipeline/def(서버도 같은 검사)
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { MAX_STEPS, checkSteps, isCron, type Step, type StepKind } from '@/lib/pipeline/def'
import { Pager, usePplErr } from './shared'

export type Seed = { connId: string; tables: string[]; adapterCd: Adapter; at: number }
type Adapter = 'POLL' | 'LOGICAL' | 'KEY_DIFF'
type Row = {
  ppl_id: string
  ppl_nm: string
  src_conn_id: string
  tgt_desc: string | null
  adapter_cd: Adapter
  sched_txt: string | null
  sts_cd: string
  mod_dtm: string
  def_json?: { steps?: Step[]; tables?: string[] }
}
type Draft = { id: string | null; pplNm: string; srcConnId: string; tgtDesc: string; adapterCd: Adapter; schedTxt: string; steps: Step[]; tablesTxt: string }

const ADAPTERS: Adapter[] = ['POLL', 'LOGICAL', 'KEY_DIFF']
// 단계 동작 제안(자유 입력 + datalist) — 실행 의미는 워커 확정 후
const OPS: Record<StepKind, string[]> = {
  SOURCE: ['CDC_READ', 'SNAPSHOT_READ'],
  TRANSFORM: ['FILTER', 'MAP_COLUMNS', 'CAST', 'MASK', 'DEDUP'],
  TARGET: ['UPSERT', 'APPEND', 'LAKE_FILE'],
}
const INPUT = 'bg-surface-raised h-10 min-w-0 rounded-lg px-3 text-sm'

const blank = (connId: string | null): Draft => ({
  id: null,
  pplNm: '',
  srcConnId: connId ?? '',
  tgtDesc: '',
  adapterCd: 'POLL',
  schedTxt: '',
  steps: [
    { kind: 'SOURCE', op: 'CDC_READ', note: '' },
    { kind: 'TARGET', op: 'UPSERT', note: '' },
  ],
  tablesTxt: '',
})

export function PipelineSection({ linkId, connId, seed }: { linkId: string; connId: string | null; seed: Seed | null }) {
  const t = useTranslations('pipeline')
  const errText = usePplErr()
  const [list, setList] = useState<{ items: Row[]; total: number; page: number; pageSize: number } | null>(null)
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await readApi<NonNullable<typeof list>>(piFetch(`/api/pipeline?link=${encodeURIComponent(linkId)}&page=${page}`))
    if (r.ok) setList(r.data)
    else setErr(errText(r.body))
    // errText 는 번역 함수 — 연결·페이지 변경에만 반응
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId, page])
  useEffect(() => {
    void load()
  }, [load])

  // 사전 점검 → 새 초안
  useEffect(() => {
    if (!seed) return
    setDraft({ ...blank(seed.connId), adapterCd: seed.adapterCd, tablesTxt: seed.tables.join('\n') })
    setMsg(null)
  }, [seed])

  async function edit(id: string) {
    setErr(null)
    setMsg(null)
    const r = await readApi<{ item: Row }>(piFetch(`/api/pipeline/${id}?link=${encodeURIComponent(linkId)}`))
    if (!r.ok) return setErr(errText(r.body))
    const i = r.data.item
    setDraft({
      id: i.ppl_id,
      pplNm: i.ppl_nm,
      srcConnId: i.src_conn_id,
      tgtDesc: i.tgt_desc ?? '',
      adapterCd: i.adapter_cd,
      schedTxt: i.sched_txt ?? '',
      steps: i.def_json?.steps?.length ? i.def_json.steps : blank(null).steps,
      tablesTxt: (i.def_json?.tables ?? []).join('\n'),
    })
  }

  async function remove(row: Row) {
    if (!window.confirm(t('ed.removeConfirm', { name: row.ppl_nm }))) return
    const r = await readApi(piFetch(`/api/pipeline/${row.ppl_id}?link=${encodeURIComponent(linkId)}`, { method: 'DELETE' }))
    if (!r.ok) return setErr(errText(r.body))
    if (draft?.id === row.ppl_id) setDraft(null)
    void load()
  }

  // 화면 검사 = 서버 검사와 같은 규칙(R-P5 화면이 먼저 막는다)
  const problem = !draft
    ? null
    : !draft.pplNm.trim()
      ? 'NAME_REQUIRED'
      : !draft.srcConnId
        ? 'CONN_REQUIRED'
        : draft.schedTxt.trim() && !isCron(draft.schedTxt)
          ? 'CRON_INVALID'
          : draft.steps.some((s) => !s.op.trim())
            ? 'OP_REQUIRED'
            : checkSteps(draft.steps)

  async function save() {
    if (!draft || problem) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    const body = {
      link: linkId,
      pplNm: draft.pplNm.trim(),
      srcConnId: draft.srcConnId,
      tgtDesc: draft.tgtDesc.trim(),
      adapterCd: draft.adapterCd,
      schedTxt: draft.schedTxt.trim(),
      def: {
        steps: draft.steps.map((s) => ({ ...s, op: s.op.trim() })),
        tables: [...new Set(draft.tablesTxt.split(/[\s,]+/).filter(Boolean))].slice(0, 500),
      },
    }
    const r = await readApi<{ pplId: string }>(
      piFetch(draft.id ? `/api/pipeline/${draft.id}` : '/api/pipeline', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    setBusy(false)
    if (!r.ok) return setErr(errText(r.body))
    setDraft({ ...draft, id: r.data.pplId })
    setMsg(t('ed.saved'))
    if (page === 1) void load()
    else setPage(1)
  }

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const setStep = (i: number, p: Partial<Step>) => set({ steps: draft!.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  // 변환 단계는 대상 바로 앞에 끼운다(원천·대상 위치 고정)
  const addTransform = () =>
    set({ steps: [...draft!.steps.slice(0, -1), { kind: 'TRANSFORM', op: 'FILTER', note: '' }, draft!.steps[draft!.steps.length - 1]] })
  const removeStep = (i: number) => set({ steps: draft!.steps.filter((_, j) => j !== i) })
  const move = (i: number, d: -1 | 1) => {
    const s = [...draft!.steps]
    ;[s[i], s[i + d]] = [s[i + d], s[i]]
    set({ steps: s })
  }

  return (
    <section className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">{t('ed.title')}</h2>
        <span className="text-muted-foreground text-xs">{t('ed.draftOnly')}</span>
        <button className={`${BTN} ml-auto`} onClick={() => (setDraft(blank(connId)), setMsg(null))}>
          {t('ed.new')}
        </button>
      </div>

      {list === null ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : list.total === 0 ? (
        <p className="text-muted-foreground text-sm">{t('ed.empty')}</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {list.items.map((r) => (
            <li key={r.ppl_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/5 py-2">
              <span className="font-medium break-all">{r.ppl_nm}</span>
              <span className="text-accent text-xs">{t(`adapter.${r.adapter_cd}`)}</span>
              <span className="text-muted-foreground text-xs">{r.sched_txt || t('ed.manual')}</span>
              <span className="text-muted-foreground text-xs">{t(`sts.${r.sts_cd}`)}</span>
              <span className="text-muted-foreground text-xs">{new Date(r.mod_dtm).toLocaleString()}</span>
              <span className="ml-auto flex gap-2">
                <button className="text-accent text-xs underline" onClick={() => void edit(r.ppl_id)}>
                  {t('ed.edit')}
                </button>
                <button className="text-danger text-xs underline" onClick={() => void remove(r)}>
                  {t('ed.remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={list.page} pages={Math.ceil(list.total / list.pageSize)} onPage={setPage} />}

      {draft && (
        <div className="bg-surface-raised/40 flex flex-col gap-3 rounded-xl border border-white/10 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{t('ed.name')}</span>
              <input className={INPUT} value={draft.pplNm} maxLength={100} onChange={(e) => set({ pplNm: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{t('ed.adapter')}</span>
              <select className={INPUT} value={draft.adapterCd} onChange={(e) => set({ adapterCd: e.target.value as Adapter })}>
                {ADAPTERS.map((a) => (
                  <option key={a} value={a}>
                    {t(`adapter.${a}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{t('ed.srcConn')}</span>
              <input className={INPUT} value={draft.srcConnId} readOnly />
              {connId && connId !== draft.srcConnId && (
                <button className="text-accent self-start text-xs underline" onClick={() => set({ srcConnId: connId })}>
                  {t('ed.useCurrentConn')}
                </button>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{t('ed.sched')}</span>
              <input
                className={INPUT}
                value={draft.schedTxt}
                maxLength={100}
                placeholder="*/15 * * * *"
                onChange={(e) => set({ schedTxt: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground text-xs">{t('ed.target')}</span>
              <input
                className={INPUT}
                value={draft.tgtDesc}
                maxLength={500}
                placeholder={t('ed.targetPh')}
                onChange={(e) => set({ tgtDesc: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground text-xs">{t('ed.tables')}</span>
              <textarea
                className="bg-surface-raised min-h-20 rounded-lg p-2 text-sm"
                value={draft.tablesTxt}
                placeholder="public.cust"
                onChange={(e) => set({ tablesTxt: e.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{t('ed.steps')}</p>
            <ol className="flex flex-col gap-2">
              {draft.steps.map((s, i) => (
                <li key={i} className="bg-surface flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm">
                  <span className="text-muted-foreground w-6 text-right">{i + 1}</span>
                  <span className={`w-20 text-xs font-semibold ${s.kind === 'TRANSFORM' ? '' : 'text-accent'}`}>{t(`kind.${s.kind}`)}</span>
                  <input
                    className={`${INPUT} w-36`}
                    value={s.op}
                    maxLength={60}
                    list={`ppl-ops-${s.kind}`}
                    aria-label={t('ed.op')}
                    onChange={(e) => setStep(i, { op: e.target.value })}
                  />
                  <input
                    className={`${INPUT} min-w-32 flex-1`}
                    value={s.note}
                    maxLength={500}
                    placeholder={t('ed.notePh')}
                    onChange={(e) => setStep(i, { note: e.target.value })}
                  />
                  {s.kind === 'TRANSFORM' && (
                    <span className="flex gap-1">
                      <button className="text-xs underline disabled:opacity-40" disabled={i <= 1} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button className="text-xs underline disabled:opacity-40" disabled={i >= draft.steps.length - 2} onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <button className="text-danger text-xs underline" onClick={() => removeStep(i)}>
                        {t('ed.remove')}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {(Object.keys(OPS) as StepKind[]).map((k) => (
              <datalist key={k} id={`ppl-ops-${k}`}>
                {OPS[k].map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            ))}
            <button className={`${BTN} self-start`} disabled={draft.steps.length >= MAX_STEPS} onClick={addTransform}>
              {t('ed.addTransform')}
            </button>
          </div>

          {problem && <p className="text-danger text-xs">{t(`check.${problem}`)}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN_PRIMARY} disabled={busy || !!problem} onClick={() => void save()}>
              {busy ? t('ed.saving') : t('ed.save')}
            </button>
            <button className={BTN} onClick={() => setDraft(null)}>
              {t('ed.close')}
            </button>
            {msg && <span className="text-xs">{msg}</span>}
          </div>
        </div>
      )}
      {err && <p className="text-danger text-sm">{err}</p>}
    </section>
  )
}
