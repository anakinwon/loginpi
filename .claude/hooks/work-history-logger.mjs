#!/usr/bin/env node
/**
 * work-history-logger — 요청(REQUEST)·응답(RESPONSE)을 Java 로그 형식 + 통계용 JSONL 로 남기는 하네스 훅 (2026-09-20 마스터 지시)
 *
 * 저장 (요청일자 기준, 로컬 시각 Asia/Seoul)
 *   <project>/work-history/YYYY/MM/YYYY-MM-DD.log    사람이 읽는 로그 (아래 줄 형식)
 *   <project>/work-history/YYYY/MM/YYYY-MM-DD.jsonl  통계용 — 턴(응답)당 1 레코드. 통계 유형 3종의 원천:
 *     ① tokens    { api_calls, input, cache_read, cache_create, output, thinking }   (requestId 로 중복 제거한 API 호출 합)
 *     ② resources { skills[{name,kind}], mcp[{name,kind}], agents[{name,n}], hooks[{name,event,n}], plugins[] }  kind: s=스킬 p=플러그인 m=독립 MCP
 *     ③ perf      { turn_duration_ms(하네스 측정), tool_ms(도구 소요 합), hook_ms(Stop 훅 소요 합), out_tps(출력 토큰/초) }
 *     + category·elapsed_ms·tools·steps 등 기존 필드.  집계: pnpm work:stats / pnpm work:report
 * 출처: Claude Code 세션 기록(transcript JSONL)
 * 등록: .claude/settings.json Stop + SessionEnd →  node "$CLAUDE_PROJECT_DIR/.claude/hooks/work-history-logger.mjs"
 * 소급: node work-history-logger.mjs --backfill <transcript.jsonl>   (append 이므로 재생성 시 해당 날짜 .log/.jsonl 먼저 삭제)
 *
 * 카테고리 — 요청문 키워드 규칙을 위에서부터 첫 일치로 판정. 요청문에 `#cat:NAME` 을 쓰면 강제.
 *   GIT · DEPLOY · INSTALL · FIX · TEST · DATA · REFACTOR · CONFIG · DOCS · FEATURE · QUERY · OTHER
 *
 * 줄 형식
 *   [yyyy-MM-dd HH:mm:ss.SSS] SESSION  sess=xxxxxxxx model=... cwd=$WORKSPACE_ROOT/loginpi
 *   [yyyy-MM-dd HH:mm:ss.SSS] REQUEST  #NN [CATEGORY] ────   (다음 줄부터 "    > " 요청 전문; 턴 도중 메시지는 "(mid-turn)")
 *   [yyyy-MM-dd HH:mm:ss.SSS] STEP     #NN Tool 요약 → OK|ERROR 1.2s
 *   [yyyy-MM-dd HH:mm:ss.SSS] NOTE     #NN 중간 서술 첫 줄
 *   [yyyy-MM-dd HH:mm:ss.SSS] COMMAND  #NN /명령 …            (로컬 내장 슬래시 명령)
 *   [yyyy-MM-dd HH:mm:ss.SSS] EVENT    #NN 백그라운드 작업 알림 등
 *   [yyyy-MM-dd HH:mm:ss.SSS] RESPONSE #NN [CATEGORY] elapsed 06m20s | tools 11 (Bash 10, Skill 1) | errors 0   (다음 줄부터 "    < " 응답 전문)
 *   [yyyy-MM-dd HH:mm:ss.SSS] TOKENS   #NN api 12 · in 1.2k · cache-read 1.8M · cache-new 60k · out 15k (thinking 4k) · cache-hit 96.8% · out 12.3 tok/s
 *   [yyyy-MM-dd HH:mm:ss.SSS] USAGE    #NN skills task-observer(s) · mcp gemini(m) · agents - · plugins - · hooks 24 (PreToolUse 12, PostToolUse 10)
 *
 * 경로 치환: 로그에 쓰는 모든 텍스트에서 워크스페이스 루트(env WORKSPACE_ROOT, 없으면 프로젝트의 부모)를 `$WORKSPACE_ROOT` 로 바꾼다.
 * 상태: %TEMP%/work-history-state/<session_id>.json — Stop 마다 처리한 줄 수 이후만 읽어 중복 없이 이어 쓴다. 실패해도 항상 exit 0, stdout 무출력.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..', '..')
const WORKSPACE_ROOT = (process.env.WORKSPACE_ROOT || path.dirname(PROJECT)).replace(/\\/g, '/').replace(/\/+$/, '')
const LOG_ROOT = process.env.WORK_HISTORY_DIR || path.join(PROJECT, 'work-history')
const STATE_DIR = path.join(os.tmpdir(), 'work-history-state')
const TZ = 'Asia/Seoul'

// ── 카테고리 규칙 ───────────────────────────────────────────────────────────────
const CATEGORY_RULES = [
  ['GIT',      /커밋|푸시|\bpush\b|\bcommit\b|\bmerge\b|\brebase\b|브랜치|\bbranch\b|\bPR\b/i],
  ['DEPLOY',   /배포|\bdeploy|승격|\bpromote|\brelease\b/i],
  ['INSTALL',  /설치|\binstall|걸치|\bnpm i\b|\bpnpm add\b|\bnpx skills add\b/i],
  ['FIX',      /수정해|고쳐|버그|\bbug\b|오류|에러|\berror\b|\bfix\b|안\s?돼|안\s?됨|깨졌|깨진/i],
  ['TEST',     /테스트|\btest|검증해|\bverify|점검해/i],
  ['DATA',     /마이그레이션|\bmigration|\bDDL\b|테이블|\bschema\b|\bSQL\b|컬럼/i],
  ['REFACTOR', /리팩토|\brefactor|정리해|단순화|\bsimplif|재구성/i],
  ['CONFIG',   /설정|등록|반영|\bconfig|\bhook|훅|환경변수|전역변수|\benv\b|CLAUDE\.md|settings|권한|구분해|표기|항상|앞으로|원칙|지시/i],
  ['DOCS',     /문서|\bdocs?\b|README|메모리|기록|로그|이력|\bPRD\b|주석|정리해\s?줘|통계/i],
  ['FEATURE',  /만들어|구현|추가해|생성해|\bbuild\b|\bimplement|\bcreate\b|개발해|그려/i],
  ['QUERY',    /보여|알려|확인해|뭐야|무엇|어떻게|왜\b|설명해|표시해|찾아|\blist\b|\bshow\b|\bexplain|\bwhat\b|\bhow\b|\bwhy\b|\?\s*$/i],
]
function categorize(text, tools) {
  const forced = text.match(/#cat:([A-Za-z]+)/)
  if (forced) return { category: forced[1].toUpperCase(), tags: [forced[1].toUpperCase()], rule: 'forced' }
  const plain = text.replace(/(?:[A-Za-z]:|\$WORKSPACE_ROOT|~)[\\/][^\s"'`)]*/g, ' ')   // 경로 문자열은 키워드 판정에서 제외 (예: sql\work-statistics 의 "sql")
  const tags = []
  let rule = null
  for (const [cat, re] of CATEGORY_RULES) {
    const m = plain.match(re)
    if (m) { tags.push(cat); if (!rule) rule = `kw:${m[0].trim().slice(0, 20)}` }
  }
  if (tags.length) return { category: tags[0], tags, rule }
  const names = Object.keys(tools || {})
  if (names.some(n => /^mcp__|^Skill$/.test(n)) && names.length === 1) return { category: 'QUERY', tags: ['QUERY'], rule: 'tool:single-lookup' }
  return { category: 'OTHER', tags: ['OTHER'], rule: 'none' }
}

