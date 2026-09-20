#!/usr/bin/env node
/**
 * work-history-stats v2 — work-history/**\/*.jsonl 집계 모듈 + CLI
 * (10인 평가 반영: id 기준 중복 제거·fix 레코드 병합 / 비율 지표 모집단 통일 / 비용 / 파일명 날짜 프리필터 / --help·exit code)
 *
 * 통계 유형
 *   summary      턴·소요·도구·비용·카테고리·시간대 (축: category/day/week/month/year/hour/weekday/session/model/project/skill/mcp/agent)
 *   tokens       ① 토큰·비용 — API 호출, 입력/캐시 읽기/캐시 생성/출력/thinking, 캐시 적중률, gen tok/s, USD
 *   usage        ② agent/mcp/skill/plugin/hook 사용 — 리소스별 종류(s/p/m/agent/hook)·사용 턴·호출·오류·평균 소요
 *   performance  ③ 성능 비교 — 축별 평균·중앙·p90·최대 소요, 오류율, gen tok/s, 도구 시간 비중(모두 timed 모집단), 도구별 지연, 이전 기간 대비
 *
 * 모집단 규칙: 비율·평균 지표는 `timed`(elapsed_ms 가 있고 absorbed/superseded/incomplete 가 아닌 레코드)만으로 계산한다.
 *   합계(토큰·도구·비용)는 모든 레코드. part>1 레코드는 구간 델타이므로 그대로 합산한다.
 *
 * CLI
 *   pnpm work:stats [--date D | --month M | --from A --to B] [--type summary|tokens|usage|performance|all] [--by <축>] [--csv] [--json] [--list] [--help]
 *   exit 0 정상 · 2 레코드 없음 · 1 인자 오류
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { kfmt, ms2, pct, usd, csvSafe, CATEGORY_KEYS } from './work-history-core.mjs'
export { kfmt, ms2, pct, usd }

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LOG_ROOT = process.env.WORK_HISTORY_DIR || path.join(PROJECT, 'work-history')
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── 로드 ─────────────────────────────────────────────────────────────────────
function* walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) yield* walk(p); else if (e.name.endsWith('.jsonl')) yield p } }
/** 범위 안의 레코드. 파일명(YYYY-MM-DD.jsonl)으로 프리필터 → id 기준 last-write-wins → fix 레코드를 perf 에 병합 → ts_req 정렬 */
export function loadRows({ from = '0000-00-00', to = '9999-99-99', root = LOG_ROOT } = {}) {
  const byId = new Map(), fixes = [], anon = []
  for (const f of walk(root)) {
    const day = path.basename(f, '.jsonl'); if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (day < from || day > to)) continue
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!l.trim()) continue
      let r; try { r = JSON.parse(l) } catch { continue }
      if (r.fix) { fixes.push(r); continue }
      if (r.date < from || r.date > to) continue
      if (r.id) byId.set(r.id, r); else anon.push(r)                        // v1 레코드(id 없음)는 그대로
    }
  }
  for (const fx of fixes) { const r = byId.get(fx.id); if (r) r.perf = { ...(r.perf || {}), ...fx.perf } }
  return [...byId.values(), ...anon].sort((a, b) => (a.ts_req || '').localeCompare(b.ts_req || '') || (a.part || 0) - (b.part || 0))
}

