'use client'

// 모델↔DB 정합 화면 본체 — 연결·접속(URL ?link=&conn=, LinkPicker) + 프로젝트 선택 → 탐지 실행 → 결과·이력(10건 페이지).
//  반영(DDL 생성·적용)은 schema.pi 정본(PRD 12 §5-1·5-2) — 여기서는 탐지·측정만. 모든 호출 piFetch(X-Pi-Token)
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { LinkPicker } from '@/components/link/link-picker'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import type { DriftResult, DriftSummary } from '@/lib/drift/diff'

type Project = { prjId: string; prjNm: string; trgtDbmsCd: string | null }
type RunRes = { runId: string | null; saved: boolean; statsMissing: boolean; summary: DriftSummary; result: DriftResult; cap: number }
type RunRow = { drift_run_id: string; conn_id: string; prj_id: string; prj_nm: string | null; run_dtm: string; smry_json: Partial<DriftSummary> }

const SUMMARY_KEYS = ['missingTables', 'extraTables', 'colMismatches', 'missingIndexes', 'extraIndexes', 'ddlMissing', 'unusedIndexes'] as const

function useErr() {
  const t = useTranslations('drift')
  const apiText = useApiErrorText()
  // 연결 오류 코드(LINK_*·CONN_UNSUPPORTED·NOT_IMPLEMENTED 등)는 drift.errors 에 친절 문구, 나머지는 공용 apiErrors
  return (b: ApiErrorBody) => (b.code && t.has(`errors.${b.code}`) ? t(`errors.${b.code}`) : apiText(b))
}

