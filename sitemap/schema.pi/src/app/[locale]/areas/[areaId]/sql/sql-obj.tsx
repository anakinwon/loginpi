'use client'
// SQL 편집기 객체 편집기(마스터 지시 2026-10-20 "DBeaver 와 동일 기능" — DBeaver 26.0.5 PostgreSQL 테이블 편집기 참고, 읽기 전용)
//  탐색기에서 테이블·뷰 이름을 두 번 누르면 SQL 탭 줄에 객체 탭이 열리고(page.tsx), 그 자리에 이 화면 : 하위 탭 Properties | Data | 엔티티 관계도
//  Properties = 머리 영역(sec=head) + 왼쪽 섹션 목록(고를 때만 조회 — 지연 조회, 결과는 탭이 닫힐 때까지 캐시) + 아래 도구줄(Refresh · N items)
//  Data = SELECT * 쪽 단위 조회(sec=data, 50·100·200·500행) — 표는 result-grid 의 Grid 재사용 / 엔티티 관계도 = sql-obj-erd.tsx
//  API = GET {api}/sql/obj?conn&schema&rel&sec (piFetch — Pi Browser 는 쿠키 없음), 실패 code NOT_SUPPORTED = 이 DBMS 미지원 회색 안내
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import type { Dialect } from '@/lib/modelpi/sql-split'
import { Grid, type Cell } from './result-grid'
import ObjErd, { type ErdRel, type ErdTable } from './sql-obj-erd'

type Res = { ok: boolean; code?: string; message?: string }
type Head = { name: string; oid: string | number | null; kind: string; owner: string | null; tablespace: string | null; rls: boolean | null; partitioned: boolean | null; partition_by: string | null; options: string | string[] | null; comment: string | null; est_rows: number | string | null; size: string | number | null }
type SecRes = Res & { columns?: { key: string; label: string }[]; items?: Record<string, Cell>[]; ddl?: string; count?: number }
type DataRes = Res & { columns?: { name: string; type: string }[]; rows?: Cell[][]; page?: number; size?: number; more?: boolean }
type ErdRes = Res & { tables?: ErdTable[]; rels?: ErdRel[] }
type Sub = 'props' | 'data' | 'erd'

// 섹션(보고서 순서) — [sec, 라벨(그림처럼 영문, 권한만 한글), 아이콘]
const SECS = [
  ['cols', 'Columns', '▥'],
  ['cons', 'Constraints', '🔑'],
  ['fks', 'Foreign Keys', '🔗'],
  ['idx', 'Indexes', '📇'],
  ['deps', 'Dependencies', '⤵'],
  ['refs', 'References', '⤴'],
  ['parts', 'Partitions', '▤'],
  ['trg', 'Triggers', '⚡'],
  ['rules', 'Rules', '📜'],
  ['pol', 'Policies', '🛡'],
  ['stats', 'Statistics', '📊'],
  ['grants', '권한', '👤'],
  ['ddl', 'DDL', '📄'],
  ['virt', 'Virtual', '◌'],
] as const
type Sec = (typeof SECS)[number][0]
const SIZES = [50, 100, 200, 500] as const
const NET: Res = { ok: false, message: '요청이 실패했습니다(네트워크)' }
// 칼럼 형식 아이콘(DBeaver 처럼) — PK 🔑 / 불리언 ☑ / 날짜·시각 🕒 / 숫자 123 / 그 밖 AZ
const typeIcon = (it: Record<string, Cell>) => {
  const t = String(it.type ?? '')
  if (it.pk) return '🔑'
  if (/bool/i.test(t)) return '☑'
  if (/date|time|interval/i.test(t)) return '🕒'
  if (/int|numeric|decimal|float|double|real|money|serial|NUMBER|BINARY_(FLOAT|DOUBLE)/i.test(t)) return '123'
  return 'AZ'
}
const cellTxt = (v: Cell | object) => (v == null ? '' : typeof v === 'boolean' ? (v ? '[v]' : '[ ]') : typeof v === 'object' ? JSON.stringify(v) : String(v))
const fmtBytes = (s: string | number | null) => {
  const n = Number(s)
  if (s == null || s === '' || !isFinite(n)) return s == null ? '' : String(s) // 서버가 '16 kB' 같은 글자로 주면 그대로
  for (const [u, d] of [['G', 1024 ** 3], ['M', 1024 ** 2], ['K', 1024]] as const) if (n >= d) return `${(n / d).toFixed(1)}${u}`
  return `${n}B`
}

function Fail({ r }: { r: Res }) {
  if (r.code === 'NOT_SUPPORTED') return <p className="p-3 text-xs text-gray-500">이 DBMS 에서는 지원하지 않습니다.</p>
  return <p className="p-3 text-xs font-medium text-red-700" role="alert">{r.message ?? '불러오지 못했습니다'}</p>
}

