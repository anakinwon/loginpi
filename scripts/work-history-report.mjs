#!/usr/bin/env node
/**
 * work-history-report — 통계 유형별 파일 + SVG 차트 보고서 생성 (2026-09-20 마스터 지시)
 *
 * 사용 (기간 4종: 일별 · 주별(ISO 월~일) · 월별 · 년도별, 각각 이전 기간 대비 증감 포함)
 *   pnpm work:report                          오늘 일별   → work-statistics/YYYY/MM/<YYYY-MM-DD>.*
 *   pnpm work:report --period week            이번 주     → work-statistics/YYYY/weekly/<YYYY-Www>.*
 *   pnpm work:report --period month           이번 달     → work-statistics/YYYY/MM/<YYYY-MM>.*
 *   pnpm work:report --period year            올해       → work-statistics/YYYY/<YYYY>.*
 *   pnpm work:report --period all             4종 일괄  (--date YYYY-MM-DD 로 기준일 지정)
 *   pnpm work:report --from A --to B [--out <dir>]   임의 기간
 *
 * 산출물 (stem = 날짜 또는 월) — 통계 유형별로 분리
 *   <stem>.summary.json / .md          요약: 턴·소요·도구·카테고리·시간대
 *   <stem>.tokens.json / .csv / .md     ① 토큰 사용: 총계·카테고리/시간대별·턴별 (API 호출, 입력/캐시/출력/thinking, 캐시 적중률, tok/s)
 *   <stem>.usage.json / .csv / .md      ② agent/mcp/skill/plugin/hook 사용: 리소스별 종류(s/p/m)·사용 턴·호출·오류·평균 소요
 *   <stem>.performance.json / .csv / .md ③ 성능 비교: 축별 평균/중앙/최대 소요·오류율·tok/s·도구 시간 비중, 도구별 지연, 이전 기간 대비
 *   <stem>.turns.csv                    턴 단위 원자료 (모든 유형의 조인 키 = turn)
 *   <stem>.report.html                  ①②③ 섹션별 SVG 차트 보고서 (외부 의존성 0, 라이트/다크, 호버 툴팁, 표 뷰)
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRows, aggregate, tokensStats, usageStats, perfStats, compare, tables, toCsv, ms2, pct, kfmt, listRows, isoWeek, PROJECT } from './work-history-stats.mjs'

// ── 인자 ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const opt = (name, dflt = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt }
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
// 기간 체계 — day: YYYY/MM/<날짜>.*  week: YYYY/weekly/<YYYY-Www>.*(ISO 월~일)  month: YYYY/MM/<YYYY-MM>.*  year: YYYY/<YYYY>.*  range: --from/--to
function rangeFor(period, anchor) {
  const [y, m] = anchor.split('-').map(Number)
  if (period === 'day') return { period, from: anchor, to: anchor, stem: anchor, dir: [anchor.slice(0, 4), anchor.slice(5, 7)], label: anchor, sub: 'hour', prev: { from: addDays(anchor, -1), to: addDays(anchor, -1), label: addDays(anchor, -1) } }
  if (period === 'week') { const w = isoWeek(anchor); const pw = isoWeek(addDays(w.from, -7)); return { period, from: w.from, to: w.to, stem: w.key, dir: [w.key.slice(0, 4), 'weekly'], label: `${w.key} (${w.from} ~ ${w.to})`, sub: 'day', prev: { from: pw.from, to: pw.to, label: pw.key } } }
  if (period === 'month') { const pm = m === 1 ? [y - 1, 12] : [y, m - 1]; const mm = String(m).padStart(2, '0'), pmm = String(pm[1]).padStart(2, '0'); return { period, from: `${y}-${mm}-01`, to: `${y}-${mm}-${lastDay(y, m)}`, stem: `${y}-${mm}`, dir: [String(y), mm], label: `${y}-${mm}`, sub: 'day', prev: { from: `${pm[0]}-${pmm}-01`, to: `${pm[0]}-${pmm}-${lastDay(pm[0], pm[1])}`, label: `${pm[0]}-${pmm}` } } }
  if (period === 'year') return { period, from: `${y}-01-01`, to: `${y}-12-31`, stem: String(y), dir: [String(y)], label: String(y), sub: 'month', prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) } }
  const f = opt('from'), t = opt('to', f); return { period: 'range', from: f, to: t, stem: `${f}_${t}`, dir: [f.slice(0, 4), f.slice(5, 7)], label: `${f} ~ ${t}`, sub: 'day', prev: null }
}
const period = opt('period', opt('month') ? 'month' : opt('from') ? 'range' : 'day')
const anchor = opt('date', opt('month') ? `${opt('month')}-01` : todayKst())
if (period === 'all') {                                                   // 일·주·월·년 4종 일괄 생성 (자기 자신을 기간별로 재실행)
  const { spawnSync } = await import('node:child_process')
  for (const p of ['day', 'week', 'month', 'year']) { const r = spawnSync(process.execPath, [process.argv[1], '--period', p, '--date', anchor, ...(opt('out') ? ['--out', opt('out')] : [])], { stdio: 'inherit' }); if (r.status) process.exit(r.status) }
  process.exit(0)
}
const R = rangeFor(period, anchor)
const { from, to, stem } = R
const yyyymm = from.replace(/-/g, '').slice(0, 6)
const OUT = path.resolve(PROJECT, opt('out', path.join('work-statistics', ...R.dir)))
fs.mkdirSync(OUT, { recursive: true })
for (const legacy of ['stats.json', 'stats.md', 'category.csv', 'tool.csv', 'hour.csv', 'day.csv']) { const p = path.join(OUT, `${stem}.${legacy}`); if (fs.existsSync(p)) fs.unlinkSync(p) }   // 구 단일 구조 정리

// ── 데이터 ────────────────────────────────────────────────────────────────────
const rows = loadRows({ from, to })
if (!rows.length) { console.log(`레코드 없음 (${from} ~ ${to})`); process.exit(0) }
const agg = aggregate(rows); const { total, axes } = agg
const TK = tokensStats(rows), US = usageStats(rows), PF = perfStats(rows)
const turns = listRows(rows)
const generatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
// 이전 기간 (일: 전날 / 주: 전주 / 월: 전월 / 년: 전년) 대비
const prevRange = R.prev
const prevRows = prevRange ? loadRows(prevRange) : []
const CMP = prevRows.length ? compare(PF.total, perfStats(prevRows).total) : null

// ── 통계 파일 ──────────────────────────────────────────────────────────────────
const w = (name, body) => { fs.writeFileSync(path.join(OUT, `${stem}.${name}`), body); return `${stem}.${name}` }
const written = []
const mdTable = (arr, drop = /_ms$|^steps$/) => { if (!arr?.length) return '_없음_'; const cols = Object.keys(arr[0]).filter(c => !drop.test(c)); return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...arr.map(o => `| ${cols.map(c => { const v = o[c]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v) }).join(' | ')} |`)].join('\n') }
const fmtTok = arr => arr.map(o => ({ key: o.key, turns: o.turns, api_calls: o.api_calls, input: kfmt(o.input), cache_read: kfmt(o.cache_read), cache_new: kfmt(o.cache_create), output: kfmt(o.output), thinking: kfmt(o.thinking), cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), out_per_turn: kfmt(o.out_per_turn), out_tps: o.out_tps ?? '-' }))
const fmtPerf = arr => arr.map(o => ({ key: o.key, turns: o.turns, avg_elapsed: ms2(o.avg_elapsed_ms), p50: ms2(o.p50_elapsed_ms), max: ms2(o.max_elapsed_ms), avg_tools: o.avg_tools, error_rate: pct(o.error_rate, 1), avg_out_tokens: kfmt(o.avg_out_tokens), out_tps: o.out_tps ?? '-', avg_api_calls: o.avg_api_calls, cache_hit: o.cache_hit == null ? '-' : pct(o.cache_hit, 1), tool_share: o.tool_share == null ? '-' : pct(o.tool_share, 1), avg_hook: ms2(o.avg_hook_ms) }))
const fmtCmp = arr => arr.map(c => ({ metric: c.metric, current: c.current, previous: c.previous, delta: c.delta == null ? '-' : `${c.delta > 0 ? '+' : ''}${(100 * c.delta).toFixed(1)}%` }))
const header = `생성: ${generatedAt} · 범위: ${from} ~ ${to} · 출처: work-history/*.jsonl`

// summary
written.push(w('summary.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, total, axes, turns }, null, 2)))
written.push(w('summary.md', `# 요약 ${stem}\n\n${header}\n\n| 턴 | 일수 | 세션 | 총 소요 | 평균/턴 | 도구 호출 | 도구 오류 | 재전송 | 흡수 | 응답 글자수 |\n|---|---|---|---|---|---|---|---|---|---|\n| ${total.turns} | ${total.days} | ${total.sessions} | ${ms2(total.elapsed_ms)} | ${ms2(total.avg_elapsed_ms)} | ${total.tools} | ${total.errors} | ${total.superseded} | ${total.absorbed} | ${total.res_chars.toLocaleString()} |\n\n## 카테고리별\n\n${mdTable(tables(agg, 'category'))}\n\n## 시간대별\n\n${mdTable(tables(agg, 'hour'))}\n\n## 도구별 (호출 단위)\n\n${mdTable(tables(agg, 'tool'))}\n`))
// ① tokens
written.push(w('tokens.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, ...TK }, null, 2)))
written.push(w('tokens.csv', toCsv([TK.total, ...TK.by.category.map(o => ({ ...o, key: `category:${o.key}` })), ...TK.by.hour.map(o => ({ ...o, key: `hour:${o.key}` })), ...TK.by.day.map(o => ({ ...o, key: `day:${o.key}` }))])))
written.push(w('tokens.md', `# ① 토큰 사용 ${stem}\n\n${header}\n\n## 총계\n\n${mdTable(fmtTok([TK.total]))}\n\n## 카테고리별\n\n${mdTable(fmtTok(TK.by.category))}\n\n## 시간대별\n\n${mdTable(fmtTok(TK.by.hour))}\n\n## 턴별\n\n${mdTable(TK.turns.map(t => ({ turn: t.turn, ts_req: t.ts_req?.slice(11, 19), category: t.category, api_calls: t.api_calls, input: kfmt(t.input), cache_read: kfmt(t.cache_read), cache_new: kfmt(t.cache_create), output: kfmt(t.output), thinking: kfmt(t.thinking), cache_hit: t.cache_hit == null ? '-' : pct(t.cache_hit, 1), out_tps: t.out_tps ?? '-' })))}\n`))
// ② usage
written.push(w('usage.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, ...US }, null, 2)))
written.push(w('usage.csv', toCsv(US.items)))
written.push(w('usage.md', `# ② agent / mcp / skill / plugin / hook 사용 ${stem}\n\n${header}\n\n종류: s=스킬(프로젝트·사용자) · p=플러그인 제공(스킬·MCP) · m=독립 MCP 서버(.mcp.json) · agent=서브에이전트 · hook=하네스 훅\n\n## 유형별\n\n${mdTable(US.byType)}\n\n## 종류별\n\n${mdTable(US.byKind)}\n\n## 리소스별\n\n${mdTable(US.items.filter(i => i.type !== 'hook').map(i => ({ ...i, avg: ms2(i.avg_ms), total: ms2(i.total_ms) })))}\n\n## 훅 이벤트별 (실행 ${US.hook_runs_total}회 중 Stop 훅 소요 합 ${ms2(US.hook_ms_total)})\n\n${mdTable(US.hooksByEvent)}\n\n## 훅 상세\n\n${mdTable(US.items.filter(i => i.type === 'hook').map(i => ({ hook: i.name, turns: i.turns, runs: i.calls })))}\n`))
// ③ performance
written.push(w('performance.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, ...PF, compare_previous: CMP ? { previous_range: prevRange, metrics: CMP } : null }, null, 2)))
written.push(w('performance.csv', toCsv([PF.total, ...PF.by.category.map(o => ({ ...o, key: `category:${o.key}` })), ...PF.by.hour.map(o => ({ ...o, key: `hour:${o.key}` })), ...PF.by.day.map(o => ({ ...o, key: `day:${o.key}` }))])))
written.push(w('performance.md', `# ③ 성능 비교 ${stem}\n\n${header}\n\n## 총계·카테고리별\n\n${mdTable(fmtPerf([PF.total, ...PF.by.category]))}\n\n## 시간대별\n\n${mdTable(fmtPerf(PF.by.hour))}\n\n## 도구별 지연\n\n${mdTable(PF.tools.map(t => ({ tool: t.tool, calls: t.calls, errors: t.errors, error_rate: pct(t.error_rate, 1), avg: ms2(t.avg_ms), total: ms2(t.total_ms), share: pct(t.share_of_tool_time, 1) })))}\n\n## 이전 기간 대비${prevRange ? ` (${prevRange.label})` : ''}\n\n${CMP ? mdTable(fmtCmp(CMP)) : '_이전 기간 데이터 없음_'}\n\n## 턴별\n\n${mdTable(PF.turns.map(t => ({ turn: t.turn, ts_req: t.ts_req?.slice(11, 19), category: t.category, elapsed: ms2(t.elapsed_ms), turn_duration: ms2(t.turn_duration_ms), tool_time: ms2(t.tool_ms), tool_share: t.tool_share == null ? '-' : pct(t.tool_share, 1), hook_time: ms2(t.hook_ms), tools: t.tools, errors: t.errors, api_calls: t.api_calls, output: kfmt(t.output_tokens), out_tps: t.out_tps ?? '-', cache_hit: t.cache_hit == null ? '-' : pct(t.cache_hit, 1) })))}\n`))
written.push(w('turns.csv', toCsv(turns)))

// ── 차트 보고서 ────────────────────────────────────────────────────────────────
const CATEGORY_ORDER = ['INSTALL', 'CONFIG', 'QUERY', 'GIT', 'FEATURE', 'FIX', 'DOCS', 'TEST', 'DATA', 'REFACTOR', 'DEPLOY', 'OTHER']
const catIndex = c => { const i = CATEGORY_ORDER.indexOf(c); return i >= 0 && i < 8 ? i + 1 : 0 }
const catVar = c => catIndex(c) ? `var(--s${catIndex(c)})` : 'var(--other)'
const KIND = { s: { label: '스킬 (s)', v: 'var(--s1)' }, p: { label: '플러그인 (p)', v: 'var(--s2)' }, m: { label: '독립 MCP (m)', v: 'var(--s3)' }, agent: { label: '에이전트', v: 'var(--s4)' } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const fmtNum = n => Number(n).toLocaleString()
const turnLabel = r => `#${String(r.turn).padStart(2, '0')}${r.part > 1 ? '.' + r.part : ''}`

// 가로 막대 (값 1축, 직접 라벨). items: [{label, value, sub, color, tip}]
function hbar(items, { width = 560, rowH = 30, labelW = 150, valueFmt = v => fmtNum(v) } = {}) {
  if (!items.length) return '<p class="desc">데이터 없음</p>'
  const max = Math.max(1, ...items.map(i => i.value))
  const plotW = width - labelW - 210, height = items.length * rowH + 8
  const x = v => labelW + (v / max) * plotW
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height + 18}" role="img" aria-label="가로 막대 차트">`
  for (const t of [...new Set([0, 0.5, 1].map(f => +(max * f).toFixed(1)))]) s += `<line x1="${x(t)}" y1="0" x2="${x(t)}" y2="${height}" class="grid"/><text x="${x(t)}" y="${height + 14}" class="tick" text-anchor="middle">${valueFmt(t)}</text>`
  items.forEach((it, i) => {
    const y = i * rowH + 4, h = rowH - 10, bw = Math.max(0, x(it.value) - labelW)
    s += `<g class="mark" data-tip="${esc(it.tip || `${it.label}: ${valueFmt(it.value)}`)}"><rect x="${labelW - 8}" y="${y - 3}" width="${plotW + 210}" height="${rowH - 4}" fill="transparent"/>`
    s += `<text x="${labelW - 10}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${esc(it.label)}</text>`
    s += `<rect x="${labelW}" y="${y}" width="${bw}" height="${h}" fill="${it.color}"/><rect x="${Math.max(labelW, labelW + bw - 4)}" y="${y}" width="${Math.min(4, bw)}" height="${h}" rx="3" fill="${it.color}"/>`
    s += `<text x="${labelW + bw + 8}" y="${y + h / 2 + 4}" class="val">${valueFmt(it.value)}${it.sub ? ` <tspan class="sub">${esc(it.sub)}</tspan>` : ''}</text></g>`
  })
  return s + '</svg>'
}
// 가로 누적 막대. items: [{label, segs:[{value,color,name}], tip, sub}]  (세그먼트 사이 2px 표면 간격)
function sbar(items, { width = 560, rowH = 26, labelW = 70, valueFmt = v => fmtNum(v) } = {}) {
  if (!items.length) return '<p class="desc">데이터 없음</p>'
  const tot = it => it.segs.reduce((a, s) => a + s.value, 0)
  const max = Math.max(1, ...items.map(tot))
  const plotW = width - labelW - 150, height = items.length * rowH + 8
  const x = v => (v / max) * plotW
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height + 18}" role="img" aria-label="누적 가로 막대 차트">`
  for (const t of [...new Set([0, 0.5, 1].map(f => Math.round(max * f)))]) s += `<line x1="${labelW + x(t)}" y1="0" x2="${labelW + x(t)}" y2="${height}" class="grid"/><text x="${labelW + x(t)}" y="${height + 14}" class="tick" text-anchor="middle">${valueFmt(t)}</text>`
  items.forEach((it, i) => {
    const y = i * rowH + 4, h = rowH - 10; let cx = labelW
    s += `<g class="mark" data-tip="${esc(it.tip)}"><rect x="${labelW - 8}" y="${y - 3}" width="${plotW + 150}" height="${rowH - 4}" fill="transparent"/><text x="${labelW - 10}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${esc(it.label)}</text>`
    for (const sg of it.segs) { const wv = x(sg.value); if (wv > 0) { s += `<rect x="${cx}" y="${y}" width="${Math.max(0, wv - 2)}" height="${h}" fill="${sg.color}"/>`; cx += wv } }
    s += `<text x="${labelW + x(tot(it)) + 8}" y="${y + h / 2 + 4}" class="val">${valueFmt(tot(it))}${it.sub ? ` <tspan class="sub">${esc(it.sub)}</tspan>` : ''}</text></g>`
  })
  return s + '</svg>'
}
function vbar(items, { width = 560, height = 200, color = 'var(--s1)', valueFmt = v => v } = {}) {
  if (!items.length) return '<p class="desc">데이터 없음</p>'
  const max = Math.max(1, ...items.map(i => i.value)), padL = 44, padB = 26, padT = 18
  const plotW = width - padL - 12, plotH = height - padB - padT, n = items.length, slot = plotW / Math.max(1, n), bw = Math.min(44, slot * 0.6)
  const y = v => padT + plotH - (v / max) * plotH
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="세로 막대 차트">`
  for (const f of [0, 0.5, 1]) { const v = Math.round(max * f); s += `<line x1="${padL}" y1="${y(v)}" x2="${width - 12}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${valueFmt(v)}</text>` }
  items.forEach((it, i) => {
    const cx = padL + slot * i + slot / 2, top = y(it.value), h = padT + plotH - top
    s += `<g class="mark" data-tip="${esc(it.tip || `${it.label}: ${valueFmt(it.value)}`)}"><rect x="${cx - slot / 2}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent"/>`
    s += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(0, h - 4)}" fill="${it.color || color}"/><rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.min(4, h)}" rx="3" fill="${it.color || color}"/>`
    s += `<text x="${cx}" y="${top - 5}" class="val" text-anchor="middle">${valueFmt(it.value)}</text><text x="${cx}" y="${height - 8}" class="lbl" text-anchor="middle">${esc(it.label)}</text></g>`
  })
  return s + '</svg>'
}
function gantt(rs, { width = 1120, rowH = 24 } = {}) {
  const t = s => new Date(s).getTime()
  const ends = rs.map(r => r.ts_res ? t(r.ts_res) : t(r.ts_req) + (r.elapsed_ms || 60e3))
  const starts = rs.map((r, i) => r.part > 1 && r.ts_res ? ends[i] - (r.elapsed_ms || 0) : t(r.ts_req))
  const H = 3600e3, t0 = Math.floor(Math.min(...starts) / H) * H, t1 = Math.ceil(Math.max(...ends) / H) * H
  const padL = 52, padR = 16, labelW = 260, padT = 22, plotW = width - padL - padR - labelW, height = padT + rs.length * rowH + 8
  const x = ms => padL + ((ms - t0) / (t1 - t0)) * plotW
  const hh = ms => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="턴 타임라인">`
  for (let m = t0; m <= t1; m += H) s += `<line x1="${x(m)}" y1="${padT - 6}" x2="${x(m)}" y2="${height - 6}" class="grid"/><text x="${x(m)}" y="${padT - 10}" class="tick" text-anchor="middle">${hh(m)}</text>`
  rs.forEach((r, i) => {
    const y = padT + i * rowH + 4, h = rowH - 10, xs = x(starts[i]), xe = Math.max(xs + 2, x(ends[i])), col = catVar(r.category)
    const head = (r.req_head || '').replace(/\s+/g, ' ').slice(0, 30)
    const tip = `${turnLabel(r)} [${r.category}] ${r.ts_req.slice(11, 19)} → ${r.ts_res ? r.ts_res.slice(11, 19) : '-'} · ${ms2(r.elapsed_ms)} · 도구 ${r.tools_total} · 출력 ${kfmt(r.tokens?.output)} tok${r.tool_errors ? ` · 오류 ${r.tool_errors}` : ''}${r.absorbed ? ' · 다음 요청에 흡수' : ''}${r.superseded ? ' · 재전송으로 대체' : ''}`
    s += `<g class="mark" data-tip="${esc(tip)}"><rect x="${padL - 4}" y="${y - 3}" width="${plotW + labelW + 8}" height="${rowH - 4}" fill="transparent"/><text x="${padL - 8}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${turnLabel(r)}</text>`
    if (r.superseded) s += `<circle cx="${xs}" cy="${y + h / 2}" r="4" fill="none" stroke="${col}" stroke-width="2"/>`
    else s += `<rect x="${xs}" y="${y}" width="${xe - xs}" height="${h}" fill="${col}" rx="2"${r.absorbed ? ' opacity="0.45"' : ''}/>`
    s += `<text x="${xe + 8}" y="${y + h / 2 + 4}" class="val"><tspan class="sub">${r.elapsed_ms != null ? ms2(r.elapsed_ms) : (r.superseded ? '재전송' : '흡수')}</tspan> ${esc(head)}${r.mid_turn ? ' <tspan class="sub">(mid-turn)</tspan>' : ''}</text></g>`
  })
  return s + '</svg>'
}
const legendOf = pairs => `<ul class="legend">${pairs.map(([name, v]) => `<li><i style="background:${v}"></i>${esc(name)}</li>`).join('')}</ul>`
const catsPresent = CATEGORY_ORDER.filter(c => axes.category.some(a => a.key === c)).concat(axes.category.map(a => a.key).filter(k => !CATEGORY_ORDER.includes(k)))
const catLegend = legendOf(catsPresent.map(c => [c, catVar(c)]))
const htmlTable = (arr, cols) => `<div class="scroll"><table><thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${arr.map(o => `<tr>${cols.map(c => `<td class="${c[2] || ''}">${c[1](o)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

// ① 토큰
const tokTurnBars = rows.map(r => ({ label: turnLabel(r), value: r.tokens?.output || 0, color: catVar(r.category), tip: `${turnLabel(r)} [${r.category}] 출력 ${kfmt(r.tokens?.output)} (thinking ${kfmt(r.tokens?.thinking)}) · API ${r.tokens?.api_calls}회 · ${r.perf?.out_tps ?? '-'} tok/s` }))
const ctxBars = rows.map(r => ({ label: turnLabel(r), segs: [{ value: r.tokens?.cache_read || 0, color: 'var(--s1)' }, { value: r.tokens?.cache_create || 0, color: 'var(--s3)' }, { value: r.tokens?.input || 0, color: 'var(--s2)' }], sub: r.tokens?.cache_hit == null ? '' : `· 적중 ${pct(r.tokens.cache_hit, 1)}`, tip: `${turnLabel(r)} 컨텍스트 ${kfmt(r.tokens?.context)} = 캐시 읽기 ${kfmt(r.tokens?.cache_read)} + 캐시 생성 ${kfmt(r.tokens?.cache_create)} + 신규 입력 ${kfmt(r.tokens?.input)} · API ${r.tokens?.api_calls}회 (호출당 ${kfmt(r.tokens?.api_calls ? r.tokens.context / r.tokens.api_calls : 0)})` }))
const tokCatBars = TK.by.category.map(o => ({ label: o.key, value: o.output, sub: `· 턴당 ${kfmt(o.out_per_turn)} · ${o.out_tps ?? '-'} tok/s`, color: catVar(o.key), tip: `${o.key}: 출력 ${kfmt(o.output)} · thinking ${kfmt(o.thinking)} · API ${o.api_calls}회 · 캐시 적중 ${pct(o.cache_hit, 1)}` }))
// ② 사용
const usageBars = US.items.filter(i => i.type !== 'hook' && i.type !== 'plugin').sort((a, b) => b.calls - a.calls).map(i => ({ label: `${i.name}${i.type === 'agent' ? '' : `(${i.kind})`}`, value: i.calls, sub: `· ${i.turns}턴${i.errors ? ` · 오류 ${i.errors}` : ''}${i.avg_ms != null ? ` · 평균 ${ms2(i.avg_ms)}` : ''}`, color: (KIND[i.kind] || KIND.agent).v, tip: `${i.type} ${i.name} [${(KIND[i.kind] || KIND.agent).label}]: ${i.calls}회 · ${i.turns}턴에서 사용 · 오류 ${i.errors}${i.plugin ? ` · 플러그인 ${i.plugin}` : ''}` }))
const hookBars = US.hooksByEvent.map(h => ({ label: h.event, value: h.runs, sub: `· 훅 ${h.distinct}종`, color: 'var(--s7)', tip: `${h.event}: ${h.runs}회 실행 · ${h.distinct}종` }))
// ③ 성능
const perfCatBars = PF.by.category.map(o => ({ label: o.key, value: +((o.avg_elapsed_ms || 0) / 60000).toFixed(1), sub: `· 중앙 ${ms2(o.p50_elapsed_ms)} · 최대 ${ms2(o.max_elapsed_ms)}`, color: catVar(o.key), tip: `${o.key}: 평균 ${ms2(o.avg_elapsed_ms)} · 중앙 ${ms2(o.p50_elapsed_ms)} · 최대 ${ms2(o.max_elapsed_ms)} · 도구 ${o.avg_tools}/턴 · 오류율 ${pct(o.error_rate, 1)}` }))
const shareBars = rows.filter(r => r.elapsed_ms > 0 && !r.absorbed).map(r => ({ label: turnLabel(r), segs: [{ value: Math.min(r.perf?.tool_ms || 0, r.elapsed_ms), color: 'var(--s2)' }, { value: Math.max(0, r.elapsed_ms - Math.min(r.perf?.tool_ms || 0, r.elapsed_ms)), color: 'var(--s1)' }], sub: `· 도구 ${pct(r.perf?.tool_share, 1)}`, tip: `${turnLabel(r)} 소요 ${ms2(r.elapsed_ms)} = 도구 실행 ${ms2(r.perf?.tool_ms)} + 모델·기타 ${ms2(r.elapsed_ms - (r.perf?.tool_ms || 0))} · 훅 ${ms2(r.perf?.hook_ms)}` }))
const latencyBars = PF.tools.slice(0, 10).map(t => ({ label: t.tool.replace(/^mcp__/, 'mcp:').replace(/__.*$/, ''), value: +((t.avg_ms || 0) / 1000).toFixed(1), sub: `· ${t.calls}회 · 합계 ${ms2(t.total_ms)}${t.errors ? ` · 오류 ${t.errors}` : ''}`, color: 'var(--s1)', tip: `${t.tool}: 평균 ${ms2(t.avg_ms)} · 호출 ${t.calls} · 오류율 ${pct(t.error_rate, 1)} · 도구 시간 비중 ${pct(t.share_of_tool_time, 1)}` }))
const tpsBars = PF.by.category.filter(o => o.out_tps != null).map(o => ({ label: o.key, value: o.out_tps, sub: `· 턴당 출력 ${kfmt(o.avg_out_tokens)}`, color: catVar(o.key), tip: `${o.key}: 출력 ${o.out_tps} tok/s · API ${o.avg_api_calls}회/턴 · 캐시 적중 ${pct(o.cache_hit, 1)}` }))
// 추이 (기간의 하위 축: 일→시간대, 주·월→일, 년→월)
const SUB_LABEL = { hour: '시간대별', day: '일별', month: '월별' }
const subKey = R.sub, subFmt = k => subKey === 'hour' ? `${String(k).padStart(2, '0')}시` : subKey === 'month' ? String(k).slice(5) + '월' : String(k).slice(5)
const trendTurns = axes[subKey].map(a => ({ label: subFmt(a.key), value: a.turns, tip: `${a.key}: ${a.turns}턴 · 소요 ${ms2(a.elapsed_ms)} · 도구 ${a.tools} · 오류 ${a.errors}` }))
const trendTokens = (TK.by[subKey] || []).map(a => ({ label: subFmt(a.key), value: a.output, tip: `${a.key}: 출력 ${kfmt(a.output)} · API ${a.api_calls} · 캐시 적중 ${pct(a.cache_hit, 1)}` }))
const trendElapsed = (PF.by[subKey] || []).map(a => ({ label: subFmt(a.key), value: +((a.avg_elapsed_ms || 0) / 60000).toFixed(1), tip: `${a.key}: 평균 ${ms2(a.avg_elapsed_ms)} · 중앙 ${ms2(a.p50_elapsed_ms)} · 오류율 ${pct(a.error_rate, 1)}` }))
const showGantt = rows.length <= 80
const kpi = [['턴', fmtNum(total.turns), `${total.days}일 · 세션 ${total.sessions}`], ['총 소요', ms2(total.elapsed_ms), `평균 ${ms2(total.avg_elapsed_ms)}/턴`], ['도구 호출', fmtNum(total.tools), `오류 ${total.errors} (${pct(total.errors, total.tools)})`], ['API 호출', fmtNum(TK.total.api_calls), `턴당 ${(TK.total.api_calls / total.turns).toFixed(1)}회`], ['출력 토큰', kfmt(TK.total.output), `thinking ${kfmt(TK.total.thinking)}`], ['캐시 적중', pct(TK.total.cache_hit, 1), `컨텍스트 ${kfmt(TK.total.context)}`]]
const cmpRows = CMP ? fmtCmp(CMP) : []

const html = `<meta charset="utf-8">
<title>작업 통계 ${stem}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{color-scheme:light;--bg:#f6f5f2;--surface:#fcfcfb;--line:#e4e2dc;--grid:#ebe9e3;--ink:#0b0b0b;--ink2:#52514e;--ink3:#8a8884;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#e34948;--other:#9a9893;--bad:#c0392b;
  --sans:"IBM Plex Sans KR",system-ui,"Malgun Gothic",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--other:#6f6e69;--bad:#e66767}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--other:#6f6e69;--bad:#e66767}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans)}
.wrap{max-width:1180px;margin:0 auto;padding-block:28px 48px;padding-inline:20px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px;margin-bottom:22px}
h1{font-size:24px;font-weight:600;margin:0;letter-spacing:-.01em;text-wrap:balance}
.meta{color:var(--ink2);font-family:var(--mono);font-size:12px}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:26px}
.kpi div{background:var(--surface);border:1px solid var(--line);padding:14px 16px}
.kpi b{display:block;font-size:26px;font-weight:600;font-family:var(--mono);font-variant-numeric:tabular-nums;line-height:1.1;margin:4px 0}
.kpi span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)}
.kpi small{color:var(--ink2)}
h2.type{font-size:16px;font-weight:600;margin:30px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--ink)}
h2.type small{font-weight:400;color:var(--ink2);font-size:12px;margin-left:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px}
section{background:var(--surface);border:1px solid var(--line);padding:16px 18px 12px;min-width:0}
section.wide{grid-column:1/-1}
h3{font-size:14px;font-weight:600;margin:0 0 2px}
.desc{color:var(--ink2);font-size:12px;margin:0 0 10px}
.chart{width:100%;height:auto;display:block;font-family:var(--sans)}
.chart .grid{stroke:var(--grid);stroke-width:1}
.chart .tick{fill:var(--ink3);font-size:11px;font-family:var(--sans);font-variant-numeric:tabular-nums}
.chart .lbl{fill:var(--ink);font-size:12px}
.chart .val{fill:var(--ink);font-size:12px;font-family:var(--mono);font-variant-numeric:tabular-nums}
.chart .sub{fill:var(--ink2)}
.chart .mark{cursor:default}.chart .mark:hover rect:not([fill="transparent"]),.chart .mark:hover circle{filter:brightness(1.12)}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;padding:0;margin:0 0 10px;font-size:12px;color:var(--ink2)}
.legend i,.dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th{text-align:left;color:var(--ink3);font-weight:500;font-size:11px;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--line);padding:6px 8px;white-space:nowrap}
td{padding:6px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
td.num{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.bad{color:var(--bad);font-weight:600}
td.req{color:var(--ink2);max-width:520px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 9px;font-size:12px;border-radius:3px;max-width:380px;display:none;z-index:9;font-family:var(--mono)}
footer{margin-top:22px;color:var(--ink3);font-size:12px}
@media (prefers-reduced-motion:no-preference){.chart .mark rect{transition:filter .12s}}
</style>
<div class="wrap">
<header><h1>작업 통계 ${esc(stem)}</h1><span class="meta">${esc({ day: '일별', week: '주별', month: '월별', year: '년도별', range: '기간' }[R.period])} · ${esc(from)} ~ ${esc(to)} · 세션 ${total.sessions} · ${esc([...new Set(rows.map(r => r.model))].join(', '))} · 생성 ${esc(generatedAt)}</span></header>
<div class="kpi">${kpi.map(([l, v, sub]) => `<div><span>${l}</span><b>${v}</b><small>${sub}</small></div>`).join('')}</div>

<h2 class="type">추이<small>${esc(SUB_LABEL[subKey])} · 기간 안의 흐름</small></h2>
<div class="grid">
  <section><h3>${esc(SUB_LABEL[subKey])} 턴 수</h3><p class="desc">요청 시각 기준 (Asia/Seoul)</p>${vbar(trendTurns)}</section>
  <section><h3>${esc(SUB_LABEL[subKey])} 출력 토큰</h3><p class="desc">모델 생성 토큰 합</p>${vbar(trendTokens, { color: 'var(--s3)', valueFmt: kfmt })}</section>
  <section><h3>${esc(SUB_LABEL[subKey])} 평균 소요 (분)</h3><p class="desc">턴당 요청→응답</p>${vbar(trendElapsed, { color: 'var(--s2)', valueFmt: v => `${v}` })}</section>
</div>

<h2 class="type">① 토큰 사용<small>API 호출별 usage 를 턴 단위로 합산 · 컨텍스트 = 캐시 읽기 + 캐시 생성 + 신규 입력</small></h2>
<div class="grid">
  <section><h3>턴별 출력 토큰</h3><p class="desc">모델이 생성한 토큰(thinking 포함) · 색은 카테고리</p>${catLegend}${hbar(tokTurnBars, { labelW: 60, rowH: 22, valueFmt: kfmt })}</section>
  <section><h3>턴별 컨텍스트 토큰</h3><p class="desc">누적: 캐시 읽기 / 캐시 생성 / 신규 입력 · 오른쪽은 캐시 적중률</p>${legendOf([['캐시 읽기', 'var(--s1)'], ['캐시 생성', 'var(--s3)'], ['신규 입력', 'var(--s2)']])}${sbar(ctxBars, { labelW: 60, rowH: 22, valueFmt: kfmt })}</section>
  <section><h3>카테고리별 출력 토큰</h3><p class="desc">합계 · 턴당 평균 · 출력 속도</p>${hbar(tokCatBars, { valueFmt: kfmt })}</section>
  <section><h3>토큰 표</h3><p class="desc">카테고리별 (전체 CSV: ${esc(stem)}.tokens.csv)</p>${htmlTable(fmtTok([TK.total, ...TK.by.category]), [['구분', o => esc(o.key)], ['턴', o => o.turns, 'num'], ['API', o => o.api_calls, 'num'], ['입력', o => o.input, 'num'], ['캐시 읽기', o => o.cache_read, 'num'], ['캐시 생성', o => o.cache_new, 'num'], ['출력', o => o.output, 'num'], ['thinking', o => o.thinking, 'num'], ['적중', o => o.cache_hit, 'num'], ['tok/s', o => o.out_tps, 'num']])}</section>
</div>

<h2 class="type">② 에이전트 · MCP · 스킬 · 플러그인 · 훅 사용<small>s=스킬 · p=플러그인 제공 · m=독립 MCP 서버(.mcp.json)</small></h2>
<div class="grid">
  <section><h3>리소스별 호출 수</h3><p class="desc">색은 종류 · 오른쪽은 사용 턴 수·오류·평균 소요</p>${legendOf(Object.values(KIND).map(k => [k.label, k.v]))}${hbar(usageBars, { labelW: 190 })}</section>
  <section><h3>훅 이벤트별 실행 수</h3><p class="desc">하네스 훅(세션 기록의 hook 첨부 기준) · Stop 훅 소요 합 ${esc(ms2(US.hook_ms_total))}</p>${hbar(hookBars, { labelW: 170 })}</section>
  <section class="wide"><h3>사용 표</h3><p class="desc">유형별 개수·호출·사용 턴 (전체 CSV: ${esc(stem)}.usage.csv)</p>${htmlTable(US.byType, [['유형', o => esc(o.type)], ['종류 수', o => o.distinct, 'num'], ['호출', o => o.calls, 'num'], ['사용 턴', o => o.turns_using, 'num']])}</section>
</div>

<h2 class="type">③ 성능 비교<small>소요·처리량·오류율·도구 시간 비중 · 이전 기간(${esc(prevRange?.label || '-')}) 대비</small></h2>
<div class="grid">
  <section><h3>카테고리별 평균 소요 (분)</h3><p class="desc">요청→응답 · 중앙값·최대 병기</p>${hbar(perfCatBars, { valueFmt: v => `${v}분` })}</section>
  <section><h3>카테고리별 출력 속도 (tok/s)</h3><p class="desc">출력 토큰 ÷ 소요 시간</p>${hbar(tpsBars, { valueFmt: v => `${v}` })}</section>
  <section><h3>턴별 소요 구성</h3><p class="desc">누적: 도구 실행 시간 / 모델·기타 시간 · 오른쪽은 도구 비중</p>${legendOf([['도구 실행', 'var(--s2)'], ['모델·기타', 'var(--s1)']])}${sbar(shareBars, { labelW: 60, rowH: 22, valueFmt: v => ms2(v) })}</section>
  <section><h3>도구별 평균 지연 (초)</h3><p class="desc">호출 단위 평균 · 합계·오류 병기</p>${hbar(latencyBars, { valueFmt: v => `${v}s` })}</section>
  ${showGantt ? `<section class="wide"><h3>턴 타임라인</h3><p class="desc">요청 시각 → 응답 시각 구간 · 색은 카테고리 · 반투명은 다음 요청에 흡수된 턴, 원은 응답 없이 재전송된 요청</p>${catLegend}<div class="scroll">${gantt(rows)}</div></section>` : `<section class="wide"><h3>턴 타임라인</h3><p class="desc">턴이 ${rows.length}개라 타임라인은 생략합니다 (80개 이하일 때 표시). 일별 보고서에서 확인하세요.</p></section>`}
  <section class="wide"><h3>${CMP ? `이전 기간 대비 (${esc(prevRange.label)})` : '이전 기간 대비'}</h3><p class="desc">${CMP ? '증감 = (현재 − 이전) ÷ 이전' : '이전 기간 데이터가 없어 비교할 수 없습니다. 다음 날부터 자동으로 채워집니다.'}</p>${CMP ? htmlTable(cmpRows, [['지표', o => esc(o.metric)], ['현재', o => esc(o.current), 'num'], ['이전', o => esc(o.previous), 'num'], ['증감', o => esc(o.delta), 'num']]) : ''}</section>
</div>

<h2 class="type">턴 목록<small>모든 유형의 조인 키 · CSV: ${esc(stem)}.turns.csv</small></h2>
<div class="grid"><section class="wide">${htmlTable(turns, [['시각', o => esc(o.ts_req?.slice(11, 19)), 'num'], ['턴', o => esc(o.turn.replace(/^[^#]*#/, '#'))], ['카테고리', o => `<i class="dot" style="background:${catVar(o.category)}"></i>${esc(o.category)}`], ['소요', o => esc(o.elapsed), 'num'], ['도구', o => o.tools, 'num'], ['오류', o => o.errors, o => o.errors ? 'num bad' : 'num'], ['API', o => o.api_calls, 'num'], ['출력', o => kfmt(o.output_tokens), 'num'], ['적중', o => o.cache_hit == null ? '-' : pct(o.cache_hit, 1), 'num'], ['요청', o => esc(o.req), 'req']].map(c => [c[0], c[1], typeof c[2] === 'function' ? null : c[2], c[2]]).map(c => [c[0], o => c[1](o), c[2]]))}</section></div>
<footer>출처 work-history/*.jsonl (${esc(from)} ~ ${esc(to)}) · 생성 scripts/work-history-report.mjs --period ${esc(R.period)} · 통계 파일: ${written.map(esc).join(', ')}</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>
(function(){var tip=document.getElementById('tip');function show(e){var g=e.target.closest('.mark');if(!g||!g.dataset.tip){tip.style.display='none';return}tip.textContent=g.dataset.tip;tip.style.display='block';var x=e.clientX+14,y=e.clientY+14;if(x+tip.offsetWidth>innerWidth-8)x=e.clientX-tip.offsetWidth-14;if(y+tip.offsetHeight>innerHeight-8)y=e.clientY-tip.offsetHeight-14;tip.style.left=x+'px';tip.style.top=y+'px'}
document.querySelectorAll('.chart').forEach(function(c){c.addEventListener('mousemove',show);c.addEventListener('mouseleave',function(){tip.style.display='none'})})})();
</script>
`
written.push(w('report.html', html))
console.log(`${OUT}\n` + written.map(f => `  ${f}`).join('\n'))