export function DriftPanel() {
  const t = useTranslations('drift')
  const errText = useErr()
  const sp = useSearchParams()
  const linkId = sp.get('link')
  const connId = sp.get('conn')

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [prjId, setPrjId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState<RunRes | null>(null)
  const [hist, setHist] = useState<{ runs: RunRow[]; total: number; page: number; pageSize: number } | null>(null)
  const [page, setPage] = useState(1)

  // 연결이 바뀌면 프로젝트 목록 다시(비동기, 렌더 비차단)
  useEffect(() => {
    setProjects(null)
    setPrjId('')
    setRun(null)
    setErr(null)
    if (!linkId) return
    let off = false
    void readApi<{ projects: Project[] }>(piFetch(`/api/drift/projects?link=${encodeURIComponent(linkId)}`)).then((r) => {
      if (off) return
      if (r.ok) setProjects(r.data.projects)
      else setErr(errText(r.body))
    })
    return () => {
      off = true
    }
    // errText 는 번역 함수 — 연결 변경에만 반응(의존성 의도적 생략)
  }, [linkId])

  const loadHist = useCallback(async () => {
    if (!linkId) return setHist(null)
    const r = await readApi<NonNullable<typeof hist>>(piFetch(`/api/drift/runs?link=${encodeURIComponent(linkId)}&page=${page}`))
    if (r.ok) setHist(r.data)
  }, [linkId, page])
  useEffect(() => {
    void loadHist()
  }, [loadHist])

  async function detect() {
    if (!linkId || !connId || !prjId) return
    setBusy(true)
    setErr(null)
    const prjNm = projects?.find((p) => p.prjId === prjId)?.prjNm
    const r = await readApi<RunRes>(
      piFetch('/api/drift/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: linkId, conn: connId, prjId, prjNm }),
      }),
    )
    setBusy(false)
    if (!r.ok) return setErr(errText(r.body))
    setRun(r.data)
    if (page === 1) void loadHist()
    else setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <LinkPicker />
      {!linkId && <p className="bg-surface text-muted-foreground rounded-2xl p-4 text-sm">{t('needLink')}</p>}

      {linkId && (
        <section className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('project')}</span>
            <select
              className="bg-surface-raised h-10 min-w-0 rounded-lg px-3"
              value={prjId}
              onChange={(e) => setPrjId(e.target.value)}
              disabled={!projects}
            >
              <option value="">{projects ? t('projectPick') : t('loading')}</option>
              {projects?.map((p) => (
                <option key={p.prjId} value={p.prjId}>
                  {p.prjNm}
                  {p.trgtDbmsCd ? ` (${p.trgtDbmsCd})` : ''}
                </option>
              ))}
            </select>
          </label>
          {!connId && <p className="text-muted-foreground text-xs">{t('needConn')}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN_PRIMARY} disabled={busy || !connId || !prjId} onClick={() => void detect()}>
              {busy ? t('running') : t('run')}
            </button>
            <span className="text-muted-foreground text-xs break-keep">{t('readOnly')}</span>
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
        </section>
      )}

      {run && <DriftResultView run={run} />}

      <p className="bg-surface text-muted-foreground rounded-2xl border border-dashed border-white/15 p-4 text-sm break-keep">
        {t('applyInSchema')}{' '}
        <a className="text-accent underline" href="https://schem.vercel.app" target="_blank" rel="noreferrer">
          schema.pi
        </a>
      </p>

      {hist && hist.total > 0 && (
        <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="font-bold">{t('history')}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {hist.runs.map((h) => (
              <li key={h.drift_run_id} className="flex flex-wrap gap-x-3 border-b border-white/5 py-1">
                <span className="text-muted-foreground">{new Date(h.run_dtm).toLocaleString()}</span>
                <span className="font-medium break-all">{h.prj_nm ?? h.prj_id}</span>
                <span className="text-muted-foreground text-xs">
                  {SUMMARY_KEYS.map((k) => `${t(`sum.${k}`)} ${h.smry_json?.[k] ?? 0}`).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <Pager page={hist.page} pages={Math.ceil(hist.total / hist.pageSize)} onPage={setPage} />
        </section>
      )}
    </div>
  )
}

// 반응형 페이지 이동 — 모바일 = 이전·현재/전체·다음, 데스크톱 = 번호도 표시(최대 7개)
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const t = useTranslations('drift')
  if (pages <= 1) return null
  const start = Math.max(1, Math.min(page - 3, pages - 6))
  const nums = Array.from({ length: Math.min(7, pages) }, (_, i) => start + i)
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label={t('history')}>
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

function DriftResultView({ run }: { run: RunRes }) {
  const t = useTranslations('drift')
  const { summary: s, result: r } = run
  const fmtSize = (b: number | null) => (b == null ? '-' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SUMMARY_KEYS.map((k) => (
          <div key={k} className="bg-surface rounded-2xl p-3">
            <p className="text-muted-foreground text-xs break-keep">{t(`sum.${k}`)}</p>
            <p className={`text-2xl font-bold ${s[k] > 0 ? 'text-accent' : ''}`}>{s[k]}</p>
          </div>
        ))}
      </section>
      {!run.saved && <p className="text-muted-foreground text-xs">{t('notSaved')}</p>}
      {Object.entries(s).some(([k, v]) => k !== 'idxUsage' && k !== 'unusedIndexes' && v > run.cap) && (
        <p className="text-muted-foreground text-xs">{t('capped', { cap: run.cap })}</p>
      )}

      <Block title={t('sec.ddlMissing')} hint={t('hint.ddlMissing')} items={r.ddlMissing.map((d) => `${d.kind} ${d.name} — ${t('reqNo', { id: d.reqId })}`)} />
      <Block title={t('sec.missingTables')} items={r.missingTables} />
      <Block title={t('sec.extraTables')} hint={t('hint.extraTables')} items={r.extraTables} />
      <Block
        title={t('sec.colMismatches')}
        items={r.colMismatches.map((c) => `${c.tbl}.${c.col} — ${t(`kind.${c.kind}`)}${c.model ? ` (${t('model')} ${c.model} / DB ${c.db})` : ''}`)}
      />
      <Block title={t('sec.missingIndexes')} items={r.missingIndexes.map((i) => `${i.tbl}.${i.idx}`)} />
      <Block title={t('sec.extraIndexes')} items={r.extraIndexes.map((i) => `${i.tbl}.${i.idx}`)} />

      <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="font-bold">{t('sec.idxUsage')}</h2>
        <p className="text-muted-foreground text-xs break-keep">{run.statsMissing ? t('statsMissing') : t('hint.idxUsage')}</p>
        {r.idxUsage.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-1 pr-2">{t('col.idx')}</th>
                  <th className="py-1 pr-2">{t('col.scans')}</th>
                  <th className="py-1 pr-2">{t('col.size')}</th>
                  <th className="py-1">{t('col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {r.idxUsage.map((u) => (
                  <tr key={u.dbIdx} className="border-t border-white/5">
                    <td className="py-1 pr-2 break-all">
                      {u.tbl}.{u.idx}
                      {u.dbIdx !== u.idx && <span className="text-muted-foreground text-xs"> → {u.dbIdx}</span>}
                    </td>
                    <td className="py-1 pr-2">{u.scans ?? '-'}</td>
                    <td className="py-1 pr-2">{fmtSize(u.sizeBytes)}</td>
                    <td className={`py-1 ${u.status === 'UNUSED' ? 'text-danger' : ''}`}>{t(`usage.${u.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Block({ title, hint, items }: { title: string; hint?: string; items: string[] }) {
  const t = useTranslations('drift')
  return (
    <section className="bg-surface flex flex-col gap-2 rounded-2xl p-4">
      <h2 className="font-bold">
        {title} <span className="text-muted-foreground text-sm font-normal">{items.length}</span>
      </h2>
      {hint && <p className="text-muted-foreground text-xs break-keep">{hint}</p>}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('none')}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto font-mono text-xs break-all">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
