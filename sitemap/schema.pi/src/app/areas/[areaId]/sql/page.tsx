'use client'
// SQL 편집기 화면(마스터 지시 2026-10-18 "Universal SQL Editor" — DBeaver 26.0.5 화면 구성 참고)
//  위 툴바 : 접속(서버 직접만)·활성 스키마·실행(Ctrl+Enter 현재 문장 / Alt+X 스크립트)·행 제한·한 트랜잭션(DA)·권한 표시
//  왼쪽 탐색기(스키마 › 종류 › 객체·크기 › 칼럼, 펼칠 때만 조회, 두 번 누르기 = SELECT 실행) / 가운데 편집기(CodeMirror) / 아래 결과·실행 이력
//  쓰기(DML·DDL)는 DA 만 즉시(Auto 커밋), 위험 문장은 확인 후, 서버가 문장을 다시 판정. 편집 내용은 접속별로 이 브라우저에 초안 저장
//  실행 방식 AUTO | MANUAL(DA) — MANUAL = 미리 실행(대기 문장 재실행 후 항상 되돌림) + [Commit] 대기 문장 한 트랜잭션 재실행·커밋 / [Rollback] 대기 목록 비움(서버리스라 요청 사이 트랜잭션 유지 불가, 마스터 결정 2026-10-18)
//  화면 떠나기(마스터 강조 2026-10-18 '테이블락 방지') : 대기 문장이 있으면 메뉴·링크·뒤로 가기·접속/방식 바꾸기 모두 [Commit 후 / Rollback 후 / 취소] 확인 창
//   강제 종료(탭·브라우저 닫기·오류) = 대기 문장은 이 화면 메모리에만 있어 그대로 버려짐(Rollback, DB 변화 없음) — 브라우저 기본 경고도 띄움.
//   DB 쪽은 요청 사이에 트랜잭션을 열어 두지 않아 잠금이 남지 않고, 요청 도중 끊겨도 idle_in_transaction_session_timeout 으로 DB 가 rollback(sql-run.ts)
//  아래 상태줄 = 수행 시간 자세히·패치 크기·전체 패치·쪽 이동(result-grid)
//  화면 = 위 끝부터 하단 메뉴 바로 위까지 여백 없이 100%(fixed, 메뉴 높이 = --area-nav-h), 좁은 화면(<768px)은 탐색기를 왼쪽 서랍으로(☰ 탐색기)
//  패널 크기 = 손잡이 끌기(탐색기 너비·편집기 높이, 이 브라우저에 기억, 두 번 누르면 기본), 탐색기 이름 = 편집기로 끌어 놓기·Ctrl+C·오른쪽 누르기 복사(마스터 지시 2026-10-18)
import { piFetch } from '@pi/auth/client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DANGER_NM, quoteIdent, splitSql, stmtAt, type Danger } from '@/lib/modelpi/sql-split'
import ResultPanel, { type RunMode, type RunRes } from './result-grid'
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
  exec_mode_cd: 'READ' | 'WRITE' | 'TRY' | 'CMIT'
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
const SIZES = [200, 500, 1000, 5000] as const // 패치 크기
const ALL = 100_000 // 전체 패치(서버 응답 3.5MB 한도가 먼저 걸릴 수 있음)
const PENDING_MAX = 50
const MODE_NM: Record<string, string> = { READ: '조회', WRITE: '쓰기', TRY: '미리 실행', CMIT: '커밋' }
// 식별자 따옴표 — 카탈로그 이름이 그대로 SQL 이 되지 않게(예: 테이블명 'x; DROP …'), 단순 이름(PG 소문자·Oracle 대문자)은 그대로
const qi = (n: string, ora: boolean) => quoteIdent(n, ora ? 'ORA' : 'PG')
const HSIZE = 20
// 패널 크기(px) — l 탐색기 너비, e 편집기 높이
const PANE = { l: { min: 160, max: 720, def: 256 }, e: { min: 80, max: 1600, def: 300 } } as const
type Pane = { l: number; e: number }
// 탐색기 이름 끌기 — span 에 draggable(Firefox 는 button 끌기가 시작되지 않음), 편집기(CodeMirror)가 놓은 자리에 text/plain 삽입
function Drag({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <span draggable onDragStart={(e) => (e.dataTransfer.setData('text/plain', t), (e.dataTransfer.effectAllowed = 'copy'))} className="cursor-grab">
      {children}
    </span>
  )
}
const maxOf = (k: keyof Pane) => (k === 'e' && typeof window !== 'undefined' ? Math.max(PANE.e.min, Math.min(PANE.e.max, window.innerHeight - 260)) : PANE[k].max) // 편집기는 결과 패널 자리를 남김
const clampPane = (k: keyof Pane, v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(Math.min(maxOf(k), Math.max(PANE[k].min, v))) : PANE[k].def)
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
  const connRef = useRef('') // 응답이 올 때 지금 접속(요청 중 접속을 바꾸면 이전 응답 버림)
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
  const [limit, setLimitS] = useState<number>(200)
  const [txMode, setTxMode] = useState<'AUTO' | 'MANUAL'>('AUTO')
  const [pending, setPending] = useState<string[]>([]) // MANUAL 대기 문장(커밋 전)
  const [last, setLast] = useState('') // 마지막 실행 SQL(전체 패치 재실행용)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [out, setOut] = useState<{ results: RunRes[]; ms: number; at: string; mode: RunMode } | null>(null)
  const [tab, setTab] = useState<'res' | 'hist'>('res')
  const [hist, setHist] = useState<{ items: Hist[]; total: number; page: number }>({ items: [], total: 0, page: 1 })
  const [pane, setPane] = useState<Pane>({ l: PANE.l.def, e: PANE.e.def })
  const [pick, setPick] = useState('') // 탐색기에서 고른 이름(복사 대상)
  const [treeOpen, setTreeOpen] = useState(false) // 좁은 화면 탐색기 서랍
  useEffect(() => {
    if (!treeOpen) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setTreeOpen(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [treeOpen])
  const manual = canWrite && txMode === 'MANUAL'
  useEffect(() => {
    const n = Number(store.get('sql-fetch'))
    if ((SIZES as readonly number[]).includes(n)) setLimitS(n)
    if (store.get('sql-tx') === 'MANUAL') setTxMode('MANUAL')
  }, [])
  const leaving = useRef(false) // 확인 창에서 Commit·Rollback 뒤 떠나는 중(경고·가드 생략)
  useEffect(() => {
    if (!pending.length) return
    const h = (e: BeforeUnloadEvent) => void (!leaving.current && e.preventDefault()) // 탭·브라우저 닫기 = 브라우저 기본 경고(그대로 닫으면 대기 문장 버림 = Rollback), 확인 창에서 고른 이동은 제외
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [pending.length])
  // 떠나기 확인 창 — why = 무엇을 하려는지, go = Commit·Rollback 뒤 이어서 할 일, cancel = 취소 때 할 일
  const router = useRouter()
  const [leave, setLeave] = useState<{ why: string; go: () => void; cancel?: () => void } | null>(null)
  useEffect(() => {
    if (leave) setMsg('') // 창을 열 때 이전 실행 오류는 지움(창 안에는 이번 Commit 결과만)
  }, [leave])
  useEffect(() => {
    if (leave && !pending.length && !busy) {
      const g = leave.go
      setLeave(null)
      g() // 창이 열린 사이 대기 문장이 비었음(진행 중이던 커밋 완료) — 고를 것 없이 이어서
    }
  }, [leave, pending.length, busy])
  const guarded = useRef(false) // 뒤로 가기를 잡으려고 넣어 둔 같은 주소 history 항목
  const guardHref = useRef('')
  const skipPop = useRef(false)
  // 링크·메뉴(같은 사이트) 누르기 — 대기 문장이 있으면 이동을 멈추고 확인 창
  useEffect(() => {
    if (!pending.length) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      e.preventDefault()
      e.stopPropagation()
      setLeave({ why: '이동', go: () => leaveTo(() => (guarded.current ? router.replace : router.push)(url.pathname + url.search + url.hash)) })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pending.length, router])
  // 뒤로 가기 — 대기 문장이 생기면 같은 주소 항목을 하나 넣어 두고, 뒤로 가면 다시 넣은 뒤 확인 창(Next 라우터 상태는 그대로 복사)
  useEffect(() => {
    if (pending.length && !guarded.current) {
      window.history.pushState({ ...window.history.state, sqlGuard: 1 }, '', window.location.href)
      guarded.current = true
      guardHref.current = window.location.href
    } else if (!pending.length && guarded.current && !leaving.current) {
      guarded.current = false
      skipPop.current = true
      window.history.back() // 넣어 둔 항목 걷어 냄(같은 주소)
    }
  }, [pending.length])
  // 떠나기 실행 — 이동이 실제로 안 일어나면(되돌아갈 곳 없음 등) 잠시 뒤 경고·가드를 다시 켬
  const leaveTo = (move: () => void) => {
    leaving.current = true
    move()
    window.setTimeout(() => void (leaving.current = false), 2000)
  }
  useEffect(() => {
    if (pending.length) leaving.current = false // 새 대기 문장 = 다시 지킴
  }, [pending.length])
  // Navigation API(크롬·엣지 등) — 뒤로·앞으로·목록에서 여러 칸 이동을 이동 전에 막고 확인 창, 확인 뒤 그 항목으로
  useEffect(() => {
    const nav = (window as unknown as { navigation?: { addEventListener(t: string, h: (e: NavEvent) => void): void; removeEventListener(t: string, h: (e: NavEvent) => void): void; traverseTo(k: string): void } }).navigation
    type NavEvent = { navigationType: string; cancelable: boolean; destination: { key: string; url: string }; preventDefault(): void }
    if (!nav || !pending.length) return
    const h = (e: NavEvent) => {
      if (leaving.current || e.navigationType !== 'traverse' || !e.cancelable || e.destination.url === window.location.href) return
      e.preventDefault()
      const key = e.destination.key
      setLeave({ why: '뒤로·앞으로 가기', go: () => leaveTo(() => ((guarded.current = false), nav.traverseTo(key))) })
    }
    nav.addEventListener('navigate', h)
    return () => nav.removeEventListener('navigate', h)
  }, [pending.length])
  // 대체(Navigation API 없음·취소 불가) — 가드 항목에서 한 칸 뒤로 간 경우만 되돌리고 확인 창, 여러 칸 이동은 막을 수 없음(대기 문장 버림 = Rollback)
  useEffect(() => {
    const onPop = () => {
      if (skipPop.current) return void (skipPop.current = false)
      if (!guarded.current || leaving.current || window.location.href !== guardHref.current) return
      window.history.pushState({ ...window.history.state, sqlGuard: 1 }, '', window.location.href)
      setLeave({ why: '뒤로 가기', go: () => leaveTo(() => ((guarded.current = false), window.history.go(-2))) })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [note, setNote] = useState('')
  useEffect(() => {
    try {
      const v = JSON.parse(store.get('sql-pane') ?? 'null') as Partial<Pane> | null
      if (v) setPane({ l: clampPane('l', v.l), e: clampPane('e', v.e) })
    } catch {}
  }, [])
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
    connRef.current = connId
    ed.current?.set(store.get(draftKey) ?? 'SELECT 1;\n')
    setSchemas([]), setObjs({}), setCols({}), setOpen(new Set()), setOut(null), setMsg(''), setPending([]), setLast('')
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
  async function run(script: boolean, sqlText?: string, confirm = false, lim = limit): Promise<void> {
    if (!conn || busy) return
    if (manual && pending.length >= PENDING_MAX) return setMsg(`대기 문장이 ${PENDING_MAX}개입니다 — Commit 또는 Rollback 하십시오`)
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
    const cid = conn.conn_id
    try {
      const r = await piFetch(`${api}/sql/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conn_id: conn.conn_id, sql: text, limit: lim, schema: schema || null, tx: manual ? 'MANUAL' : 'AUTO', pending: manual ? pending : [], confirm }) })
      const j = await r.json()
      if (connRef.current !== cid) return // 요청 중 접속을 바꿈
      if (j.code === 'SQL_CONFIRM') {
        const list = (j.detail as { seq: number; txt: string; danger: Danger }[]).map((d) => `${d.seq}. [${DANGER_NM[d.danger]}]\n${d.txt}`).join('\n\n')
        if (window.confirm(`위험한 문장이 있습니다 — 그래도 실행할까요?\n\n${list}`)) return void (setBusy(false), await run(script, text, true, lim))
        return setMsg('실행을 취소했습니다')
      }
      if (!j.ok) return setMsg(`${j.message}${j.detail ? ` — ${typeof j.detail === 'string' ? j.detail : (j.detail.txt ?? JSON.stringify(j.detail))}` : ''}`)
      setOut({ results: j.results, ms: j.ms, at: j.at, mode: j.mode })
      setLast((j.results as RunRes[]).every((x) => x.kind === 'READ') ? text! : '') // 전체 패치 = 조회만 다시 실행(쓰기 재실행 방지)
      if (j.journal?.length) setPending((p) => [...p, ...j.journal])
      void loadHist(1)
    } catch {
      setMsg('실행 요청이 실패했습니다(네트워크·시간 초과)')
    } finally {
      setBusy(false)
    }
  }

  const flash = (t: string) => (setNote(t), window.setTimeout(() => setNote(''), 3000)) // 잠깐 보이는 알림
  // MANUAL Commit — 대기 문장을 한 트랜잭션으로 다시 실행·커밋(오류면 전체 되돌림·대기 목록 유지)
  async function commit(ask = true): Promise<boolean> {
    if (!conn || busy || !pending.length) return false
    if (ask && !window.confirm(`대기 문장 ${pending.length}개를 한 트랜잭션으로 다시 실행해 커밋할까요?\n(미리 실행 뒤 다른 변경·now()·시퀀스 값은 달라질 수 있습니다)\n\n${pending.map((x, i) => `${i + 1}. ${x.slice(0, 200)}`).join('\n')}`)) return false
    setBusy(true), setMsg(''), setTab('res')
    try {
      const cid = conn.conn_id
      const j = await (await piFetch(`${api}/sql/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conn_id: cid, tx: 'MANUAL', pending, commit: true, confirm: true, limit, schema: schema || null }) })).json()
      if (connRef.current !== cid) return false
      setLast('')
      if (!j.ok) return (setMsg(`${j.message}${j.detail ? ` — ${typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)}` : ''}`), false)
      setOut({ results: j.results, ms: j.ms, at: j.at, mode: j.mode })
      void loadHist(1)
      if (j.rslt === 'OK') return (setPending([]), flash(`커밋했습니다 — ${pending.length}문장`), true)
      setMsg('커밋 실패 — 전체 되돌렸습니다(대기 목록은 그대로)')
      return false
    } catch {
      setMsg('커밋 요청이 실패했습니다(네트워크·시간 초과) — DB 반영 여부를 실행 이력에서 확인하십시오')
      return false
    } finally {
      setBusy(false)
    }
  }
  const rollback = () => {
    if (!pending.length || !window.confirm(`대기 문장 ${pending.length}개를 버릴까요? (DB 는 아직 바뀌지 않았습니다)`)) return
    setPending([]), flash('Rollback — 대기 목록을 비웠습니다')
  }
  const setMode = (m: 'AUTO' | 'MANUAL') => {
    if (m === txMode) return
    const apply = () => (setPending([]), setTxMode(m), store.set('sql-tx', m))
    if (pending.length) setLeave({ why: `${m} 로 바꾸기`, go: apply })
    else apply()
  }
  const setLimit = (n: number) => (setLimitS(n), store.set('sql-fetch', String(n)))

  // 이름 복사·끌어 놓기 — 편집기(CodeMirror)는 끌어 온 text/plain 을 놓은 자리에 넣음. SQL 에 바로 쓰도록 필요하면 따옴표 식별자
  const copyName = (t: string) => {
    if (!navigator.clipboard) return setNote('이 브라우저는 복사를 지원하지 않습니다(https 필요) — 끌어 놓기를 쓰십시오')
    void navigator.clipboard.writeText(t).then(() => setNote(`복사했습니다 : ${t}`), () => setNote('복사하지 못했습니다(브라우저 권한)'))
    window.setTimeout(() => setNote(''), 3000)
  }
  // id = 트리 경로(같은 이름 여러 곳 구분), t = 복사·끌기 글자
  const nameProps = (id: string, t: string) => ({
    onFocus: () => setPick(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') (e.preventDefault(), copyName(t))
    },
    onContextMenu: (e: React.MouseEvent) => (e.preventDefault(), setPick(id), copyName(t)),
  })
  // 손잡이 — 끄는 동안 창 이벤트로 추적(편집기 위를 지나가도 끊기지 않음)
  const splitter = (k: 'l' | 'e') => (
    <div
      role="separator"
      aria-orientation={k === 'l' ? 'vertical' : 'horizontal'}
      aria-label={k === 'l' ? '탐색기 너비 조절' : '편집기·결과 높이 조절'}
      title="끌어서 크기 조절(방향키도 가능) · 두 번 누르면 기본 크기"
      tabIndex={0}
      aria-valuenow={pane[k]}
      aria-valuemin={PANE[k].min}
      aria-valuemax={maxOf(k)}
      onKeyDown={(e) => {
        const d = (k === 'l' ? { ArrowLeft: -20, ArrowRight: 20 } : { ArrowUp: -20, ArrowDown: 20 } as Record<string, number>)[e.key] // 손잡이 방향 키만
        if (!d) return
        e.preventDefault()
        setPane((p) => { const v = { ...p, [k]: clampPane(k, p[k] + d) }; store.set('sql-pane', JSON.stringify(v)); return v })
      }}
      className={`group shrink-0 touch-none items-center justify-center ${k === 'l' ? 'hidden w-2 cursor-col-resize md:flex' : 'flex h-2 cursor-row-resize'}`}
      onPointerDown={(e) => {
        e.preventDefault()
        const a0 = k === 'l' ? e.clientX : e.clientY, v0 = pane[k]
        let last = pane
        const move = (ev: PointerEvent) => {
          const v = clampPane(k, v0 + (k === 'l' ? ev.clientX : ev.clientY) - a0)
          setPane((p) => (last = { ...p, [k]: v }))
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', up)
          document.body.style.cursor = ''
          store.set('sql-pane', JSON.stringify(last))
        }
        document.body.style.cursor = k === 'l' ? 'col-resize' : 'row-resize'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
      }}
      onDoubleClick={() => setPane((p) => { const v = { ...p, [k]: PANE[k].def }; store.set('sql-pane', JSON.stringify(v)); return v })}
    >
      <span className={`rounded-full bg-[#c7d2e6] group-hover:bg-[#3b5f9e] ${k === 'l' ? 'h-16 w-1.5' : 'h-1.5 w-16'}`} />
    </div>
  )

  if (denied)
    return (
      <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
        <h1 className="text-2xl font-bold">SQL 편집기</h1>
        <p className="mt-3 text-sm">SQL 편집기 권한이 없습니다(조회자 역할). 분류체계 설정 권한자에게 역할 변경을 요청하십시오.</p>
      </main>
    )

  const kwl = kw.trim().toLowerCase()
  const btn = 'rounded border border-white/40 bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:opacity-40'
  const sel = 'rounded border border-white/40 bg-[#1f3a68] px-1 py-0.5 text-white'
  return (
    <main className="fixed inset-x-0 top-0 z-30 flex flex-col overflow-hidden bg-white" style={{ bottom: 'var(--area-nav-h, 4rem)' }}>
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <Link href="/" className="shrink-0 text-xs text-blue-700 underline">
          ← 분류체계 목록
        </Link>
        <h1 className="shrink-0 text-sm font-bold">SQL 편집기</h1>
        <span className="hidden truncate text-[11px] text-gray-500 lg:inline">Ctrl+Enter 현재 문장 · Alt+X 스크립트 · Ctrl+Shift+F 정렬 · Ctrl+Space 자동 완성 · Ctrl+/ 주석</span>
      </div>
      <section className="flex shrink-0 flex-wrap items-center gap-1.5 bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-2 py-1 text-sm text-white" aria-label="SQL 실행 도구">
        <button type="button" className={`${btn} md:hidden`} onClick={() => setTreeOpen((v) => !v)} aria-expanded={treeOpen} aria-controls="sql-tree">
          ☰ 탐색기
        </button>
        <select value={connId} disabled={busy} onChange={(e) => { const v = e.target.value; if (pending.length) setLeave({ why: '접속 바꾸기', go: () => setConnId(v) }); else setConnId(v) }} className={sel} aria-label="접속">
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
        <button type="button" className={btn} disabled={!conn} onClick={() => ed.current?.format()} title="Ctrl+Shift+F — 선택 영역(없으면 커서 문장)을 강 정렬(키워드 끝 6열)로 다시 배치">
          ≡ 정렬
        </button>
        <span className="ml-auto flex items-center gap-2">
          {canWrite ? (
            <>
              {manual && (
                <>
                  <span className={`rounded px-2 py-0.5 text-xs ${pending.length ? 'bg-amber-300 font-semibold text-black' : 'bg-white/20'}`} title={pending.map((x, i) => `${i + 1}. ${x.slice(0, 120)}`).join('\n') || '대기 문장 없음'}>
                    대기 {pending.length}
                  </span>
                  <button type="button" className={btn} disabled={!pending.length || busy} onClick={() => void commit()} title="대기 문장을 한 트랜잭션으로 다시 실행해 커밋">
                    ✔ Commit
                  </button>
                  <button type="button" className={btn} disabled={!pending.length || busy} onClick={rollback} title="대기 문장 버림(DB 는 아직 바뀌지 않음)">
                    ↺ Rollback
                  </button>
                </>
              )}
              <span role="group" aria-label="실행 방식" className="flex overflow-hidden rounded border border-white/50 text-xs font-semibold">
                {(['AUTO', 'MANUAL'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={txMode === m}
                    disabled={busy}
                    onClick={() => setMode(m)}
                    title={m === 'AUTO' ? '문장마다 바로 커밋' : '미리 실행해 결과를 보고 Commit 때 반영(대기 문장 재실행)'}
                    className={`px-2 py-0.5 ${txMode === m ? (m === 'AUTO' ? 'bg-red-100 text-red-800' : 'bg-amber-200 text-amber-900') : 'text-white/80 hover:bg-white/10'}`}
                  >
                    {m}
                  </button>
                ))}
              </span>
            </>
          ) : (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">조회 전용</span>
          )}
        </span>
        {busy && <span className="text-xs">실행 중…</span>}
      </section>
      {msg && (
        <p role="status" className="shrink-0 px-2 py-0.5 text-sm font-medium text-red-700">
          {msg}
        </p>
      )}
      {note && !msg && <p className="shrink-0 px-2 py-0.5 text-xs text-gray-600" aria-live="polite">{note}</p>}
      {!conns.some(usable) && conns.length > 0 && <p className="shrink-0 px-2 py-0.5 text-xs text-gray-600">쓸 수 있는 접속이 없습니다 — 데이터아키텍트가 &lsquo;DDL 생성 › DB 접속&rsquo;에서 서버 직접 접속을 &lsquo;조회 전용 계정&rsquo;으로 지정해야 합니다.</p>}
      {!conns.length && (
        <p className="shrink-0 px-2 py-0.5 text-xs text-gray-600">
          접속이 없습니다 — <Link href={`/areas/${areaId}/ddl`} className="underline">DDL 생성 › DB 접속</Link>에서 등록합니다.
        </p>
      )}

      <div className="relative flex min-h-0 flex-1 border-t">
        {treeOpen && <div className="absolute inset-0 z-10 bg-black/30 md:hidden" onClick={() => setTreeOpen(false)} aria-hidden />}
        <nav
          id="sql-tree"
          className={`${treeOpen ? 'absolute inset-y-0 left-0 z-20 flex w-[85vw] max-w-sm shadow-xl' : 'hidden'} shrink-0 flex-col overflow-hidden border-r bg-white text-xs md:static md:flex md:w-[var(--tree-w)] md:max-w-none md:shadow-none`}
          style={{ '--tree-w': `${pane.l}px` } as React.CSSProperties}
          aria-label="데이터베이스 탐색기"
        >
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="이름 필터" className="m-1 rounded border px-2 py-0.5" aria-label="탐색기 이름 필터" />
          <ul className="min-h-0 flex-1 overflow-auto px-1 pb-2 font-mono">
            {schemas.map((s) => {
              const sk = `s:${s.name}`, list = objs[s.name]
              return (
                <li key={s.name}>
                  <button type="button" {...nameProps(sk, qi(s.name, dialect === 'ORA'))} className={`w-full text-left hover:bg-gray-100 ${s.name === schema ? 'font-bold' : ''} ${pick === sk ? 'bg-blue-100' : ''}`} onClick={() => toggle(sk, () => void loadObjs(s.name))} aria-expanded={open.has(sk)}>
                    {open.has(sk) ? '▾' : '▸'} 🗄 <Drag t={qi(s.name, dialect === 'ORA')}>{s.name}</Drag>
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
                                          <button type="button" {...nameProps(`o:${ok}`, qi(o.name, dialect === 'ORA'))} className={`min-w-0 flex-1 truncate text-left ${pick === `o:${ok}` ? 'bg-blue-100' : ''}`} onClick={() => rel && toggle(`c:${ok}`, () => void loadCols(s.name, o.name))} onDoubleClick={() => rel && (setTreeOpen(false), run(false, `SELECT * FROM ${qi(s.name, dialect === 'ORA')}.${qi(o.name, dialect === 'ORA')}`))}>
                                            {rel ? (open.has(`c:${ok}`) ? '▾ ' : '▸ ') : '· '}
                                            <Drag t={qi(o.name, dialect === 'ORA')}>{o.name}</Drag>
                                          </button>
                                          <span className="ml-1 shrink-0 text-gray-400">{fmtSize(o.size)}</span>
                                        </div>
                                        {open.has(`c:${ok}`) && (
                                          <ul className="pl-4 text-gray-700">
                                            {cl === 'loading' && <li className="text-gray-400">…</li>}
                                            {Array.isArray(cl) &&
                                              cl.map((c) => (
                                                <li key={c.name} className="truncate" title={c.type}>
                                                  <button type="button" {...nameProps(`k:${ok}.${c.name}`, qi(c.name, dialect === 'ORA'))} className={`text-left ${pick === `k:${ok}.${c.name}` ? 'bg-blue-100' : ''}`} onClick={() => ed.current?.insert(qi(c.name, dialect === 'ORA'))}>
                                                    {c.pk ? '🔑' : '·'} <Drag t={qi(c.name, dialect === 'ORA')}>{c.name}</Drag> <span className="text-gray-400">{c.type}{c.nn ? ' NN' : ''}</span>
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
          <p className="border-t px-1 py-0.5 text-[10px] text-gray-500">이름을 편집기로 끌어 놓기 · 고르고 Ctrl+C 또는 오른쪽 누르기 = 이름 복사 · 두 번 누르기 = SELECT 실행 · 칼럼 누르기 = 편집기에 넣기</p>
        </nav>
        {splitter('l')}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 overflow-hidden" style={{ height: pane.e, maxHeight: 'calc(100% - 7rem)' }} aria-label="SQL 편집기">
            {connId && <SqlEditor key={connId} ref={ed} initial={store.get(draftKey) ?? 'SELECT 1;\n'} dialect={dialect} tables={tables} schema={schema || undefined} onChange={(t) => store.set(draftKey, t)} onRun={(s) => void run(s)} />}
          </div>
          {splitter('e')}
          <div className="flex min-h-20 flex-1 flex-col border-t">
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
                out ? <ResultPanel results={out.results} ms={out.ms} at={out.at} mode={out.mode} dialect={dialect} fetch={{ limit, sizes: SIZES, all: ALL, setLimit, busy, canAll: !!last, fetchAll: () => void (last ? run(false, last, false, ALL) : setMsg('먼저 실행하십시오')) }} /> : <p className="p-3 text-sm text-gray-500">문장에 커서를 두고 Ctrl+Enter 를 누르십시오.</p>
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
                            <td className={`border px-2 ${h.exec_mode_cd === 'WRITE' || h.exec_mode_cd === 'CMIT' ? 'text-red-700' : h.exec_mode_cd === 'TRY' ? 'text-amber-700' : ''}`}>{MODE_NM[h.exec_mode_cd] ?? h.exec_mode_cd}</td>
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
      {/* 확인 창은 body 로 — fixed main(z-30) 쌓임 맥락 밖이라 하단 메뉴(z-40)까지 덮음 */}
      {leave &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onKeyDown={(e) => e.key === 'Escape' && (leave.cancel?.(), setLeave(null))}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" className="w-full max-w-xl rounded-xl bg-white p-4 text-sm shadow-xl">
            <h2 id="leave-title" className="text-base font-bold text-red-800">
              커밋하지 않은 대기 문장 {pending.length}개 — {leave.why} 전에 처리하십시오
            </h2>
            <p className="mt-1 text-xs text-gray-600">아직 DB 에 반영되지 않았습니다(MANUAL 미리 실행). Commit = 한 트랜잭션으로 다시 실행해 반영, Rollback = 버림. 탭·브라우저를 그냥 닫으면 모두 Rollback 됩니다.</p>
            <ol className="mt-2 max-h-48 list-decimal overflow-auto rounded border bg-gray-50 py-1 pr-2 pl-7 font-mono text-xs">
              {pending.map((x, i) => (
                <li key={i} className="truncate" title={x}>
                  {x}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded bg-[#1f3a68] px-3 py-1 font-semibold text-white disabled:opacity-50"
                onClick={async () => {
                  const go = leave.go
                  if (await commit(false)) setLeave(null), go()
                }}
              >
                ✔ Commit 후 {leave.why}
              </button>
              <button type="button" disabled={busy} className="rounded border border-red-300 bg-red-50 px-3 py-1 font-semibold text-red-800 disabled:opacity-50" onClick={() => (setPending([]), setLeave(null), leave.go())}>
                ↺ Rollback 후 {leave.why}
              </button>
              <button type="button" autoFocus disabled={busy} className="rounded border px-3 py-1" onClick={() => (leave.cancel?.(), setLeave(null))}>
                취소
              </button>
            </div>
            {busy && <p className="mt-2 text-xs text-gray-500">커밋 중…</p>}
            {msg && !busy && (
              <p role="alert" className="mt-2 text-xs font-medium text-red-700">
                {msg}
              </p>
            )}
          </div>
        </div>,
          document.body,
        )}
    </main>
  )
}
