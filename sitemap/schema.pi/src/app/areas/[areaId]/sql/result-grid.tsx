'use client'
// SQL 실행 결과 그리드(2026-10-18, DBeaver 결과 패널 참고) — 문장마다 탭, 행 번호·칼럼(타입)·[NULL]·숫자 오른쪽 정렬
// 헤더 누르기 = 받은 행 안 정렬(오름 → 내림 → 원래), 빠른 필터 = 받은 행 안 글자 포함, 셀 누르고 Ctrl+C = 값 복사, TSV 복사·CSV·JSON 내려받기
// 행은 화면에서 200행씩 쪽 나눔(서버 행 제한 200·1000·5000 과 별개)
// 칼럼명 = 편집기로 끌어 놓기·헤더 고르고 Ctrl+C·오른쪽 누르기 복사(따옴표 식별자), 헤더 오른쪽 끝 끌기 = 칼럼 너비(두 번 누르면 자동)
import { useMemo, useState } from 'react'
import { quoteIdent, type Dialect } from '@/lib/modelpi/sql-split'

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
const COL_MIN = 40
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

function Grid({ r, dialect }: { r: RunRes; dialect: Dialect }) {
  const cols = r.columns ?? []
  const [w, setW] = useState<Record<number, number>>({}) // 칼럼 너비(px) — 없으면 자동
  const [note, setNote] = useState('')
  const copy = (t: string) => {
    if (!navigator.clipboard) return setNote('복사 미지원(https 필요)')
    void navigator.clipboard.writeText(t).then(() => setNote(`복사 : ${t}`), () => setNote('복사하지 못했습니다'))
    window.setTimeout(() => setNote(''), 3000)
  }
  // 헤더 오른쪽 끝 손잡이 — 끄는 동안 창 이벤트로 추적
  const resize = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault(), e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement!, x0 = e.clientX, w0 = th.getBoundingClientRect().width
    const move = (ev: PointerEvent) => setW((p) => ({ ...p, [i]: Math.max(COL_MIN, Math.round(w0 + ev.clientX - x0)) }))
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up), window.removeEventListener('pointercancel', up), (document.body.style.cursor = ''))
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move), window.addEventListener('pointerup', up), window.addEventListener('pointercancel', up)
  }
  const wStyle = (i: number) => (w[i] ? { width: w[i], minWidth: w[i], maxWidth: w[i] } : undefined)
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
        {note && <span className="text-gray-600" aria-live="polite">{note}</span>}
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
              {cols.map((c, i) => {
                const q = quoteIdent(c.name, dialect)
                return (
                  <th
                    key={i}
                    tabIndex={0}
                    style={wStyle(i)}
                    title="누르기 = 정렬 · 이름 끌어 편집기에 놓기 · Ctrl+C/오른쪽 누르기 = 칼럼명 복사 · 오른쪽 끝 끌기 = 너비"
                    className="relative cursor-pointer overflow-hidden border px-2 py-1 text-left whitespace-nowrap focus:outline-2 focus:outline-blue-500"
                    onClick={() => setSort(sort?.i !== i ? { i, dir: 1 } : sort.dir === 1 ? { i, dir: -1 } : null)}
                    onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && (e.preventDefault(), e.stopPropagation(), copy(q))}
                    onContextMenu={(e) => (e.preventDefault(), copy(q))}
                    aria-sort={sort?.i === i ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    <span draggable onDragStart={(e) => (e.dataTransfer.setData('text/plain', q), (e.dataTransfer.effectAllowed = 'copy'))} className="cursor-grab">
                      {c.name}
                    </span>{' '}
                    {sort?.i === i ? (sort.dir === 1 ? '▲' : '▼') : ''}
                    <span className="block truncate text-[10px] font-normal text-gray-500">{c.type}</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${c.name} 칼럼 너비 조절`}
                      title="끌어서 칼럼 너비(방향키도 가능) · 두 번 누르면 자동"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        const d = ({ ArrowLeft: -20, ArrowRight: 20 } as Record<string, number>)[e.key]
                        if (!d) return
                        e.preventDefault(), e.stopPropagation()
                        const cur = w[i] ?? (e.currentTarget.parentElement?.getBoundingClientRect().width ?? 100)
                        setW((p) => ({ ...p, [i]: Math.max(COL_MIN, Math.round(cur + d)) }))
                      }}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#3b5f9e]/40"
                      onPointerDown={resize(i)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => (e.stopPropagation(), setW(({ [i]: _x, ...rest }) => rest))}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((o, ri) => (
              <tr key={o.n} className="hover:bg-amber-50">
                <td className="border bg-gray-50 px-2 text-right text-gray-500">{o.n}</td>
                {o.v.map((v, ci) => (
                  <td key={ci} style={wStyle(ci)} onClick={() => setCur({ r: ri, c: ci })} className={`max-w-[28rem] truncate border px-2 py-0.5 ${NUM.test(cols[ci]?.type ?? '') || typeof v === 'number' ? 'text-right' : ''} ${cur?.r === ri && cur?.c === ci ? 'outline outline-2 outline-blue-500' : ''}`} title={txt(v)}>
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

export default function ResultPanel({ results, ms, dialect }: { results: RunRes[]; ms: number; dialect: Dialect }) {
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
      <div className="min-h-0 flex-1">{r.columns && r.rslt === 'OK' ? <Grid key={`${r.seq}-${ms}`} r={r} dialect={dialect} /> : <pre className="h-full overflow-auto p-2 text-xs whitespace-pre-wrap text-gray-700">{r.txt}</pre>}</div>
      <div className="border-t bg-gray-50 px-2 py-1 text-xs" role="status">
        {status} <span className="ml-2 text-gray-500">· 전체 {ms}ms · 문장 {results.length}개</span>
      </div>
    </div>
  )
}
