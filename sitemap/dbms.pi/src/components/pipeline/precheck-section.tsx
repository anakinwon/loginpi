'use client'

// 7-1 원천 사전 점검(CDC-R00) — 접속(+선택 스키마) 점검 → 논리 복제 준비 상태 + 테이블별 권장 어댑터·근거(20건씩 페이지)
//  선택한 테이블을 정의 편집기 초안으로 넘긴다(onSeed). 읽기 전용 카탈로그·설정 조회만, 저장 없음
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import type { Readiness, TablePrecheck, summarize } from '@/lib/pipeline/precheck'
import type { Seed } from './pipeline-editor'
import { Pager, usePplErr } from './shared'

type Res = { ready: Readiness; summary: ReturnType<typeof summarize>; items: TablePrecheck[]; truncated: boolean }
const PAGE = 20
const ADAPTER_KEYS = ['LOGICAL', 'POLL', 'KEY_DIFF', 'NONE'] as const

export function PrecheckSection({ linkId, connId, onSeed }: { linkId: string; connId: string | null; onSeed: (s: Seed) => void }) {
  const t = useTranslations('pipeline')
  const errText = usePplErr()
  const [schema, setSchema] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<Res | null>(null)
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  async function run() {
    if (!connId) return
    setBusy(true)
    setErr(null)
    const r = await readApi<Res>(
      piFetch('/api/pipeline/precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: linkId, conn: connId, ...(schema.trim() ? { schema: schema.trim() } : {}) }),
      }),
    )
    setBusy(false)
    if (!r.ok) return setErr(errText(r.body))
    setRes(r.data)
    setPage(1)
    setPicked(new Set())
  }

  const name = (i: TablePrecheck) => `${i.schema}.${i.table}`
  function toggle(n: string) {
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }
  function seed() {
    if (!res || !connId) return
    const items = res.items.filter((i) => picked.has(name(i)))
    // 초안 어댑터 = 선택 테이블 공통 가능 어댑터 중 첫째(없으면 가장 흔한 권장)
    const common = (['LOGICAL', 'POLL', 'KEY_DIFF'] as const).find((a) => items.every((i) => i.alts.includes(a)))
    onSeed({ connId, tables: items.map(name), adapterCd: common ?? 'KEY_DIFF', at: Date.now() })
  }

  const items = res?.items ?? []
  const view = items.slice((page - 1) * PAGE, page * PAGE)

  return (
    <section className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
      <h2 className="font-bold">{t('pre.title')}</h2>
      <p className="text-muted-foreground text-xs break-keep">{t('pre.intro')}</p>
      {!connId && <p className="text-muted-foreground text-sm">{t('needConn')}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">{t('pre.schema')}</span>
          <input
            className="bg-surface-raised h-10 w-48 max-w-full rounded-lg px-3"
            value={schema}
            maxLength={128}
            placeholder={t('pre.schemaPh')}
            onChange={(e) => setSchema(e.target.value)}
          />
        </label>
        <button className={BTN_PRIMARY} disabled={busy || !connId} onClick={() => void run()}>
          {busy ? t('pre.running') : t('pre.run')}
        </button>
      </div>
      {err && <p className="text-danger text-sm">{err}</p>}

      {res && (
        <>
          <ReadyView r={res.ready} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ADAPTER_KEYS.map((k) => (
              <div key={k} className="bg-surface-raised rounded-xl p-3">
                <p className="text-muted-foreground text-xs break-keep">{t(`adapter.${k}`)}</p>
                <p className="text-2xl font-bold">{res.summary.by[k]}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs break-keep">
            {t('pre.sum', { tables: res.summary.tables, noPk: res.summary.noPk, deleteUnseen: res.summary.deleteUnseen })}
          </p>
          {res.truncated && <p className="text-danger text-xs break-keep">{t('pre.truncated')}</p>}
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('pre.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1 pr-2" />
                    <th className="py-1 pr-2">{t('pre.colTable')}</th>
                    <th className="py-1 pr-2">{t('pre.colChg')}</th>
                    <th className="py-1 pr-2">{t('pre.colDel')}</th>
                    <th className="py-1 pr-2">PK</th>
                    <th className="py-1">{t('pre.colAdapter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((i) => (
                    <tr key={name(i)} className="border-t border-white/5 align-top">
                      <td className="py-1 pr-2">
                        <input
                          type="checkbox"
                          aria-label={name(i)}
                          checked={picked.has(name(i))}
                          disabled={i.adapter === 'NONE'}
                          onChange={() => toggle(name(i))}
                        />
                      </td>
                      <td className="py-1 pr-2 break-all">
                        {name(i)}
                        {i.estRows != null && <span className="text-muted-foreground text-xs"> · ~{i.estRows.toLocaleString()}</span>}
                      </td>
                      <td className="py-1 pr-2 break-all">{i.chgCol ?? '-'}</td>
                      <td className="py-1 pr-2 break-all">{i.delCol ?? '-'}</td>
                      <td className="py-1 pr-2">{i.pkYn ? 'O' : <span className="text-danger">X</span>}</td>
                      <td className="py-1">
                        <span className={`font-semibold ${i.adapter === 'NONE' ? 'text-danger' : 'text-accent'}`}>{t(`adapter.${i.adapter}`)}</span>
                        <ul className="text-muted-foreground text-xs">
                          {i.reasons.map((c) => (
                            <li key={c} className="break-keep">
                              {t(`reason.${c}`)}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pages={Math.ceil(items.length / PAGE)} onPage={setPage} />
          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN} disabled={picked.size === 0} onClick={seed}>
              {t('pre.toDraft', { n: picked.size })}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function ReadyView({ r }: { r: Readiness }) {
  const t = useTranslations('pipeline')
  return (
    <div className={`rounded-xl p-3 text-sm ${r.logicalReady ? 'bg-accent/10' : 'bg-surface-raised'}`}>
      <p className="font-semibold">{r.logicalReady ? t('ready.ok') : t('ready.no')}</p>
      <p className="text-muted-foreground text-xs">
        wal_level {r.walLevel ?? '?'} · max_replication_slots {r.maxSlots ?? '?'} · max_wal_senders {r.maxSenders ?? '?'} ·{' '}
        {t('ready.senders', { n: r.senders ?? '?' })}
      </p>
      <ul className="text-muted-foreground mt-1 text-xs">
        {r.reasons.map((c) => (
          <li key={c} className="break-keep">
            {t(`reason.${c}`)}
          </li>
        ))}
      </ul>
    </div>
  )
}
