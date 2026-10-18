'use client'
// SQL 실행 결과 그리드(2026-10-18, DBeaver 결과 패널 참고) — 문장마다 탭, 행 번호·칼럼(타입)·[NULL]·숫자 오른쪽 정렬
// 헤더 누르기 = 받은 행 안 정렬(오름 → 내림 → 원래), 빠른 필터 = 받은 행 안 글자 포함, 셀 누르고 Ctrl+C = 값 복사, TSV 복사·CSV·JSON 내려받기
// 행은 화면에서 200행씩 쪽 나눔(서버 행 제한 200·1000·5000 과 별개)
import { useMemo, useState } from 'react'

export type Cell = string | number | boolean | null
export interface RunRes {
  seq: number
  txt: string
  kind: 'READ' | 'WRITE' | 'TXN'
  rslt: 'OK' | 'ERR' | 'SKIP' | 'RBK'
  columns?: { name: string; type: string }[]
  rows?: Cell[][]
  affected?: number | null
  truncated?: boolean
  ms?: number
  err_cd?: string | null
  err_msg?: string | null
}
const PAGE = 200
const NUM = /int|numeric|decimal|float|double|real|money|serial|NUMBER|BINARY_(FLOAT|DOUBLE)/i
const RSLT_NM: Record<RunRes['rslt'], string> = { OK: '성공', ERR: '오류', SKIP: '실행 안 함', RBK: '되돌림' }

