#!/usr/bin/env node
/**
 * work-history-stats — work-history/**\/*.jsonl(턴당 1 레코드) 집계 모듈 + CLI (2026-09-20 마스터 지시: 통계 유형 3종)
 *
 * 통계 유형
 *   summary      턴·소요·도구·카테고리·시간대 (기존 축)
 *   tokens       ① 토큰 사용 — API 호출, 입력/캐시 읽기/캐시 생성/출력/thinking, 캐시 적중률, 출력 tok/s (턴·카테고리·시간대·일자별)
 *   usage        ② agent/mcp/skill/plugin/hook 사용 — 리소스별 종류(s/p/m/agent/hook)·사용 턴 수·호출 수·오류·평균 소요
 *   performance  ③ 성능 비교 — 카테고리/시간대/일자/모델/세션별 평균 소요·도구·출력 토큰·tok/s·오류율·도구 시간 비중, 도구별 지연, 이전 기간 대비 증감
 *
 * CLI
 *   pnpm work:stats [--date D | --month M | --from A --to B] [--type summary|tokens|usage|performance|all] [--by <축>] [--csv] [--json] [--list]
 *
 * 모듈 (scripts/work-history-report.mjs 가 사용)
 *   import { loadRows, aggregate, tokensStats, usageStats, perfStats, compare, tables, toCsv, ms2 } from './work-history-stats.mjs'
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LOG_ROOT = process.env.WORK_HISTORY_DIR || path.join(PROJECT, 'work-history')
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── 로드 ─────────────────────────────────────────────────────────────────────
function* walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) yield* walk(p); else if (e.name.endsWith('.jsonl')) yield p } }
export function loadRows({ from = '0000-00-00', to = '9999-99-99', root = LOG_ROOT } = {}) {
  const rows = []
  for (const f of walk(root)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); if (r.date >= from && r.date <= to) rows.push(r) } catch {} }
  return rows.sort((a, b) => (a.ts_req || '').localeCompare(b.ts_req || ''))
}

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────
export const ms2 = ms => { if (ms == null) return '-'; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m` }
export const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '-'
export const kfmt = n => { n = Number(n) || 0; return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n) }
const tok = r => r.tokens || { api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0, context: 0 }
const sum = (arr, f) => arr.reduce((a, r) => a + (f(r) || 0), 0)
const avg = (arr, f) => { const v = arr.map(f).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const groupBy = (rows, keyFn) => { const g = new Map(); for (const r of rows) for (const k of [].concat(keyFn(r))) { if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r) } return g }
const sortAxis = (key, arr) => ['day', 'week', 'month', 'year', 'session'].includes(key) ? arr.sort((x, y) => String(x.key).localeCompare(String(y.key))) : key === 'hour' ? arr.sort((x, y) => x.key - y.key) : key === 'weekday' ? arr.sort((x, y) => WEEK.indexOf(x.key) - WEEK.indexOf(y.key)) : arr.sort((x, y) => y.turns - x.turns)
// ISO 주(월~일): 'YYYY-Www'. 주별·월별·년도별 축과 기간 계산에 공용
export function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z'); const day = (d.getUTCDay() + 6) % 7           // 월=0 … 일=6
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - day + 3)
  const y = thu.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((thu - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - day); const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  return { key: `${y}-W${String(w).padStart(2, '0')}`, from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
}
export const AXES = { category: r => r.category, day: r => r.date, week: r => isoWeek(r.date).key, month: r => r.date.slice(0, 7), year: r => r.date.slice(0, 4), hour: r => r.hour, weekday: r => r.weekday, session: r => r.session, model: r => r.model, skill: r => r.skills, mcp: r => r.mcp, agent: r => r.agents }

// ── summary (기존) ─────────────────────────────────────────────────────────────
function groupTurns(rows, keyFn) {
  return [...groupBy(rows, keyFn)].map(([k, rs]) => ({ key: k, turns: rs.length, elapsed_ms: sum(rs, r => r.elapsed_ms), avg_elapsed: avg(rs, r => r.elapsed_ms), tools: sum(rs, r => r.tools_total), avg_tools: +(sum(rs, r => r.tools_total) / rs.length).toFixed(1), errors: sum(rs, r => r.tool_errors), req_chars: sum(rs, r => r.req_chars), res_chars: sum(rs, r => r.res_chars), mid_turn: rs.filter(r => r.mid_turn).length }))
}
function groupSteps(rows) {
  const g = new Map()
  for (const r of rows) for (const s of r.steps || []) { const a = g.get(s.t) || { key: s.t, calls: 0, errors: 0, ms: 0, timed: 0 }; a.calls++; if (s.ok === false) a.errors++; if (s.ms != null) { a.ms += s.ms; a.timed++ } g.set(s.t, a) }
  return [...g.values()].map(a => ({ ...a, avg_ms: a.timed ? Math.round(a.ms / a.timed) : null })).sort((x, y) => y.calls - x.calls)
}
export function aggregate(rows) {
  const total = { turns: rows.length, elapsed_ms: sum(rows, r => r.elapsed_ms), tools: sum(rows, r => r.tools_total), errors: sum(rows, r => r.tool_errors), days: new Set(rows.map(r => r.date)).size, sessions: new Set(rows.map(r => r.session)).size, superseded: rows.filter(r => r.superseded).length, incomplete: rows.filter(r => r.incomplete).length, absorbed: rows.filter(r => r.absorbed).length, res_chars: sum(rows, r => r.res_chars), req_chars: sum(rows, r => r.req_chars) }
  total.avg_elapsed_ms = total.turns ? Math.round(total.elapsed_ms / total.turns) : 0
  const axes = {}; for (const k of ['category', 'day', 'week', 'month', 'year', 'hour', 'weekday', 'session', 'skill', 'mcp', 'agent']) axes[k] = sortAxis(k, groupTurns(rows, AXES[k]))
  axes.tool = groupSteps(rows)
  return { total, axes }
}

// ── ① tokens ─────────────────────────────────────────────────────────────────
const tokenSum = rs => { const t = { api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0 }; for (const r of rs) { const u = tok(r); for (const k of Object.keys(t)) t[k] += u[k] || 0 } t.context = t.input + t.cache_read + t.cache_create; t.cache_hit = t.context ? +(t.cache_read / t.context).toFixed(4) : null; return t }
const tokenRow = (key, rs) => { const t = tokenSum(rs); const el = sum(rs, r => r.elapsed_ms); return { key, turns: rs.length, ...t, out_per_turn: Math.round(t.output / rs.length), ctx_per_call: t.api_calls ? Math.round(t.context / t.api_calls) : 0, out_tps: el > 0 ? +(t.output / (el / 1000)).toFixed(2) : null } }
export function tokensStats(rows) {
  const total = tokenRow('total', rows)
  const by = {}; for (const k of ['category', 'hour', 'day', 'week', 'month', 'year', 'session', 'model']) by[k] = sortAxis(k, [...groupBy(rows, AXES[k])].map(([key, rs]) => tokenRow(key, rs)))
  const turns = rows.map(r => ({ turn: `${r.session}#${r.turn}${r.part > 1 ? '.' + r.part : ''}`, ts_req: r.ts_req, category: r.category, ...tok(r), out_tps: r.perf?.out_tps ?? null, cache_hit: tok(r).cache_hit ?? null }))
  return { total, by, turns }
}

// ── ② usage (agent / mcp / skill / plugin / hook) ─────────────────────────────
export function usageStats(rows) {
  const acc = new Map()                                                  // key `${type}:${name}` → row
  const add = (type, name, kind, r, n = 1, extra = {}) => { const k = `${type}:${name}`; const a = acc.get(k) || { type, name, kind, turns: new Set(), calls: 0, errors: 0, ms: 0, timed: 0, plugin: extra.plugin || null }; a.turns.add(`${r.session}#${r.turn}`); a.calls += n; acc.set(k, a); return a }
  for (const r of rows) {
    const res = r.resources || {}
    for (const s of res.skills || []) add('skill', s.name, s.kind, r, s.n || 1, s)
    for (const m of res.mcp || []) add('mcp', m.name, m.kind, r, m.n || 1, m)
    for (const a of res.agents || []) add('agent', a.name, 'agent', r, a.n || 1)
    for (const h of res.hooks || []) add('hook', `${h.event}:${h.name}`, 'hook', r, h.n || 1)
    for (const p of res.plugins || []) add('plugin', p, 'p', r, 1)
    for (const s of r.steps || []) {                                     // 소요·오류는 steps 에서 (mcp 도구 / Skill / Agent)
      let key = null
      if (/^mcp__/.test(s.t)) { const m = s.t.match(/^mcp__(.+?)__/); const pm = m && m[1].match(/^plugin_(.+)_[^_]+$/); key = `mcp:${pm ? pm[1] : m[1]}` }
      else if (s.t === 'Skill') key = null
      const a = key && acc.get(key); if (a) { if (s.ok === false) a.errors++; if (s.ms != null) { a.ms += s.ms; a.timed++ } }
    }
  }
  const items = [...acc.values()].map(a => ({ type: a.type, name: a.name, kind: a.kind, plugin: a.plugin, turns: a.turns.size, calls: a.calls, errors: a.errors, avg_ms: a.timed ? Math.round(a.ms / a.timed) : null, total_ms: a.ms })).sort((x, y) => x.type.localeCompare(y.type) || y.calls - x.calls)
  const byType = {}; for (const it of items) { const t = byType[it.type] || (byType[it.type] = { type: it.type, distinct: 0, calls: 0, turns: new Set() }); t.distinct++; t.calls += it.calls }
  const typeRows = Object.values(byType).map(t => ({ type: t.type, distinct: t.distinct, calls: t.calls, turns_using: rows.filter(r => { const res = r.resources || {}; return { skill: res.skills, mcp: res.mcp, agent: res.agents, hook: res.hooks, plugin: res.plugins }[t.type]?.length }).length }))
  const byKind = {}; for (const it of items.filter(i => i.type !== 'hook' && i.type !== 'plugin')) { const k = byKind[it.kind] || (byKind[it.kind] = { kind: it.kind, label: { s: 'skill', p: 'plugin', m: 'mcp', agent: 'agent' }[it.kind] || it.kind, distinct: 0, calls: 0 }); k.distinct++; k.calls += it.calls }
  const hooksByEvent = {}; for (const it of items.filter(i => i.type === 'hook')) { const ev = it.name.split(':')[0]; const h = hooksByEvent[ev] || (hooksByEvent[ev] = { event: ev, distinct: 0, runs: 0 }); h.distinct++; h.runs += it.calls }
  return { items, byType: typeRows, byKind: Object.values(byKind), hooksByEvent: Object.values(hooksByEvent).sort((a, b) => b.runs - a.runs), hook_ms_total: sum(rows, r => r.perf?.hook_ms), hook_runs_total: sum(rows, r => r.perf?.hook_runs) }
}

// ── ③ performance ────────────────────────────────────────────────────────────
const perfRow = (key, rs) => {
  const timed = rs.filter(r => r.elapsed_ms != null && !r.absorbed)
  const t = tokenSum(rs); const el = sum(timed, r => r.elapsed_ms); const toolMs = sum(rs, r => r.perf?.tool_ms)
  return { key, turns: rs.length, avg_elapsed_ms: avg(timed, r => r.elapsed_ms), p50_elapsed_ms: median(timed.map(r => r.elapsed_ms)), max_elapsed_ms: timed.length ? Math.max(...timed.map(r => r.elapsed_ms)) : null, avg_tools: +(sum(rs, r => r.tools_total) / rs.length).toFixed(1), error_rate: sum(rs, r => r.tools_total) ? +(sum(rs, r => r.tool_errors) / sum(rs, r => r.tools_total)).toFixed(4) : 0, avg_out_tokens: Math.round(t.output / rs.length), out_tps: el > 0 ? +(t.output / (el / 1000)).toFixed(2) : null, avg_api_calls: +(t.api_calls / rs.length).toFixed(1), cache_hit: t.cache_hit, tool_share: el > 0 ? +(toolMs / el).toFixed(3) : null, avg_hook_ms: avg(rs, r => r.perf?.hook_ms) }
}
const median = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2) }
export function perfStats(rows) {
  const total = perfRow('total', rows)
  const by = {}; for (const k of ['category', 'hour', 'day', 'week', 'month', 'year', 'model', 'session']) by[k] = sortAxis(k, [...groupBy(rows, AXES[k])].map(([key, rs]) => perfRow(key, rs)))
  const tools = groupSteps(rows).map(a => ({ tool: a.key, calls: a.calls, errors: a.errors, error_rate: a.calls ? +(a.errors / a.calls).toFixed(4) : 0, avg_ms: a.avg_ms, total_ms: a.ms, share_of_tool_time: null }))
  const toolMsTotal = sum(tools, t => t.total_ms); for (const t of tools) t.share_of_tool_time = toolMsTotal ? +(t.total_ms / toolMsTotal).toFixed(3) : null
  const turns = rows.map(r => ({ turn: `${r.session}#${r.turn}${r.part > 1 ? '.' + r.part : ''}`, ts_req: r.ts_req, category: r.category, elapsed_ms: r.elapsed_ms, turn_duration_ms: r.perf?.turn_duration_ms ?? null, tool_ms: r.perf?.tool_ms ?? null, tool_share: r.perf?.tool_share ?? null, hook_ms: r.perf?.hook_ms ?? null, tools: r.tools_total, errors: r.tool_errors, api_calls: tok(r).api_calls, output_tokens: tok(r).output, out_tps: r.perf?.out_tps ?? null, cache_hit: tok(r).cache_hit ?? null }))
  return { total, by, tools, turns }
}
// 이전 기간 대비 증감 (cur/prev 는 perfRow 결과). delta = (cur − prev) / prev
export function compare(cur, prev) {
  if (!cur || !prev) return null
  const keys = ['turns', 'avg_elapsed_ms', 'p50_elapsed_ms', 'avg_tools', 'error_rate', 'avg_out_tokens', 'out_tps', 'avg_api_calls', 'cache_hit', 'tool_share']
  return keys.map(k => ({ metric: k, current: cur[k], previous: prev[k], delta: cur[k] != null && prev[k] ? +(((cur[k] - prev[k]) / prev[k])).toFixed(4) : null }))
}

// ── 표·CSV ────────────────────────────────────────────────────────────────────
export const toCsv = arr => { if (!arr.length) return ''; const cols = Object.keys(arr[0]); return [cols.join(','), ...arr.map(o => cols.map(c => { const v = o[c]; const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(','))].join('\n') }
export function tables(agg, key) {
  const { total } = agg; const arr = agg.axes[key] || []
  if (key === 'tool') return arr.map(a => ({ tool: a.key, calls: a.calls, share: pct(a.calls, total.tools), errors: a.errors, err_rate: pct(a.errors, a.calls), avg: ms2(a.avg_ms), total: ms2(a.ms), avg_ms: a.avg_ms, total_ms: a.ms }))
  return arr.map(a => ({ [key]: a.key, turns: a.turns, share: pct(a.turns, total.turns), elapsed: ms2(a.elapsed_ms), avg_elapsed: ms2(a.avg_elapsed), tools: a.tools, avg_tools: a.avg_tools, errors: a.errors, res_chars: a.res_chars, elapsed_ms: a.elapsed_ms, avg_elapsed_ms: a.avg_elapsed }))
}
export const listRows = rows => rows.map(r => ({ ts_req: r.ts_req?.slice(0, 19).replace('T', ' '), turn: `${r.session}#${r.turn}${r.part > 1 ? '.' + r.part : ''}`, category: r.category, elapsed: ms2(r.elapsed_ms), elapsed_ms: r.elapsed_ms, tools: r.tools_total, errors: r.tool_errors, api_calls: tok(r).api_calls, output_tokens: tok(r).output, cache_hit: tok(r).cache_hit, req: r.req_head }))

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const opt = (name, dflt = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt }
  const month = opt('month'), date = opt('date')
  const from = opt('from', date || (month ? `${month}-01` : '0000-00-00')), to = opt('to', date || (month ? `${month}-31` : '9999-99-99'))
  const type = opt('type', 'summary'); const by = opt('by'); const csv = opt('csv') !== null; const json = opt('json') !== null; const list = opt('list') !== null
  const rows = loadRows({ from, to })
  if (!rows.length) { console.log(`레코드 없음: ${LOG_ROOT} (${from} ~ ${to})`); process.exit(0) }
  const agg = aggregate(rows); const { total } = agg
  const omit = (o, re) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !re.test(k) && v !== undefined))
  const strip = arr => arr.map(o => omit(o, /_ms$/))
  const fmtPerf = arr => arr.map(o => ({ key: o.key, turns: o.turns, avg_elapsed: ms2(o.avg_elapsed_ms), p50: ms2(o.p50_elapsed_ms), max: ms2(o.max_elapsed_ms), avg_tools: o.avg_tools, error_rate: pct(o.error_rate, 1), avg_out_tokens: o.avg_out_tokens, out_tps: o.out_tps ?? '-', avg_api_calls: o.avg_api_calls, cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), tool_share: o.tool_share == null ? '-' : pct(o.tool_share, 1), avg_hook: ms2(o.avg_hook_ms) }))
  const fmtTok = arr => arr.map(o => ({ key: o.key, turns: o.turns, api: o.api_calls, input: kfmt(o.input), cache_read: kfmt(o.cache_read), cache_new: kfmt(o.cache_create), output: kfmt(o.output), thinking: kfmt(o.thinking), cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), out_per_turn: kfmt(o.out_per_turn), out_tps: o.out_tps ?? '-' }))
  if (json) { const out = { range: { from, to }, summary: agg, tokens: tokensStats(rows), usage: usageStats(rows), performance: perfStats(rows) }; console.log(JSON.stringify(type === 'all' || type === 'summary' && !opt('type') ? out : { range: out.range, [type]: out[type] }, null, 2)); process.exit(0) }
  if (list) { console.table(listRows(rows).map(({ elapsed_ms, ...o }) => ({ ...o, cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), req: o.req?.slice(0, 40) }))); process.exit(0) }
  const head = `${from === '0000-00-00' ? '전체' : from} ~ ${to === '9999-99-99' ? '' : to}`
  const show = (title, arr) => { if (!arr.length) return; console.log(`\n▶ ${title}`); console.table(arr) }
  if (csv) {
    const t = type === 'tokens' ? fmtTok(tokensStats(rows).by[by || 'category']) : type === 'usage' ? usageStats(rows).items : type === 'performance' ? (by === 'tool' ? perfStats(rows).tools : perfStats(rows).by[by || 'category']) : tables(agg, by || 'category')
    console.log(toCsv(t)); process.exit(0)
  }
  if (type === 'tokens' || type === 'all') { const ts = tokensStats(rows); console.log(`\n■ ① 토큰 사용  ${head}`); console.log(`  API 호출 ${ts.total.api_calls} · 입력 ${kfmt(ts.total.input)} · 캐시 읽기 ${kfmt(ts.total.cache_read)} · 캐시 생성 ${kfmt(ts.total.cache_create)} · 출력 ${kfmt(ts.total.output)} (thinking ${kfmt(ts.total.thinking)}) · 캐시 적중 ${pct(ts.total.cache_hit, 1)} · 출력 ${ts.total.out_tps ?? '-'} tok/s`); show(`by ${by || 'category'}`, fmtTok(ts.by[by || 'category'] || ts.by.category)) }
  if (type === 'usage' || type === 'all') { const us = usageStats(rows); console.log(`\n■ ② agent/mcp/skill/plugin/hook 사용  ${head}`); show('유형별', us.byType); show('종류별 (s=스킬 p=플러그인 m=독립 MCP)', us.byKind); show('리소스별', us.items.filter(i => i.type !== 'hook').map(i => ({ ...omit(i, /_ms$/), avg: ms2(i.avg_ms) }))); show('훅 이벤트별', us.hooksByEvent) }
  if (type === 'performance' || type === 'all') { const ps = perfStats(rows); console.log(`\n■ ③ 성능 비교  ${head}`); show(`by ${by || 'category'}`, fmtPerf([ps.total, ...(ps.by[by || 'category'] || ps.by.category)])); show('도구별 지연', ps.tools.map(t => ({ tool: t.tool, calls: t.calls, errors: t.errors, error_rate: pct(t.error_rate, 1), avg: ms2(t.avg_ms), total: ms2(t.total_ms), share: pct(t.share_of_tool_time, 1) }))) }
  if (type === 'summary' || type === 'all') {
    console.log(`\n■ 요약  ${head}   (${LOG_ROOT})`)
    console.log(`  턴 ${total.turns} · 일수 ${total.days} · 세션 ${total.sessions} · 총 소요 ${ms2(total.elapsed_ms)} · 평균 ${ms2(total.avg_elapsed_ms)}/턴 · 도구 호출 ${total.tools} (오류 ${total.errors}) · 재전송 ${total.superseded} · 흡수 ${total.absorbed} · 미완료 ${total.incomplete}`)
    if (by) show(`by ${by}`, strip(tables(agg, by)))
    else { show('카테고리별', strip(tables(agg, 'category'))); show('도구별 (호출 단위)', strip(tables(agg, 'tool'))); show('시간대별', strip(tables(agg, 'hour'))) }
  }
}
