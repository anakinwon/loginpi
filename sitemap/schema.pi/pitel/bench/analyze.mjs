// 두 적재 로그 비교 분석 → JSON : 10분 누적(행·완료율), 주제영역별(행·작업 단위·끝난 시각·작업 단위 소요 합·행/초), 테이블별 소요 비교 상·하위
// 실행 : node bench/analyze.mjs --log oracle/out/full_load.log [--base database/datagen_pitel-pg.log] > out.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'datagen/out/plan.json')))
const n = new Map(plan.map(p => [p.tbl, p.n])), area = new Map(plan.map(p => [p.tbl, p.area]))
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const t0 = Date.UTC(2010, 0, 1), t1 = Date.UTC(2026, 9, 31, 23, 59, 59)
const kk = (y, N) => Math.max(0, Math.min(N, Math.floor(N * Math.pow((Date.UTC(y, 0, 1) - t0) / (t1 - t0), 1 / 0.22))))
const rowsOf = id => { const [t, y] = id.split(':'), N = n.get(t); if (y === 'all') return N; const yy = +y; return Math.max(0, (yy === 2026 ? N : kk(yy + 1, N)) - (yy === 2010 ? 1 : kk(yy, N) + 1) + 1) }
function load(file) {
  const st = new Map(), U = []
  let first
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = l.match(/^(시작|완료) (\S+:\S+) (\S+)$/)
    if (!m) continue
    const t = new Date(m[3]).getTime()
    if (m[1] === '시작') { st.set(m[2], t); if (!first || t < first) first = t } else U.push({ id: m[2], s: st.get(m[2]), e: t })
  }
  const total = Math.max(...U.map(u => u.e)) - first
  return { first, total: total / 1000, U: U.map(u => ({ id: u.id, tbl: u.id.split(':')[0], area: area.get(u.id.split(':')[0]), rows: rowsOf(u.id), s: (u.s - first) / 1000, e: (u.e - first) / 1000 })) }
}
const D = { pg: load(path.resolve(ROOT, arg('--base', 'database/datagen_pitel-pg.log'))), tg: load(path.resolve(ROOT, arg('--log', 'oracle/out/full_load.log'))) }
const target = plan.reduce((s, p) => s + p.n, 0)
const maxMin = Math.ceil(Math.max(D.pg.total, D.tg.total) / 600) * 10
const series = []
for (let m = 10; m <= maxMin; m += 10) {
  const r = k => D[k].U.filter(u => u.e <= m * 60).reduce((s, u) => s + u.rows, 0)
  const c = k => D[k].U.filter(u => u.e <= m * 60).length
  series.push({ min: m, pg: r('pg'), tg: r('tg'), pgUnits: c('pg'), tgUnits: c('tg') })
}
const areas = AREAS.map(a => {
  const f = k => { const u = D[k].U.filter(x => x.area === a); const busy = u.reduce((s, x) => s + (x.e - x.s), 0); return { units: u.length, rows: u.reduce((s, x) => s + x.rows, 0), start: Math.min(...u.map(x => x.s)), end: Math.max(...u.map(x => x.e)), busy, rps: u.reduce((s, x) => s + x.rows, 0) / busy } }
  return { area: a, target: plan.filter(p => p.area === a).reduce((s, p) => s + p.n, 0), pg: f('pg'), tg: f('tg') }
})
const tbl = new Map()
for (const k of ['pg', 'tg']) for (const u of D[k].U) { const o = tbl.get(u.tbl) || { tbl: u.tbl, area: u.area, rows: n.get(u.tbl), pg: 0, tg: 0 }; o[k] += u.e - u.s; tbl.set(u.tbl, o) }
const T = [...tbl.values()].filter(t => t.pg > 30 && t.tg > 30).map(t => ({ ...t, ratio: t.tg / t.pg }))
T.sort((a, b) => a.ratio - b.ratio)
const busy = k => D[k].U.reduce((s, u) => s + (u.e - u.s), 0)
console.log(JSON.stringify({ target, pg: { total: D.pg.total, busy: busy('pg'), units: D.pg.U.length }, tg: { total: D.tg.total, busy: busy('tg'), units: D.tg.U.length }, series, areas, fastest: T.slice(0, 8), slowest: T.slice(-8).reverse(), bigTables: [...tbl.values()].sort((a, b) => b.rows - a.rows).slice(0, 10) }, null, 1))