const txt = (v: Cell) => (v == null ? '' : String(v))
const csvCell = (v: Cell) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
function download(name: string, body: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + body], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Grid({ r }: { r: RunRes }) {
  const cols = r.columns ?? []
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null)
  const [kw, setKw] = useState('')
  const [page, setPage] = useState(1)
  const [cur, setCur] = useState<{ r: number; c: number } | null>(null)
  const rows = useMemo(() => {
    let x = (r.rows ?? []).map((v, n) => ({ v, n: n + 1 }))
    const k = kw.trim().toLowerCase()
    if (k) x = x.filter((o) => o.v.some((c) => txt(c).toLowerCase().includes(k)))
    if (sort) {
      const num = NUM.test(cols[sort.i]?.type ?? '')
      x = [...x].sort((a, b) => {
        const p = a.v[sort.i], q = b.v[sort.i]
        if (p == null || q == null) return p == null ? (q == null ? 0 : 1) : -1 // NULL 은 뒤로
        return (num ? Number(p) - Number(q) : String(p).localeCompare(String(q), 'ko')) * sort.dir
      })
    }
    return x
  }, [r.rows, kw, sort, cols])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const shown = rows.slice((page - 1) * PAGE, page * PAGE)
  const tsv = () => [cols.map((c) => c.name).join('\t'), ...rows.map((o) => o.v.map(txt).join('\t'))].join('\n')
  const base = `result-${r.seq}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-2 py-1 text-xs">
        <input value={kw} onChange={(e) => (setKw(e.target.value), setPage(1))} placeholder="받은 행에서 찾기" className="rounded border px-2 py-0.5" aria-label="결과 빠른 필터" />
        <button type="button" className="rounded border bg-white px-2 py-0.5" onClick={() => navigator.clipboard.writeText(tsv())}>TSV 복사</button>
        <button type="button" className="rounded border bg-white px-2 py-0.5" onClick={() => download(`${base}.csv`, [cols.map((c) => csvCell(c.name)).join(','), ...rows.map((o) => o.v.map(csvCell).join(','))].join('\r\n'), 'text/csv;charset=utf-8')}>CSV</button>
        <button type="button" className="rounded border bg-white px-2 py-0.5" onClick={() => download(`${base}.json`, JSON.stringify(rows.map((o) => Object.fromEntries(cols.map((c, i) => [c.name, o.v[i]]))), null, 2), 'application/json')}>JSON</button>
        {pages > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border bg-white px-2 disabled:opacity-40" aria-label="이전 쪽">‹</button>
            {page} / {pages}
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border bg-white px-2 disabled:opacity-40" aria-label="다음 쪽">›</button>
          </span>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'c' && cur) {
            e.preventDefault()
            navigator.clipboard.writeText(txt(shown[cur.r]?.v[cur.c] ?? null))
          }
        }}
      >
        <table className="border-collapse font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-[#e9eff9]">
            <tr>
              <th className="border px-2 py-1 text-right text-gray-500">#</th>
              {cols.map((c, i) => (
                <th key={i} className="cursor-pointer border px-2 py-1 text-left whitespace-nowrap" onClick={() => setSort(sort?.i !== i ? { i, dir: 1 } : sort.dir === 1 ? { i, dir: -1 } : null)} aria-sort={sort?.i === i ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  {c.name} {sort?.i === i ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  <span className="block text-[10px] font-normal text-gray-500">{c.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((o, ri) => (
              <tr key={o.n} className="hover:bg-amber-50">
                <td className="border bg-gray-50 px-2 text-right text-gray-500">{o.n}</td>
                {o.v.map((v, ci) => (
                  <td key={ci} onClick={() => setCur({ r: ri, c: ci })} className={`max-w-[28rem] truncate border px-2 py-0.5 ${NUM.test(cols[ci]?.type ?? '') || typeof v === 'number' ? 'text-right' : ''} ${cur?.r === ri && cur?.c === ci ? 'outline outline-2 outline-blue-500' : ''}`} title={txt(v)}>
                    {v == null ? <span className="text-gray-400 italic">[NULL]</span> : txt(v)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={cols.length + 1} className="p-3 text-center text-gray-500">행이 없습니다</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ResultPanel({ results, ms }: { results: RunRes[]; ms: number }) {
  const [at, setAt] = useState(0)
  const r = results[Math.min(at, results.length - 1)]
  if (!r) return null
  const status =
    r.rslt === 'ERR' || r.err_cd ? (
      <span className="text-red-700">{r.err_cd ? `[${r.err_cd}] ` : ''}{r.err_msg ?? RSLT_NM[r.rslt]}</span>
    ) : r.rslt !== 'OK' ? (
      <span className="text-gray-600">{RSLT_NM[r.rslt]}</span>
    ) : r.columns ? (
      <span>
        {r.rows?.length ?? 0} row(s) fetched - {r.ms ?? 0}ms{r.truncated && <b className="text-amber-700"> · 더 있음(행 제한을 늘려 다시 실행)</b>}
      </span>
    ) : (
      <span>{r.affected ?? 0} row(s) affected - {r.ms ?? 0}ms</span>
    )
  return (
    <div className="flex h-full min-h-0 flex-col">
      {results.length > 1 && (
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b px-1 pt-1 text-xs">
          {results.map((x, i) => (
            <button key={x.seq} role="tab" aria-selected={i === at} onClick={() => setAt(i)} className={`rounded-t border px-2 py-0.5 whitespace-nowrap ${i === at ? 'bg-white font-semibold' : 'bg-gray-100'} ${x.rslt === 'ERR' ? 'text-red-700' : x.rslt === 'OK' ? '' : 'text-gray-400'}`}>
              {x.seq}. {x.columns ? `결과 ${x.rows?.length ?? 0}행` : x.rslt === 'OK' ? `${x.affected ?? 0}행 반영` : RSLT_NM[x.rslt]}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">{r.columns && r.rslt === 'OK' ? <Grid key={`${r.seq}-${ms}`} r={r} /> : <pre className="h-full overflow-auto p-2 text-xs whitespace-pre-wrap text-gray-700">{r.txt}</pre>}</div>
      <div className="border-t bg-gray-50 px-2 py-1 text-xs" role="status">
        {status} <span className="ml-2 text-gray-500">· 전체 {ms}ms · 문장 {results.length}개</span>
      </div>
    </div>
  )
}
