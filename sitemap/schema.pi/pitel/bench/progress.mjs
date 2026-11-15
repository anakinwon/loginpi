// DBMS 별 초기 데이터 적재 진행 비교표 : 주제영역별(목표 행 · 완료 행 · 완료율 · 크기) + 시간대별(10분 누적) 두 표를 Markdown 으로 출력
// 기준선 = PostgreSQL 2026-11-14 배율 1 실측 로그(같은 경과 시점 비교), 대상 = datagen run 로그. 실행마다 크기 기록을 <로그>.size.jsonl 에 남김(보고서 시계열 근거)
// 실행 : node bench/progress.mjs --target oracle --log oracle/out/full_load.log   (PRD dbms.pi 11.7 보고 방식 정본)
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
const BASE = path.resolve(ROOT, arg('--base') || 'database/datagen_pitel-pg.log')
const STEP_MIN = 10
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const LABEL = { oracle: 'Oracle', mssql: 'MS-SQL', mysql: 'MySQL' }

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
  // shortcut: MySQL 크기 조회는 해당 실증 착수 때 추가(information_schema.TABLES)
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
// 로그 → 첫 시작 시각 · 완료 작업 단위(경과초) · 실패 수
function scan(file) {
  let first
  let fail = 0
  const out = []
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.startsWith('실패 ')) fail++
    const m = l.match(/^(시작|완료) (\S+:\S+) (\S+)$/)
    if (!m) continue
    const t = new Date(m[3])
    if (m[1] === '시작' && (!first || t < first)) first = t
    if (m[1] === '완료') out.push({ id: m[2], at: t })
  }
  return { first, fail, list: out.map(x => ({ id: x.id, sec: (x.at - first) / 1000 })) }
}
const sumBy = (lst, until) => {
  const s = Object.fromEntries(AREAS.map(a => [a, 0]))
  for (const x of lst) if (x.sec <= until) s[area.get(x.id.split(':')[0])] += rowsOf(x.id)
  return s
}
const total = o => Object.values(o).reduce((s, x) => s + x, 0)

const O = scan(LOG)
const P = scan(BASE)
const ended = fs.readFileSync(LOG, 'utf8').match(/^exit \d+ (\S+)$/m)
const el = ((ended ? new Date(ended[1]) : Date.now()) - O.first) / 1000
const tgt = Object.fromEntries(AREAS.map(a => [a, 0]))
for (const p of plan) tgt[p.area] += p.n
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
const L = [
  `경과 ${Math.floor(el / 60)}분 ${Math.round(el % 60)}초 · 작업 단위 ${O.list.length}/2,086 · 실패 ${O.fail} (PostgreSQL = 2026-11-14 배율 1 실측의 같은 경과 시점)`,
  '',
  `| 주제영역 | 목표 행 | PostgreSQL 완료 행 | PG 완료율 | ${D} 완료 행 | ${D} 완료율 | ${D} 크기(GB) |`,
  '|---|---:|---:|---:|---:|---:|---:|',
]
const T = { t: 0, p: 0, o: 0, s: 0 }
for (const a of AREAS) {
  L.push(`| ${a} | ${f(tgt[a])} | ${f(pNow[a])} | ${pct(pNow[a], tgt[a])} | ${f(oNow[a])} | ${pct(oNow[a], tgt[a])} | ${gb(sz[a])} |`)
  T.t += tgt[a]
  T.p += pNow[a]
  T.o += oNow[a]
  T.s += sz[a]
}
L.push(`| 합계 | ${f(T.t)} | ${f(T.p)} | ${pct(T.p, T.t)} | ${f(T.o)} | ${pct(T.o, T.t)} | ${gb(T.s)} (+LOB ${gb(lob)}) |`, '')
L.push(`| 경과 | PostgreSQL 완료 행 | PG 완료율 | ${D} 완료 행 | ${D} 완료율 | ${D} 크기(GB) |`, '|---:|---:|---:|---:|---:|---:|')
const hist = fs.readFileSync(SIZE_LOG, 'utf8').trim().split('\n').map(JSON.parse)
for (let m = STEP_MIN; m * 60 <= el + 1; m += STEP_MIN) {
  const p = total(sumBy(P.list, m * 60))
  const o = total(sumBy(O.list, m * 60))
  const h = hist.filter(x => Math.abs(x.sec - m * 60) <= 150).pop()
  L.push(`| ${m}분 | ${f(p)} | ${pct(p, T.t)} | ${f(o)} | ${pct(o, T.t)} | ${h ? gb(total(h.sz) + h.lob) : '기록 없음'} |`)
}
L.push(`| ${ended ? '끝' : '지금'} | ${f(T.p)} | ${pct(T.p, T.t)} | ${f(T.o)} | ${pct(T.o, T.t)} | ${gb(T.s + lob)} |`)
console.log(L.join('\n'))