// ── 공통 ─────────────────────────────────────────────────────────────────────
const tok = r => r.tokens || { api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0, context: 0 }
const sum = (arr, f) => arr.reduce((a, r) => a + (f(r) || 0), 0)
const avg = (arr, f) => { const v = arr.map(f).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const quantile = (v, q) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)) }
export const isTimed = r => r.elapsed_ms != null && !r.absorbed && !r.superseded && !r.incomplete
const groupBy = (rows, keyFn) => { const g = new Map(); for (const r of rows) for (const k of [].concat(keyFn(r))) { if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r) } return g }
export function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z'); const day = (d.getUTCDay() + 6) % 7
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - day + 3)
  const y = thu.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((thu - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - day); const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  return { key: `${y}-W${String(w).padStart(2, '0')}`, from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
}
export const AXES = { category: r => r.category, tag: r => r.tags, day: r => r.date, week: r => isoWeek(r.date).key, month: r => r.date.slice(0, 7), year: r => r.date.slice(0, 4), hour: r => r.hour, weekday: r => r.weekday, session: r => r.session, model: r => r.model, project: r => r.project, skill: r => r.skills, mcp: r => r.mcp, agent: r => r.agents }
export const AXIS_KEYS = Object.keys(AXES)
const sortAxis = (key, arr) => ['day', 'week', 'month', 'year', 'session'].includes(key) ? arr.sort((x, y) => String(x.key).localeCompare(String(y.key))) : key === 'hour' ? arr.sort((x, y) => x.key - y.key) : key === 'weekday' ? arr.sort((x, y) => WEEK.indexOf(x.key) - WEEK.indexOf(y.key)) : key === 'category' ? arr.sort((x, y) => y.turns - x.turns || CATEGORY_KEYS.indexOf(x.key) - CATEGORY_KEYS.indexOf(y.key)) : arr.sort((x, y) => y.turns - x.turns)
const tokenSum = rs => { const t = { api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0 }; for (const r of rs) { const u = tok(r); for (const k of Object.keys(t)) t[k] += u[k] || 0 } t.context = t.input + t.cache_read + t.cache_create; t.cache_hit = t.context ? +(t.cache_read / t.context).toFixed(4) : null; t.cost_usd = rs.some(r => r.cost_usd != null) ? +sum(rs, r => r.cost_usd).toFixed(4) : null; return t }

// ── summary ──────────────────────────────────────────────────────────────────
function groupTurns(rows, keyFn) {
  return [...groupBy(rows, keyFn)].map(([k, rs]) => { const timed = rs.filter(isTimed); const t = tokenSum(rs); return { key: k, turns: rs.length, n_timed: timed.length, elapsed_ms: sum(timed, r => r.elapsed_ms), avg_elapsed: avg(timed, r => r.elapsed_ms), p50_elapsed: quantile(timed.map(r => r.elapsed_ms), 0.5), tools: sum(rs, r => r.tools_total), avg_tools: +(sum(rs, r => r.tools_total) / rs.length).toFixed(1), errors: sum(rs, r => r.tool_errors), output: t.output, cost_usd: t.cost_usd, req_chars: sum(rs, r => r.req_chars), res_chars: sum(rs, r => r.res_chars), mid_turn: rs.filter(r => r.mid_turn).length } })
}
function groupSteps(rows) {
  const g = new Map()
  for (const r of rows) for (const s of r.steps || []) { const a = g.get(s.t) || { key: s.t, calls: 0, errors: 0, ms: 0, timed: 0 }; a.calls++; if (s.ok === false) a.errors++; if (s.ms != null) { a.ms += s.ms; a.timed++ } g.set(s.t, a) }
  return [...g.values()].map(a => ({ ...a, avg_ms: a.timed ? Math.round(a.ms / a.timed) : null })).sort((x, y) => y.calls - x.calls)
}
export function aggregate(rows) {
  const timed = rows.filter(isTimed); const t = tokenSum(rows)
  const total = { turns: rows.length, n_timed: timed.length, elapsed_ms: sum(timed, r => r.elapsed_ms), avg_elapsed_ms: avg(timed, r => r.elapsed_ms), p50_elapsed_ms: quantile(timed.map(r => r.elapsed_ms), 0.5), tools: sum(rows, r => r.tools_total), errors: sum(rows, r => r.tool_errors), days: new Set(rows.map(r => r.date)).size, sessions: new Set(rows.map(r => r.session)).size, projects: new Set(rows.map(r => r.project).filter(Boolean)).size, superseded: rows.filter(r => r.superseded).length, incomplete: rows.filter(r => r.incomplete).length, absorbed: rows.filter(r => r.absorbed).length, res_chars: sum(rows, r => r.res_chars), req_chars: sum(rows, r => r.req_chars), output: t.output, cost_usd: t.cost_usd }
  const axes = {}; for (const k of AXIS_KEYS) axes[k] = sortAxis(k, groupTurns(rows, AXES[k]))
  axes.tool = groupSteps(rows)
  return { total, axes }
}

// ── ① tokens ─────────────────────────────────────────────────────────────────
const tokenRow = (key, rs) => { const t = tokenSum(rs); const timed = rs.filter(isTimed); const el = sum(timed, r => r.elapsed_ms); const gen = sum(timed, r => Math.max(1, (r.elapsed_ms || 0) - (r.perf?.tool_ms || 0) - (r.perf?.hook_ms || 0))); const tt = tokenSum(timed); return { key, turns: rs.length, n_timed: timed.length, ...t, out_per_turn: Math.round(t.output / rs.length), ctx_per_call: t.api_calls ? Math.round(t.context / t.api_calls) : 0, out_tps: el > 0 ? +(tt.output / (el / 1000)).toFixed(2) : null, gen_tps: gen > 0 && timed.length ? +(tt.output / (gen / 1000)).toFixed(2) : null, cost_per_turn: t.cost_usd != null ? +(t.cost_usd / rs.length).toFixed(4) : null } }
export function tokensStats(rows) {
  const total = tokenRow('total', rows)
  const by = {}; for (const k of ['category', 'hour', 'day', 'week', 'month', 'year', 'session', 'model', 'project']) by[k] = sortAxis(k, [...groupBy(rows, AXES[k])].map(([key, rs]) => tokenRow(key, rs)))
  const turns = rows.map(r => ({ id: r.id, turn: `${r.session}#${r.turn}${r.part > 1 ? '.' + r.part : ''}`, ts_req: r.ts_req, category: r.category, model: r.model, ...tok(r), cost_usd: r.cost_usd ?? null, out_tps: r.perf?.out_tps ?? null, gen_tps: r.perf?.gen_tps ?? null, cache_hit: tok(r).cache_hit ?? null }))
  const outs = rows.filter(isTimed).map(r => tok(r).output)
  return { total, by, turns, distribution: { out_p50: quantile(outs, 0.5), out_p90: quantile(outs, 0.9), out_max: outs.length ? Math.max(...outs) : null, ctx_first: rows.length ? tok(rows[0]).context : null, ctx_last: rows.length ? tok(rows[rows.length - 1]).context : null } }
}

// ── ② usage ──────────────────────────────────────────────────────────────────
export function usageStats(rows) {
  const acc = new Map()
  const add = (type, name, kind, r, n = 1, extra = {}) => { const k = `${type}:${name}`; const a = acc.get(k) || { type, name, kind, turns: new Set(), calls: 0, errors: 0, ms: 0, timed: 0, plugin: extra.plugin || null }; a.turns.add(`${r.session}#${r.turn}`); a.calls += n; acc.set(k, a); return a }
  for (const r of rows) {
    const res = r.resources || {}
    for (const s of res.skills || []) add('skill', s.name, s.kind, r, s.n || 1, s)
    for (const m of res.mcp || []) add('mcp', m.name, m.kind, r, m.n || 1, m)
    for (const a of res.agents || []) add('agent', a.name, 'agent', r, a.n || 1)
    for (const h of res.hooks || []) add('hook', `${h.event}:${h.name}`, 'hook', r, h.n || 1)
    for (const p of res.plugins || []) add('plugin', p, 'p', r, 1)
    for (const s of r.steps || []) { if (!/^mcp__/.test(s.t)) continue; const m = s.t.match(/^mcp__(.+?)__/); const pm = m && m[1].match(/^plugin_(.+)_[^_]+$/); const a = acc.get(`mcp:${pm ? pm[1] : m[1]}`); if (a) { if (s.ok === false) a.errors++; if (s.ms != null) { a.ms += s.ms; a.timed++ } } }
  }
  const items = [...acc.values()].map(a => ({ type: a.type, name: a.name, kind: a.kind, plugin: a.plugin, turns: a.turns.size, calls: a.calls, errors: a.errors, avg_ms: a.timed ? Math.round(a.ms / a.timed) : null, total_ms: a.ms })).sort((x, y) => x.type.localeCompare(y.type) || y.calls - x.calls)
  const byType = {}; for (const it of items) { const t = byType[it.type] || (byType[it.type] = { type: it.type, distinct: 0, calls: 0 }); t.distinct++; t.calls += it.calls }
  const typeRows = Object.values(byType).map(t => ({ ...t, turns_using: rows.filter(r => { const res = r.resources || {}; return { skill: res.skills, mcp: res.mcp, agent: res.agents, hook: res.hooks, plugin: res.plugins }[t.type]?.length }).length }))
  const byKind = {}; for (const it of items.filter(i => i.type !== 'hook' && i.type !== 'plugin')) { const k = byKind[it.kind] || (byKind[it.kind] = { kind: it.kind, label: { s: 'skill', p: 'plugin', m: 'mcp', agent: 'agent' }[it.kind] || it.kind, distinct: 0, calls: 0 }); k.distinct++; k.calls += it.calls }
  const hooksByEvent = {}; for (const it of items.filter(i => i.type === 'hook')) { const ev = it.name.split(':')[0]; const h = hooksByEvent[ev] || (hooksByEvent[ev] = { event: ev, distinct: 0, runs: 0 }); h.distinct++; h.runs += it.calls }
  return { items, byType: typeRows, byKind: Object.values(byKind), hooksByEvent: Object.values(hooksByEvent).sort((a, b) => b.runs - a.runs), hook_ms_total: sum(rows, r => r.perf?.hook_ms), hook_runs_total: sum(rows, r => r.perf?.hook_runs) }
}

// ── ③ performance ────────────────────────────────────────────────────────────
const perfRow = (key, rs) => {
  const timed = rs.filter(isTimed); const t = tokenSum(rs); const tt = tokenSum(timed)
  const el = sum(timed, r => r.elapsed_ms), toolMs = sum(timed, r => r.perf?.tool_ms), hookMs = sum(timed, r => r.perf?.hook_ms)
  const gen = Math.max(0, el - toolMs - hookMs)
  return { key, turns: rs.length, n_timed: timed.length, avg_elapsed_ms: avg(timed, r => r.elapsed_ms), p50_elapsed_ms: quantile(timed.map(r => r.elapsed_ms), 0.5), p90_elapsed_ms: quantile(timed.map(r => r.elapsed_ms), 0.9), max_elapsed_ms: timed.length ? Math.max(...timed.map(r => r.elapsed_ms)) : null, avg_tools: +(sum(rs, r => r.tools_total) / Math.max(1, rs.length)).toFixed(1), error_rate: sum(rs, r => r.tools_total) ? +(sum(rs, r => r.tool_errors) / sum(rs, r => r.tools_total)).toFixed(4) : 0, avg_out_tokens: Math.round(t.output / Math.max(1, rs.length)), out_tps: el > 0 ? +(tt.output / (el / 1000)).toFixed(2) : null, gen_tps: gen > 0 ? +(tt.output / (gen / 1000)).toFixed(2) : null, avg_api_calls: +(t.api_calls / Math.max(1, rs.length)).toFixed(1), cache_hit: t.cache_hit, tool_share: el > 0 ? +(toolMs / el).toFixed(3) : null, avg_hook_ms: avg(timed, r => r.perf?.hook_ms), cost_usd: t.cost_usd, cost_per_turn: t.cost_usd != null ? +(t.cost_usd / Math.max(1, rs.length)).toFixed(4) : null }
}
export function perfStats(rows) {
  const total = perfRow('total', rows)
  const by = {}; for (const k of ['category', 'hour', 'day', 'week', 'month', 'year', 'model', 'session', 'project']) by[k] = sortAxis(k, [...groupBy(rows, AXES[k])].map(([key, rs]) => perfRow(key, rs)))
  const tools = groupSteps(rows).map(a => ({ tool: a.key, calls: a.calls, errors: a.errors, error_rate: a.calls ? +(a.errors / a.calls).toFixed(4) : 0, avg_ms: a.avg_ms, total_ms: a.ms, share_of_tool_time: null }))
  const toolMsTotal = sum(tools, t => t.total_ms); for (const t of tools) t.share_of_tool_time = toolMsTotal ? +(t.total_ms / toolMsTotal).toFixed(3) : null
  const turns = rows.map(r => ({ id: r.id, turn: `${r.session}#${r.turn}${r.part > 1 ? '.' + r.part : ''}`, ts_req: r.ts_req, category: r.category, timed: isTimed(r), elapsed_ms: r.elapsed_ms, turn_duration_ms: r.perf?.turn_duration_ms ?? null, tool_ms: r.perf?.tool_ms ?? null, tool_share: r.perf?.tool_share ?? null, hook_ms: r.perf?.hook_ms ?? null, tools: r.tools_total, errors: r.tool_errors, api_calls: tok(r).api_calls, output_tokens: tok(r).output, out_tps: r.perf?.out_tps ?? null, gen_tps: r.perf?.gen_tps ?? null, cache_hit: tok(r).cache_hit ?? null, cost_usd: r.cost_usd ?? null }))
  return { total, by, tools, turns }
}
export function compare(cur, prev) {
  if (!cur || !prev) return null
  return ['turns', 'n_timed', 'avg_elapsed_ms', 'p50_elapsed_ms', 'avg_tools', 'error_rate', 'avg_out_tokens', 'gen_tps', 'avg_api_calls', 'cache_hit', 'tool_share', 'cost_usd', 'cost_per_turn'].map(k => ({ metric: k, current: cur[k], previous: prev[k], delta: cur[k] != null && prev[k] ? +(((cur[k] - prev[k]) / prev[k])).toFixed(4) : null }))
}

// ── 표·CSV ────────────────────────────────────────────────────────────────────
export const toCsv = arr => { if (!arr.length) return ''; const cols = Object.keys(arr[0]); return [cols.join(','), ...arr.map(o => cols.map(c => { const v = o[c]; const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(csvSafe(v))); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(','))].join('\n') }
export function tables(agg, key) {
  const { total } = agg; const arr = agg.axes[key] || []
  if (key === 'tool') return arr.map(a => ({ tool: a.key, calls: a.calls, share: pct(a.calls, total.tools), errors: a.errors, err_rate: pct(a.errors, a.calls), avg: ms2(a.avg_ms), total: ms2(a.ms), avg_ms: a.avg_ms, total_ms: a.ms }))
  return arr.map(a => ({ [key]: a.key, turns: a.turns, n_timed: a.n_timed, share: pct(a.turns, total.turns), elapsed: ms2(a.elapsed_ms), avg_elapsed: ms2(a.avg_elapsed), p50: ms2(a.p50_elapsed), tools: a.tools, avg_tools: a.avg_tools, errors: a.errors, output: kfmt(a.output), cost: usd(a.cost_usd), res_chars: a.res_chars, elapsed_ms: a.elapsed_ms, avg_elapsed_ms: a.avg_elapsed, cost_usd: a.cost_usd }))
}
export const fmtTok = arr => arr.map(o => ({ key: o.key, turns: o.turns, api_calls: o.api_calls, input: kfmt(o.input), cache_read: kfmt(o.cache_read), cache_new: kfmt(o.cache_create), output: kfmt(o.output), thinking: kfmt(o.thinking), cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), out_per_turn: kfmt(o.out_per_turn), gen_tps: o.gen_tps ?? '-', cost: usd(o.cost_usd), cost_per_turn: usd(o.cost_per_turn) }))
export const fmtPerf = arr => arr.map(o => ({ key: o.key, turns: o.turns, n_timed: o.n_timed, avg_elapsed: ms2(o.avg_elapsed_ms), p50: ms2(o.p50_elapsed_ms), p90: ms2(o.p90_elapsed_ms), max: ms2(o.max_elapsed_ms), avg_tools: o.avg_tools, error_rate: pct(o.error_rate, 1), avg_out: kfmt(o.avg_out_tokens), gen_tps: o.gen_tps ?? '-', api_per_turn: o.avg_api_calls, cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), tool_share: o.tool_share == null ? '-' : pct(o.tool_share, 1), avg_hook: ms2(o.avg_hook_ms), cost: usd(o.cost_usd), cost_per_turn: usd(o.cost_per_turn) }))
export const fmtCmp = arr => arr.map(c => ({ metric: c.metric, current: c.current, previous: c.previous, delta: c.delta == null ? '-' : `${c.delta > 0 ? '+' : ''}${(100 * c.delta).toFixed(1)}%` }))
export const listRows = rows => rows.map(r => ({ ts_req: r.ts_req?.slice(0, 19).replace('T', ' '), turn: `${r.session}#${r.turn}${r.part > 1 ? '.' + r.part : ''}`, category: r.category, elapsed: ms2(r.elapsed_ms), elapsed_ms: r.elapsed_ms, tools: r.tools_total, errors: r.tool_errors, api_calls: tok(r).api_calls, output_tokens: tok(r).output, cache_hit: tok(r).cache_hit, cost_usd: r.cost_usd ?? null, flag: r.absorbed ? 'absorbed' : r.superseded ? 'superseded' : r.incomplete ? 'incomplete' : '', req: r.req_head }))

