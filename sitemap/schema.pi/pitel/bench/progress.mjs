// DBMS 별 초기 데이터 적재 진행 비교표 : 주제영역별(목표 행 · 완료 행 · 완료율 · 크기) + 시간대별(10분 누적) 두 표를 Markdown 으로 출력
// 기준선 = PostgreSQL 2026-11-14 배율 1 실측 로그(같은 경과 시점 비교), 대상 = datagen run 로그. 실행마다 크기 기록을 <로그>.size.jsonl 에 남김(보고서 시계열 근거)
// 실행 : node bench/progress.mjs --target oracle --log oracle/out/full_load.log [--base <기준 로그> --base-label PostgreSQL]   (PRD dbms.pi 11.7 보고 방식 정본)
// --base 없음 = 대상 단독(2026-11-21 새 PC 조건 첫 측정 MySQL). 셋째 표 = 주제영역별 생성 시간(첫 작업 단위 시작 ~ 마지막 완료)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = k => {
  const i = process.argv.indexOf(k)
  return i > 0 ? process.argv[i + 1] : undefined
}
const TARGET = arg('--target') || 'oracle'
const LOG = path.resolve(ROOT, arg('--log') || 'oracle/out/full_load.log')
const BASE = arg('--base') ? path.resolve(ROOT, arg('--base')) : null
const BL = arg('--base-label') || 'PostgreSQL'
const STEP_MIN = 10
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const LABEL = { oracle: 'Oracle', mssql: 'MS-SQL', mysql: 'MySQL', pg: 'PostgreSQL' }

// 대상 DB 의 주제영역별 크기(바이트). 세그먼트·테이블 이름 = PTL_<영역>_… , 영역 미상 LOB 은 lob 으로 따로
const SIZE = {
  oracle: async () => {
    const { ora, rows } = await import('../oracle/ora.mjs')
    const sz = Object.fromEntries(AREAS.map(a => [a, 0]))
    const q = "SELECT SUBSTR(segment_name, 5, 3) || '|' || SUM(bytes) FROM dba_segments WHERE owner = 'PITEL' AND segment_name LIKE 'PTL\\_%' ESCAPE '\\' GROUP BY SUBSTR(segment_name, 5, 3);"
    for (const l of rows(await ora(q, { sysdba: true }))) {
      const [a, b] = l.trim().split('|')
      if (a in sz) sz[a] = +b
    }
    const lob = +rows(await ora("SELECT NVL(SUM(bytes), 0) FROM dba_segments WHERE owner = 'PITEL' AND segment_name NOT LIKE 'PTL\\_%' ESCAPE '\\';", { sysdba: true }))[0]
    return { sz, lob }
  },
  // MS-SQL : 할당 페이지(8KB) 합, 테이블 이름 PTL_<영역>_, varchar(max) 넘침 데이터(LOB_DATA)는 lob 으로 따로
  mssql: async () => {
    const { ms, rows } = await import('../mssql/ms.mjs')
    const sz = Object.fromEntries(AREAS.map(a => [a, 0]))
    let lob = 0
    const q = "SELECT SUBSTRING(t.name, 5, 3), au.type_desc, SUM(au.total_pages) * 8192 FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id JOIN sys.allocation_units au ON au.container_id = p.partition_id WHERE t.name LIKE 'PTL[_]%' GROUP BY SUBSTRING(t.name, 5, 3), au.type_desc;"
    for (const l of rows(await ms(q))) {
      const [a, ty, b] = l.trim().split('|')
      if (ty === 'LOB_DATA') lob += +b
      else if (a in sz) sz[a] += +b
    }
    return { sz, lob }
  },
  // MySQL : 테이블스페이스 파일 할당 크기(파티션마다 파일 1개), 이름 pitel/ptl_<영역>_…
  mysql: async () => {
    const { my, rows } = await import('../mysql/my.mjs')
    const sz = Object.fromEntries(AREAS.map(a => [a, 0]))
    const q = "SELECT UPPER(SUBSTRING(NAME, 11, 3)), SUM(ALLOCATED_SIZE) FROM information_schema.INNODB_TABLESPACES WHERE NAME LIKE 'pitel/ptl\\_%' GROUP BY UPPER(SUBSTRING(NAME, 11, 3));"
    for (const l of rows(await my(q))) {
      const [a, b] = l.trim().split('\t')
      if (a in sz) sz[a] = +b
    }
    return { sz, lob: 0 }
  },
  // PostgreSQL : pitel-pg 의 DB pitel · public, 파티션 하위 테이블 크기(TOAST 포함, 인덱스 없음) 합, 이름 ptl_<영역>_…
  pg: async () => {
    const { spawnSync } = await import('node:child_process')
    const sz = Object.fromEntries(AREAS.map(a => [a, 0]))
    const q = "SELECT upper(substr(relname, 5, 3)) || '|' || sum(pg_total_relation_size(oid)) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'ptl\\_%' GROUP BY upper(substr(relname, 5, 3));"
    // ON_ERROR_STOP : psql 은 표준입력 SQL 오류에도 종료 코드 0 이라 크기가 조용히 0 으로 나옴(2026-11-21)
    const r = spawnSync('docker', ['exec', '-i', process.env.PITEL_CONTAINER || 'pitel-pg', 'psql', '-U', 'postgres', '-d', 'pitel', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' })
    if (r.status !== 0) throw new Error('크기 조회 실패 : ' + r.stderr)
    for (const l of r.stdout.split('\n').filter(Boolean)) {
      const [a, b] = l.trim().split('|')
      if (a in sz) sz[a] = +b
    }
    return { sz, lob: 0 }
  },
}
if (!SIZE[TARGET]) throw new Error(`크기 조회 미구현 대상 : ${TARGET}`)

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'datagen/out/plan.json')))
const n = new Map(plan.map(p => [p.tbl, p.n]))
const area = new Map(plan.map(p => [p.tbl, p.area]))
// 작업 단위 행 수 = datagen dtmToK 와 같은 경계 계산
const t0 = Date.UTC(2010, 0, 1), t1 = Date.UTC(2026, 9, 31, 23, 59, 59)
const kk = (y, N) => Math.max(0, Math.min(N, Math.floor(N * Math.pow((Date.UTC(y, 0, 1) - t0) / (t1 - t0), 1 / 0.22))))
const rowsOf = id => {
  const [t, y] = id.split(':'), N = n.get(t)
  if (y === 'all') return N
  const yy = +y, from = yy === 2010 ? 1 : kk(yy, N) + 1, to = yy === 2026 ? N : kk(yy + 1, N)
  return Math.max(0, to - from + 1)
}
// 로그 → 첫 시작 시각 · 완료 작업 단위(경과초, 시작 경과초) · 시작한 작업 단위 · 실패 수
function scan(file) {
  let first
  let fail = 0
  const out = []
  const st = new Map()
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.startsWith('실패 ')) fail++
    const m = l.match(/^(시작|완료) (\S+:\S+) (\S+)$/)
    if (!m) continue
    const t = new Date(m[3])
    if (m[1] === '시작') {
      st.set(m[2], t)
      if (!first || t < first) first = t
    }
    if (m[1] === '완료') out.push({ id: m[2], at: t })
  }
  const rel = t => (t - first) / 1000
  return { first, fail, starts: [...st].map(([id, t]) => ({ id, sec: rel(t) })), list: out.map(x => ({ id: x.id, sec: rel(x.at), s: rel(st.get(x.id)) })) }
}
const sumBy = (lst, until) => {
  const s = Object.fromEntries(AREAS.map(a => [a, 0]))
  for (const x of lst) if (x.sec <= until) s[area.get(x.id.split(':')[0])] += rowsOf(x.id)
  return s
}
const total = o => Object.values(o).reduce((s, x) => s + x, 0)

