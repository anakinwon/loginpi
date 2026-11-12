'use client'
// SQL 편집기 객체 편집기(마스터 지시 2026-10-20 "DBeaver 와 동일 기능" — DBeaver 26.0.5 PostgreSQL 테이블 편집기 참고, 읽기 전용)
//  탐색기에서 테이블·뷰 이름을 두 번 누르면 SQL 탭 줄에 객체 탭이 열리고(page.tsx), 그 자리에 이 화면 : 하위 탭 Properties | Data | 엔티티 관계도
//  Properties = 머리 영역(sec=head) + 왼쪽 섹션 목록(고를 때만 조회 — 지연 조회, 결과는 탭이 닫힐 때까지 캐시) + 아래 도구줄(Refresh · N items)
//  Data = SELECT * 쪽 단위 조회(sec=data, 50·100·200·500행) — 표는 result-grid 의 Grid 재사용 / 엔티티 관계도 = sql-obj-erd.tsx
//  API = GET {api}/sql/obj?conn&schema&rel&sec (piFetch — Pi Browser 는 쿠키 없음), 실패 code NOT_SUPPORTED = 이 DBMS 미지원 회색 안내
import { piFetch } from '@pi/auth/client'
import { ArrowDownRight, ArrowUpRight, ChartColumn, ChevronLeft, ChevronRight, CircleDashed, Clock, Columns3, Copy, FileCode, KeyRound, Link2, ListTree, RotateCw, Rows3, ScrollText, ShieldCheck, SquareCheck, SquarePlus, User, Zap } from 'lucide-react'
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

// 섹션(보고서 순서) — [sec, 라벨(그림처럼 영문, 권한만 한글), 선 아이콘(lucide)]
const SECS = [
  ['cols', 'Columns', Columns3],
  ['cons', 'Constraints', KeyRound],
  ['fks', 'Foreign Keys', Link2],
  ['idx', 'Indexes', ListTree],
  ['deps', 'Dependencies', ArrowDownRight],
  ['refs', 'References', ArrowUpRight],
  ['parts', 'Partitions', Rows3],
  ['trg', 'Triggers', Zap],
  ['rules', 'Rules', ScrollText],
  ['pol', 'Policies', ShieldCheck],
  ['stats', 'Statistics', ChartColumn],
  ['grants', '권한', User],
  ['ddl', 'DDL', FileCode],
  ['virt', 'Virtual', CircleDashed],
] as const
type Sec = (typeof SECS)[number][0]
const SIZES = [50, 100, 200, 500] as const
const NET: Res = { ok: false, message: '요청이 실패했습니다(네트워크)' }
// 칼럼 형식 아이콘(DBeaver 처럼) — PK KeyRound / 불리언 SquareCheck / 날짜·시각 Clock / 숫자 123 / 그 밖 AZ
const typeIcon = (it: Record<string, Cell>) => {
  const t = String(it.type ?? '')
  if (it.pk) return <KeyRound className="inline h-3 w-3 text-warn" strokeWidth={1.75} />
  if (/bool/i.test(t)) return <SquareCheck className="inline h-3 w-3" strokeWidth={1.75} />
  if (/date|time|interval/i.test(t)) return <Clock className="inline h-3 w-3" strokeWidth={1.75} />
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
  if (r.code === 'NOT_SUPPORTED') return <p className="p-3 text-xs text-ink-3">이 DBMS 미지원</p>
  return <p className="p-3 text-xs text-danger" role="alert">{r.message ?? '불러오지 못했습니다'}</p>
}