// ── 인자 ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv, spec) {
  const out = {}; const errs = []
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (!a.startsWith('--')) { errs.push(`알 수 없는 인자: ${a}`); continue } const k = a.slice(2); if (!(k in spec)) { errs.push(`알 수 없는 옵션: --${k}`); continue } if (spec[k] === 'flag') out[k] = true; else { const v = argv[i + 1]; if (v == null || v.startsWith('--')) { errs.push(`--${k} 값이 필요합니다`); continue } out[k] = v; i++ } }
  return { opt: out, errs }
}
export const HELP_STATS = `work-history-stats — 작업 이력 통계
  --date YYYY-MM-DD | --month YYYY-MM | --from A --to B   기간 (기본 전체)
  --type summary|tokens|usage|performance|all             통계 유형 (기본 summary)
  --by ${AXIS_KEYS.join('|')}|tool   축 (기본 category)
  --csv | --json | --list | --help
exit: 0 정상, 1 인자 오류, 2 레코드 없음`

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { opt, errs } = parseArgs(process.argv.slice(2), { date: 'value', month: 'value', from: 'value', to: 'value', type: 'value', by: 'value', csv: 'flag', json: 'flag', list: 'flag', help: 'flag' })
  if (opt.help) { console.log(HELP_STATS); process.exit(0) }
  const type = opt.type || 'summary'
  if (!['summary', 'tokens', 'usage', 'performance', 'all'].includes(type)) errs.push(`--type 값 오류: ${type}`)
  if (opt.by && !AXIS_KEYS.includes(opt.by) && opt.by !== 'tool') errs.push(`--by 값 오류: ${opt.by}`)
  if (errs.length) { console.error(errs.join('\n') + '\n\n' + HELP_STATS); process.exit(1) }
  const from = opt.from || opt.date || (opt.month ? `${opt.month}-01` : '0000-00-00'), to = opt.to || opt.date || (opt.month ? `${opt.month}-31` : '9999-99-99')
  const by = opt.by || 'category'
  const rows = loadRows({ from, to })
  if (!rows.length) { console.error(`레코드 없음: ${LOG_ROOT} (${from} ~ ${to})`); process.exit(2) }
  const agg = aggregate(rows); const { total } = agg
  const omit = (o, re) => Object.fromEntries(Object.entries(o).filter(([k]) => !re.test(k)))
  const head = `${from === '0000-00-00' ? '전체' : from} ~ ${to === '9999-99-99' ? '' : to}`
  const show = (title, arr) => { if (!arr.length) return; console.log(`\n▶ ${title}`); console.table(arr) }
  if (opt.json) { const out = { range: { from, to }, summary: agg, tokens: tokensStats(rows), usage: usageStats(rows), performance: perfStats(rows) }; console.log(JSON.stringify(type === 'all' || type === 'summary' ? out : { range: out.range, [type]: out[type] }, null, 2)); process.exit(0) }
  if (opt.list) { console.table(listRows(rows).map(o => ({ ...omit(o, /_ms$|cost_usd/), cost: usd(o.cost_usd), cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), req: o.req?.slice(0, 40) }))); process.exit(0) }
  if (opt.csv) { const t = type === 'tokens' ? fmtTok(tokensStats(rows).by[by] || []) : type === 'usage' ? usageStats(rows).items : type === 'performance' ? (by === 'tool' ? perfStats(rows).tools : fmtPerf(perfStats(rows).by[by] || [])) : tables(agg, by); console.log(toCsv(t)); process.exit(0) }
  if (type === 'tokens' || type === 'all') { const ts = tokensStats(rows); console.log(`\n■ ① 토큰·비용  ${head}`); console.log(`  API 호출 ${ts.total.api_calls} · 입력 ${kfmt(ts.total.input)} · 캐시 읽기 ${kfmt(ts.total.cache_read)} · 캐시 생성 ${kfmt(ts.total.cache_create)} · 출력 ${kfmt(ts.total.output)} (thinking ${kfmt(ts.total.thinking)}) · 캐시 적중 ${pct(ts.total.cache_hit, 1)} · gen ${ts.total.gen_tps ?? '-'} tok/s · 비용 ${usd(ts.total.cost_usd)} (턴당 ${usd(ts.total.cost_per_turn)}) · 출력 p50/p90 ${kfmt(ts.distribution.out_p50)}/${kfmt(ts.distribution.out_p90)}`); show(`by ${by}`, fmtTok(ts.by[by] || ts.by.category)) }
  if (type === 'usage' || type === 'all') { const us = usageStats(rows); console.log(`\n■ ② agent/mcp/skill/plugin/hook 사용  ${head}`); show('유형별', us.byType); show('종류별 (s=스킬 p=플러그인 m=독립 MCP)', us.byKind); show('리소스별', us.items.filter(i => i.type !== 'hook').map(i => ({ ...omit(i, /_ms$/), avg: ms2(i.avg_ms) }))); show('훅 이벤트별', us.hooksByEvent) }
  if (type === 'performance' || type === 'all') { const ps = perfStats(rows); console.log(`\n■ ③ 성능 비교  ${head}  (비율·평균은 timed 레코드 기준)`); show(`by ${by}`, fmtPerf([ps.total, ...(ps.by[by] || ps.by.category)])); show('도구별 지연', ps.tools.map(t => ({ tool: t.tool, calls: t.calls, errors: t.errors, error_rate: pct(t.error_rate, 1), avg: ms2(t.avg_ms), total: ms2(t.total_ms), share: pct(t.share_of_tool_time, 1) }))) }
  if (type === 'summary' || type === 'all') {
    console.log(`\n■ 요약  ${head}   (${LOG_ROOT})`)
    console.log(`  턴 ${total.turns} (timed ${total.n_timed}) · 일수 ${total.days} · 세션 ${total.sessions} · 총 소요 ${ms2(total.elapsed_ms)} · 평균 ${ms2(total.avg_elapsed_ms)} · 중앙 ${ms2(total.p50_elapsed_ms)} · 도구 ${total.tools} (오류 ${total.errors}) · 출력 ${kfmt(total.output)} · 비용 ${usd(total.cost_usd)} · 재전송 ${total.superseded} · 흡수 ${total.absorbed} · 미완료 ${total.incomplete}`)
    const strip = arr => arr.map(o => omit(o, /_ms$|cost_usd/))
    if (opt.by) show(`by ${by}`, strip(tables(agg, by)))
    else { show('카테고리별', strip(tables(agg, 'category'))); show('도구별 (호출 단위)', strip(tables(agg, 'tool'))); show('시간대별', strip(tables(agg, 'hour'))) }
  }
}