const O = scan(LOG)
const P = BASE ? scan(BASE) : { list: [] }
const exitLine = fs.readFileSync(LOG, 'utf8').match(/^exit \d+ (\S+)$/m)
// 끝 = exit 줄(launch.mjs) 또는 작업 단위 전부 완료(exit 줄 없는 로그) — 후자는 마지막 완료 시각
const allDone = O.list.length === plan.reduce((s, p) => s + (p.n >= 1000000 ? 17 : 1), 0)
const ended = exitLine || allDone
const el = exitLine ? (new Date(exitLine[1]) - O.first) / 1000 : allDone ? Math.max(...O.list.map(x => x.sec)) : (Date.now() - O.first) / 1000
const tgt = Object.fromEntries(AREAS.map(a => [a, 0]))
// 작업 단위 수 = datagen chunks 와 같은 규칙(100만 행 이상 = 2010~2026 연도 17개, 미만 = 1개)
const units = Object.fromEntries(AREAS.map(a => [a, 0]))
for (const p of plan) {
  tgt[p.area] += p.n
  units[p.area] += p.n >= 1000000 ? 17 : 1
}
const UNITS = total(units)
// 끝났으면 전부 집계 : exit 시각은 초 단위라 마지막 완료(밀리초)보다 앞설 수 있음
const oNow = sumBy(O.list, ended ? Infinity : el)
const pNow = sumBy(P.list, el)
const { sz, lob } = await SIZE[TARGET]()
const SIZE_LOG = LOG.replace(/\.log$/, '') + '.size.jsonl'
fs.appendFileSync(SIZE_LOG, JSON.stringify({ at: new Date().toISOString(), sec: Math.round(el), sz, lob, rows: oNow }) + '\n')