// 범용 표 — 서버가 준 columns 순서·라벨 그대로(모든 섹션 공용), Columns 섹션은 이름 앞 형식 아이콘
function SecTable({ r, cols }: { r: SecRes; cols: boolean }) {
  const hs = r.columns ?? []
  return (
    <table className="w-full border-collapse font-mono text-xs">
      <thead className="sticky top-0 z-10">
        <tr className="thead-3d">
          {hs.map((h) => (
            <th key={h.key} className="px-3 py-1.5 text-start font-sans whitespace-nowrap">{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(r.items ?? []).map((it, i) => (
          <tr key={i} className="border-b border-line">
            {hs.map((h, j) => {
              const v = it[h.key]
              return (
                <td key={h.key} className={`max-w-[28rem] truncate px-3 py-1 ${typeof v === 'number' ? 'text-right' : ''} ${typeof v === 'boolean' ? 'text-center' : ''}`} title={cellTxt(v)}>
                  {cols && j === 0 && (
                    <span className={`me-1 inline-block w-6 text-center text-xs ${it.pk ? '' : 'text-ink-3'}`} aria-hidden>
                      {typeIcon(it)}
                    </span>
                  )}
                  {cellTxt(v)}
                  {cols && j === 0 && it.fk ? <span className="badge ms-1" data-tone="warn" title="외래키 칼럼">FK</span> : null}
                </td>
              )
            })}
          </tr>
        ))}
        {!r.items?.length && (
          <tr>
            <td colSpan={Math.max(1, hs.length)} className="py-6 text-center font-sans text-ink-3">항목 없음</td>
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
    <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className="seg-item" style={{ height: 24 }}>
      {nm}
    </button>
  )
  const field = (label: string, v: React.ReactNode, wide = false) => (
    <label className={`flex min-w-0 items-center gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="w-28 shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 truncate rounded-control border border-line bg-well px-2 py-0.5 font-mono text-ink" title={typeof v === 'string' ? v : undefined}>
        {v === '' || v == null ? <span className="text-ink-off"> </span> : v}
      </span>
    </label>
  )
  const check = (label: string, v: boolean | null | undefined) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={!!v} readOnly disabled />
      <span className="text-ink-2">{label}</span>
    </label>
  )

  // 오른쪽 내용 — 섹션별
  const secBody = () => {
    if (sec === 'virt') return <p className="p-3 text-xs text-ink-3">DBeaver 가상 키(프로젝트 설정 전용, DB 객체 아님) — 제공하지 않음</p>
    if (!cur || cur === 'loading') return <p className="p-3 text-xs text-ink-3">불러오는 중…</p>
    if (!cur.ok) return <Fail r={cur} />
    if (sec === 'ddl')
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-2 py-1">
            <button type="button" className="btn-key btn-sm" onClick={() => copy(cur.ddl ?? '')}><Copy aria-hidden /> 복사</button>
            <button type="button" className="btn-key btn-sm" disabled={sqlFull} onClick={() => onNewSql(cur.ddl ?? '')} title={sqlFull ? 'SQL 탭이 요금제 상한입니다 — 탭을 닫거나 요금제를 올리십시오' : '이 DDL 로 새 SQL 탭'}>
              <SquarePlus aria-hidden /> 새 SQL 탭
            </button>
            {sqlFull && <span className="text-ink-3">SQL 탭 상한 — 탭을 닫으면 열 수 있음</span>}
            {note && <span className="text-ink-3" aria-live="polite">{note}</span>}
          </div>
          <pre className="paper min-h-0 flex-1 overflow-auto bg-surface p-2 font-mono text-xs whitespace-pre">{cur.ddl}</pre>
        </div>
      )
    return (
      <div className="flex h-full min-h-0 flex-col">
        {sec === 'stats' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-2 py-1">
            <button type="button" className="btn-key btn-sm" onClick={() => void countRows()} title="SELECT COUNT(*) — 큰 테이블은 오래 걸릴 수 있음">
              실제 행 수 세기
            </button>
            {count != null && <span className="font-mono tabular-nums">{typeof count === 'number' ? `${count.toLocaleString()} 행` : count}</span>}
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
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 items-center border-b border-line bg-canvas px-2 py-1">
        <span role="tablist" aria-label="객체 편집기" className="seg">
          {subBtn('props', 'Properties')}
          {subBtn('data', 'Data')}
          {!isView && subBtn('erd', '엔티티 관계도')}
        </span>
      </div>

      {sub === 'props' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <section className="shrink-0 border-b border-line px-3 py-2" aria-label="테이블 정보">
            {head === 'loading' || !head ? (
              <p className="text-ink-3">불러오는 중…</p>
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
            <select value={sec} onChange={(e) => setSec(e.target.value as Sec)} className="input-sm m-2 w-auto shrink-0 md:hidden" aria-label="섹션">
              {SECS.map(([k, nm]) => (
                <option key={k} value={k}>
                  {nm}
                </option>
              ))}
            </select>
            <nav aria-label="섹션" className="hidden w-40 shrink-0 overflow-y-auto border-e border-line bg-canvas p-1 md:block">
              {SECS.map(([k, nm, Ic]) => (
                <button key={k} type="button" aria-current={sec === k} onClick={() => setSec(k)} className={`flex w-full items-center gap-2 rounded-control px-2 py-1 text-start transition-colors ${sec === k ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'}`}>
                  <Ic className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {nm}
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">{secBody()}</div>
              <div className="flex shrink-0 items-center gap-2 border-t border-line bg-canvas px-2 py-1">
                <button type="button" className="btn-ghost btn-sm" disabled={sec === 'virt' || cur === 'loading'} onClick={() => (sec === 'stats' && setCount(null), void loadSec(sec))} title="이 섹션 다시 불러오기">
                  <RotateCw aria-hidden /> 새로고침
                </button>
                <span className="ms-auto font-mono text-ink-3 tabular-nums">{items != null && sec !== 'ddl' ? `${items} items` : ''}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {sub === 'data' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 truncate border-b border-line bg-canvas px-2 py-1 font-mono text-ink-2" title="이 탭이 실행하는 조회(조회 전용)">
            SELECT * FROM {qn}
          </p>
          <div className="min-h-0 flex-1">
            {!dr || dr === 'loading' ? (
              <p className="p-3 text-ink-3">불러오는 중…</p>
            ) : !dr.ok ? (
              <Fail r={dr} />
            ) : (
              <Grid
                key={`${data.page}-${data.size}`}
                r={{ seq: data.page, txt: `SELECT * FROM ${qn}`, kind: 'READ', rslt: 'OK', columns: dr.columns ?? [], rows: dr.rows ?? [] }}
                dialect={dialect}
                bar={(pager) => {
                  const nav = 'btn-ghost btn-icon btn-sm'
                  const from = (data.page - 1) * data.size
                  return (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas px-2 py-1 text-xs text-ink-2">
                      <span className="min-w-0 flex-1 font-mono tabular-nums" role="status">
                        {dr.rows?.length ? `${(from + 1).toLocaleString()} – ${(from + dr.rows.length).toLocaleString()}행` : '행 없음'}
                        {dr.more && <span className="ms-1 font-medium text-warn">· 더 있음</span>}
                      </span>
                      <label className="flex items-center gap-1">
                        건수
                        <select value={data.size} onChange={(e) => void loadData(1, Number(e.target.value))} className="input-sm w-auto" aria-label="한 쪽 행 수">
                          {SIZES.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className={nav} disabled={data.page <= 1} onClick={() => void loadData(data.page - 1, data.size)} aria-label="이전 쪽" title="이전 쪽"><ChevronLeft className="rtl:rotate-180" aria-hidden /></button>
                      <span className="font-mono tabular-nums">{data.page}쪽</span>
                      <button type="button" className={nav} disabled={!dr.more} onClick={() => void loadData(data.page + 1, data.size)} aria-label="다음 쪽" title="다음 쪽"><ChevronRight className="rtl:rotate-180" aria-hidden /></button>
                      <button type="button" className={nav} onClick={() => void loadData(data.page, data.size)} aria-label="이 쪽 다시 조회" title="이 쪽 다시 조회"><RotateCw aria-hidden /></button>
                      {pager.pages > 1 && (
                        <span className="flex items-center gap-1 text-ink-3" title="받은 행을 화면에서 200행씩">
                          화면
                          <button type="button" className={nav} disabled={pager.page <= 1} onClick={() => pager.go(pager.page - 1)} aria-label="화면 이전" title="화면 이전"><ChevronLeft className="rtl:rotate-180" aria-hidden /></button>
                          <span className="font-mono tabular-nums">{pager.page}/{pager.pages}</span>
                          <button type="button" className={nav} disabled={pager.page >= pager.pages} onClick={() => pager.go(pager.page + 1)} aria-label="화면 다음" title="화면 다음"><ChevronRight className="rtl:rotate-180" aria-hidden /></button>
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
            <p className="p-3 text-ink-3">불러오는 중…</p>
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
