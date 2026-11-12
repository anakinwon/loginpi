'use client'
import { piFetch } from '@pi/auth/client'
// 변경 이력 화면 — 대상·동작·사용자·기간 조건 조회, 행을 펼치면 변경 전후 값 비교(바뀐 항목만)
import { use, useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHead } from '@/components/page-head'
import { auditDiff } from '@/lib/audit-diff'
import { ACT_NM, AUDIT_NM_KEYS, TGT_NM } from '@/lib/roles'

interface Log {
  log_id: string
  tgt_tp_cd: string
  tgt_id: string
  act_cd: string
  bfr_val: Record<string, unknown> | null
  aftr_val: Record<string, unknown> | null
  apv_req_id: string | null
  reg_dtm: string
  sys_user: { pi_usr_nm: string } | null
}
const EMPTY = { tgt: '', act: '', usr: '', from: '', to: '' }

// 대상 이름 — 변경 후(없으면 전) 값의 이름 항목
const targetName = (l: Log) => {
  const r = { ...(l.bfr_val ?? {}), ...(l.aftr_val ?? {}) }
  const v = { ...r, ...(r.std_term as Record<string, unknown> | undefined) } // 표준코드 = 용어 임베드(std_term.term_log_nm)
  const k = AUDIT_NM_KEYS.find((n) => v[n])
  return k ? String(v[k]) : l.tgt_id.slice(0, 8)
}
const show = (v: unknown) => (v === null || v === undefined ? '(없음)' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export default function HistoryPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const [f, setF] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: Log[]; total: number; size: number } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ ...applied, page: String(page) })
    const j = await (await piFetch(`/api/areas/${areaId}/history?${sp}`)).json()
    if (j.ok) {
      setData(j)
      setMsg('')
    } else setMsg(j.message)
  }, [areaId, applied, page])
  useEffect(() => {
    load()
  }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  const sel = (k: keyof typeof EMPTY, opts: Record<string, string>, label: string) => (
    <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="input w-auto" aria-label={label}>
      <option value="">{label} 전체</option>
      {Object.entries(opts).map(([v, n]) => (
        <option key={v} value={v}>
          {n}
        </option>
      ))}
    </select>
  )

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="변경 이력" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setApplied(f)
        }}
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        {sel('tgt', TGT_NM, '대상')}
        {sel('act', ACT_NM, '동작')}
        <input value={f.usr} onChange={(e) => setF({ ...f, usr: e.target.value })} placeholder="사용자명" aria-label="사용자명" className="input w-40" />
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="input w-auto" aria-label="시작일" />
        <span className="text-ink-3">~</span>
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="input w-auto" aria-label="종료일" />
        <button className="btn-key">조회</button>
      </form>
      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-dense">
          <thead>
            <tr className="thead-3d text-start">
              {['일시', '대상', '이름', '동작', '사용자', '경로'].map((h) => (
                <th key={h} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!data || data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-3">
                  {msg || '이력이 없습니다'}
                </td>
              </tr>
            ) : (
              data.items.flatMap((l) => {
                const rows = [
                  <tr key={l.log_id} onClick={() => setOpen(open === l.log_id ? null : l.log_id)} className={`cursor-pointer ${open === l.log_id ? '[&>td]:bg-raised' : ''}`} aria-expanded={open === l.log_id}>
                    <td className={`border-b px-3 py-1.5 font-mono text-xs whitespace-nowrap text-ink-3 tabular-nums`}>{new Date(l.reg_dtm).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)}</td>
                    <td className={`border-b px-3 py-1.5 whitespace-nowrap`}>
                      <span className="badge">{TGT_NM[l.tgt_tp_cd] ?? l.tgt_tp_cd}</span>
                    </td>
                    <td className={`border-b px-3 py-1.5 font-medium`}>{targetName(l)}</td>
                    <td className={`border-b px-3 py-1.5 whitespace-nowrap`}>{ACT_NM[l.act_cd] ?? l.act_cd}</td>
                    <td className={`border-b px-3 py-1.5 text-xs whitespace-nowrap text-ink-3`}>{l.sys_user?.pi_usr_nm}</td>
                    <td className={`border-b px-3 py-1.5 text-xs whitespace-nowrap text-ink-3`}>{l.apv_req_id ? '승인' : '직접'}</td>
                  </tr>,
                ]
                if (open === l.log_id) {
                  const diff = auditDiff(l.bfr_val, l.aftr_val)
                  rows.push(
                    <tr key={l.log_id + '-d'}>
                      <td colSpan={6} className="border-b bg-well px-4 py-3">
                        {diff.length === 0 ? (
                          <span className="text-ink-3">비교할 변경 항목이 없습니다</span>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-start text-ink-3">
                                <th className="py-1 pe-4 text-start font-medium">항목</th>
                                <th className="py-1 pe-4 text-start font-medium">변경 전</th>
                                <th className="py-1 text-start font-medium">변경 후</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diff.map((d) => (
                                <tr key={d.key}>
                                  <td className="py-1 pe-4 font-mono text-ink-2">{d.key}</td>
                                  <td className={`py-1 pe-4 ${d.before == null ? 'text-ink-off' : 'text-danger line-through decoration-1'}`}>{show(d.before)}</td>
                                  <td className="py-1 text-ink">{show(d.after)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>,
                  )
                }
                return rows
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {data && <span className="font-mono text-xs text-ink-3 tabular-nums">총 {data.total.toLocaleString()}건</span>}
        <div className="mx-auto flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="이전" title="이전" className="btn-ghost btn-icon btn-sm">
            <ChevronLeft className="rtl:rotate-180" aria-hidden />
          </button>
          <span className="font-mono text-xs text-ink-2 tabular-nums">
            {page} / {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="다음" title="다음" className="btn-ghost btn-icon btn-sm">
            <ChevronRight className="rtl:rotate-180" aria-hidden />
          </button>
        </div>
      </div>
    </main>
  )
}
