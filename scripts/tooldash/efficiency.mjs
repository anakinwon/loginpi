/**
 * efficiency.mjs — 도구 사용 효율 지표 집계 (Agent4)
 *   원천 ① 작업 이력 P/work-history/**.jsonl (턴 단위, 합산 규칙은 프로젝트 정본 loadRows 를 그대로 import)
 *   원천 ② 세션 기록 H/.claude/projects/<proj>/*.jsonl + <sid>/subagents/*.jsonl (API 호출 단위, 줄 단위 스트리밍, requestId 중복 제거)
 *   출력  S/efficiency_daily.json · S/efficiency_summary.md   실행: node efficiency.mjs [--project P] [--home H] [--out S]
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { execSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length))
import os from 'node:os'
const P = (args.project || process.env.TOOLDASH_PROJECT || process.cwd()).replace(/\\/g, '/')   // 프로젝트 루트 (기본값 = 현재 작업 폴더)
const H = (args.home || process.env.TOOLDASH_HOME || os.homedir()).replace(/\\/g, '/')          // 사용자 홈 (기본값 = OS 홈)
const S = args.out || path.dirname(fileURLToPath(import.meta.url))
const SESS_DIR = path.join(H, '.claude/projects', P.replace(/[:\/]/g, '-'))   // C:/Users/… → C--Users-…
const { loadRows, isTimed } = await import(pathToFileURL(path.join(P, 'scripts/work-history-stats.mjs')).href)

// ── 공통 유틸 ─────────────────────────────────────────────────────────────────
const kstDate = ts => new Date(new Date(ts).getTime() + 9 * 3600e3).toISOString().slice(0, 10)   // UTC → KST 날짜
const median = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2) }
const div = (a, b, d = 4) => (b ? +(a / b).toFixed(d) : null)
const KINDS = ['Agent', 'MCP', 'Skill', '기타']
const kindOf = n => n === 'Agent' ? 'Agent' : /^mcp__/.test(n) ? 'MCP' : n === 'Skill' ? 'Skill' : '기타'
const resultChars = c => typeof c === 'string' ? c.length : Array.isArray(c) ? c.reduce((s, p) => s + (typeof p?.text === 'string' ? p.text.length : 0), 0) : 0
const newDay = () => ({ tokens: { input: 0, output: 0, cache_creation: 0, cache_read: 0 }, side_tokens: 0, api_calls: 0, kinds: Object.fromEntries(KINDS.map(k => [k, { calls: 0, errors: 0, chars: 0, results: 0 }])) })

// ── ② 세션 기록 스트리밍 ───────────────────────────────────────────────────────
const sess = new Map()              // date → newDay()
const dayOf = d => { if (!sess.has(d)) sess.set(d, newDay()); return sess.get(d) }
const pending = new Map()           // tool_use_id → { date, kind }  (tool_result 와 짝짓기)
async function scanFile(file, sidechain, seen) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const l of rl) {
    if (!l) continue
    let j; try { j = JSON.parse(l) } catch { continue }
    const side = sidechain || !!j.isSidechain
    const content = Array.isArray(j.message?.content) ? j.message.content : []
    if (j.type === 'assistant') {
      const date = kstDate(j.timestamp || 0)
      const u = j.message?.usage, rid = j.requestId || j.message?.id || j.uuid
      if (u && rid && !seen.has(rid)) {                      // 스트리밍 조각은 requestId 공유 → 1회만 집계
        seen.add(rid)
        const d = dayOf(date), t = d.tokens
        t.input += u.input_tokens || 0; t.output += u.output_tokens || 0; t.cache_creation += u.cache_creation_input_tokens || 0; t.cache_read += u.cache_read_input_tokens || 0
        d.api_calls += 1
        if (side) d.side_tokens += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
      }
      for (const c of content) if (c.type === 'tool_use' && c.id && !pending.has(c.id)) { const k = kindOf(c.name || ''); pending.set(c.id, { date, kind: k }); dayOf(date).kinds[k].calls += 1 }
    } else if (j.type === 'user') {
      for (const c of content) if (c.type === 'tool_result' && c.tool_use_id) {
        const p = pending.get(c.tool_use_id); if (!p) continue
        const k = dayOf(p.date).kinds[p.kind]
        if (c.is_error) k.errors += 1
        k.chars += resultChars(c.content); k.results += 1
        pending.delete(c.tool_use_id)
      }
    }
  }
}
const mains = fs.readdirSync(SESS_DIR).filter(f => f.endsWith('.jsonl'))
for (const f of mains) {
  const sid = f.replace(/\.jsonl$/, ''), seen = new Set()          // requestId 중복 제거 범위 = 세션(메인+서브에이전트)
  await scanFile(path.join(SESS_DIR, f), false, seen)
  const sub = path.join(SESS_DIR, sid, 'subagents')
  if (fs.existsSync(sub)) for (const g of fs.readdirSync(sub).filter(x => x.endsWith('.jsonl'))) await scanFile(path.join(sub, g), true, seen)
}
const unpaired = pending.size          // 결과가 없는 도구 호출(중단 등) — 성공률 분모에서 제외

// ── ① 작업 이력 ────────────────────────────────────────────────────────────────
const rows = loadRows({ root: path.join(P, 'work-history') })
const wh = new Map()                   // date → rows[]
for (const r of rows) { if (!r.date) continue; if (!wh.has(r.date)) wh.set(r.date, []); wh.get(r.date).push(r) }

// ── 지표 계산 (일별·전체 공통) ──────────────────────────────────────────────────
function metrics(date, sd, wr) {
  const o = { date }
  const kinds = sd?.kinds, sum = f => kinds ? KINDS.reduce((a, k) => a + f(kinds[k]), 0) : 0
  const calls = sum(k => k.calls), results = sum(k => k.results), errors = sum(k => k.errors)
  o.calls = calls
  o.success_rate = results ? +(1 - errors / results).toFixed(4) : null
  o.success_by_kind = Object.fromEntries(KINDS.map(k => [k, kinds && kinds[k].results ? +(1 - kinds[k].errors / kinds[k].results).toFixed(4) : null]))
  const t = sd?.tokens, tokTotal = t ? t.input + t.output + t.cache_creation + t.cache_read : 0
  o.tokens_per_call = t ? div(tokTotal, calls, 0) : null
  o.cache_hit_rate = t ? div(t.cache_read, t.input + t.cache_creation + t.cache_read) : null
  o.output_ratio = t ? div(t.output, t.input + t.cache_creation + t.cache_read) : null
  o.sidechain_share = t ? div(sd.side_tokens, tokTotal) : null
  o.avg_result_chars_by_kind = Object.fromEntries(KINDS.map(k => [k, kinds && kinds[k].results ? Math.round(kinds[k].chars / kinds[k].results) : null]))
  // 작업 이력: 분모 = distinct 요청(session:turn). part 레코드 수는 분모 금지(WORK_METRICS §1)
  const turns = wr ? new Set(wr.map(r => r.id.replace(/\.\d+$/, ''))).size : 0
  const toolsWH = wr ? wr.reduce((a, r) => a + (r.tools_total || 0), 0) : 0
  const cost = wr ? +wr.reduce((a, r) => a + (r.cost_usd || 0), 0).toFixed(4) : null
  o.turns = turns
  o.calls_per_turn = wr ? div(toolsWH, turns, 2) : null
  o.cost_per_call_usd = wr ? div(cost, toolsWH) : null
  const verifiedTurns = wr ? new Set(wr.filter(r => r.verified === true).map(r => r.id.replace(/\.\d+$/, ''))).size : 0
  o.verified_rate = wr ? div(verifiedTurns, turns) : null
  const timed = wr ? wr.filter(isTimed) : []
  o.ttft_ms_median = median(timed.map(r => r.ttft_ms).filter(v => v != null))
  o.elapsed_ms_median = median(timed.map(r => r.elapsed_ms))
  o.tokens_total = tokTotal || null
  o.cost_usd = cost
  o.n = { api_calls: sd?.api_calls || 0, tool_results: results, tool_errors: errors, tools_work_history: toolsWH, timed_turns: timed.length, work_history_records: wr?.length || 0 }
  o.null_reasons = {}
  if (!sd) { const other = wr && wr.every(r => r.project && r.project !== path.basename(P)); for (const k of ['calls', 'success_rate', 'tokens_per_call', 'cache_hit_rate', 'output_ratio', 'sidechain_share', 'avg_result_chars_by_kind']) o.null_reasons[k] = other ? `다른 작업 장소 체크아웃(project=${wr[0].project}) 세션 — 이 PC 에 세션 기록 없음(작업 이력만 git 으로 동기화됨)` : '세션 기록에 해당 날짜 API 호출 없음' }
  if (!wr) for (const k of ['calls_per_turn', 'cost_per_call_usd', 'verified_rate', 'ttft_ms_median', 'elapsed_ms_median', 'cost_usd']) o.null_reasons[k] = '작업 이력(work-history) 없음 — 로거 도입(2026-09-18) 이전'
  if (wr && !timed.length) o.null_reasons.ttft_ms_median = o.null_reasons.elapsed_ms_median = '완료 턴(timed) 0건'
  return o
}
const dates = [...new Set([...sess.keys(), ...wh.keys()])].sort()
const days = dates.map(d => metrics(d, sess.get(d), wh.get(d)))
// 전체: 세션 기록 합산 + 작업 이력 전체
const all = newDay()
for (const sd of sess.values()) { all.api_calls += sd.api_calls; all.side_tokens += sd.side_tokens; for (const k in sd.tokens) all.tokens[k] += sd.tokens[k]; for (const k of KINDS) for (const f in sd.kinds[k]) all.kinds[k][f] += sd.kinds[k][f] }
const overall = metrics('overall', all, rows.filter(r => r.date))

// ── 교차 검증: work-statistics/**/*.metrics.json · summary.json ──────────────────
function whCheck(wr) {   // metrics.json 과 같은 정의로 작업 이력에서 재계산
  const timed = wr.filter(isTimed), tools = wr.reduce((a, r) => a + (r.tools_total || 0), 0), errs = wr.reduce((a, r) => a + (r.tool_errors || 0), 0)
  const tk = wr.reduce((a, r) => { const t = r.tokens || {}; a.cr += t.cache_read || 0; a.ctx += t.context || 0; return a }, { cr: 0, ctx: 0 })
  return { error_rate: div(errs, tools), ttft_ms: median(timed.map(r => r.ttft_ms).filter(v => v != null)), cost_usd: +wr.reduce((a, r) => a + (r.cost_usd || 0), 0).toFixed(4), cache_hit: div(tk.cr, tk.ctx), tool_chars: wr.reduce((a, r) => a + (r.perf?.tool_chars || 0), 0), tools, p50_elapsed_ms: median(timed.map(r => r.elapsed_ms)) }
}
const cross = []
// 교차 검증 기준선: metrics.json 을 마지막으로 커밋한 시점의 work-history 트리(보고서와 같은 커밋에 묶임)를 git show 로 꺼내 같은 규칙으로 재계산
const git = a => { try { return execSync(`git ${a}`, { cwd: P, encoding: 'utf8', maxBuffer: 64 << 20 }).trim() } catch { return '' } }
const commitRows = new Map()
function rowsAtCommit(c) {
  if (commitRows.has(c)) return commitRows.get(c)
  const dir = path.join(S, '_wh_' + c.slice(0, 8))
  for (const f of git(`ls-tree -r --name-only ${c} -- work-history`).split(/\r?\n/).filter(f => f.endsWith('.jsonl'))) { const out = path.join(dir, path.relative('work-history', f)); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, git(`show ${c}:${f}`) + '\n') }
  const rows = fs.existsSync(dir) ? loadRows({ root: dir }) : []; commitRows.set(c, rows); return rows
}
const statRoot = path.join(P, 'work-statistics')
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
for (const f of walk(statRoot).filter(f => f.endsWith('.metrics.json'))) {
  const m = JSON.parse(fs.readFileSync(f, 'utf8')), { from, to } = m.range
  const wr = rows.filter(r => r.date >= from && r.date <= to); if (!wr.length) continue
  const c = whCheck(wr), stem = path.basename(f, '.metrics.json'), rel = path.relative(P, f).replace(/\\/g, '/')
  const commit = git(`log -1 --format=%H -- "${rel}"`), cAsOf = commit ? whCheck(rowsAtCommit(commit).filter(r => r.date >= from && r.date <= to)) : {}
  const fileVals = Object.fromEntries(Object.values(m.kpi_tree).flat().map(x => [x.metric, x.value]))
  const sumFile = f.replace(/\.metrics\.json$/, '.summary.json')
  const sm = fs.existsSync(sumFile) ? JSON.parse(fs.readFileSync(sumFile, 'utf8')).total : {}
  const pairs = [['error_rate', fileVals.error_rate], ['ttft_ms', fileVals.ttft_ms], ['cost_usd', fileVals.cost_usd], ['cache_hit', fileVals.cache_hit], ['tool_chars', fileVals.tool_chars], ['tools', sm.tools], ['p50_elapsed_ms', sm.p50_elapsed_ms]]
  for (const [k, fv] of pairs) { if (fv === undefined) continue; const cv = c[k]; const diff = fv == null || cv == null ? null : +(cv - fv).toFixed(4); const near = (a, b) => a != null && b != null && Math.abs(a - b) <= Math.abs(b) * 0.005; const match = near(cv, fv), matchAsOf = near(cAsOf[k], fv); cross.push({ file: rel, period: stem, generated_at: m.generated_at, metric: k, file_value: fv, computed: cv, diff, match, commit: commit.slice(0, 8) || null, computed_at_commit: cAsOf[k] ?? null, match_at_commit: matchAsOf, reason: match ? null : matchAsOf ? '보고서 생성(' + m.generated_at + ') 이후 작업 이력 레코드 추가 — 커밋 ' + commit.slice(0, 8) + ' 시점 트리로 재계산하면 일치' : '원인 미확인' }) }
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
const definitions = {
  calls: '도구 호출 수 = 세션 기록 assistant content 의 tool_use 블록 수(id 중복 제거, 메인+서브에이전트, Hook 은 tool_use 가 아니므로 자연 제외)',
  success_rate: '도구 호출 성공률 = 1 − is_error 인 tool_result 수 ÷ tool_result 수 (tool_use_id 로 짝지은 것만, 결과 없는 호출 ' + unpaired + '건 제외)',
  success_by_kind: '종류별 성공률: name Agent→Agent, mcp__*→MCP, Skill→Skill, 그 외→기타',
  calls_per_turn: '턴당 도구 호출 수 = Σ tools_total ÷ distinct 요청 수(session:turn) — 작업 이력',
  tokens_per_call: '호출당 토큰 = Σ(input+output+cache_creation+cache_read) ÷ 도구 호출 수 — 세션 기록, 같은 KST 날짜, requestId 중복 제거',
  cost_per_call_usd: '호출당 비용 = Σ cost_usd(core.costUsd, 메인 세션) ÷ Σ tools_total — 작업 이력',
  cache_hit_rate: '캐시 적중률 = cache_read ÷ (input + cache_creation + cache_read) — 세션 기록',
  output_ratio: '출력 비율 = output ÷ (input + cache_creation + cache_read) — 세션 기록',
  verified_rate: '검증률 = verified===true 인 요청 ÷ distinct 요청 — 작업 이력 (null 은 미검증으로 간주)',
  ttft_ms_median: '첫 토큰 지연 중앙값 = timed 턴(elapsed≠null·¬absorbed·¬superseded·¬incomplete) ttft_ms 중앙값 — 작업 이력',
  elapsed_ms_median: '턴 소요 중앙값 = timed 턴 elapsed_ms 중앙값 — 작업 이력',
  sidechain_share: '서브에이전트 비중 = isSidechain(subagents/*.jsonl) API 호출 토큰 ÷ 전체 토큰 — 세션 기록',
  avg_result_chars_by_kind: '종류별 평균 결과 길이 = tool_result content 문자 수(문자열 또는 text 파트 합) 평균',
  date: 'KST 기준 (세션 기록 timestamp UTC+9, 작업 이력 date 필드)',
}
const out = { generated_at: new Date().toISOString(), range: { session_records: { from: [...sess.keys()].sort()[0], to: [...sess.keys()].sort().at(-1), files: mains.length }, work_history: { from: [...wh.keys()].sort()[0], to: [...wh.keys()].sort().at(-1), records: rows.length } }, days, overall, cross_check: { metrics_json_vs_computed: cross, mismatches: cross.filter(c => !c.match).length, unexplained: cross.filter(c => !c.match && !c.match_at_commit).length }, definitions, unpaired_tool_uses: unpaired }
fs.mkdirSync(S, { recursive: true })
fs.writeFileSync(path.join(S, 'efficiency_daily.json'), JSON.stringify(out, null, 2))

const f4 = v => v == null ? '-' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4)) : String(v)
const pc = v => v == null ? '-' : (100 * v).toFixed(1) + '%'
const kindRow = (o, key) => KINDS.map(k => f4(o[key][k])).join(' / ')
const md = []
md.push('# 도구 사용 효율 지표 (Agent4)', '', `생성: ${out.generated_at} · 세션 기록 ${out.range.session_records.from} ~ ${out.range.session_records.to} (${mains.length} 세션) · 작업 이력 ${out.range.work_history.from} ~ ${out.range.work_history.to} (${rows.length} 레코드)`, '')
md.push('## 1. 전체 지표', '', '| 지표 | 값 | 원천 |', '|---|---|---|')
const O = overall
md.push(`| 도구 호출 수 | ${f4(O.calls)} | 세션 |`, `| 도구 호출 성공률 | ${pc(O.success_rate)} (오류 ${O.n.tool_errors}/${O.n.tool_results}) | 세션 |`, `| 종류별 성공률 (Agent/MCP/Skill/기타) | ${KINDS.map(k => pc(O.success_by_kind[k])).join(' / ')} | 세션 |`,
  `| 턴당 도구 호출 수 | ${f4(O.calls_per_turn)} (${O.n.tools_work_history}/${O.turns}) | 이력 |`, `| 호출당 토큰 | ${f4(O.tokens_per_call)} | 세션 |`, `| 호출당 비용(USD) | ${f4(O.cost_per_call_usd)} | 이력 |`,
  `| 캐시 적중률 | ${pc(O.cache_hit_rate)} | 세션 |`, `| 출력 비율 | ${pc(O.output_ratio)} | 세션 |`, `| 검증률 | ${pc(O.verified_rate)} | 이력 |`, `| 첫 토큰 지연 중앙값 | ${f4(O.ttft_ms_median)} ms | 이력 |`, `| 턴 소요 중앙값 | ${f4(O.elapsed_ms_median)} ms | 이력 |`,
  `| 서브에이전트 비중 | ${pc(O.sidechain_share)} | 세션 |`, `| 종류별 평균 결과 길이(자) | ${kindRow(O, 'avg_result_chars_by_kind')} | 세션 |`, `| 총 토큰 / 메인 비용 | ${f4(O.tokens_total)} / $${f4(O.cost_usd)} | 세션 / 이력 |`, '')
