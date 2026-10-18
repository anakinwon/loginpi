'use client'
// SQL 편집기 화면(마스터 지시 2026-10-18 "Universal SQL Editor" — DBeaver 26.0.5 화면 구성 참고)
//  위 툴바 : 접속(서버 직접만)·활성 스키마·실행(Ctrl+Enter 현재 문장 / Alt+X 스크립트)·행 제한·한 트랜잭션(DA)·권한 표시
//  왼쪽 탐색기(스키마 › 종류 › 객체·크기 › 칼럼, 펼칠 때만 조회, 두 번 누르기 = SELECT 실행) / 가운데 편집기(CodeMirror) / 아래 결과·실행 이력
//  쓰기(DML·DDL)는 DA 만 즉시(Auto 커밋), 위험 문장은 확인 후, 서버가 문장을 다시 판정. 편집 내용은 접속별로 이 브라우저에 초안 저장
import { piFetch } from '@pi/auth/client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { DANGER_NM, splitSql, stmtAt, type Danger } from '@/lib/modelpi/sql-split'
import ResultPanel, { type RunRes } from './result-grid'
import type { EdHandle } from './sql-editor'

const SqlEditor = dynamic(() => import('./sql-editor'), { ssr: false, loading: () => <p className="p-2 text-sm text-gray-500">편집기 불러오는 중…</p> })

interface Conn {
  conn_id: string
  conn_nm: string
  dbms_cd: string
  exec_mthd_cd: 'SRV' | 'AGT'
  rdonly_acct_yn?: 'Y' | 'N'
}
interface Obj {
  name: string
  kind: string
  size: string | null
  cmt: string | null
}
interface ColM {
  name: string
  type: string
  nn: boolean
  pk: boolean
}
interface Hist {
  sql_exec_id: string
  usr_nm: string
  conn_nm: string | null
  sql_txt: string
  stmt_cnt: number
  exec_mode_cd: 'READ' | 'WRITE'
  rslt_cd: 'OK' | 'ERR' | 'PART'
  row_cnt: number | null
  elapsed_ms: number | null
  err_cd: string | null
  reg_dtm: string
}
const KIND: [string, string][] = [
  ['rp', '테이블'],
  ['v', '뷰'],
  ['m', '구체화 뷰'],
  ['f', '외부 테이블'],
  ['S', '시퀀스'],
  ['F', '함수'],
]
const DBMS_NM: Record<string, string> = { '0014': 'PostgreSQL', '0001': 'Oracle' }
const LIMITS = [200, 1000, 5000] as const
const HSIZE = 20
// 바이트 → DBeaver 와 같은 K·M·G(1024 단위)
const fmtSize = (s: string | null) => {
  const n = Number(s)
  if (!s || !isFinite(n)) return ''
  for (const [u, d] of [['G', 1024 ** 3], ['M', 1024 ** 2], ['K', 1024]] as const) if (n >= d) return `${Math.floor(n / d)}${u}`
  return `${n}B`
}
const store = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v)
    } catch {}
  },
}

