#!/usr/bin/env node
/**
 * work-history-report v2 — 통계 유형별 파일 + SVG 차트 보고서 (10인 평가 반영: 비용 · 컨텍스트 차트 교체 · 모바일 폭 · aria · 인자 검증)
 *
 * 사용 (기간 4종: 일별 · 주별(ISO 월~일) · 월별 · 년도별, 각각 이전 기간 대비 증감 포함)
 *   pnpm work:report                          오늘 일별   → work-statistics/YYYY/MM/<YYYY-MM-DD>.*
 *   pnpm work:report --period week            이번 주     → work-statistics/YYYY/weekly/<YYYY-Www>.*
 *   pnpm work:report --period month           이번 달     → work-statistics/YYYY/MM/<YYYY-MM>.*
 *   pnpm work:report --period year            올해       → work-statistics/YYYY/<YYYY>.*
 *   pnpm work:report --period all             4종 일괄  (--date YYYY-MM-DD 로 기준일 지정)
 *   pnpm work:report --from A --to B [--out <dir>] [--help]
 *
 * 산출물 (stem = 날짜 또는 주/월/년)
 *   <stem>.summary.json/.md · <stem>.tokens.json/.csv/.md · <stem>.usage.json/.csv/.md · <stem>.performance.json/.csv/.md · <stem>.turns.csv
 *   <stem>.report.html   인라인 SVG 차트 (외부 의존성 0, 라이트/다크, 호버 툴팁, 표 뷰, 400px 폭 대응)
 * exit: 0 정상 · 1 인자 오류 · 2 레코드 없음
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRows, aggregate, tokensStats, usageStats, perfStats, compare, tables, toCsv, ms2, pct, kfmt, usd, listRows, isoWeek, fmtTok, fmtPerf, fmtCmp, parseArgs, PROJECT } from './work-history-stats.mjs'
import { categoryColorVar, CATEGORY_KEYS } from './work-history-core.mjs'

// ── 인자·기간 ───────────────────────────────────────────────────────────────
const HELP = `work-history-report — 통계 파일 + 차트 보고서
  --period day|week|month|year|all   (기본 day; --month 지정 시 month, --from 지정 시 range)
  --date YYYY-MM-DD                  기준일 (기본 오늘, Asia/Seoul)
  --month YYYY-MM | --from A --to B  기간 직접 지정
  --out <dir>                        출력 디렉터리 (기본 work-statistics/YYYY/MM 등)
  --help`
const { opt, errs } = parseArgs(process.argv.slice(2), { period: 'value', date: 'value', month: 'value', from: 'value', to: 'value', out: 'value', help: 'flag' })
if (opt.help) { console.log(HELP); process.exit(0) }
const period = opt.period || (opt.month ? 'month' : opt.from ? 'range' : 'day')
if (!['day', 'week', 'month', 'year', 'all', 'range'].includes(period)) errs.push(`--period 값 오류: ${period}`)
if (opt.date && !/^\d{4}-\d{2}-\d{2}$/.test(opt.date)) errs.push(`--date 형식 오류: ${opt.date}`)
if (opt.month && !/^\d{4}-\d{2}$/.test(opt.month)) errs.push(`--month 형식 오류: ${opt.month}`)
if (period === 'range' && !opt.from) errs.push('--from 이 필요합니다')
if (errs.length) { console.error(errs.join('\n') + '\n\n' + HELP); process.exit(1) }
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
function rangeFor(period, anchor) {
  const [y, m] = anchor.split('-').map(Number)
  if (period === 'day') return { period, from: anchor, to: anchor, stem: anchor, dir: [anchor.slice(0, 4), anchor.slice(5, 7)], label: anchor, sub: 'hour', prev: { from: addDays(anchor, -1), to: addDays(anchor, -1), label: addDays(anchor, -1) } }
  if (period === 'week') { const w = isoWeek(anchor); const pw = isoWeek(addDays(w.from, -7)); return { period, from: w.from, to: w.to, stem: w.key, dir: [w.key.slice(0, 4), 'weekly'], label: `${w.key} (${w.from} ~ ${w.to})`, sub: 'day', prev: { from: pw.from, to: pw.to, label: pw.key } } }
  if (period === 'month') { const pm = m === 1 ? [y - 1, 12] : [y, m - 1]; const mm = String(m).padStart(2, '0'), pmm = String(pm[1]).padStart(2, '0'); return { period, from: `${y}-${mm}-01`, to: `${y}-${mm}-${lastDay(y, m)}`, stem: `${y}-${mm}`, dir: [String(y), mm], label: `${y}-${mm}`, sub: 'day', prev: { from: `${pm[0]}-${pmm}-01`, to: `${pm[0]}-${pmm}-${lastDay(pm[0], pm[1])}`, label: `${pm[0]}-${pmm}` } } }
  if (period === 'year') return { period, from: `${y}-01-01`, to: `${y}-12-31`, stem: String(y), dir: [String(y)], label: String(y), sub: 'month', prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) } }
  const f = opt.from, t = opt.to || f; return { period: 'range', from: f, to: t, stem: `${f}_${t}`, dir: [f.slice(0, 4), f.slice(5, 7)], label: `${f} ~ ${t}`, sub: 'day', prev: null }
}
const anchor = opt.date || (opt.month ? `${opt.month}-01` : todayKst())
if (period === 'all') {
  const { spawnSync } = await import('node:child_process')
  for (const p of ['day', 'week', 'month', 'year']) { const r = spawnSync(process.execPath, [process.argv[1], '--period', p, '--date', anchor, ...(opt.out ? ['--out', opt.out] : [])], { stdio: 'inherit' }); if (r.status && r.status !== 2) process.exit(r.status) }
  process.exit(0)
}
const R = rangeFor(period, anchor); const { from, to, stem } = R
const OUT = path.resolve(PROJECT, opt.out || path.join('work-statistics', ...R.dir))

// ── 데이터 ────────────────────────────────────────────────────────────────────
const rows = loadRows({ from, to })
if (!rows.length) { console.error(`레코드 없음 (${from} ~ ${to})`); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })
for (const legacy of ['stats.json', 'stats.md', 'category.csv', 'tool.csv', 'hour.csv', 'day.csv']) { const p = path.join(OUT, `${stem}.${legacy}`); if (fs.existsSync(p)) fs.unlinkSync(p) }
const agg = aggregate(rows); const { total, axes } = agg
const TK = tokensStats(rows), US = usageStats(rows), PF = perfStats(rows)
const turns = listRows(rows)
const generatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
const prevRange = R.prev, prevRows = prevRange ? loadRows(prevRange) : []
const CMP = prevRows.length ? compare(PF.total, perfStats(prevRows).total) : null
const models = [...new Set(rows.map(r => r.model).filter(Boolean))]

// ── 통계 파일 ──────────────────────────────────────────────────────────────────
const w = (name, body) => { fs.writeFileSync(path.join(OUT, `${stem}.${name}`), body); return `${stem}.${name}` }
const written = []
const mdTable = (arr, drop = /_ms$|^steps$|cost_usd/) => { if (!arr?.length) return '_없음_'; const cols = Object.keys(arr[0]).filter(c => !drop.test(c)); return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...arr.map(o => `| ${cols.map(c => { const v = o[c]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v) }).join(' | ')} |`)].join('\n') }
const header = `생성: ${generatedAt} · 범위: ${from} ~ ${to} · 모델: ${models.join(', ') || '-'} · 출처: work-history/*.jsonl (v2, id 중복 제거·보정 병합)`
written.push(w('summary.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, total, axes, turns }, null, 2)))
written.push(w('summary.md', `# 요약 ${stem}\n\n${header}\n\n| 턴 | timed | 일수 | 세션 | 총 소요 | 평균 | 중앙 | 도구 | 오류 | 출력 토큰 | 비용 | 재전송 | 흡수 | 미완료 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n| ${total.turns} | ${total.n_timed} | ${total.days} | ${total.sessions} | ${ms2(total.elapsed_ms)} | ${ms2(total.avg_elapsed_ms)} | ${ms2(total.p50_elapsed_ms)} | ${total.tools} | ${total.errors} | ${kfmt(total.output)} | ${usd(total.cost_usd)} | ${total.superseded} | ${total.absorbed} | ${total.incomplete} |\n\n## 카테고리별\n\n${mdTable(tables(agg, 'category'))}\n\n## 시간대별\n\n${mdTable(tables(agg, 'hour'))}\n\n## 도구별 (호출 단위)\n\n${mdTable(tables(agg, 'tool'))}\n`))
written.push(w('tokens.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, ...TK }, null, 2)))
written.push(w('tokens.csv', toCsv([TK.total, ...TK.by.category.map(o => ({ ...o, key: `category:${o.key}` })), ...TK.by.hour.map(o => ({ ...o, key: `hour:${o.key}` })), ...TK.by.day.map(o => ({ ...o, key: `day:${o.key}` })), ...TK.by.model.map(o => ({ ...o, key: `model:${o.key}` }))])))
written.push(w('tokens.md', `# ① 토큰·비용 ${stem}\n\n${header}\n\n비용은 claude.com/pricing 공표 단가(캐시 생성은 1시간 TTL 요율)로 추정한 값이며 실제 청구와 다를 수 있다. output 에 thinking 포함.\n\n## 총계\n\n${mdTable(fmtTok([TK.total]))}\n\n출력 토큰 분포: p50 ${kfmt(TK.distribution.out_p50)} · p90 ${kfmt(TK.distribution.out_p90)} · max ${kfmt(TK.distribution.out_max)} · 컨텍스트 첫/끝 턴 ${kfmt(TK.distribution.ctx_first)} → ${kfmt(TK.distribution.ctx_last)}\n\n## 카테고리별\n\n${mdTable(fmtTok(TK.by.category))}\n\n## 모델별\n\n${mdTable(fmtTok(TK.by.model))}\n\n## 시간대별\n\n${mdTable(fmtTok(TK.by.hour))}\n\n## 턴별\n\n${mdTable(TK.turns.map(t => ({ turn: t.turn, ts_req: t.ts_req?.slice(11, 19), category: t.category, api_calls: t.api_calls, input: kfmt(t.input), cache_read: kfmt(t.cache_read), cache_new: kfmt(t.cache_create), output: kfmt(t.output), thinking: kfmt(t.thinking), cache_hit: t.cache_hit == null ? '-' : pct(t.cache_hit, 1), gen_tps: t.gen_tps ?? '-', cost: usd(t.cost_usd) })))}\n`))
written.push(w('usage.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, ...US }, null, 2)))
written.push(w('usage.csv', toCsv(US.items)))
written.push(w('usage.md', `# ② agent / mcp / skill / plugin / hook 사용 ${stem}\n\n${header}\n\n종류: s=스킬 · p=플러그인 제공 · m=독립 MCP 서버 · agent=서브에이전트 · hook=하네스 훅\n\n## 유형별\n\n${mdTable(US.byType)}\n\n## 종류별\n\n${mdTable(US.byKind)}\n\n## 리소스별\n\n${mdTable(US.items.filter(i => i.type !== 'hook').map(i => ({ ...i, avg: ms2(i.avg_ms), total: ms2(i.total_ms) })))}\n\n## 훅 이벤트별 (실행 ${US.hook_runs_total}회 · Stop 훅 소요 합 ${ms2(US.hook_ms_total)})\n\n${mdTable(US.hooksByEvent)}\n`))
written.push(w('performance.json', JSON.stringify({ range: { from, to }, generated_at: generatedAt, ...PF, compare_previous: CMP ? { previous_range: prevRange, metrics: CMP } : null }, null, 2)))
written.push(w('performance.csv', toCsv([PF.total, ...PF.by.category.map(o => ({ ...o, key: `category:${o.key}` })), ...PF.by.hour.map(o => ({ ...o, key: `hour:${o.key}` })), ...PF.by.day.map(o => ({ ...o, key: `day:${o.key}` })), ...PF.by.model.map(o => ({ ...o, key: `model:${o.key}` }))])))
written.push(w('performance.md', `# ③ 성능 비교 ${stem}\n\n${header}\n\n비율·평균 지표는 timed 레코드(응답이 완료된 턴)만으로 계산. gen tok/s = 출력 토큰 ÷ (소요 − 도구 − 훅 시간).\n\n## 총계·카테고리별\n\n${mdTable(fmtPerf([PF.total, ...PF.by.category]))}\n\n## 모델별\n\n${mdTable(fmtPerf(PF.by.model))}\n\n## 시간대별\n\n${mdTable(fmtPerf(PF.by.hour))}\n\n## 도구별 지연\n\n${mdTable(PF.tools.map(t => ({ tool: t.tool, calls: t.calls, errors: t.errors, error_rate: pct(t.error_rate, 1), avg: ms2(t.avg_ms), total: ms2(t.total_ms), share: pct(t.share_of_tool_time, 1) })))}\n\n## 이전 기간 대비${prevRange ? ` (${prevRange.label})` : ''}\n\n${CMP ? mdTable(fmtCmp(CMP)) : '_이전 기간 데이터 없음_'}\n\n## 턴별\n\n${mdTable(PF.turns.map(t => ({ turn: t.turn, ts_req: t.ts_req?.slice(11, 19), category: t.category, timed: t.timed ? 'y' : '', elapsed: ms2(t.elapsed_ms), turn_duration: ms2(t.turn_duration_ms), tool_time: ms2(t.tool_ms), tool_share: t.tool_share == null ? '-' : pct(t.tool_share, 1), hook_time: ms2(t.hook_ms), tools: t.tools, errors: t.errors, api_calls: t.api_calls, output: kfmt(t.output_tokens), gen_tps: t.gen_tps ?? '-', cache_hit: t.cache_hit == null ? '-' : pct(t.cache_hit, 1), cost: usd(t.cost_usd) })))}\n`))
written.push(w('turns.csv', toCsv(turns)))

// ── 차트 ───────────────────────────────────────────────────────────────────────
const KIND = { s: { label: '스킬 (s)', v: 'var(--s1)' }, p: { label: '플러그인 (p)', v: 'var(--s2)' }, m: { label: '독립 MCP (m)', v: 'var(--s3)' }, agent: { label: '에이전트', v: 'var(--s4)' } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const fmtNum = n => Number(n).toLocaleString()
const turnLabel = r => `#${String(r.turn).padStart(2, '0')}${r.part > 1 ? '.' + r.part : ''}`
const catVar = categoryColorVar
const svgOpen = (w, h, aria) => `<div class="scroll"><svg class="chart" viewBox="0 0 ${w} ${h}" style="min-width:${Math.min(w, 520)}px" role="img" aria-label="${esc(aria)}">`
const svgClose = '</svg></div>'
function hbar(items, { width = 560, rowH = 30, labelW = 150, valueFmt = v => fmtNum(v), aria = '가로 막대 차트' } = {}) {
  if (!items.length) return '<p class="desc">데이터 없음</p>'
  const max = Math.max(1, ...items.map(i => i.value)); const plotW = width - labelW - 210, height = items.length * rowH + 8
  const x = v => labelW + (v / max) * plotW
  let s = svgOpen(width, height + 18, aria)
  for (const t of [...new Set([0, 0.5, 1].map(f => +(max * f).toFixed(1)))]) s += `<line x1="${x(t)}" y1="0" x2="${x(t)}" y2="${height}" class="grid"/><text x="${x(t)}" y="${height + 14}" class="tick" text-anchor="middle">${valueFmt(t)}</text>`
  items.forEach((it, i) => { const y = i * rowH + 4, h = rowH - 10, bw = Math.max(0, x(it.value) - labelW); s += `<g class="mark" tabindex="0" data-tip="${esc(it.tip || `${it.label}: ${valueFmt(it.value)}`)}"><rect x="${labelW - 8}" y="${y - 3}" width="${plotW + 210}" height="${rowH - 4}" fill="transparent"/><text x="${labelW - 10}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${esc(it.label)}</text><rect x="${labelW}" y="${y}" width="${bw}" height="${h}" fill="${it.color}"/><rect x="${Math.max(labelW, labelW + bw - 4)}" y="${y}" width="${Math.min(4, bw)}" height="${h}" rx="3" fill="${it.color}"/><text x="${labelW + bw + 8}" y="${y + h / 2 + 4}" class="val">${valueFmt(it.value)}${it.sub ? ` <tspan class="sub">${esc(it.sub)}</tspan>` : ''}</text></g>` })
  return s + svgClose
}
function sbar(items, { width = 560, rowH = 26, labelW = 70, valueFmt = v => fmtNum(v), aria = '누적 가로 막대 차트' } = {}) {
  if (!items.length) return '<p class="desc">데이터 없음</p>'
  const tot = it => it.segs.reduce((a, s) => a + s.value, 0); const max = Math.max(1, ...items.map(tot)); const plotW = width - labelW - 150, height = items.length * rowH + 8; const x = v => (v / max) * plotW
  let s = svgOpen(width, height + 18, aria)
  for (const t of [...new Set([0, 0.5, 1].map(f => Math.round(max * f)))]) s += `<line x1="${labelW + x(t)}" y1="0" x2="${labelW + x(t)}" y2="${height}" class="grid"/><text x="${labelW + x(t)}" y="${height + 14}" class="tick" text-anchor="middle">${valueFmt(t)}</text>`
  items.forEach((it, i) => { const y = i * rowH + 4, h = rowH - 10; let cx = labelW; s += `<g class="mark" tabindex="0" data-tip="${esc(it.tip)}"><rect x="${labelW - 8}" y="${y - 3}" width="${plotW + 150}" height="${rowH - 4}" fill="transparent"/><text x="${labelW - 10}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${esc(it.label)}</text>`; for (const sg of it.segs) { const wv = x(sg.value); if (wv > 0) { s += `<rect x="${cx}" y="${y}" width="${Math.max(0, wv - 2)}" height="${h}" fill="${sg.color}"/>`; cx += wv } } s += `<text x="${labelW + x(tot(it)) + 8}" y="${y + h / 2 + 4}" class="val">${valueFmt(tot(it))}${it.sub ? ` <tspan class="sub">${esc(it.sub)}</tspan>` : ''}</text></g>` })
  return s + svgClose
}
function vbar(items, { width = 560, height = 200, color = 'var(--s1)', valueFmt = v => v, aria = '세로 막대 차트' } = {}) {
  if (!items.length) return '<p class="desc">데이터 없음</p>'
  const max = Math.max(1, ...items.map(i => i.value)), padL = 44, padB = 26, padT = 18; const plotW = width - padL - 12, plotH = height - padB - padT, n = items.length, slot = plotW / Math.max(1, n), bw = Math.min(44, slot * 0.6); const y = v => padT + plotH - (v / max) * plotH
  let s = svgOpen(width, height, aria)
  for (const f of [0, 0.5, 1]) { const v = Math.round(max * f); s += `<line x1="${padL}" y1="${y(v)}" x2="${width - 12}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${valueFmt(v)}</text>` }
  items.forEach((it, i) => { const cx = padL + slot * i + slot / 2, top = y(it.value), h = padT + plotH - top; s += `<g class="mark" tabindex="0" data-tip="${esc(it.tip || `${it.label}: ${valueFmt(it.value)}`)}"><rect x="${cx - slot / 2}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent"/><rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(0, h - 4)}" fill="${it.color || color}"/><rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.min(4, h)}" rx="3" fill="${it.color || color}"/><text x="${cx}" y="${top - 5}" class="val" text-anchor="middle">${valueFmt(it.value)}</text><text x="${cx}" y="${height - 8}" class="lbl" text-anchor="middle">${esc(it.label)}</text></g>` })
  return s + svgClose
}
function gantt(rs, { width = 1120, rowH = 24 } = {}) {
  const t = s => new Date(s).getTime()
  const ends = rs.map(r => r.ts_res ? t(r.ts_res) : t(r.ts_req) + Math.max(60e3, r.perf?.tool_ms || 0)), starts = rs.map((r, i) => r.part > 1 && r.ts_res ? ends[i] - (r.elapsed_ms || 0) : t(r.ts_req))
  const H = 3600e3, t0 = Math.floor(Math.min(...starts) / H) * H, t1 = Math.ceil(Math.max(...ends) / H) * H
  const padL = 52, padR = 16, labelW = 260, padT = 22, plotW = width - padL - padR - labelW, height = padT + rs.length * rowH + 8; const x = ms => padL + ((ms - t0) / (t1 - t0)) * plotW; const hh = ms => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
  let s = `<div class="scroll"><svg class="chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="턴 타임라인: 요청 시각부터 응답 시각까지">`
  for (let m = t0; m <= t1; m += H) s += `<line x1="${x(m)}" y1="${padT - 6}" x2="${x(m)}" y2="${height - 6}" class="grid"/><text x="${x(m)}" y="${padT - 10}" class="tick" text-anchor="middle">${hh(m)}</text>`
  rs.forEach((r, i) => { const y = padT + i * rowH + 4, h = rowH - 10, xs = x(starts[i]), xe = Math.max(xs + 2, x(ends[i])), col = catVar(r.category); const head = (r.req_head || '').replace(/\s+/g, ' ').slice(0, 30); const tip = `${turnLabel(r)} [${r.category}] ${r.ts_req.slice(11, 19)} → ${r.ts_res ? r.ts_res.slice(11, 19) : '-'} · ${ms2(r.elapsed_ms)} · 도구 ${r.tools_total} · 출력 ${kfmt(r.tokens?.output)} tok · ${usd(r.cost_usd)}${r.tool_errors ? ` · 오류 ${r.tool_errors}` : ''}${r.absorbed ? ' · 다음 요청에 흡수' : ''}${r.superseded ? ' · 재전송으로 대체' : ''}`; s += `<g class="mark" tabindex="0" data-tip="${esc(tip)}"><rect x="${padL - 4}" y="${y - 3}" width="${plotW + labelW + 8}" height="${rowH - 4}" fill="transparent"/><text x="${padL - 8}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${turnLabel(r)}</text>`; if (r.superseded) s += `<circle cx="${xs}" cy="${y + h / 2}" r="4" fill="none" stroke="${col}" stroke-width="2"/>`; else s += `<rect x="${xs}" y="${y}" width="${xe - xs}" height="${h}" fill="${col}" rx="2"${r.absorbed ? ' opacity="0.45"' : ''}/>`; s += `<text x="${xe + 8}" y="${y + h / 2 + 4}" class="val"><tspan class="sub">${r.elapsed_ms != null ? ms2(r.elapsed_ms) : (r.superseded ? '재전송' : '흡수')}</tspan> ${esc(head)}${r.mid_turn ? ' <tspan class="sub">(mid-turn)</tspan>' : ''}</text></g>` })
  return s + '</svg></div>'
}
const legendOf = pairs => `<ul class="legend">${pairs.map(([name, v]) => `<li><i style="background:${v}"></i>${esc(name)}</li>`).join('')}</ul>`
const catsPresent = CATEGORY_KEYS.filter(c => axes.category.some(a => a.key === c)).concat(axes.category.map(a => a.key).filter(k => !CATEGORY_KEYS.includes(k)))
const catLegend = legendOf(catsPresent.map(c => [c, catVar(c)]))
const htmlTable = (arr, cols) => `<div class="scroll"><table><thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${arr.map(o => `<tr>${cols.map(c => `<td class="${typeof c[2] === 'function' ? c[2](o) : (c[2] || '')}">${c[1](o)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

const SUB_LABEL = { hour: '시간대별', day: '일별', month: '월별' }
const subKey = R.sub, subFmt = k => subKey === 'hour' ? `${String(k).padStart(2, '0')}시` : subKey === 'month' ? String(k).slice(5) + '월' : String(k).slice(5)
const trendTurns = axes[subKey].map(a => ({ label: subFmt(a.key), value: a.turns, tip: `${a.key}: ${a.turns}턴 · 소요 ${ms2(a.elapsed_ms)} · 도구 ${a.tools} · 오류 ${a.errors} · ${usd(a.cost_usd)}` }))
const trendTokens = (TK.by[subKey] || []).map(a => ({ label: subFmt(a.key), value: a.output, tip: `${a.key}: 출력 ${kfmt(a.output)} · API ${a.api_calls} · 캐시 적중 ${pct(a.cache_hit, 1)} · ${usd(a.cost_usd)}` }))
const trendCost = (TK.by[subKey] || []).map(a => ({ label: subFmt(a.key), value: +(a.cost_usd || 0).toFixed(2), tip: `${a.key}: ${usd(a.cost_usd)} · 턴당 ${usd(a.cost_per_turn)}` }))
const showGantt = rows.length <= 80
// ① 토큰·비용
const tokTurnBars = rows.map(r => ({ label: turnLabel(r), value: r.tokens?.output || 0, color: catVar(r.category), tip: `${turnLabel(r)} [${r.category}] 출력 ${kfmt(r.tokens?.output)} (thinking ${kfmt(r.tokens?.thinking)}) · API ${r.tokens?.api_calls}회 · gen ${r.perf?.gen_tps ?? '-'} tok/s · ${usd(r.cost_usd)}` }))
const newCtxBars = rows.map(r => ({ label: turnLabel(r), segs: [{ value: r.tokens?.cache_create || 0, color: 'var(--s3)' }, { value: r.tokens?.input || 0, color: 'var(--s2)' }], sub: r.tokens?.cache_hit == null ? '' : `· 적중 ${pct(r.tokens.cache_hit, 1)}`, tip: `${turnLabel(r)} 신규 처리 ${kfmt((r.tokens?.cache_create || 0) + (r.tokens?.input || 0))} = 캐시 생성 ${kfmt(r.tokens?.cache_create)} + 신규 입력 ${kfmt(r.tokens?.input)} · 캐시 읽기 ${kfmt(r.tokens?.cache_read)} (적중 ${pct(r.tokens?.cache_hit, 1)}) · API ${r.tokens?.api_calls}회` }))
const costCatBars = TK.by.category.map(o => ({ label: o.key, value: +(o.cost_usd || 0).toFixed(2), sub: `· 턴당 ${usd(o.cost_per_turn)} · 출력 ${kfmt(o.output)}`, color: catVar(o.key), tip: `${o.key}: ${usd(o.cost_usd)} · 출력 ${kfmt(o.output)} · 캐시 읽기 ${kfmt(o.cache_read)} · 캐시 생성 ${kfmt(o.cache_create)}` }))
// ② 사용
const usageBars = US.items.filter(i => i.type !== 'hook' && i.type !== 'plugin').sort((a, b) => b.calls - a.calls).map(i => ({ label: `${i.name}${i.type === 'agent' ? '' : `(${i.kind})`}`, value: i.calls, sub: `· ${i.turns}턴${i.errors ? ` · 오류 ${i.errors}` : ''}${i.avg_ms != null ? ` · 평균 ${ms2(i.avg_ms)}` : ''}`, color: (KIND[i.kind] || KIND.agent).v, tip: `${i.type} ${i.name} [${(KIND[i.kind] || KIND.agent).label}]: ${i.calls}회 · ${i.turns}턴 · 오류 ${i.errors}${i.plugin ? ` · 플러그인 ${i.plugin}` : ''}` }))
const hookBars = US.hooksByEvent.map(h => ({ label: h.event, value: h.runs, sub: `· 훅 ${h.distinct}종`, color: 'var(--s7)', tip: `${h.event}: ${h.runs}회 실행 · ${h.distinct}종` }))
// ③ 성능
const perfCatBars = PF.by.category.filter(o => o.n_timed).map(o => ({ label: o.key, value: +((o.avg_elapsed_ms || 0) / 60000).toFixed(1), sub: `· 중앙 ${ms2(o.p50_elapsed_ms)} · n=${o.n_timed}`, color: catVar(o.key), tip: `${o.key}: 평균 ${ms2(o.avg_elapsed_ms)} · 중앙 ${ms2(o.p50_elapsed_ms)} · p90 ${ms2(o.p90_elapsed_ms)} · 최대 ${ms2(o.max_elapsed_ms)} · n=${o.n_timed}` }))
const shareBars = rows.filter(r => r.elapsed_ms > 0 && !r.absorbed).map(r => ({ label: turnLabel(r), segs: [{ value: Math.min(r.perf?.tool_ms || 0, r.elapsed_ms), color: 'var(--s2)' }, { value: Math.min(r.perf?.hook_ms || 0, Math.max(0, r.elapsed_ms - (r.perf?.tool_ms || 0))), color: 'var(--s7)' }, { value: Math.max(0, r.elapsed_ms - Math.min(r.perf?.tool_ms || 0, r.elapsed_ms) - (r.perf?.hook_ms || 0)), color: 'var(--s1)' }], sub: `· 도구 ${pct(r.perf?.tool_share, 1)}`, tip: `${turnLabel(r)} 소요 ${ms2(r.elapsed_ms)} = 도구 ${ms2(r.perf?.tool_ms)} + 훅 ${ms2(r.perf?.hook_ms)} + 모델·기타 ${ms2(r.elapsed_ms - (r.perf?.tool_ms || 0) - (r.perf?.hook_ms || 0))}` }))
const latencyBars = PF.tools.slice(0, 10).map(t => ({ label: t.tool.replace(/^mcp__/, 'mcp:').replace(/__.*$/, ''), value: +((t.avg_ms || 0) / 1000).toFixed(1), sub: `· ${t.calls}회 · 합계 ${ms2(t.total_ms)}${t.errors ? ` · 오류 ${t.errors}` : ''}`, color: 'var(--s1)', tip: `${t.tool}: 평균 ${ms2(t.avg_ms)} · 호출 ${t.calls} · 오류율 ${pct(t.error_rate, 1)} · 도구 시간 비중 ${pct(t.share_of_tool_time, 1)}` }))
const tpsBars = PF.by.category.filter(o => o.gen_tps != null).map(o => ({ label: o.key, value: o.gen_tps, sub: `· 턴당 출력 ${kfmt(o.avg_out_tokens)}`, color: catVar(o.key), tip: `${o.key}: gen ${o.gen_tps} tok/s (종단 ${o.out_tps ?? '-'}) · API ${o.avg_api_calls}회/턴 · 캐시 적중 ${pct(o.cache_hit, 1)}` }))
const kpi = [['턴', fmtNum(total.turns), `timed ${total.n_timed} · 세션 ${total.sessions}`], ['총 소요', ms2(total.elapsed_ms), `평균 ${ms2(total.avg_elapsed_ms)} · 중앙 ${ms2(total.p50_elapsed_ms)}`], ['비용 (추정)', usd(total.cost_usd), `턴당 ${usd(TK.total.cost_per_turn)}`], ['도구 호출', fmtNum(total.tools), `오류 ${total.errors} (${pct(total.errors, total.tools)})`], ['출력 토큰', kfmt(TK.total.output), `thinking ${kfmt(TK.total.thinking)} · p50 ${kfmt(TK.distribution.out_p50)}`], ['캐시 적중', pct(TK.total.cache_hit, 1), `신규 처리 ${kfmt(TK.total.cache_create + TK.total.input)}`]]

const html = `<meta charset="utf-8">
<title>작업 통계 ${stem}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{color-scheme:light;--bg:#f6f5f2;--surface:#fcfcfb;--line:#e4e2dc;--grid:#ebe9e3;--ink:#0b0b0b;--ink2:#52514e;--ink3:#8a8884;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#e34948;--s9:#7a5c2e;--s10:#2e7d8a;--s11:#8a6fb5;--other:#9a9893;--bad:#c0392b;
  --sans:"IBM Plex Sans KR",system-ui,"Malgun Gothic",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--s9:#b08a55;--s10:#4fa7b5;--s11:#a996d6;--other:#6f6e69;--bad:#e66767}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--s9:#b08a55;--s10:#4fa7b5;--s11:#a996d6;--other:#6f6e69;--bad:#e66767}
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
.chart .mark{cursor:default;outline:none}.chart .mark:hover rect:not([fill="transparent"]),.chart .mark:focus rect:not([fill="transparent"]),.chart .mark:hover circle{filter:brightness(1.12)}
.chart .mark:focus-visible rect[fill="transparent"]{stroke:var(--ink);stroke-width:1}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;padding:0;margin:0 0 10px;font-size:12px;color:var(--ink2)}
.legend i,.dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.scroll{overflow-x:auto;max-width:100%}
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
<header><h1>작업 통계 ${esc(stem)}</h1><span class="meta">${esc({ day: '일별', week: '주별', month: '월별', year: '년도별', range: '기간' }[R.period])} · ${esc(from)} ~ ${esc(to)} · 세션 ${total.sessions} · ${esc(models.join(', '))} · 생성 ${esc(generatedAt)}</span></header>
<div class="kpi">${kpi.map(([l, v, sub]) => `<div><span>${l}</span><b>${v}</b><small>${sub}</small></div>`).join('')}</div>

<h2 class="type">추이<small>${esc(SUB_LABEL[subKey])} · 기간 안의 흐름</small></h2>
<div class="grid">
  <section><h3>${esc(SUB_LABEL[subKey])} 턴 수</h3><p class="desc">요청 시각 기준 (Asia/Seoul)</p>${vbar(trendTurns, { aria: `${SUB_LABEL[subKey]} 턴 수` })}</section>
  <section><h3>${esc(SUB_LABEL[subKey])} 출력 토큰</h3><p class="desc">모델 생성 토큰 합</p>${vbar(trendTokens, { color: 'var(--s3)', valueFmt: kfmt, aria: `${SUB_LABEL[subKey]} 출력 토큰` })}</section>
  <section><h3>${esc(SUB_LABEL[subKey])} 비용 (USD, 추정)</h3><p class="desc">공표 단가 기준</p>${vbar(trendCost, { color: 'var(--s2)', valueFmt: v => `$${v}`, aria: `${SUB_LABEL[subKey]} 비용` })}</section>
</div>

<h2 class="type">① 토큰·비용<small>API 호출별 usage 를 턴 단위로 합산 · 비용은 claude.com/pricing 단가 추정(1시간 캐시 요율)</small></h2>
<div class="grid">
  <section><h3>턴별 출력 토큰</h3><p class="desc">모델이 생성한 토큰(thinking 포함) · 색은 카테고리</p>${catLegend}${hbar(tokTurnBars, { labelW: 60, rowH: 22, valueFmt: kfmt, aria: '턴별 출력 토큰' })}</section>
  <section><h3>턴별 신규 처리 토큰</h3><p class="desc">캐시 읽기를 제외한 실제 처리량 = 캐시 생성 + 신규 입력 · 오른쪽은 캐시 적중률</p>${legendOf([['캐시 생성', 'var(--s3)'], ['신규 입력', 'var(--s2)']])}${sbar(newCtxBars, { labelW: 60, rowH: 22, valueFmt: kfmt, aria: '턴별 신규 처리 토큰 (캐시 생성과 신규 입력)' })}</section>
  <section><h3>카테고리별 비용</h3><p class="desc">USD 추정 · 턴당 비용·출력 병기</p>${hbar(costCatBars, { valueFmt: v => `$${v}`, aria: '카테고리별 비용' })}</section>
  <section><h3>토큰·비용 표</h3><p class="desc">카테고리별 (전체 CSV: ${esc(stem)}.tokens.csv)</p>${htmlTable(fmtTok([TK.total, ...TK.by.category]), [['구분', o => esc(o.key)], ['턴', o => o.turns, 'num'], ['API', o => o.api_calls, 'num'], ['입력', o => o.input, 'num'], ['캐시 읽기', o => o.cache_read, 'num'], ['캐시 생성', o => o.cache_new, 'num'], ['출력', o => o.output, 'num'], ['thinking', o => o.thinking, 'num'], ['적중', o => o.cache_hit, 'num'], ['gen tok/s', o => o.gen_tps, 'num'], ['비용', o => o.cost, 'num']])}</section>
</div>

<h2 class="type">② 에이전트 · MCP · 스킬 · 플러그인 · 훅 사용<small>s=스킬 · p=플러그인 제공 · m=독립 MCP 서버(.mcp.json)</small></h2>
<div class="grid">
  <section><h3>리소스별 호출 수</h3><p class="desc">색은 종류 · 오른쪽은 사용 턴 수·오류·평균 소요</p>${legendOf(Object.values(KIND).map(k => [k.label, k.v]))}${hbar(usageBars, { labelW: 190, aria: '리소스별 호출 수' })}</section>
  <section><h3>훅 이벤트별 실행 수</h3><p class="desc">세션 기록의 hook 첨부 기준 · Stop 훅 소요 합 ${esc(ms2(US.hook_ms_total))}</p>${hbar(hookBars, { labelW: 170, aria: '훅 이벤트별 실행 수' })}</section>
  <section class="wide"><h3>사용 표</h3><p class="desc">유형별 개수·호출·사용 턴 (전체 CSV: ${esc(stem)}.usage.csv)</p>${htmlTable(US.byType, [['유형', o => esc(o.type)], ['종류 수', o => o.distinct, 'num'], ['호출', o => o.calls, 'num'], ['사용 턴', o => o.turns_using, 'num']])}</section>
</div>

<h2 class="type">③ 성능 비교<small>timed 레코드 기준 · gen tok/s = 출력 ÷ (소요 − 도구 − 훅) · 이전 기간(${esc(prevRange?.label || '-')}) 대비</small></h2>
<div class="grid">
  <section><h3>카테고리별 평균 소요 (분)</h3><p class="desc">요청→응답 · 중앙값·표본 수 병기</p>${hbar(perfCatBars, { valueFmt: v => `${v}분`, aria: '카테고리별 평균 소요 시간' })}</section>
  <section><h3>카테고리별 생성 속도 (gen tok/s)</h3><p class="desc">도구·훅 대기 제외한 순수 생성 속도</p>${hbar(tpsBars, { valueFmt: v => `${v}`, aria: '카테고리별 생성 속도' })}</section>
  <section><h3>턴별 소요 구성</h3><p class="desc">누적: 도구 실행 / 훅 / 모델·기타 · 오른쪽은 도구 비중</p>${legendOf([['도구 실행', 'var(--s2)'], ['훅', 'var(--s7)'], ['모델·기타', 'var(--s1)']])}${sbar(shareBars, { labelW: 60, rowH: 22, valueFmt: v => ms2(v), aria: '턴별 소요 구성 (도구, 훅, 모델)' })}</section>
  <section><h3>도구별 평균 지연 (초)</h3><p class="desc">호출 단위 평균 · 합계·오류 병기</p>${hbar(latencyBars, { valueFmt: v => `${v}s`, aria: '도구별 평균 지연' })}</section>
  ${showGantt ? `<section class="wide"><h3>턴 타임라인</h3><p class="desc">요청 시각 → 응답 시각 구간 · 색은 카테고리 · 반투명은 다음 요청에 흡수된 턴, 원은 응답 없이 재전송된 요청</p>${catLegend}${gantt(rows)}</section>` : `<section class="wide"><h3>턴 타임라인</h3><p class="desc">턴이 ${rows.length}개라 타임라인은 생략합니다 (80개 이하일 때 표시). 일별 보고서에서 확인하세요.</p></section>`}
  <section class="wide"><h3>${CMP ? `이전 기간 대비 (${esc(prevRange.label)})` : '이전 기간 대비'}</h3><p class="desc">${CMP ? '증감 = (현재 − 이전) ÷ 이전 · 표본이 작을 때(n<10) ±40% 안의 변동은 잡음일 수 있습니다' : '이전 기간 데이터가 없어 비교할 수 없습니다. 다음 기간부터 자동으로 채워집니다.'}</p>${CMP ? htmlTable(fmtCmp(CMP), [['지표', o => esc(o.metric)], ['현재', o => esc(o.current), 'num'], ['이전', o => esc(o.previous), 'num'], ['증감', o => esc(o.delta), 'num']]) : ''}</section>
</div>

<h2 class="type">턴 목록<small>모든 유형의 조인 키 · CSV: ${esc(stem)}.turns.csv</small></h2>
<div class="grid"><section class="wide">${htmlTable(turns, [['시각', o => esc(o.ts_req?.slice(11, 19)), 'num'], ['턴', o => esc(o.turn.replace(/^[^#]*#/, '#'))], ['카테고리', o => `<i class="dot" style="background:${catVar(o.category)}"></i>${esc(o.category)}`], ['소요', o => esc(o.elapsed), 'num'], ['도구', o => o.tools, 'num'], ['오류', o => o.errors, o => o.errors ? 'num bad' : 'num'], ['API', o => o.api_calls, 'num'], ['출력', o => kfmt(o.output_tokens), 'num'], ['적중', o => o.cache_hit == null ? '-' : pct(o.cache_hit, 1), 'num'], ['비용', o => usd(o.cost_usd), 'num'], ['상태', o => esc(o.flag)], ['요청', o => esc(o.req), 'req']])}</section></div>
<footer>출처 work-history/*.jsonl (${esc(from)} ~ ${esc(to)}) · 생성 scripts/work-history-report.mjs --period ${esc(R.period)} · 통계 파일: ${written.map(esc).join(', ')}</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>
(function(){var tip=document.getElementById('tip');function at(x,y){if(x+tip.offsetWidth>innerWidth-8)x=innerWidth-tip.offsetWidth-8;if(y+tip.offsetHeight>innerHeight-8)y=y-tip.offsetHeight-28;tip.style.left=x+'px';tip.style.top=y+'px'}
function show(g,x,y){if(!g||!g.dataset.tip){tip.style.display='none';return}tip.textContent=g.dataset.tip;tip.style.display='block';at(x,y)}
document.querySelectorAll('.chart').forEach(function(c){c.addEventListener('mousemove',function(e){show(e.target.closest('.mark'),e.clientX+14,e.clientY+14)});c.addEventListener('mouseleave',function(){tip.style.display='none'});c.addEventListener('focusin',function(e){var g=e.target.closest('.mark');if(!g)return;var b=g.getBoundingClientRect();show(g,b.left,b.bottom+6)});c.addEventListener('focusout',function(){tip.style.display='none'});c.addEventListener('touchstart',function(e){var g=e.target.closest('.mark');if(g){var t=e.touches[0];show(g,t.clientX+14,t.clientY+14)}},{passive:true})})})();
</script>
`
written.push(w('report.html', html))
console.log(`${OUT}\n` + written.map(f => `  ${f}`).join('\n'))