md.push('## 2. 일별 지표 (KST)', '', '| 날짜 | 호출 | 성공률 | Agent/MCP/Skill/기타 성공률 | 턴 | 턴당 호출 | 호출당 토큰 | 호출당 비용 | 캐시 적중 | 출력 비율 | 검증률 | TTFT p50 | 소요 p50 | 서브 비중 | 결과 길이 A/M/S/기타 |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const d of days) md.push(`| ${d.date} | ${f4(d.calls)} | ${pc(d.success_rate)} | ${KINDS.map(k => pc(d.success_by_kind[k])).join('/')} | ${d.turns || '-'} | ${f4(d.calls_per_turn)} | ${f4(d.tokens_per_call)} | ${f4(d.cost_per_call_usd)} | ${pc(d.cache_hit_rate)} | ${pc(d.output_ratio)} | ${pc(d.verified_rate)} | ${f4(d.ttft_ms_median)} | ${f4(d.elapsed_ms_median)} | ${pc(d.sidechain_share)} | ${kindRow(d, 'avg_result_chars_by_kind')} |`)
md.push('', '## 3. 교차 검증 (work-statistics metrics.json·summary.json vs 재계산)', '', `불일치 ${out.cross_check.mismatches} / ${cross.length}건 (허용 오차 0.5%) · 그중 보고서 커밋 시점 트리로 재계산하면 일치하는 것 ${cross.filter(c => !c.match && c.match_at_commit).length}건 · 원인 미확인 ${out.cross_check.unexplained}건`, '', '| 기간 | 지표 | 파일 값 | 재계산(현재) | 차이 | 일치 | 커밋 시점 재계산 | 사유 |', '|---|---|---|---|---|---|---|---|')
for (const c of cross) md.push(`| ${c.period} | ${c.metric} | ${f4(c.file_value)} | ${f4(c.computed)} | ${f4(c.diff)} | ${c.match ? 'O' : 'X'} | ${f4(c.computed_at_commit)}${c.match_at_commit ? ' O' : ''} | ${c.reason || ''} |`)
md.push('', '## 4. 계산 불가 항목과 사유', '')
const nullDays = days.filter(d => Object.keys(d.null_reasons).length)
const reasonGroups = new Map(); for (const d of nullDays) for (const [k, r] of Object.entries(d.null_reasons)) { const key = r; if (!reasonGroups.has(key)) reasonGroups.set(key, { keys: new Set(), dates: new Set() }); reasonGroups.get(key).keys.add(k); reasonGroups.get(key).dates.add(d.date) }
for (const [r, g] of reasonGroups) md.push(`- **${r}**: 지표 ${[...g.keys].join(', ')} — 날짜 ${g.dates.size}일 (${[...g.dates].slice(0, 3).join(', ')}${g.dates.size > 3 ? ' …' : ''})`)
md.push(`- 결과가 없는 도구 호출(tool_result 미도착, 중단·진행 중) ${unpaired}건은 성공률 분모에서 제외 (호출 수에는 포함)`)
md.push('- Hook 은 tool_use 블록이 아니므로 오류율·결과 길이 대상에서 자연 제외', '- 호출당 비용은 메인 세션 cost_usd 만 사용 (서브에이전트 비용 cost_agents_usd 는 작업 이력 agent 레코드 별도 — 정의에 없어 제외)')
md.push('', '## 5. 정의', '', ...Object.entries(definitions).map(([k, v]) => `- \`${k}\`: ${v}`))
fs.writeFileSync(path.join(S, 'efficiency_summary.md'), md.join('\n'))
console.log(`unexplained=${out.cross_check.unexplained} days=${days.length} calls=${O.calls} success=${O.success_rate} cache=${O.cache_hit_rate} tok/call=${O.tokens_per_call} cost/call=${O.cost_per_call_usd} verified=${O.verified_rate} ttft=${O.ttft_ms_median} mismatches=${out.cross_check.mismatches}/${cross.length} unpaired=${unpaired}`)
