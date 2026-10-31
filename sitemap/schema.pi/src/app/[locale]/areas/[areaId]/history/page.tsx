'use client'
import { piFetch } from '@pi/auth/client'
// 변경 이력 화면 — 대상·동작·사용자·기간 조건 조회, 행을 펼치면 변경 전후 값 비교(바뀐 항목만)
import { Link } from '@/i18n/navigation'
import { use, useCallback, useEffect, useState } from 'react'
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
    <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rounded border px-2 py-1" aria-label={label}>
      <option value="">{label} 전체</option>
      {Object.entries(opts).map(([v, n]) => (
        <option key={v} value={v}>
          {n}
        </option>
      ))}
    </select>
  )

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">변경 이력</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setApplied(f)
        }}
        className="mt-4 flex flex-wrap items-center gap-2 text-sm"
      >
        {sel('tgt', TGT_NM, '대상')}
        {sel('act', ACT_NM, '동작')}
        <input value={f.usr} onChange={(e) => setF({ ...f, usr: e.target.value })} placeholder="사용자명" className="rounded border px-2 py-1" />
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="rounded border px-2 py-1" aria-label="시작일" />
        <span>~</span>
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="rounded border px-2 py-1" aria-label="종료일" />
        <button className="rounded bg-gray-800 px-3 py-1 text-white">조회</button>
        {data && <span className="ml-auto text-gray-500">총 {data.total}건</span>}
      </form>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            {['일시', '대상', '이름', '동작', '사용자', '경로'].map((h) => (
              <th key={h} className="border px-2 py-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!data || data.items.length === 0 ? (
            <tr>
              <td colSpan={6} className="border px-2 py-4 text-center text-gray-500">
                {msg || '이력이 없습니다'}
              </td>
            </tr>
          ) : (
            data.items.flatMap((l) => {
              const rows = [
                <tr key={l.log_id} onClick={() => setOpen(open === l.log_id ? null : l.log_id)} className="cursor-pointer hover:bg-gray-50" aria-expanded={open === l.log_id}>
                  <td className="whitespace-nowrap border px-2 py-1">{new Date(l.reg_dtm).toLocaleString('ko-KR')}</td>
                  <td className="border px-2 py-1">{TGT_NM[l.tgt_tp_cd] ?? l.tgt_tp_cd}</td>
                  <td className="border px-2 py-1">{targetName(l)}</td>
                  <td className="border px-2 py-1">{ACT_NM[l.act_cd] ?? l.act_cd}</td>
                  <td className="border px-2 py-1">{l.sys_user?.pi_usr_nm}</td>
                  <td className="border px-2 py-1">{l.apv_req_id ? '승인' : '직접'}</td>
                </tr>,
              ]
              if (open === l.log_id) {
                const diff = auditDiff(l.bfr_val, l.aftr_val)
                rows.push(
                  <tr key={l.log_id + '-d'}>
                    <td colSpan={6} className="border bg-gray-50 px-4 py-2">
                      {diff.length === 0 ? (
                        <span className="text-gray-500">비교할 변경 항목이 없습니다</span>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-600">
                              <th className="pr-4">항목</th>
                              <th className="pr-4">변경 전</th>
                              <th>변경 후</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diff.map((d) => (
                              <tr key={d.key}>
                                <td className="pr-4 font-mono">{d.key}</td>
                                <td className="pr-4 text-red-700">{show(d.before)}</td>
                                <td className="text-blue-800">{show(d.after)}</td>
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
      <div className="mt-3 flex items-center justify-center gap-3 text-sm">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">
          이전
        </button>
        <span>
          {page} / {pages}
        </span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">
          다음
        </button>
      </div>
    </main>
  )
}
