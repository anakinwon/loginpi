// 5종 도구(Agent/MCP/Skill/Hook/Plugin) 일별 사용횟수 집계
// 원천 1: ~/.claude/projects/<proj>/*.jsonl + <session>/subagents/*.jsonl (줄 단위 스트리밍)
// 원천 2: <proj>/work-history/**/*.jsonl (교차 검증, id 기준 last-write-wins + 파트 델타 합산)
// 실행: node usage.mjs [--proj-dir D] [--work-dir W] [--out S]   (기본값은 아래 상수)
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const A = Object.fromEntries(process.argv.slice(2).map((v, i, a) => v.startsWith('--') ? [v.slice(2), a[i + 1]] : null).filter(Boolean))
import os from 'node:os'
const HOME = (process.env.TOOLDASH_HOME || os.homedir()).replace(/\\/g, '/')
const PROJECT = (process.env.TOOLDASH_PROJECT || process.cwd()).replace(/\\/g, '/')
// 세션 기록 폴더명 = 프로젝트 경로에서 영숫자 외 문자를 '-'로 바꾼 것 (Claude Code 규칙)
const PROJ_DIR = A['proj-dir'] || `${HOME}/.claude/projects/${PROJECT.replace(/[^A-Za-z0-9]/g, '-')}`
const WORK_DIR = A['work-dir'] || `${PROJECT}/work-history`
const OUT = A.out || path.dirname(fileURLToPath(import.meta.url))
const KST_MS = 9 * 3600e3
const PLUGIN_SKILL_RE = /^(ponytail|document-skills|example-skills|claude-mem|claude-code-setup|frontend-design):/
const PLUGIN_HOOK_RE = /plugins\/cache|PLUGIN_ROOT|ponytail|claude-mem|prior observations/i
const HOOK_EXEC_TYPES = new Set(['hook_success', 'hook_cancelled', 'async_hook_response'])   // 실행 레코드만 1회로 계수(additional_context·system_message 는 같은 실행의 파생 출력)

const kstDate = ts => ts ? new Date(new Date(ts).getTime() + KST_MS).toISOString().slice(0, 10) : null

/** tool_use 이름 → 종류·이름·상세·플러그인 여부 */
function classify(name, input = {}) {
  if (name === 'Agent' || name === 'Task') return { kind: 'Agent', name, detail: input.subagent_type || input.name || '', via_plugin: false }
  if (name.startsWith('mcp__')) { const srv = name.split('__')[1] || ''; return { kind: 'MCP', name: srv, detail: name, via_plugin: srv.startsWith('plugin_') } }
  if (name === 'Skill') { const sk = input.skill || ''; return { kind: 'Skill', name: sk, detail: sk, via_plugin: PLUGIN_SKILL_RE.test(sk) } }
  return { kind: '기타', name, detail: '', via_plugin: false }
}

/** 세션 기록 1파일 스트리밍 → 이벤트 배열 (tool_use.id 기준 중복 제거, tool_result 짝짓기) */
async function scanTranscript(file, session, sidechain) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  const seen = new Set(), pending = new Map(), events = []; let derived = 0
  for await (const line of rl) {
    if (!line.trim()) continue
    let r; try { r = JSON.parse(line) } catch { continue }
    const ts = r.timestamp, sc = sidechain || r.isSidechain === true
    const a = r.attachment
    if (a && a.hookName) {                                    // 훅 실행 레코드 1건 = 1회
      if (!HOOK_EXEC_TYPES.has(a.type)) { derived++; continue }
      const src = (a.command || '') + ' ' + (a.content || '').slice(0, 200) + ' ' + JSON.stringify(a.response || '').slice(0, 300)
      events.push({ ts, date: kstDate(ts), kind: 'Hook', name: a.hookName, detail: a.type, via_plugin: PLUGIN_HOOK_RE.test(src), session, sidechain: sc, is_error: a.type === 'hook_cancelled', result_chars: null })
      continue
    }
    const c = r.message && r.message.content
    if (!Array.isArray(c)) continue
    if (r.message.role === 'assistant') {
      for (const b of c) {
        if (b.type !== 'tool_use' || !b.id || seen.has(b.id)) continue
        seen.add(b.id)
        const ev = { ts, date: kstDate(ts), ...classify(b.name, b.input), session, sidechain: sc, is_error: null, result_chars: null }
        events.push(ev); pending.set(b.id, ev)
      }
    } else if (r.message.role === 'user') {
      for (const b of c) {
        if (b.type !== 'tool_result') continue
        const ev = pending.get(b.tool_use_id); if (!ev) continue
        ev.is_error = b.is_error === true
        ev.result_chars = typeof b.content === 'string' ? b.content.length : Array.isArray(b.content) ? b.content.reduce((s, x) => s + (x.text || '').length, 0) : 0
        pending.delete(b.tool_use_id)
      }
    }
  }
  scanTranscript.derived = (scanTranscript.derived || 0) + derived
  return events
}