const f = x => x.toLocaleString('ko-KR')
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%'
const gb = b => (b / 1e9).toFixed(1)
const D = LABEL[TARGET]
// 기준 칸(--base 있을 때만)
const bh = BASE ? `${BL} 완료 행 | ${BL} 완료율 | ` : ''
const bs = BASE ? '---:|---:|' : ''
const bv = (p, t) => (BASE ? `${f(p)} | ${pct(p, t)} | ` : '')
const L = [
  `경과 ${Math.floor(Math.round(el) / 60)}분 ${Math.round(el) % 60}초 · 작업 단위 ${O.list.length}/${f(UNITS)} · 실패 ${O.fail}${BASE ? ` (${BL} = 기준 로그의 같은 경과 시점)` : ''}`,
  '',
  `| 주제영역 | 목표 행 | ${bh}${D} 완료 행 | ${D} 완료율 | ${D} 크기(GB) |`,
  `|---|---:|${bs}---:|---:|---:|`,
]
const T = { t: 0, p: 0, o: 0, s: 0 }
for (const a of AREAS) {
  L.push(`| ${a} | ${f(tgt[a])} | ${bv(pNow[a], tgt[a])}${f(oNow[a])} | ${pct(oNow[a], tgt[a])} | ${gb(sz[a])} |`)
  T.t += tgt[a]
  T.p += pNow[a]
  T.o += oNow[a]
  T.s += sz[a]
}
L.push(`| 합계 | ${f(T.t)} | ${bv(T.p, T.t)}${f(T.o)} | ${pct(T.o, T.t)} | ${gb(T.s)} (+LOB ${gb(lob)}) |`, '')
L.push(`| 경과 | ${bh}${D} 완료 행 | ${D} 완료율 | ${D} 크기(GB) |`, `|---:|${bs}---:|---:|---:|`)
const hist = fs.readFileSync(SIZE_LOG, 'utf8').trim().split('\n').map(JSON.parse)
for (let m = STEP_MIN; m * 60 <= el + 1; m += STEP_MIN) {
  const p = total(sumBy(P.list, m * 60))
  const o = total(sumBy(O.list, m * 60))
  const h = hist.filter(x => Math.abs(x.sec - m * 60) <= 150).pop()
  L.push(`| ${m}분 | ${bv(p, T.t)}${f(o)} | ${pct(o, T.t)} | ${h ? gb(total(h.sz) + h.lob) : '기록 없음'} |`)
}
L.push(`| ${ended ? '끝' : '지금'} | ${bv(T.p, T.t)}${f(T.o)} | ${pct(T.o, T.t)} | ${gb(T.s + lob)} |`, '')

// 주제영역별 생성 시간 : 시작 = 영역 첫 작업 단위 시작, 끝 = 영역 마지막 작업 단위 완료(전부 끝났을 때만), 생성 시간 = 끝(진행 중이면 지금) − 시작
const hms = x => {
  const s = Math.round(x) // 먼저 초 단위로 반올림(59.6초가 '0:00:60' 으로 나오지 않게)
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const kst = s => new Date(O.first.getTime() + s * 1000 + 9 * 3600e3).toISOString().slice(11, 19)
L.push(`| 주제영역 | 작업 단위 완료/전체 | 시작(KST) | 끝(KST) | 생성 시간 | 작업 단위 소요 합 | ${D} 완료 행 | 행/초 |`, '|---|---:|---:|---:|---:|---:|---:|---:|')
const AT = { done: 0, busy: 0 }
for (const a of AREAS) {
  const inA = x => area.get(x.id.split(':')[0]) === a
  const ss = O.starts.filter(inA), dd = O.list.filter(inA)
  if (!ss.length) {
    L.push(`| ${a} | 0/${units[a]} | 시작 전 | - | - | - | 0 | - |`)
    continue
  }
  const s = Math.min(...ss.map(x => x.sec))
  const fin = dd.length === units[a]
  const e = fin ? Math.max(...dd.map(x => x.sec)) : el
  const busy = dd.reduce((t, x) => t + (x.sec - x.s), 0)
  AT.done += dd.length
  AT.busy += busy
  L.push(`| ${a} | ${dd.length}/${units[a]} | ${kst(s)} | ${fin ? kst(e) : '진행 중'} | ${hms(e - s)}${fin ? '' : ' (진행 중)'} | ${hms(busy)} | ${f(oNow[a])} | ${f(Math.round(oNow[a] / Math.max(e - s, 1)))} |`)
}
L.push(`| 전체 | ${AT.done}/${f(UNITS)} | ${kst(0)} | ${ended ? kst(el) : '진행 중'} | ${hms(el)} | ${hms(AT.busy)} | ${f(T.o)} | ${f(Math.round(T.o / Math.max(el, 1)))} |`)
console.log(L.join('\n'))