// 범용 표 — 서버가 준 columns 순서·라벨 그대로(모든 섹션 공용), Columns 섹션은 이름 앞 형식 아이콘
function SecTable({ r, cols }: { r: SecRes; cols: boolean }) {
  const hs = r.columns ?? []
  return (
    <table className="w-full border-collapse font-mono text-[0.72rem]">
      <thead className="sticky top-0 z-10">
        <tr className="thead-3d">
          {hs.map((h) => (
            <th key={h.key} className="border px-2 py-1 text-left whitespace-nowrap">{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(r.items ?? []).map((it, i) => (
          <tr key={i} className="hover:bg-amber-50">
            {hs.map((h, j) => {
              const v = it[h.key]
              return (
                <td key={h.key} className={`max-w-[28rem] truncate border px-2 py-0.5 ${typeof v === 'number' ? 'text-right' : ''} ${typeof v === 'boolean' ? 'text-center' : ''}`} title={cellTxt(v)}>
                  {cols && j === 0 && (
                    <span className={`mr-1 inline-block w-6 text-center text-[0.6rem] font-bold ${it.pk ? '' : 'text-[#3b5f9e]'}`} aria-hidden>
                      {typeIcon(it)}
                    </span>
                  )}
                  {cellTxt(v)}
                  {cols && j === 0 && it.fk ? <span className="ml-1 text-[0.6rem] text-amber-700" title="외래키 칼럼">FK</span> : null}
                </td>
              )
            })}
          </tr>
        ))}
        {!r.items?.length && (
          <tr>
            <td colSpan={Math.max(1, hs.length)} className="p-3 text-center text-gray-500">항목이 없습니다</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

export default function ObjEditor({ api, conn, schema, rel, dialect, active, onOpen, onNewSql, sqlFull }: { api: string; conn: string; schema: string; rel: string; dialect: Dialect; active: boolean; onOpen: (schema: string, rel: string) => void; onNewSql: (text: string) => void; sqlFull: boolean }) {
  const base = `${api}/sql/obj?conn=${encodeURIComponent(conn)}&schema=${encodeURIComponent(schema)}&rel=${encodeURIComponent(rel)}`
  const get = useCallback(
    async <T,>(q: string): Promise<T> => {
      try {
        const r = await piFetch(`${base}&${q}`)
        return (await r.json()) as T
      } catch {
        return NET as T
      }
    },
    [base],
  )
  const [sub, setSub] = useState<Sub>('props')
  const [head, setHead] = useState<(Res & { item?: Head }) | 'loading' | null>(null)
  const [sec, setSec] = useState<Sec>('cols')
  const [cache, setCache] = useState<Partial<Record<Sec, SecRes | 'loading'>>>({})
  const [count, setCount] = useState<number | string | null>(null)
  const [data, setData] = useState<{ page: number; size: number; res: DataRes | 'loading' | null }>({ page: 1, size: 200, res: null })
  const [erd, setErd] = useState<ErdRes | 'loading' | null>(null)
  const [note, setNote] = useState('')

  const loadSec = useCallback(
    async (s: Sec) => {
      if (s === 'virt') return
      setCache((c) => ({ ...c, [s]: 'loading' }))
      const r = await get<SecRes>(`sec=${s}`)
      setCache((c) => ({ ...c, [s]: r }))
    },
    [get],
  )
  const loadData = useCallback(
    async (page: number, size: number) => {
      setData({ page, size, res: 'loading' })
      const r = await get<DataRes>(`sec=data&page=${page}&size=${size}`)
      setData({ page, size, res: r })
    },
    [get],
  )
  // 보일 때만 조회(처음 1번) — 머리는 탭이 처음 보일 때, 섹션·Data·관계도는 고를 때(새로고침 뒤 복원된 탭도 누르기 전엔 조회 안 함)
  useEffect(() => {
    if (!active) return
    if (!head) {
      setHead('loading')
      void get<Res & { item?: Head }>('sec=head').then(setHead)
    }
    if (sub === 'props' && !cache[sec]) void loadSec(sec)
    if (sub === 'data' && !data.res) void loadData(1, data.size)
    if (sub === 'erd' && !erd) {
      setErd('loading')
      void get<ErdRes>('sec=erd').then(setErd)
    }
  }, [active, sub, sec]) // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (t: string) => (setNote(t), window.setTimeout(() => setNote(''), 3000))
  const copy = (t: string) => {
    if (!navigator.clipboard) return flash('이 브라우저는 복사를 지원하지 않습니다(https 필요)')
    void navigator.clipboard.writeText(t).then(() => flash('DDL 을 복사했습니다'), () => flash('복사하지 못했습니다(브라우저 권한)'))
  }
  const countRows = async () => {
    setCount('세는 중…')
    const r = await get<SecRes>('sec=count')
    setCount(r.ok ? Number(r.count ?? 0) : r.code === 'NOT_SUPPORTED' ? '지원하지 않음' : (r.message ?? '실패'))
  }

  const h = head && head !== 'loading' && head.ok ? head.item : undefined
  const isView = h ? 'vm'.includes(h.kind) : false
  const qn = `${schema}.${rel}`
  const cur = cache[sec]
  const items = cur && cur !== 'loading' && cur.ok ? (cur.items?.length ?? 0) : null
  const subBtn = (k: Sub, nm: string) => (
    <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`rounded-t border px-2 py-0.5 whitespace-nowrap ${sub === k ? '-mb-px border-b-white bg-white font-semibold' : 'bg-gray-100 hover:bg-white'}`}>
      {nm}
    </button>
  )
  const field = (label: string, v: React.ReactNode, wide = false) => (
    <label className={`flex min-w-0 items-center gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="w-28 shrink-0 text-gray-600">{label}</span>
      <span className="min-w-0 flex-1 truncate rounded border bg-gray-50 px-1.5 py-0.5 font-mono" title={typeof v === 'string' ? v : undefined}>
        {v === '' || v == null ? <span className="text-gray-400"> </span> : v}
      </span>
    </label>
  )
  const check = (label: string, v: boolean | null | undefined) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={!!v} readOnly disabled className="accent-[#1f3a68]" />
      <span className="text-gray-700">{label}</span>
    </label>
  )

  // 오른쪽 내용 — 섹션별
  const secBody = () => {
    if (sec === 'virt') return <p className="p-3 text-xs text-gray-500">DBeaver 가상 키(프로젝트 설정 전용, DB 객체 아님) — 이 화면에서는 제공하지 않습니다.</p>
    if (!cur || cur === 'loading') return <p className="p-3 text-xs text-gray-500">불러오는 중…</p>
    if (!cur.ok) return <Fail r={cur} />
    if (sec === 'ddl')
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-2 py-1">
            <button type="button" className="btn-3d px-2 py-0 text-xs" onClick={() => copy(cur.ddl ?? '')}>복사</button>
            <button type="button" className="btn-3d px-2 py-0 text-xs" disabled={sqlFull} onClick={() => onNewSql(cur.ddl ?? '')} title={sqlFull ? 'SQL 탭이 요금제 상한입니다 — 탭을 닫거나 요금제를 올리십시오' : '이 DDL 로 새 SQL 탭'}>
              새 SQL 탭으로 열기
            </button>
            {sqlFull && <span className="text-gray-500">SQL 탭 상한 — 탭을 닫으면 열 수 있습니다</span>}
            {note && <span className="text-gray-600" aria-live="polite">{note}</span>}
          </div>
          <pre className="min-h-0 flex-1 overflow-auto bg-white p-2 font-mono text-[0.72rem] whitespace-pre">{cur.ddl}</pre>
        </div>
      )
    return (
      <div className="flex h-full min-h-0 flex-col">
        {sec === 'stats' && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-2 py-1">
            <button type="button" className="btn-3d px-2 py-0 text-xs" onClick={() => void countRows()} title="SELECT COUNT(*) — 큰 테이블은 오래 걸릴 수 있음">
              실제 행 수 세기
            </button>
            {count != null && <span className="font-mono">{typeof count === 'number' ? `${count.toLocaleString()} 행` : count}</span>}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <SecTable r={cur} cols={sec === 'cols'} />
        </div>
      </div>
    )
  }

  const dr = data.res
  return (
    <div className="flex h-full min-h-0 flex-col text-[0.75rem]">
      <div role="tablist" aria-label="객체 편집기" className="flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b bg-gray-50 px-1 pt-1">
        {subBtn('props', 'Properties')}
        {subBtn('data', 'Data')}
        {!isView && subBtn('erd', '엔티티 관계도')}
      </div>

      {sub === 'props' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <section className="shrink-0 border-b px-2 py-1.5" aria-label="테이블 정보">
            {head === 'loading' || !head ? (
              <p className="text-gray-500">불러오는 중…</p>
            ) : !head.ok ? (
              <Fail r={head} />
            ) : (
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {field('Table Name', h?.name ?? rel)}
                {field('Comment', h?.comment ?? '')}
                {field('Owner', h?.owner ?? '')}
                {field('Tablespace', h?.tablespace ?? '')}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {check('Has Row-Level Security', h?.rls)}
                  {check('Partitions', h?.partitioned)}
                </div>
                {field('Partition by', h?.partition_by ?? '')}
                {field('Extra Options', Array.isArray(h?.options) ? h.options.join(', ') : (h?.options ?? ''))}
                {field('추정 행 수 · 크기', `${h?.est_rows != null ? Number(h.est_rows).toLocaleString() : '-'} 행 · ${fmtBytes(h?.size ?? null) || '-'}`)}
              </div>
            )}
          </section>
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {/* 좁은 화면 = 고르기 상자, 넓은 화면 = 왼쪽 세로 목록 */}
            <select value={sec} onChange={(e) => setSec(e.target.value as Sec)} className="m-1 shrink-0 rounded border px-1 py-0.5 md:hidden" aria-label="섹션">
              {SECS.map(([k, nm, ic]) => (
                <option key={k} value={k}>
                  {ic} {nm}
                </option>
              ))}
            </select>
            <nav aria-label="섹션" className="hidden w-40 shrink-0 overflow-y-auto border-r bg-gray-50 py-1 md:block">
              {SECS.map(([k, nm, ic]) => (
                <button key={k} type="button" aria-current={sec === k} onClick={() => setSec(k)} className={`flex w-full items-center gap-1.5 px-2 py-0.5 text-left ${sec === k ? 'bg-[#dbe5f5] font-semibold text-[#1f3a68]' : 'hover:bg-white'}`}>
                  <span className="w-4 text-center" aria-hidden>{ic}</span>
                  {nm}
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">{secBody()}</div>
              <div className="flex shrink-0 items-center gap-2 border-t bg-gray-50 px-2 py-1">
                <button type="button" className="btn-3d px-2 py-0 text-xs" disabled={sec === 'virt' || cur === 'loading'} onClick={() => (sec === 'stats' && setCount(null), void loadSec(sec))} title="이 섹션 다시 불러오기">
                  ↻ Refresh
                </button>
                <span className="ml-auto text-gray-500">{items != null && sec !== 'ddl' ? `${items} items` : ''}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {sub === 'data' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 truncate border-b bg-gray-50 px-2 py-0.5 font-mono text-gray-700" title="이 탭이 실행하는 조회(조회 전용)">
            SELECT * FROM {qn}
          </p>
          <div className="min-h-0 flex-1">
            {!dr || dr === 'loading' ? (
              <p className="p-3 text-gray-500">불러오는 중…</p>
            ) : !dr.ok ? (
              <Fail r={dr} />
            ) : (
              <Grid
                key={`${data.page}-${data.size}`}
                r={{ seq: data.page, txt: `SELECT * FROM ${qn}`, kind: 'READ', rslt: 'OK', columns: dr.columns ?? [], rows: dr.rows ?? [] }}
                dialect={dialect}
                bar={(pager) => {
                  const nav = 'rounded border bg-white px-1.5 disabled:opacity-40'
                  const from = (data.page - 1) * data.size
                  return (
                    <div className="flex flex-wrap items-center gap-2 border-t bg-gray-50 px-2 py-1 text-xs">
                      <span className="min-w-0 flex-1" role="status">
                        {dr.rows?.length ? `${(from + 1).toLocaleString()} – ${(from + dr.rows.length).toLocaleString()}행` : '행 없음'}
                        {dr.more && <b className="ml-1 text-amber-700">· 더 있음</b>}
                      </span>
                      <label className="flex items-center gap-1">
                        건수
                        <select value={data.size} onChange={(e) => void loadData(1, Number(e.target.value))} className="rounded border bg-white px-1" aria-label="한 쪽 행 수">
                          {SIZES.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className={nav} disabled={data.page <= 1} onClick={() => void loadData(data.page - 1, data.size)} aria-label="이전 쪽">‹ 이전</button>
                      <span className="tabular-nums">{data.page}쪽</span>
                      <button type="button" className={nav} disabled={!dr.more} onClick={() => void loadData(data.page + 1, data.size)} aria-label="다음 쪽">다음 ›</button>
                      <button type="button" className={nav} onClick={() => void loadData(data.page, data.size)} title="이 쪽 다시 조회">↻</button>
                      {pager.pages > 1 && (
                        <span className="flex items-center gap-1 text-gray-500" title="받은 행을 화면에서 200행씩">
                          화면
                          <button type="button" className={nav} disabled={pager.page <= 1} onClick={() => pager.go(pager.page - 1)} aria-label="화면 이전">‹</button>
                          {pager.page}/{pager.pages}
                          <button type="button" className={nav} disabled={pager.page >= pager.pages} onClick={() => pager.go(pager.page + 1)} aria-label="화면 다음">›</button>
                        </span>
                      )}
                    </div>
                  )
                }}
              />
            )}
          </div>
        </div>
      )}

      {sub === 'erd' && (
        <div className="min-h-0 flex-1">
          {!erd || erd === 'loading' ? (
            <p className="p-3 text-gray-500">불러오는 중…</p>
          ) : !erd.ok ? (
            <Fail r={erd} />
          ) : (
            <ObjErd tables={erd.tables ?? []} rels={erd.rels ?? []} schema={schema} rel={rel} onOpen={onOpen} />
          )}
        </div>
      )}
    </div>
  )
}