/** 작업 이력 교차 검증: id last-write-wins, part 델타 합산, fix 는 perf 만 보정(도구 수 무관)이라 제외, agent 레코드는 별도 열 */
function loadWorkHistory(root) {
  const files = fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).filter(f => f.endsWith('.jsonl')).map(f => path.join(root, f)) : []
  const byId = new Map(), agents = []
  for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim()) continue
    let r; try { r = JSON.parse(l) } catch { continue }
    if (r.fix) continue
    if (r.agent) { agents.push(r); continue }
    if (r.id) byId.set(r.id, r)
  }
  const days = {}
  const day = d => days[d] ||= { date: d, turns: 0, sessions: new Set(), tools_total: 0, tool_errors: 0, Agent: 0, MCP: 0, Skill: 0, Hook: 0, Plugin: 0, agent_tools: 0 }
  for (const r of byId.values()) {
    const d = day(r.date); d.turns++; d.sessions.add(r.session)
    d.tools_total += r.tools_total || 0; d.tool_errors += r.tool_errors || 0
    const t = r.tools || {}; d.Agent += (t.Agent || 0) + (t.Task || 0)
    d.MCP += Object.entries(t).filter(([k]) => k.startsWith('mcp__')).reduce((s, [, v]) => s + v, 0)
    d.Skill += t.Skill || 0
    const res = r.resources || {}
    d.Hook += (res.hooks || []).reduce((s, h) => s + (h.n || 0), 0)
    d.Plugin += (res.skills || []).filter(s => s.kind === 'p').reduce((s, x) => s + (x.n || 0), 0) + (res.mcp || []).filter(m => (m.name || '').startsWith('plugin_')).reduce((s, x) => s + (x.n || 0), 0)
  }
  for (const a of agents) { const d = day(a.date || (a.ts_start || '').slice(0, 10)); d.agent_tools += typeof a.tools === 'number' ? a.tools : 0 }
  return { files: files.length, days: Object.values(days).map(d => ({ ...d, sessions: d.sessions.size })).sort((x, y) => x.date.localeCompare(y.date)) }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const transcripts = fs.readdirSync(PROJ_DIR).filter(f => f.endsWith('.jsonl'))
  const subFiles = []
  for (const d of fs.readdirSync(PROJ_DIR)) { const p = path.join(PROJ_DIR, d, 'subagents'); if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (f.endsWith('.jsonl')) subFiles.push({ file: path.join(p, f), session: d.slice(0, 8) }) }
  let events = []
  for (const f of transcripts) { const ev = await scanTranscript(path.join(PROJ_DIR, f), f.slice(0, 8), false); process.stderr.write(`${f.slice(0, 8)} ${ev.length}\n`); events.push(...ev) }
  for (const s of subFiles) { const ev = await scanTranscript(s.file, s.session, true); process.stderr.write(`sub ${path.basename(s.file)} ${ev.length}\n`); events.push(...ev) }
  events = events.filter(e => e.date).sort((a, b) => a.ts.localeCompare(b.ts))
  fs.writeFileSync(path.join(OUT, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n')

  // 일별 집계
  const byDay = new Map(), byName = new Map(), kindTotal = { Agent: 0, MCP: 0, Skill: 0, Hook: 0, Plugin: 0, '기타': 0 }
  for (const e of events) {
    const d = byDay.get(e.date) || { date: e.date, sessions: new Set(), Agent: 0, MCP: 0, Skill: 0, Hook: 0, Plugin: 0, '기타': 0, total: 0, names: new Map() }
    byDay.set(e.date, d); d.sessions.add(e.session); d[e.kind]++; d.total++; kindTotal[e.kind]++
    if (e.via_plugin) { d.Plugin++; kindTotal.Plugin++ }
    const k = e.kind + '|' + e.name
    d.names.set(k, (d.names.get(k) || 0) + 1)
    const n = byName.get(k) || { kind: e.kind, name: e.name, count: 0, errors: 0, first: e.date, last: e.date }
    byName.set(k, n); n.count++; if (e.is_error) n.errors++; n.last = e.date
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    date: d.date, sessions: d.sessions.size, Agent: d.Agent, MCP: d.MCP, Skill: d.Skill, Hook: d.Hook, Plugin: d.Plugin, '기타': d['기타'], total: d.total,
    top: [...d.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => ({ name: k.split('|')[1], kind: k.split('|')[0], count: c }))
  }))
  const wh = loadWorkHistory(WORK_DIR)
  const daily = {
    range: { from: days[0]?.date, to: days.at(-1)?.date }, days,
    by_name: [...byName.values()].sort((a, b) => b.count - a.count),
    by_kind_total: kindTotal, work_history: wh.days,
    sources: { transcripts: transcripts.length, subagent_files: subFiles.length, work_history_files: wh.files }
  }
  fs.writeFileSync(path.join(OUT, 'usage_daily.json'), JSON.stringify(daily, null, 1))

  // 요약 md
  const hookDays = days.filter(d => d.Hook > 0).map(d => d.date)
  const L = []
  L.push('# 도구 사용횟수 집계 (세션 기록 기반)', '', `- 기간: ${daily.range.from} ~ ${daily.range.to} (활동일 ${days.length}일)`,
    `- 원천: 세션 기록 ${transcripts.length}개 + 서브에이전트 기록 ${subFiles.length}개 / 작업 이력 ${wh.files}개 파일`,
    `- 종류별 총합: ${Object.entries(kindTotal).map(([k, v]) => `${k} ${v}`).join(' · ')} (Plugin은 Skill·MCP·Hook 중 플러그인 제공분, 중복 속성)`, '')
  L.push('## 일별 집계', '', '| 날짜 | 세션 | Agent | MCP | Skill | Hook | Plugin | 기타 | 합계 |', '|---|---|---|---|---|---|---|---|---|')
  for (const d of days) L.push(`| ${d.date} | ${d.sessions} | ${d.Agent} | ${d.MCP} | ${d.Skill} | ${d.Hook} | ${d.Plugin} | ${d['기타']} | ${d.total} |`)
  L.push('', '## 상위 15개 도구 (기타 제외)', '', '| 순위 | 종류 | 이름 | 횟수 | 오류 | 최초 | 최근 |', '|---|---|---|---|---|---|---|')
  daily.by_name.filter(n => n.kind !== '기타').slice(0, 15).forEach((n, i) => L.push(`| ${i + 1} | ${n.kind} | ${n.name} | ${n.count} | ${n.errors} | ${n.first} | ${n.last} |`))
  L.push('', '## 상위 15개 도구 (기타 포함)', '', '| 순위 | 종류 | 이름 | 횟수 | 오류 |', '|---|---|---|---|---|')
  daily.by_name.slice(0, 15).forEach((n, i) => L.push(`| ${i + 1} | ${n.kind} | ${n.name} | ${n.count} | ${n.errors} |`))
  L.push('', '## 작업 이력(work-history) 대조', '', '세션 기록(T) vs 작업 이력(W). W는 id 기준 중복 제거 후 part 델타 합산, fix 레코드 제외(도구 수 미포함), agent 레코드의 도구 수는 별도 열. T의 총도구는 Hook 제외 tool_use 수.', '',
    '| 날짜 | 총도구 T(메인) | T(서브) | 총도구 W(메인) | W(에이전트) | Agent T/W | MCP T/W | Skill T/W | Hook T/W | Plugin T/W | 오류 T/W |', '|---|---|---|---|---|---|---|---|---|---|---|')
  for (const w of wh.days) {
    const t = days.find(d => d.date === w.date) || { total: 0, Hook: 0, Agent: 0, MCP: 0, Skill: 0, Plugin: 0 }
    const de = events.filter(e => e.date === w.date)
    const tErr = de.filter(e => e.is_error === true && e.kind !== 'Hook').length
    const tMain = de.filter(e => !e.sidechain && e.kind !== 'Hook').length
    const tSub = de.filter(e => e.sidechain && e.kind !== 'Hook').length
    L.push(`| ${w.date} | ${tMain} | ${tSub} | ${w.tools_total} | ${w.agent_tools} | ${t.Agent}/${w.Agent} | ${t.MCP}/${w.MCP} | ${t.Skill}/${w.Skill} | ${t.Hook}/${w.Hook} | ${t.Plugin}/${w.Plugin} | ${tErr}/${w.tool_errors} |`)
  }
  L.push('', '## 데이터 한계', '',
    `- 훅 레코드(attachment.hookName)가 존재하는 날: ${hookDays.length}일 (${hookDays[0]} ~ ${hookDays.at(-1)}). 그 외 날짜의 Hook=0은 기록 부재이며 미실행을 뜻하지 않음.`,
    `- 훅은 실행 레코드(hook_success·hook_cancelled·async_hook_response)만 1회로 계수. 같은 실행의 파생 레코드(hook_additional_context·hook_system_message) ${scanTranscript.derived || 0}건은 제외.`,
    '- 세션 기록에는 출력(stdout·additionalContext)이 있는 훅만 남음. 출력 없는 PreToolUse·PostToolUse 훅은 기록에 없어 작업 이력의 resources.hooks 수치와 차이가 남.',
    '- 훅 Plugin 판정: 훅 command 또는 content 앞 200자에 plugins/cache · PLUGIN_ROOT · ponytail · claude-mem · prior observations 가 있으면 플러그인. command·content 없는 훅 레코드는 판정 불가로 via_plugin=false.',
    '- 세션 기록의 Hook·도구는 서브에이전트 폴더 기록 포함(sidechain=true). 작업 이력은 2026-09-18 이후만 존재.',
    '- 날짜는 KST(UTC+9) 기준. 세션 수는 해당 날짜에 이벤트를 남긴 세션 UUID 앞 8자 기준(서브에이전트는 부모 세션에 귀속).',
    '- tool_result 미수신(세션 중단 등) 이벤트는 is_error=null, result_chars=null.')
  fs.writeFileSync(path.join(OUT, 'usage_summary.md'), L.join('\n') + '\n')
  console.log(JSON.stringify({ events: events.length, days: days.length, kindTotal, range: daily.range }))
}
main()