export default function SqlPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const api = `/api/areas/${areaId}`
  const ed = useRef<EdHandle>(null)
  const [conns, setConns] = useState<Conn[]>([])
  const [connId, setConnId] = useState('')
  const [canWrite, setCanWrite] = useState(false)
  const [denied, setDenied] = useState(false)
  const [schemas, setSchemas] = useState<{ name: string; cur: boolean }[]>([])
  const [schema, setSchema] = useState('')
  const [objs, setObjs] = useState<Record<string, Obj[] | 'loading'>>({})
  const [cols, setCols] = useState<Record<string, ColM[] | 'loading'>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [kw, setKw] = useState('')
  const [tables, setTables] = useState<Record<string, string[]>>({})
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(200)
  const [oneTx, setOneTx] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [out, setOut] = useState<{ results: RunRes[]; ms: number } | null>(null)
  const [tab, setTab] = useState<'res' | 'hist'>('res')
  const [hist, setHist] = useState<{ items: Hist[]; total: number; page: number }>({ items: [], total: 0, page: 1 })
  const conn = conns.find((c) => c.conn_id === connId)
  const dialect = conn?.dbms_cd === '0001' ? 'ORA' : 'PG'
  const draftKey = `sql-draft-${areaId}-${connId}`
  const usable = (c: Conn) => c.exec_mthd_cd === 'SRV' && (canWrite || c.rdonly_acct_yn === 'Y')

  const loadHist = useCallback(
    async (page: number) => {
      const r = await piFetch(`${api}/sql/hist?page=${page}&size=${HSIZE}`)
      if (r.status === 403) return setDenied(true)
      const j = await r.json()
      if (j.ok) {
        setCanWrite(!!j.all)
        setHist({ items: j.items, total: j.total, page })
      }
    },
    [api],
  )

  // 접속 목록·권한
  useEffect(() => {
    void (async () => {
      await loadHist(1)
      const j = await (await piFetch(`${api}/db-conns`)).json()
      if (j.ok) setConns(j.items)
    })()
  }, [api, loadHist])
  useEffect(() => {
    if (connId || !conns.length) return
    const keep = store.get(`sql-conn-${areaId}`)
    const first = conns.find((c) => c.conn_id === keep && usable(c)) ?? conns.find(usable)
    if (first) setConnId(first.conn_id)
  }, [conns, canWrite]) // eslint-disable-line react-hooks/exhaustive-deps

  // 접속을 바꾸면 : 초안 불러오기·스키마 목록
  useEffect(() => {
    if (!connId) return
    store.set(`sql-conn-${areaId}`, connId)
    ed.current?.set(store.get(draftKey) ?? 'SELECT 1;\n')
    setSchemas([]), setObjs({}), setCols({}), setOpen(new Set()), setOut(null), setMsg('')
    void (async () => {
      const r = await piFetch(`${api}/sql/meta?conn=${connId}&node=schemas`)
      const j = await r.json()
      if (!j.ok) return setMsg(j.detail ?? j.message)
      setSchemas(j.items)
      const keep = store.get(`sql-schema-${areaId}-${connId}`)
      setSchema(j.items.find((s: { name: string }) => s.name === keep)?.name ?? j.items.find((s: { cur: boolean }) => s.cur)?.name ?? j.items[0]?.name ?? '')
    })()
  }, [connId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 활성 스키마 → 자동 완성 목록·트리 펼침
  useEffect(() => {
    if (!connId || !schema) return
    store.set(`sql-schema-${areaId}-${connId}`, schema)
    setOpen((o) => new Set(o).add(`s:${schema}`))
    void loadObjs(schema)
    void (async () => {
      const j = await (await piFetch(`${api}/sql/meta?conn=${connId}&node=completion&schema=${encodeURIComponent(schema)}`)).json()
      if (j.ok) setTables(j.tables)
    })()
  }, [connId, schema]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadObjs(s: string) {
    if (objs[s]) return
    setObjs((o) => ({ ...o, [s]: 'loading' }))
    const j = await (await piFetch(`${api}/sql/meta?conn=${connId}&node=objects&schema=${encodeURIComponent(s)}`)).json()
    setObjs((o) => ({ ...o, [s]: j.ok ? j.items : [] }))
  }
  async function loadCols(s: string, rel: string) {
    const k = `${s}.${rel}`
    if (cols[k]) return
    setCols((o) => ({ ...o, [k]: 'loading' }))
    const j = await (await piFetch(`${api}/sql/meta?conn=${connId}&node=columns&schema=${encodeURIComponent(s)}&rel=${encodeURIComponent(rel)}`)).json()
    setCols((o) => ({ ...o, [k]: j.ok ? j.items : [] }))
  }
  const toggle = (k: string, load?: () => void) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(k)) n.delete(k)
      else {
        n.add(k)
        load?.()
      }
      return n
    })

  // 실행 — script = 전체(Alt+X), 아니면 선택 영역 또는 커서가 든 문장(그 문장을 선택해 보여 줌)
  async function run(script: boolean, sqlText?: string, confirm = false): Promise<void> {
    if (!conn || busy) return
    let text = sqlText
    if (text == null) {
      const s = ed.current!.get()
      if (script) text = s.text
      else if (s.sel.trim()) text = s.sel
      else {
        const st = stmtAt(splitSql(s.text, dialect), s.cursor)
        if (!st) return setMsg('실행할 문장이 없습니다')
        ed.current!.select(st.from, st.to)
        text = st.txt
      }
    }
    setBusy(true), setMsg(''), setTab('res')
    try {
      const r = await piFetch(`${api}/sql/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conn_id: conn.conn_id, sql: text, limit, schema: schema || null, one_tx: canWrite && oneTx, confirm }) })
      const j = await r.json()
      if (j.code === 'SQL_CONFIRM') {
        const list = (j.detail as { seq: number; txt: string; danger: Danger }[]).map((d) => `${d.seq}. [${DANGER_NM[d.danger]}]\n${d.txt}`).join('\n\n')
        if (window.confirm(`위험한 문장이 있습니다 — 그래도 실행할까요?\n\n${list}`)) return void (setBusy(false), await run(script, text, true))
        return setMsg('실행을 취소했습니다')
      }
      if (!j.ok) return setMsg(`${j.message}${j.detail ? ` — ${typeof j.detail === 'string' ? j.detail : (j.detail.txt ?? JSON.stringify(j.detail))}` : ''}`)
      setOut({ results: j.results, ms: j.ms })
      void loadHist(1)
    } catch {
      setMsg('실행 요청이 실패했습니다(네트워크·시간 초과)')
    } finally {
      setBusy(false)
    }
  }

  if (denied)
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold">SQL 편집기</h1>
        <p className="mt-3 text-sm">SQL 편집기 권한이 없습니다(조회자 역할). 분류체계 설정 권한자에게 역할 변경을 요청하십시오.</p>
      </main>
    )

  const kwl = kw.trim().toLowerCase()
  const btn = 'rounded border border-white/40 bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:opacity-40'
  const sel = 'rounded border border-white/40 bg-[#1f3a68] px-1 py-0.5 text-white'
  return (
    <main className="mx-auto flex h-[calc(100dvh-7rem)] max-w-[1800px] flex-col px-3 py-3">
      <div className="flex items-baseline gap-3">
        <Link href="/" className="text-sm text-blue-700 underline">
          ← 분류체계 목록
        </Link>
        <h1 className="text-xl font-bold">SQL 편집기</h1>
        <span className="text-xs text-gray-500">Ctrl+Enter 현재 문장 · Alt+X 스크립트 · Ctrl+Space 자동 완성 · Ctrl+/ 주석</span>
      </div>
      <section className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-3 py-1.5 text-sm text-white shadow" aria-label="SQL 실행 도구">
        <select value={connId} onChange={(e) => setConnId(e.target.value)} className={sel} aria-label="접속">
          {!conns.length && <option value="">접속이 없습니다</option>}
          {conns.map((c) => (
            <option key={c.conn_id} value={c.conn_id} disabled={!usable(c)}>
              {c.conn_nm} ({DBMS_NM[c.dbms_cd] ?? c.dbms_cd}){c.exec_mthd_cd === 'AGT' ? ' — 에이전트 1차 미지원' : !usable(c) ? ' — 조회 전용 계정 아님' : ''}
            </option>
          ))}
        </select>
        <select value={schema} onChange={(e) => setSchema(e.target.value)} className={sel} aria-label="활성 스키마">
          {schemas.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className={btn} disabled={!conn || busy} onClick={() => run(false)} title="Ctrl+Enter">
          ▶ 실행
        </button>
        <button type="button" className={btn} disabled={!conn || busy} onClick={() => run(true)} title="Alt+X">
          ▶▶ 스크립트
        </button>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value) as (typeof LIMITS)[number])} className={sel} aria-label="행 제한">
          {LIMITS.map((n) => (
            <option key={n} value={n}>
              {n}행
            </option>
          ))}
        </select>
        {canWrite && (
          <label className="flex items-center gap-1 text-xs" title="스크립트 전체를 한 트랜잭션으로 — 오류가 나면 모두 되돌림(끄면 문장마다 자동 커밋)">
            <input type="checkbox" checked={oneTx} onChange={(e) => setOneTx(e.target.checked)} /> 한 트랜잭션
          </label>
        )}
        <span className={`ml-auto rounded px-2 py-0.5 text-xs font-semibold ${canWrite ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{canWrite ? `쓰기 가능 · ${oneTx ? '한 트랜잭션' : 'Auto 커밋'}` : '조회 전용'}</span>
        {busy && <span className="text-xs">실행 중…</span>}
      </section>
      {msg && (
        <p role="status" className="mt-1 text-sm font-medium text-red-700">
          {msg}
        </p>
      )}
      {!conns.some(usable) && conns.length > 0 && <p className="mt-1 text-xs text-gray-600">쓸 수 있는 접속이 없습니다 — 데이터아키텍트가 &lsquo;DDL 생성 › DB 접속&rsquo;에서 서버 직접 접속을 &lsquo;조회 전용 계정&rsquo;으로 지정해야 합니다.</p>}
      {!conns.length && (
        <p className="mt-1 text-xs text-gray-600">
          접속이 없습니다 — <Link href={`/areas/${areaId}/ddl`} className="underline">DDL 생성 › DB 접속</Link>에서 등록합니다.
        </p>
      )}

      <div className="mt-2 flex min-h-0 flex-1 gap-2">
        <nav className="flex w-64 min-w-40 shrink-0 resize-x flex-col overflow-hidden rounded border text-xs" aria-label="데이터베이스 탐색기">
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="이름 필터" className="m-1 rounded border px-2 py-0.5" aria-label="탐색기 이름 필터" />
          <ul className="min-h-0 flex-1 overflow-auto px-1 pb-2 font-mono">
            {schemas.map((s) => {
              const sk = `s:${s.name}`, list = objs[s.name]
              return (
                <li key={s.name}>
                  <button type="button" className={`w-full text-left hover:bg-gray-100 ${s.name === schema ? 'font-bold' : ''}`} onClick={() => toggle(sk, () => void loadObjs(s.name))} aria-expanded={open.has(sk)}>
                    {open.has(sk) ? '▾' : '▸'} 🗄 {s.name}
                  </button>
                  {open.has(sk) && (
                    <ul className="pl-3">
                      {list === 'loading' && <li className="text-gray-400">불러오는 중…</li>}
                      {Array.isArray(list) &&
                        KIND.map(([ks, nm]) => {
                          const items = list.filter((o) => ks.includes(o.kind) && (!kwl || o.name.toLowerCase().includes(kwl)))
                          if (!items.length) return null
                          const gk = `${sk}:${ks}`
                          return (
                            <li key={ks}>
                              <button type="button" className="w-full text-left hover:bg-gray-100" onClick={() => toggle(gk)} aria-expanded={open.has(gk)}>
                                {open.has(gk) || kwl ? '▾' : '▸'} 📁 {nm} <span className="text-gray-400">({items.length})</span>
                              </button>
                              {(open.has(gk) || kwl) && (
                                <ul className="pl-3">
                                  {items.map((o) => {
                                    const ok = `${s.name}.${o.name}`, cl = cols[ok], rel = 'rpvmf'.includes(o.kind)
                                    return (
                                      <li key={o.name}>
                                        <div className="flex items-center hover:bg-amber-50" title={o.cmt ?? ''}>
                                          <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => rel && toggle(`c:${ok}`, () => void loadCols(s.name, o.name))} onDoubleClick={() => rel && run(false, `SELECT * FROM ${s.name}.${o.name}`)}>
                                            {rel ? (open.has(`c:${ok}`) ? '▾ ' : '▸ ') : '· '}
                                            {o.name}
                                          </button>
                                          <span className="ml-1 shrink-0 text-gray-400">{fmtSize(o.size)}</span>
                                        </div>
                                        {open.has(`c:${ok}`) && (
                                          <ul className="pl-4 text-gray-700">
                                            {cl === 'loading' && <li className="text-gray-400">…</li>}
                                            {Array.isArray(cl) &&
                                              cl.map((c) => (
                                                <li key={c.name} className="truncate" title={c.type}>
                                                  <button type="button" className="text-left" onClick={() => ed.current?.insert(c.name)}>
                                                    {c.pk ? '🔑' : '·'} {c.name} <span className="text-gray-400">{c.type}{c.nn ? ' NN' : ''}</span>
                                                  </button>
                                                </li>
                                              ))}
                                          </ul>
                                        )}
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="border-t px-1 py-0.5 text-[10px] text-gray-500">두 번 누르기 = SELECT 실행 · 칼럼 누르기 = 편집기에 넣기 · 오른쪽 아래 모서리로 너비 조절</p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-[38%] min-h-24 resize-y overflow-hidden rounded border" aria-label="SQL 편집기">
            {connId && <SqlEditor key={connId} ref={ed} initial={store.get(draftKey) ?? 'SELECT 1;\n'} dialect={dialect} tables={tables} schema={schema || undefined} onChange={(t) => store.set(draftKey, t)} onRun={(s) => void run(s)} />}
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded border">
            <div role="tablist" className="flex gap-1 border-b bg-gray-50 px-1 pt-1 text-xs">
              <button role="tab" aria-selected={tab === 'res'} onClick={() => setTab('res')} className={`rounded-t border px-2 py-0.5 ${tab === 'res' ? 'bg-white font-semibold' : ''}`}>
                결과
              </button>
              <button role="tab" aria-selected={tab === 'hist'} onClick={() => (setTab('hist'), void loadHist(hist.page))} className={`rounded-t border px-2 py-0.5 ${tab === 'hist' ? 'bg-white font-semibold' : ''}`}>
                실행 이력{canWrite ? '(분류체계 전체)' : ''}
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {tab === 'res' ? (
                out ? <ResultPanel results={out.results} ms={out.ms} /> : <p className="p-3 text-sm text-gray-500">문장에 커서를 두고 Ctrl+Enter 를 누르십시오.</p>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-[#e9eff9]">
                        <tr>
                          {['시각', '실행자', '접속', '방식', '결과', '행', 'ms', 'SQL(누르면 편집기에 넣기)'].map((h) => (
                            <th key={h} className="border px-2 py-1 text-left">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hist.items.map((h) => (
                          <tr key={h.sql_exec_id} className="hover:bg-amber-50">
                            <td className="border px-2 whitespace-nowrap">{new Date(h.reg_dtm).toLocaleString('ko-KR')}</td>
                            <td className="border px-2">{h.usr_nm}</td>
                            <td className="border px-2">{h.conn_nm}</td>
                            <td className={`border px-2 ${h.exec_mode_cd === 'WRITE' ? 'text-red-700' : ''}`}>{h.exec_mode_cd === 'WRITE' ? '쓰기' : '조회'}</td>
                            <td className={`border px-2 ${h.rslt_cd === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                              {h.rslt_cd === 'OK' ? '성공' : h.rslt_cd === 'PART' ? '일부' : h.err_cd === 'RUN' ? '중단' : '오류'}
                            </td>
                            <td className="border px-2 text-right">{h.row_cnt ?? ''}</td>
                            <td className="border px-2 text-right">{h.elapsed_ms ?? ''}</td>
                            <td className="max-w-[40rem] truncate border px-2 font-mono">
                              <button type="button" className="w-full truncate text-left" title={h.sql_txt} onClick={() => ed.current?.insert(h.sql_txt + ';\n')}>
                                {h.sql_txt}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2 border-t px-2 py-1 text-xs">
                    <button type="button" disabled={hist.page <= 1} onClick={() => loadHist(hist.page - 1)} className="rounded border px-2 disabled:opacity-40">
                      ‹ 이전
                    </button>
                    {hist.page} / {Math.max(1, Math.ceil(hist.total / HSIZE))} · {hist.total}건
                    <button type="button" disabled={hist.page * HSIZE >= hist.total} onClick={() => loadHist(hist.page + 1)} className="rounded border px-2 disabled:opacity-40">
                      다음 ›
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