// ── 시각 ─────────────────────────────────────────────────────────────────────
const fmtParts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
function local(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (isNaN(d)) return '????-??-?? ??:??:??.???'
  return fmtParts.format(d).replace('T', ' ') + '.' + String(d.getMilliseconds()).padStart(3, '0')
}
const localIso = ts => local(ts).replace(' ', 'T') + '+09:00'
const dayOf = ts => local(ts).slice(0, 10)
const hourOf = ts => Number(local(ts).slice(11, 13))
const weekdayOf = ts => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(new Date(ts).getTime() + 9 * 3600e3).getUTCDay()]
const elapsed = ms => {
  if (!(ms >= 0)) return '?'
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${String(Math.floor(s / 60)).padStart(2, '0')}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}
const kfmt = n => { n = Number(n) || 0; return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(n) }

// ── 경로 치환 ─────────────────────────────────────────────────────────────────
const rootVariants = (() => {
  const r = WORKSPACE_ROOT
  const drive = r.match(/^([A-Za-z]):\//)
  const rest = r.replace(/^[A-Za-z]:\//, '')
  const forms = [r, r.replace(/\//g, '\\\\'), r.replace(/\//g, '\\')]
  if (drive) forms.push(`/${drive[1].toLowerCase()}/${rest}`, `/${drive[1].toUpperCase()}/${rest}`)
  return forms.map(f => new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m).replace(/^([A-Za-z])/, (m, d) => `[${d.toLowerCase()}${d.toUpperCase()}]`), 'g'))
})()
const subst = s => rootVariants.reduce((acc, re) => acc.replace(re, '$WORKSPACE_ROOT'), String(s ?? ''))

// ── 로그 출력 ─────────────────────────────────────────────────────────────────
function logFileFor(ts, ext = 'log') {
  const day = dayOf(ts)
  const [y, m] = day.split('-')
  const dir = path.join(LOG_ROOT, y, m)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${day}.${ext}`)
}
function line(file, ts, kind, turn, text) {
  const t = turn == null ? '' : ` #${String(turn).padStart(2, '0')}`
  fs.appendFileSync(file, subst(`[${local(ts)}] ${kind.padEnd(8)}${t} ${text}`) + '\n')
}
function block(file, prefix, text) {
  const body = String(text ?? '').replace(/\r/g, '').replace(/\n+$/, '')
  for (const l of body.split('\n')) fs.appendFileSync(file, subst(`    ${prefix} ${l}`) + '\n')
}
function record(file, obj) { fs.appendFileSync(file, JSON.stringify(obj) + '\n') }

// ── 도구 요약 / 리소스 종류 ──────────────────────────────────────────────────────
const rel = p => { if (typeof p !== 'string') return ''; const n = p.replace(/\\/g, '/'); const root = PROJECT.replace(/\\/g, '/'); return n.startsWith(root) ? n.slice(root.length + 1) : n }
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
function summarize(name, input = {}) {
  switch (name) {
    case 'Bash': case 'PowerShell': return `"${cut(input.description || input.command, 110)}"`
    case 'Skill': return `${input.skill}${input.args ? ' ' + cut(input.args, 60) : ''}`
    case 'Agent': return `${input.subagent_type || 'agent'} "${cut(input.description, 80)}"`
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return rel(input.file_path || input.notebook_path)
    case 'Grep': return `/${cut(input.pattern, 60)}/${input.path ? ' in ' + rel(input.path) : ''}`
    case 'Glob': return `${cut(input.pattern, 60)}${input.path ? ' in ' + rel(input.path) : ''}`
    case 'WebFetch': return cut(input.url, 100)
    case 'WebSearch': return `"${cut(input.query, 100)}"`
    case 'ToolSearch': return `"${cut(input.query, 80)}"`
    case 'AskUserQuestion': return `"${cut(input.questions?.[0]?.question, 100)}"`
    default: return cut(JSON.stringify(input), 110)
  }
}
// kind: s=스킬(프로젝트/사용자), p=플러그인 제공(스킬 "plugin:name", MCP "mcp__plugin_<P>_<S>__"), m=독립 MCP 서버(.mcp.json)
const skillRes = name => { const n = String(name).replace(/^\//, '').split(/\s+/)[0]; return n.includes(':') ? { name: n, kind: 'p', plugin: n.split(':')[0] } : { name: n, kind: 's' } }
const mcpRes = tool => { const m = tool.match(/^mcp__(.+?)__/); if (!m) return null; const pm = m[1].match(/^plugin_(.+)_[^_]+$/); return pm ? { name: pm[1], kind: 'p', plugin: pm[1] } : { name: m[1], kind: 'm' } }
const bump = (arr, key, make) => { let it = arr.find(x => x.name === key.name && (x.event || '') === (key.event || '')); if (!it) { it = { ...make, n: 0 }; arr.push(it) } it.n += 1; return it }

// ── 세션 기록 파싱 ─────────────────────────────────────────────────────────────
function readLines(file) { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) }
function parse(l) { try { return JSON.parse(l) } catch { return null } }
function userText(j) {
  const c = j.message?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c) && !c.some(b => b.type === 'tool_result')) return c.filter(b => b.type === 'text').map(b => b.text).join('\n')
  return null
}
function classifyPrompt(text) {
  const t = text.trim()
  if (!t || t.startsWith('<local-command-caveat>') || t.startsWith('<system-reminder>') || t.startsWith('<command-args>')) return null
  if (/^\[Request interrupted by user[^\]]*\]$/.test(t)) return null                  // 사용자 중단 표식 — 요청이 아님
  if (t.startsWith('<command-name>')) {
    const name = t.match(/<command-name>([^<]*)<\/command-name>/)?.[1]?.trim() || '?'
    const args = t.match(/<command-args>([^<]*)<\/command-args>/)?.[1]?.trim()
    return { kind: 'COMMAND', text: `${name}${args ? ' ' + args : ''}` }
  }
  if (t.startsWith('<local-command-stdout>')) {
    const out = t.replace(/<\/?local-command-stdout>/g, '').trim()
    return out && out !== '(no content)' ? { kind: 'COMMAND', text: `↳ ${cut(out, 160)}` } : null
  }
  if (t.startsWith('<task-notification>')) {
    const id = t.match(/<task-id>([^<]*)</)?.[1]
    const st = t.match(/<status>([^<]*)</)?.[1]
    const sum = t.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
    return { kind: 'EVENT', text: `background task ${id || ''} ${st || ''}: ${cut(sum, 140)}` }
  }
  return { kind: 'REQUEST', text: t }
}

// ── 상태 ─────────────────────────────────────────────────────────────────────
const emptyTokens = () => ({ api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0 })
const emptyRes = () => ({ skills: [], mcp: [], agents: [], hooks: [], plugins: [] })
const freshState = () => ({ line: 0, turn: 0, reqTs: null, sinceTs: null, responded: false, part: 0, midTurn: false, reqText: '', tools: {}, steps: [], tokens: emptyTokens(), seenReq: {}, res: emptyRes(), hookMs: 0, hookRuns: 0, turnDurationMs: null, file: null, announced: false })
function loadState(sid) { try { return { ...freshState(), ...JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${sid}.json`), 'utf8')) } } catch { return freshState() } }
function saveState(sid, st) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, `${sid}.json`), JSON.stringify(st)) }

// ── 본체: 미처리 항목을 턴 단위로 기록 ──────────────────────────────────────────
function processTranscript(transcript, sid, st, { final = false } = {}) {
  const all = readLines(transcript)
  if (all.length <= st.line) return st
  const fresh = all.slice(st.line).map(parse).filter(Boolean)
  const short = sid.slice(0, 8)

  const results = new Map()                                            // tool_use_id → {ok, ts}
  for (const l of all) {
    const j = parse(l)
    if (!j || j.type !== 'user' || !Array.isArray(j.message?.content)) continue
    for (const b of j.message.content) if (b.type === 'tool_result') results.set(b.tool_use_id, { ok: !b.is_error, ts: j.timestamp })
  }
  const model = (() => { for (const l of all) { const j = parse(l); if (j?.type === 'assistant' && j.message?.model) return j.message.model } return '?' })()

  let pendingText = null
  const notes = []
  let file = st.file
  const ensureFile = ts => { if (!file) file = logFileFor(ts); return file }
  const announce = (j, ts) => { if (st.announced) return; st.announced = true; line(ensureFile(ts), ts, 'SESSION', null, `sess=${short} model=${model} cwd=${(j.cwd || '').replace(/\\/g, '/')}`) }
  const flushNotes = () => { for (const n of notes) line(file, n.ts, 'NOTE', st.turn, cut(n.text.split('\n').find(x => x.trim()) || '', 200)); notes.length = 0 }
  const toolTotals = () => {
    const cnt = Object.entries(st.tools).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')
    const total = Object.values(st.tools).reduce((a, b) => a + b, 0)
    const errors = st.steps.filter(s => s.ok === false).length
    return { cnt, total, errors }
  }
  const plugins = () => [...new Set([...st.res.skills, ...st.res.mcp].filter(r => r.kind === 'p').map(r => r.plugin))]
  const resourcesOut = () => ({ skills: st.res.skills, mcp: st.res.mcp, agents: st.res.agents, hooks: st.res.hooks, plugins: plugins() })
  const perfOut = (elapsedMs) => {
    const tool_ms = st.steps.reduce((a, s) => a + (s.ms || 0), 0)
    return { turn_duration_ms: st.turnDurationMs, tool_ms, hook_ms: st.hookMs, hook_runs: st.hookRuns, out_tps: elapsedMs > 0 ? +(st.tokens.output / (elapsedMs / 1000)).toFixed(2) : null, tool_share: elapsedMs > 0 ? +(tool_ms / elapsedMs).toFixed(3) : null }
  }
  const baseRecord = (cat, extra) => {
    const { cnt, total, errors } = toolTotals()
    return { date: dayOf(st.reqTs), hour: hourOf(st.reqTs), weekday: weekdayOf(st.reqTs), session: short, model, turn: st.turn, part: st.part, mid_turn: !!st.midTurn, category: cat.category, tags: cat.tags, rule: cat.rule, ts_req: localIso(st.reqTs), tools_total: total, tools: st.tools, tool_errors: errors, skills: [...new Set(st.res.skills.map(r => r.name))], mcp: [...new Set(st.res.mcp.map(r => r.name))], agents: [...new Set(st.res.agents.map(r => r.name))], req_chars: st.reqText.length, req_head: subst(cut(st.reqText, 80)), tokens: { ...st.tokens, context: st.tokens.input + st.tokens.cache_read + st.tokens.cache_create, cache_hit: (st.tokens.input + st.tokens.cache_read + st.tokens.cache_create) ? +(st.tokens.cache_read / (st.tokens.input + st.tokens.cache_read + st.tokens.cache_create)).toFixed(4) : null }, resources: resourcesOut(), steps: st.steps, ...extra }
  }
  const usageLines = (ts) => {
    const t = st.tokens, ctx = t.input + t.cache_read + t.cache_create
    const elapsedMs = st.sinceTs ? new Date(ts) - new Date(st.sinceTs) : 0
    line(file, ts, 'TOKENS', st.turn, `api ${t.api_calls} · in ${kfmt(t.input)} · cache-read ${kfmt(t.cache_read)} · cache-new ${kfmt(t.cache_create)} · out ${kfmt(t.output)}${t.thinking ? ` (thinking ${kfmt(t.thinking)})` : ''} · cache-hit ${ctx ? (100 * t.cache_read / ctx).toFixed(1) : '-'}%${elapsedMs > 0 ? ` · out ${(t.output / (elapsedMs / 1000)).toFixed(1)} tok/s` : ''}`)
    const fmtRes = (arr, f) => arr.length ? arr.map(f).join(', ') : '-'
    const hooksByEvent = {}; for (const h of st.res.hooks) hooksByEvent[h.event] = (hooksByEvent[h.event] || 0) + h.n
    const hookTotal = Object.values(hooksByEvent).reduce((a, b) => a + b, 0)
    line(file, ts, 'USAGE', st.turn, `skills ${fmtRes(st.res.skills, r => `${r.name}(${r.kind})${r.n > 1 ? '×' + r.n : ''}`)} · mcp ${fmtRes(st.res.mcp, r => `${r.name}(${r.kind})${r.n > 1 ? '×' + r.n : ''}`)} · agents ${fmtRes(st.res.agents, r => `${r.name}${r.n > 1 ? '×' + r.n : ''}`)} · plugins ${plugins().join(', ') || '-'} · hooks ${hookTotal}${hookTotal ? ` (${Object.entries(hooksByEvent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}${st.hookMs ? ` · stop-hooks ${elapsed(st.hookMs)}` : ''}`)
  }
  const emitResponse = (why) => {
    if (!st.turn || !file) return
    const { cnt, total, errors } = toolTotals()
    const cat = categorize(st.reqText, st.tools)
    if (pendingText) {
      flushNotes()
      const since = st.responded && st.sinceTs ? st.sinceTs : st.reqTs
      const ms = new Date(pendingText.ts) - new Date(since)
      st.part += 1
      line(file, pendingText.ts, 'RESPONSE', st.turn, `${st.responded ? '(cont.) ' : ''}[${cat.category}] elapsed ${elapsed(ms)} | tools ${total}${cnt ? ` (${cnt})` : ''} | errors ${errors}`)
      block(file, '<', pendingText.text)
      usageLines(pendingText.ts)
      record(logFileFor(st.reqTs, 'jsonl'), baseRecord(cat, { ts_res: localIso(pendingText.ts), elapsed_ms: ms >= 0 ? ms : null, res_chars: pendingText.text.length, perf: perfOut(ms) }))
      st.responded = true
      pendingText = null
    } else if (!st.responded) {
      if (why === 'final') {
        flushNotes()
        line(file, new Date(), 'RESPONSE', st.turn, `[${cat.category}] (no final text — session ended before the turn completed) | tools ${total} | errors ${errors}`)
        usageLines(new Date())
        record(logFileFor(st.reqTs, 'jsonl'), baseRecord(cat, { part: st.part + 1, ts_res: null, elapsed_ms: null, res_chars: 0, perf: perfOut(0), incomplete: true }))
      } else if (why === 'next' && total === 0 && notes.length === 0) {
        line(file, st.reqTs, 'RESPONSE', st.turn, `[${cat.category}] (no response — superseded by the next request)`)
        record(logFileFor(st.reqTs, 'jsonl'), baseRecord(cat, { part: 1, ts_res: null, elapsed_ms: null, res_chars: 0, perf: perfOut(0), superseded: true }))
      } else if (why === 'next') {
        flushNotes()
        const toolMs = st.steps.reduce((a, s) => a + (s.ms || 0), 0)
        line(file, new Date(st.reqTs), 'RESPONSE', st.turn, `[${cat.category}] (no final text — work continued under the next request) | tools ${total}${cnt ? ` (${cnt})` : ''} | errors ${errors}`)
        usageLines(st.reqTs)
        record(logFileFor(st.reqTs, 'jsonl'), baseRecord(cat, { part: 1, ts_res: null, elapsed_ms: toolMs || null, res_chars: 0, perf: perfOut(toolMs), absorbed: true }))
      }
    }
  }
  const openTurn = (ts, text, mid) => {
    emitResponse('next')
    st.turn += 1; st.reqTs = ts; st.sinceTs = ts; st.responded = false; st.part = 0; st.midTurn = mid; st.reqText = text
    st.tools = {}; st.steps = []; st.tokens = emptyTokens(); st.seenReq = {}; st.res = emptyRes(); st.hookMs = 0; st.hookRuns = 0; st.turnDurationMs = null
    file = logFileFor(ts); st.file = file
    const cat = categorize(text, {})
    line(file, ts, 'REQUEST', st.turn, `${mid ? '(mid-turn) ' : ''}[${cat.category}] ${'─'.repeat(mid ? 36 : 45)}`)
    block(file, '>', text)
  }
  const ensureTurn = (ts) => { if (!st.turn) { st.turn = 1; st.reqTs = ts; st.sinceTs = ts; st.reqText = ''; file = ensureFile(ts); st.file = file } }

  for (const j of fresh) {
    const ts = j.timestamp || new Date().toISOString()
    if (j.type === 'assistant' && !j.isSidechain) {
      announce(j, ts)
      const rid = j.requestId || j.uuid                                     // 같은 API 호출의 블록들은 usage 가 동일 → 1회만 합산
      if (j.message?.usage && st.turn && !st.seenReq[rid]) {
        st.seenReq[rid] = 1
        const u = j.message.usage; const t = st.tokens
        t.api_calls += 1; t.input += u.input_tokens || 0; t.cache_read += u.cache_read_input_tokens || 0; t.cache_create += u.cache_creation_input_tokens || 0; t.output += u.output_tokens || 0; t.thinking += u.output_tokens_details?.thinking_tokens || 0
      }
      for (const b of j.message?.content || []) {
        if (b.type === 'tool_use') {
          if (pendingText) { notes.push(pendingText); pendingText = null }
          ensureTurn(ts)
          flushNotes()
          st.tools[b.name] = (st.tools[b.name] || 0) + 1
          if (b.name === 'Skill' && b.input?.skill) { const r = skillRes(b.input.skill); bump(st.res.skills, r, r) }
          if (b.name === 'Agent') { const n = String(b.input?.subagent_type || 'general-purpose'); bump(st.res.agents, { name: n }, { name: n }) }
          const mr = mcpRes(b.name); if (mr) bump(st.res.mcp, mr, mr)
          const r = results.get(b.id)
          const ms = r ? new Date(r.ts) - new Date(ts) : null
          st.steps.push({ t: b.name, ok: r ? r.ok : null, ms: ms >= 0 ? ms : null })
          const status = r ? `→ ${r.ok ? 'OK' : 'ERROR'} ${elapsed(ms)}` : '→ (pending)'
          line(file, ts, 'STEP', st.turn, `${b.name} ${summarize(b.name, b.input)} ${status}`)
        } else if (b.type === 'text' && b.text?.trim()) {
          if (pendingText) notes.push(pendingText)
          pendingText = { ts, text: b.text }
        }
      }
    } else if (j.type === 'attachment' && /^hook_/.test(j.attachment?.type || '') && st.turn) {   // 훅 실행 흔적 (hook_success / hook_additional_context …)
      const a = j.attachment; const name = String(a.hookName || a.hookEvent || a.type).replace(/:.*$/, ''); const ev = String(a.hookEvent || name)
      bump(st.res.hooks, { name, event: ev }, { name, event: ev })
    } else if (j.type === 'system' && st.turn) {
      if (j.subtype === 'stop_hook_summary' && Array.isArray(j.hookInfos)) { st.hookRuns += j.hookInfos.length; st.hookMs += j.hookInfos.reduce((a, h) => a + (h.durationMs || 0), 0) }
      if (j.subtype === 'turn_duration') { const v = Object.entries(j).find(([k, v]) => /duration/i.test(k) && typeof v === 'number'); if (v) st.turnDurationMs = v[1] }
    } else if (j.type === 'user' && !j.isMeta && !j.isSidechain) {
      const text = userText(j)
      if (text == null) continue
      const c = classifyPrompt(text)
      if (!c) continue
      announce(j, ts)
      if (c.kind === 'REQUEST') openTurn(ts, c.text, false)
      else { emitResponse('boundary'); st.sinceTs = ts; line(ensureFile(ts), ts, c.kind, st.turn || null, c.text) }
    } else if (j.type === 'queue-operation' && j.operation === 'remove' && j.reason === 'absorbed_mid_turn' && j.content) {
      openTurn(ts, j.content, true)
    }
  }
  emitResponse(final ? 'final' : 'stop')
  st.line = all.length; st.file = file
  return st
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
try {
  const argv = process.argv.slice(2)
  if (argv[0] === '--backfill') {
    const transcript = argv[1]
    const sid = path.basename(transcript, '.jsonl')
    const st = processTranscript(transcript, sid, freshState())
    saveState(sid, st)
    console.log(`backfilled ${sid}: ${st.turn} turns, ${st.line} lines -> ${st.file}`)
  } else {
    const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
    const sid = input.session_id, transcript = input.transcript_path
    if (sid && /^[\w-]+$/.test(sid) && transcript && fs.existsSync(transcript)) {
      const st = processTranscript(transcript, sid, loadState(sid), { final: input.hook_event_name === 'SessionEnd' })
      saveState(sid, st)
    }
  }
} catch (e) {
  try { fs.appendFileSync(path.join(os.tmpdir(), 'work-history-logger.err'), `${new Date().toISOString()} ${e?.stack || e}\n`) } catch {}
}
process.exit(0)
