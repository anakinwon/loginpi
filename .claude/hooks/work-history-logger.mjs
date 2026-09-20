#!/usr/bin/env node
/**
 * work-history-logger v2 — 요청(REQUEST)·응답(RESPONSE)을 Java 로그 형식 + 통계용 JSONL 로 남기는 하네스 훅
 * (2026-09-20 마스터 지시 → 10인 평가 반영 재구성: part 델타화 · 레코드 id/v · 사후 perf 보정 · 바이트 오프셋 증분 · 마스킹 · 점수제 분류 · 비용)
 *
 * 저장 (요청일자 기준, 로컬 시각 Asia/Seoul)
 *   <project>/work-history/YYYY/MM/YYYY-MM-DD.log    사람이 읽는 로그
 *   <project>/work-history/YYYY/MM/YYYY-MM-DD.jsonl  통계용. 레코드 종류:
 *     · 턴 레코드 { v, id:"<session_id>:<turn>.<part>", session, session_id, project, model, turn, part, category, tags, rule, confidence,
 *                  ts_req, ts_res, elapsed_ms, tokens{…}, cost_usd, resources{skills,mcp,agents,hooks,plugins}, perf{…}, steps[], … }
 *       part>1(이어진 응답) 은 **구간 델타** — 같은 턴의 part 를 합하면 턴 합계가 된다 (누적 아님)
 *     · 보정 레코드 { v, fix:true, id, perf:{turn_duration_ms, hook_ms, hook_runs} } — Stop 훅 종료 *뒤에* transcript 에 기록되는
 *       system.turn_duration / stop_hook_summary 를 다음 실행에서 해당 id 에 병합 (loadRows 가 merge)
 *   집계 시 id 기준 last-write-wins → 상태 유실로 재적재돼도 중복 없음
 * 출처: Claude Code 세션 기록(transcript JSONL). 상태: <project>/.omc/state/work-history/<session_id>.json { offset(bytes), turn, … }
 *       Stop 마다 offset 이후 바이트만 읽고(O(Δ)), 개행으로 끝나지 않은 마지막 줄은 다음 실행으로 보류.
 * 등록: .claude/settings.json Stop + SessionEnd →  node "$CLAUDE_PROJECT_DIR/.claude/hooks/work-history-logger.mjs"
 * 소급: node work-history-logger.mjs --backfill <transcript.jsonl>   (append — 재생성 시 해당 날짜 .log/.jsonl 먼저 삭제)
 * 마스킹: 모든 로그 텍스트·req_head 에 core.redact — 워크스페이스/홈/TEMP 경로, UUID, API 키·토큰·비밀번호 패턴. 도구 결과 본문은 기록하지 않는다.
 *         Bash 는 description 만(원본 명령 기록 안 함), 미등록 도구는 인자 **키 이름만** 기록.
 *
 * 줄 형식
 *   [ts] SESSION  sess=xxxxxxxx model=... project=loginpi
 *   [ts] REQUEST  #NN [잠정카테고리] ────   (다음 줄부터 "    > " 요청 전문)
 *   [ts] STEP     #NN Tool 요약 → OK|ERROR 1.2s
 *   [ts] NOTE     #NN 중간 서술 첫 줄
 *   [ts] COMMAND / EVENT
 *   [ts] RESPONSE #NN [확정카테고리 (req: 잠정)] elapsed 06m20s | tools 11 (Bash 10, Skill 1) | errors 0 | cost $0.31
 *   [ts] TOKENS   #NN api 12 · in 1.2k · cache-read 1.8M · cache-new 60k · out 15k (thinking 4k) · cache-hit 96.8% · gen 41.2 tok/s
 *   [ts] USAGE    #NN skills a(s) · mcp b(m) · agents - · plugins - · hooks 24 (PreToolUse 12, …)
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { SCHEMA_VERSION, categorize, costUsd, makeRedactor, kfmt, elapsed, usd } from '../../scripts/work-history-core.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..', '..')
const PROJECT_NAME = path.basename(PROJECT)
const WORKSPACE_ROOT = (process.env.WORKSPACE_ROOT || path.dirname(PROJECT)).replace(/\\/g, '/').replace(/\/+$/, '')
const LOG_ROOT = process.env.WORK_HISTORY_DIR || path.join(PROJECT, 'work-history')
const STATE_DIR = process.env.WORK_HISTORY_STATE_DIR || path.join(PROJECT, '.omc', 'state', 'work-history')
const TZ = 'Asia/Seoul'
const redact = makeRedactor({ workspaceRoot: WORKSPACE_ROOT })

// ── 시각 ─────────────────────────────────────────────────────────────────────
const fmtParts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
function local(ts) { const d = ts instanceof Date ? ts : new Date(ts); if (isNaN(d)) return '????-??-?? ??:??:??.???'; return fmtParts.format(d).replace('T', ' ') + '.' + String(d.getMilliseconds()).padStart(3, '0') }
const localIso = ts => local(ts).replace(' ', 'T') + '+09:00'
const dayOf = ts => local(ts).slice(0, 10)
const hourOf = ts => Number(local(ts).slice(11, 13))
const weekdayOf = ts => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(new Date(ts).getTime() + 9 * 3600e3).getUTCDay()]

// ── 로그 출력 ─────────────────────────────────────────────────────────────────
function logFileFor(ts, ext = 'log') { const day = dayOf(ts); const [y, m] = day.split('-'); const dir = path.join(LOG_ROOT, y, m); fs.mkdirSync(dir, { recursive: true }); return path.join(dir, `${day}.${ext}`) }
function line(file, ts, kind, turn, text) { const t = turn == null ? '' : ` #${String(turn).padStart(2, '0')}`; fs.appendFileSync(file, redact(`[${local(ts)}] ${kind.padEnd(8)}${t} ${text}`) + '\n') }
function block(file, prefix, text) { const body = String(text ?? '').replace(/\r/g, '').replace(/\n+$/, ''); fs.appendFileSync(file, body.split('\n').map(l => redact(`    ${prefix} ${l}`)).join('\n') + '\n') }   // 1회 append (동시 세션 인터리브 방지)
function record(file, obj) { fs.appendFileSync(file, JSON.stringify(obj) + '\n') }

// ── 도구 요약 / 리소스 종류 ──────────────────────────────────────────────────────
const rel = p => { if (typeof p !== 'string') return ''; const n = p.replace(/\\/g, '/'); const root = PROJECT.replace(/\\/g, '/'); return n.startsWith(root) ? n.slice(root.length + 1) : n }
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
function summarize(name, input = {}) {
  switch (name) {
    case 'Bash': case 'PowerShell': return `"${cut(input.description || '(no description)', 110)}"`
    case 'Skill': return `${input.skill}${input.args ? ' ' + cut(input.args, 60) : ''}`
    case 'Agent': return `${input.subagent_type || 'agent'} "${cut(input.description, 80)}"`
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return rel(input.file_path || input.notebook_path)
    case 'Grep': return `/${cut(input.pattern, 60)}/${input.path ? ' in ' + rel(input.path) : ''}`
    case 'Glob': return `${cut(input.pattern, 60)}${input.path ? ' in ' + rel(input.path) : ''}`
    case 'WebFetch': return cut(String(input.url || '').replace(/\?.*$/, '?…'), 100)
    case 'WebSearch': return `"${cut(input.query, 100)}"`
    case 'ToolSearch': return `"${cut(input.query, 80)}"`
    case 'AskUserQuestion': return `"${cut(input.questions?.[0]?.question, 100)}"`
    default: return `{${Object.keys(input || {}).join(', ')}}`            // 미등록 도구·MCP: 인자 키만
  }
}
const skillRes = name => { const n = String(name).replace(/^\//, '').split(/\s+/)[0]; return n.includes(':') ? { name: n, kind: 'p', plugin: n.split(':')[0] } : { name: n, kind: 's' } }
const mcpRes = tool => { const m = tool.match(/^mcp__(.+?)__/); if (!m) return null; const pm = m[1].match(/^plugin_(.+)_[^_]+$/); return pm ? { name: pm[1], kind: 'p', plugin: pm[1] } : { name: m[1], kind: 'm' } }
const bump = (arr, key, make) => { let it = arr.find(x => x.name === key.name && (x.event || '') === (key.event || '')); if (!it) { it = { ...make, n: 0 }; arr.push(it) } it.n += 1; return it }

// ── 세션 기록 파싱 ─────────────────────────────────────────────────────────────
function parse(l) { try { return JSON.parse(l) } catch { return null } }
/** offset(bytes) 이후를 읽어 완성된 줄만 반환. 개행 없이 끝난 꼬리는 보류(다음 실행에서 다시 읽음). */
function readFrom(file, offset) {
  const size = fs.statSync(file).size
  if (size <= offset) return { lines: [], next: offset }
  const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(size - offset)
  try { fs.readSync(fd, buf, 0, buf.length, offset) } finally { fs.closeSync(fd) }
  const text = buf.toString('utf8')
  const lastNl = text.lastIndexOf('\n')
  if (lastNl < 0) return { lines: [], next: offset }
  const complete = text.slice(0, lastNl)
  return { lines: complete.split('\n').filter(Boolean), next: offset + Buffer.byteLength(complete, 'utf8') + 1 }
}
function userText(j) { const c = j.message?.content; if (typeof c === 'string') return c; if (Array.isArray(c) && !c.some(b => b.type === 'tool_result')) return c.filter(b => b.type === 'text').map(b => b.text).join('\n'); return null }
function classifyPrompt(text) {
  const t = String(text || '').trim()
  if (!t || t.startsWith('<local-command-caveat>') || t.startsWith('<system-reminder>') || t.startsWith('<command-args>')) return null
  if (/^\[Request interrupted by user[^\]]*\]$/.test(t)) return null
  if (/^Another Claude session sent a message:|^<(teammate|agent)-message\b/.test(t)) {               // 서브에이전트·팀원 보고 = 이벤트 (사용자 요청 아님)
    const from = t.match(/(?:teammate_id|from)="([^"]+)"/)?.[1] || t.match(/<agent-message from="([^"]+)"/)?.[1] || 'agent'
    const summary = t.match(/summary="([^"]+)"/)?.[1] || t.match(/"result":"([^"]{0,120})/)?.[1]?.replace(/\\n/g, ' ') || t.replace(/<[^>]+>/g, ' ').replace(/^Another Claude session sent a message:\s*/, '').replace(/\s+/g, ' ').slice(0, 120)
    return { kind: 'EVENT', text: `agent report from ${from}: ${cut(summary, 140)}` }
  }
  if (t.startsWith('<command-name>')) { const name = t.match(/<command-name>([^<]*)<\/command-name>/)?.[1]?.trim() || '?'; const args = t.match(/<command-args>([^<]*)<\/command-args>/)?.[1]?.trim(); return { kind: 'COMMAND', text: `${name}${args ? ' ' + args : ''}` } }
  if (t.startsWith('<local-command-stdout>')) { const out = t.replace(/<\/?local-command-stdout>/g, '').trim(); return out && out !== '(no content)' ? { kind: 'COMMAND', text: `↳ ${cut(out, 160)}` } : null }
  if (t.startsWith('<task-notification>')) { const id = t.match(/<task-id>([^<]*)</)?.[1]; const st = t.match(/<status>([^<]*)</)?.[1]; const sum = t.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]; return { kind: 'EVENT', text: `background task ${id || ''} ${st || ''}: ${cut(sum, 140)}` } }
  return { kind: 'REQUEST', text: t }
}

// ── 상태 ─────────────────────────────────────────────────────────────────────
const emptyTokens = () => ({ api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0 })
const emptyRes = () => ({ skills: [], mcp: [], agents: [], hooks: [], plugins: [] })
const emptyPart = () => ({ tools: {}, steps: [], descriptions: [], writes: [], tokens: emptyTokens(), seenReq: {}, res: emptyRes(), hookMs: 0, hookRuns: 0, turnDurationMs: null, firstTextTs: null })
const freshState = () => ({ v: SCHEMA_VERSION, offset: 0, turn: 0, reqTs: null, sinceTs: null, prevResTs: null, responded: false, part: 0, midTurn: false, interrupted: false, reqText: '', reqCat: null, model: null, file: null, announced: false, lastEmitted: null, tdQueue: [], hkQueue: [], agentTurn: {}, agentSeen: {}, ...emptyPart() })
const statePath = sid => path.join(STATE_DIR, `${sid}.json`)
function loadState(sid) { try { const s = JSON.parse(fs.readFileSync(statePath(sid), 'utf8')); return { ...freshState(), ...s } } catch { return freshState() } }
function saveState(sid, st) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(statePath(sid), JSON.stringify(st)) }
function dropState(sid) { try { fs.unlinkSync(statePath(sid)) } catch {} }

// ── 본체 ─────────────────────────────────────────────────────────────────────
function processTranscript(transcript, sid, st, { final = false } = {}) {
  if (st.offset == null && st.line > 0) {                                  // v1 상태(line) → offset 마이그레이션 (1회 전체 읽기)
    const all = fs.readFileSync(transcript, 'utf8').split('\n'); st.offset = Buffer.byteLength(all.slice(0, st.line).join('\n') + '\n', 'utf8')
  }
  const { lines, next } = readFrom(transcript, st.offset || 0)
  if (!lines.length) return st
  const fresh = lines.map(parse).filter(Boolean)
  const short = sid.slice(0, 8)
  const results = new Map()                                              // 이번 구간의 tool_result (Stop 시점엔 턴의 결과가 모두 도착해 있음)
  const resultChars = c => typeof c === 'string' ? c.length : Array.isArray(c) ? c.reduce((a, p) => a + (typeof p?.text === 'string' ? p.text.length : typeof p?.source?.data === 'string' ? p.source.data.length : 0), 0) : 0
  for (const j of fresh) if (j.type === 'user' && Array.isArray(j.message?.content)) for (const b of j.message.content) if (b.type === 'tool_result') results.set(b.tool_use_id, { ok: !b.is_error, ts: j.timestamp, chars: resultChars(b.content) })
  const subagentsDir = path.join(path.dirname(transcript), sid, 'subagents')

  let pendingText = null
  const notes = []
  let file = st.file
  const ensureFile = ts => { if (!file) file = logFileFor(ts); return file }
  const announce = (j, ts) => { if (st.announced) return; st.announced = true; line(ensureFile(ts), ts, 'SESSION', null, `sess=${short} model=${st.model || '?'} project=${PROJECT_NAME}`) }
  const flushNotes = () => { for (const n of notes) line(file, n.ts, 'NOTE', st.turn, cut(n.text.split('\n').find(x => x.trim()) || '', 200)); notes.length = 0 }
  const totals = () => { const cnt = Object.entries(st.tools).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '); const total = Object.values(st.tools).reduce((a, b) => a + b, 0); const errors = st.steps.filter(s => s.ok === false).length; return { cnt, total, errors } }
  const plugins = () => [...new Set([...st.res.skills, ...st.res.mcp].filter(r => r.kind === 'p').map(r => r.plugin))]
  const evidence = () => ({ tools: st.tools, steps: st.steps, descriptions: st.descriptions })
  const usageLines = (ts, elapsedMs) => {
    const t = st.tokens, ctx = t.input + t.cache_read + t.cache_create
    const toolMs = st.steps.reduce((a, s) => a + (s.ms || 0), 0), genMs = elapsedMs > 0 ? Math.max(1, elapsedMs - toolMs - st.hookMs) : 0
    line(file, ts, 'TOKENS', st.turn, `api ${t.api_calls} · in ${kfmt(t.input)} · cache-read ${kfmt(t.cache_read)} · cache-new ${kfmt(t.cache_create)} · out ${kfmt(t.output)}${t.thinking ? ` (thinking ${kfmt(t.thinking)})` : ''} · cache-hit ${ctx ? (100 * t.cache_read / ctx).toFixed(1) : '-'}%${genMs ? ` · gen ${(t.output / (genMs / 1000)).toFixed(1)} tok/s` : ''}`)
    const fmtRes = (arr, f) => arr.length ? arr.map(f).join(', ') : '-'
    const byEv = {}; for (const h of st.res.hooks) byEv[h.event] = (byEv[h.event] || 0) + h.n
    const hookTotal = Object.values(byEv).reduce((a, b) => a + b, 0)
    line(file, ts, 'USAGE', st.turn, `skills ${fmtRes(st.res.skills, r => `${r.name}(${r.kind})${r.n > 1 ? '×' + r.n : ''}`)} · mcp ${fmtRes(st.res.mcp, r => `${r.name}(${r.kind})${r.n > 1 ? '×' + r.n : ''}`)} · agents ${fmtRes(st.res.agents, r => `${r.name}${r.n > 1 ? '×' + r.n : ''}`)} · plugins ${plugins().join(', ') || '-'} · hooks ${hookTotal}${hookTotal ? ` (${Object.entries(byEv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`)
  }
  const makeRecord = (cat, extra) => {
    const { total, errors } = totals()
    const t = st.tokens, ctx = t.input + t.cache_read + t.cache_create
    const toolMs = st.steps.reduce((a, s) => a + (s.ms || 0), 0)
    const el = extra.elapsed_ms
    const genMs = el > 0 ? Math.max(1, el - toolMs - st.hookMs) : null
    const part = extra.part ?? st.part
    const since = st.responded && st.sinceTs ? st.sinceTs : st.reqTs
    const ttft = st.firstTextTs ? Math.max(0, new Date(st.firstTextTs) - new Date(since)) : null
    const filesChanged = [...new Set(st.writes)]
    const lastWriteIdx = st.steps.map(s => /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(s.t)).lastIndexOf(true)
    const verified = filesChanged.length ? st.steps.slice(lastWriteIdx + 1).some(s => (s.t === 'Bash' || s.t === 'PowerShell') && /test|검증|verify|확인|check|run|실행|render|screenshot|--check|lint|build/i.test(s.d || '')) : null
    return {
      v: SCHEMA_VERSION, id: `${sid}:${st.turn}.${part}`, session: short, session_id: sid, project: PROJECT_NAME, model: st.model,
      date: dayOf(st.reqTs), hour: hourOf(st.reqTs), weekday: weekdayOf(st.reqTs), turn: st.turn, part, mid_turn: !!st.midTurn, ultrathink: /\bultrathink\b/i.test(st.reqText),
      category: cat.category, tags: cat.tags, rule: cat.rule, confidence: cat.confidence, category_req: st.reqCat?.category || null,
      ts_req: localIso(st.reqTs), ts_res: extra.ts_res ?? null, elapsed_ms: el ?? null, idle_ms: part <= 1 && st.prevResTs && !st.midTurn ? Math.max(0, new Date(st.reqTs) - new Date(st.prevResTs)) : null, ttft_ms: ttft,
      tools_total: total, tools: st.tools, tool_errors: errors, edit_calls: st.writes.length, files_changed: filesChanged.length, files: filesChanged.slice(0, 40), verified,
      skills: [...new Set(st.res.skills.map(r => r.name))], mcp: [...new Set(st.res.mcp.map(r => r.name))], agents: [...new Set(st.res.agents.map(r => r.name))],
      req_chars: st.reqText.length, res_chars: extra.res_chars ?? 0, req_head: redact(cut(st.reqText, 80)),
      tokens: { ...t, context: ctx, cache_hit: ctx ? +(t.cache_read / ctx).toFixed(4) : null }, cost_usd: costUsd(t, st.model),
      resources: { skills: st.res.skills, mcp: st.res.mcp, agents: st.res.agents, hooks: st.res.hooks, plugins: plugins() },
      perf: { turn_duration_ms: st.turnDurationMs, tool_ms: toolMs, hook_ms: st.hookMs, hook_runs: st.hookRuns, tool_chars: st.steps.reduce((a, s) => a + (s.chars || 0), 0), out_tps: el > 0 ? +(t.output / (el / 1000)).toFixed(2) : null, gen_tps: genMs ? +(t.output / (genMs / 1000)).toFixed(2) : null, tool_share: el > 0 ? +(toolMs / el).toFixed(3) : null },
      steps: st.steps.map(({ d, ...s }) => s), ...(st.interrupted ? { interrupted: true } : {}), ...(extra.flags || {}),
    }
  }
  // 서브에이전트 기록(<transcript dir>/<sid>/subagents/*.jsonl + .meta.json) → 디스패치한 턴에 귀속되는 agent 레코드 (Stop 마다 갱신, loadRows 가 agent_id 기준 last-write-wins 병합)
  const scanSubagents = () => {
    let dir; try { dir = fs.readdirSync(subagentsDir).filter(f => f.endsWith('.meta.json')) } catch { return }
    for (const mf of dir) {
      const base = path.join(subagentsDir, mf.replace(/\.meta\.json$/, ''))
      let meta, stat; try { meta = JSON.parse(fs.readFileSync(base + '.meta.json', 'utf8')); stat = fs.statSync(base + '.jsonl') } catch { continue }
      const agentId = mf.replace(/^agent-/, '').replace(/\.meta\.json$/, '')   // 파일명 agent-<agentId>.meta.json (agentId 는 'a'+이름+'-'+해시)
      const seen = st.agentSeen[agentId]; if (seen && seen.mtime === stat.mtimeMs && seen.size === stat.size) continue
      let text; try { text = fs.readFileSync(base + '.jsonl', 'utf8') } catch { continue }
      const firstTs = (text.match(/"timestamp":"([^"]+)"/) || [])[1] || null
      // 귀속 턴: ① 이미 매핑 ② toolUseId(일반 Agent) ③ name(팀원 에이전트: meta.name = Agent 호출의 name 인자) ④ 부모 에이전트의 턴 ⑤ 시작 시각이 속한 턴
      let turnId = st.agentTurn[agentId] || (meta.toolUseId && st.agentTurn['tu:' + meta.toolUseId]) || (meta.name && st.agentTurn['nm:' + meta.name]) || (meta.parentAgentId && st.agentTurn[meta.parentAgentId])
      if (!turnId && firstTs) { const starts = Object.entries(st.agentTurn).filter(([k]) => k.startsWith('ts:')).map(([k, v]) => [v, k.slice(3)]).sort(); for (const [ts, id] of starts) if (ts <= firstTs) turnId = id }
      if (!turnId) continue                                                // 아직 디스패치 턴을 모름(다음 Stop 에서 재시도)
      st.agentTurn[agentId] = turnId
      const tk = emptyTokens(); const seenReq = new Set(); let first = null, last = null, model = meta.model || null, tools = 0, errors = 0, outChars = 0
      for (const l of text.split('\n')) {
        if (!l) continue; let j; try { j = JSON.parse(l) } catch { continue }
        if (j.timestamp) { first = first || j.timestamp; last = j.timestamp }
        if (j.type === 'assistant') {
          if (j.message?.model) model = j.message.model
          const rid = j.requestId || j.uuid
          if (j.message?.usage && !seenReq.has(rid)) { seenReq.add(rid); const u = j.message.usage; tk.api_calls++; tk.input += u.input_tokens || 0; tk.cache_read += u.cache_read_input_tokens || 0; tk.cache_create += u.cache_creation_input_tokens || 0; tk.output += u.output_tokens || 0; tk.thinking += u.output_tokens_details?.thinking_tokens || 0 }
          for (const b of j.message?.content || []) { if (b.type === 'tool_use') tools++; else if (b.type === 'text') outChars += (b.text || '').length }
        } else if (j.type === 'user' && Array.isArray(j.message?.content)) for (const b of j.message.content) if (b.type === 'tool_result' && b.is_error) errors++
      }
      const nameFromTu = meta.toolUseId && st.agentTurn['name:' + meta.toolUseId]
      record(logFileFor(st.agentTurn['ts:' + turnId] || st.reqTs, 'jsonl'), { v: SCHEMA_VERSION, agent: true, id: turnId, agent_id: agentId, name: meta.name || nameFromTu || agentId.slice(0, 12), type: meta.customAgentType || meta.agentType || null, model, depth: meta.spawnDepth || 1, parent: meta.parentAgentId || null, ts_start: first ? localIso(first) : null, ts_end: last ? localIso(last) : null, wall_ms: first && last ? Math.max(0, new Date(last) - new Date(first)) : null, tokens: { ...tk, context: tk.input + tk.cache_read + tk.cache_create }, cost_usd: costUsd(tk, model), tools, errors, out_chars: outChars })
      st.agentSeen[agentId] = { mtime: stat.mtimeMs, size: stat.size }
    }
  }
  const resetPart = () => Object.assign(st, emptyPart())                  // part 델타: 방출 후 누적기 초기화 (agentTurn/agentSeen/fixQueue 는 턴·세션 단위라 유지)
  const emitResponse = (why) => {
    if (!st.turn || !file) return
    const { cnt, total, errors } = totals()
    const cat = categorize(st.reqText, evidence())
    const tag = cat.category + (st.reqCat && st.reqCat.category !== cat.category ? ` (req: ${st.reqCat.category})` : '')
    const cost = costUsd(st.tokens, st.model)
    if (pendingText) {
      flushNotes()
      const since = st.responded && st.sinceTs ? st.sinceTs : st.reqTs
      const ms = Math.max(0, new Date(pendingText.ts) - new Date(since))
      st.part += 1
      line(file, pendingText.ts, 'RESPONSE', st.turn, `${st.responded ? '(cont.) ' : ''}[${tag}] elapsed ${elapsed(ms)} | tools ${total}${cnt ? ` (${cnt})` : ''} | errors ${errors} | cost ${usd(cost)}`)
      block(file, '<', pendingText.text)
      usageLines(pendingText.ts, ms)
      const rec = makeRecord(cat, { ts_res: localIso(pendingText.ts), elapsed_ms: ms, res_chars: pendingText.text.length })
      record(logFileFor(st.reqTs, 'jsonl'), rec); emitted(rec)
      st.responded = true; st.sinceTs = pendingText.ts; st.prevResTs = pendingText.ts; pendingText = null
      resetPart()
    } else if (!st.responded) {
      if (why === 'final') {
        flushNotes(); const now = new Date()
        line(file, now, 'RESPONSE', st.turn, `[${tag}] (no final text — session ended before the turn completed) | tools ${total} | errors ${errors}`)
        usageLines(now, 0)
        const rec = makeRecord(cat, { part: st.part + 1, ts_res: null, elapsed_ms: null, res_chars: 0, flags: { incomplete: true } }); record(logFileFor(st.reqTs, 'jsonl'), rec); emitted(rec); st.part += 1; resetPart()
      } else if (why === 'next' && total === 0 && notes.length === 0) {
        line(file, st.reqTs, 'RESPONSE', st.turn, `[${tag}] (no response — superseded by the next request)`)
        record(logFileFor(st.reqTs, 'jsonl'), makeRecord(cat, { part: 1, ts_res: null, elapsed_ms: null, res_chars: 0, flags: { superseded: true } }))
      } else if (why === 'next') {                                          // 작업은 했으나 최종 텍스트 전에 다음 요청이 들어와 흡수된 턴 — elapsed 는 정의 불가(null), 도구 시간만 보존
        flushNotes()
        line(file, new Date(st.reqTs), 'RESPONSE', st.turn, `[${tag}] (no final text — work continued under the next request) | tools ${total}${cnt ? ` (${cnt})` : ''} | errors ${errors} | cost ${usd(cost)}`)
        usageLines(st.reqTs, 0)
        const rec = makeRecord(cat, { part: 1, ts_res: null, elapsed_ms: null, res_chars: 0, flags: st.interrupted ? { interrupted: true, incomplete: true } : { absorbed: true } }); record(logFileFor(st.reqTs, 'jsonl'), rec); emitted(rec); resetPart()
      }
    }
  }
  const openTurn = (ts, text, mid) => {
    emitResponse('next')
    st.turn += 1; st.reqTs = ts; st.sinceTs = ts; st.responded = false; st.part = 0; st.midTurn = mid; st.interrupted = false; st.reqText = text; st.lastEmitted = null; st.tdQueue = []; st.hkQueue = []
    resetPart()
    st.agentTurn['ts:' + `${sid}:${st.turn}`] = ts
    file = logFileFor(ts); st.file = file
    st.reqCat = categorize(text)
    line(file, ts, 'REQUEST', st.turn, `${mid ? '(mid-turn) ' : ''}[${st.reqCat.category}] ${'─'.repeat(mid ? 36 : 45)}`)
    block(file, '>', text)
  }
  const ensureTurn = ts => { if (!st.turn) { st.turn = 1; st.reqTs = ts; st.sinceTs = ts; st.reqText = ''; st.reqCat = categorize(''); file = ensureFile(ts); st.file = file } }
  const lateFix = (patch, kind) => {                                      // 이미 방출된 파트에 뒤늦게 도착한 perf 값 → 보정 레코드. 값 없이 방출된 파트 순서(FIFO)로 귀속
    if (!st.lastEmitted) return false
    const q = kind === 'td' ? (st.tdQueue = st.tdQueue || []) : (st.hkQueue = st.hkQueue || [])
    const id = q.length ? q.shift() : st.lastEmitted.id
    record(logFileFor(st.lastEmitted.reqTs, 'jsonl'), { v: SCHEMA_VERSION, fix: true, id, perf: patch }); return true
  }
  const emitted = rec => { st.lastEmitted = { id: rec.id, reqTs: st.reqTs }; if (rec.perf.turn_duration_ms == null) (st.tdQueue = st.tdQueue || []).push(rec.id); if (!rec.perf.hook_ms) (st.hkQueue = st.hkQueue || []).push(rec.id) }

  for (const j of fresh) {
    const ts = j.timestamp || new Date().toISOString()
    if (j.type === 'assistant' && !j.isSidechain) {
      if (j.message?.model && !/^</.test(j.message.model)) st.model = j.message.model   // 턴 단위 모델 (세션 중 /model 전환 반영; "<synthetic>" 등 하네스 합성 메시지는 제외)
      announce(j, ts)
      const rid = j.requestId || j.uuid
      if (j.message?.usage && st.turn && !st.seenReq[rid]) { st.seenReq[rid] = 1; const u = j.message.usage, t = st.tokens; t.api_calls += 1; t.input += u.input_tokens || 0; t.cache_read += u.cache_read_input_tokens || 0; t.cache_create += u.cache_creation_input_tokens || 0; t.output += u.output_tokens || 0; t.thinking += u.output_tokens_details?.thinking_tokens || 0 }
      for (const b of j.message?.content || []) {
        if (b.type === 'tool_use') {
          if (pendingText) { notes.push(pendingText); pendingText = null }
          ensureTurn(ts); flushNotes()
          st.tools[b.name] = (st.tools[b.name] || 0) + 1
          if ((b.name === 'Bash' || b.name === 'PowerShell') && b.input?.description) st.descriptions.push(String(b.input.description))
          if (b.name === 'Skill' && b.input?.skill) { const r = skillRes(b.input.skill); bump(st.res.skills, r, r) }
          if (b.name === 'Agent') { const n = String(b.input?.subagent_type || 'general-purpose'); bump(st.res.agents, { name: n }, { name: n }); st.agentTurn['tu:' + b.id] = `${sid}:${st.turn}`; if (b.input?.name) { st.agentTurn['name:' + b.id] = String(b.input.name); st.agentTurn['nm:' + String(b.input.name)] = `${sid}:${st.turn}` } }
          const mr = mcpRes(b.name); if (mr) bump(st.res.mcp, mr, mr)
          const r = results.get(b.id); const ms = r ? new Date(r.ts) - new Date(ts) : null
          const tgt = /^(Read|Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name) ? rel(b.input?.file_path || b.input?.notebook_path || '') : (b.name === 'Grep' || b.name === 'Glob') && b.input?.path ? rel(b.input.path) : undefined
          if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(b.name) && tgt) st.writes.push(tgt)
          st.steps.push({ t: b.name, ok: r ? r.ok : null, ms: ms >= 0 ? ms : null, ...(tgt ? { tgt: redact(tgt) } : {}), ...(r && r.chars ? { chars: r.chars } : {}), d: (b.name === 'Bash' || b.name === 'PowerShell') ? String(b.input?.description || '') : undefined })
          line(file, ts, 'STEP', st.turn, `${b.name} ${summarize(b.name, b.input)} ${r ? `→ ${r.ok ? 'OK' : 'ERROR'} ${elapsed(ms)}` : '→ (pending)'}`)
        } else if (b.type === 'text' && b.text?.trim()) { if (pendingText) notes.push(pendingText); pendingText = { ts, text: b.text }; if (!st.firstTextTs) st.firstTextTs = ts }
      }
    } else if (j.type === 'attachment' && /^hook_/.test(j.attachment?.type || '') && st.turn) {
      const a = j.attachment; const name = String(a.hookName || a.hookEvent || a.type).replace(/:.*$/, ''); const ev = String(a.hookEvent || name)
      bump(st.res.hooks, { name, event: ev }, { name, event: ev })
    } else if (j.type === 'system' && st.turn) {
      // 진행 중인(아직 방출 안 된) 파트가 있으면 그 파트의 값 → 누적. 없으면(직전 파트 방출 후 도착) → 보정 레코드
      const partOpen = !!pendingText || st.steps.length > 0 || st.tokens.api_calls > 0
      if (j.subtype === 'stop_hook_summary' && Array.isArray(j.hookInfos)) {
        const ms = j.hookInfos.reduce((a, h) => a + (h.durationMs || 0), 0)
        if (!partOpen && st.lastEmitted) lateFix({ hook_ms: ms, hook_runs: j.hookInfos.length }, 'hk'); else { st.hookRuns += j.hookInfos.length; st.hookMs += ms }
      }
      if (j.subtype === 'turn_duration') {
        const v = Object.entries(j).find(([k, x]) => /duration/i.test(k) && typeof x === 'number')
        if (v) { if (!partOpen && st.lastEmitted) lateFix({ turn_duration_ms: v[1] }, 'td'); else st.turnDurationMs = v[1] }
      }
    } else if (j.type === 'user' && !j.isMeta && !j.isSidechain) {
      const text = userText(j); if (text == null) continue
      if (/^\[Request interrupted by user[^\]]*\]$/.test(text.trim())) { if (st.turn) st.interrupted = true; continue }   // 사용자 중단 → 현재 턴에 플래그
      const c = classifyPrompt(text); if (!c) continue
      announce(j, ts)
      if (c.kind === 'REQUEST') openTurn(ts, c.text, false)
      else { emitResponse('boundary'); st.sinceTs = ts; line(ensureFile(ts), ts, c.kind, st.turn || null, c.text) }
    } else if (j.type === 'queue-operation' && j.operation === 'remove' && j.reason === 'absorbed_mid_turn' && j.content) {
      const c = classifyPrompt(j.content); if (c?.kind === 'REQUEST') openTurn(ts, c.text, true)
    }
  }
  emitResponse(final ? 'final' : 'stop')
  st.offset = next; st.file = file
  try { scanSubagents() } catch (e) { if (process.env.WORK_HISTORY_DEBUG) process.stderr.write(`subagent scan: ${e?.stack || e}\n`) }
  return st
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
try {
  const argv = process.argv.slice(2)
  if (argv[0] === '--backfill') {
    const transcript = argv[1]; const sid = path.basename(transcript, '.jsonl')
    const st = processTranscript(transcript, sid, freshState()); saveState(sid, st)
    console.log(`backfilled ${sid}: ${st.turn} turns, ${st.offset} bytes -> ${st.file}`)
  } else {
    const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
    const sid = input.session_id, transcript = input.transcript_path
    if (sid && /^[\w-]+$/.test(sid) && transcript && fs.existsSync(transcript)) {
      const isEnd = input.hook_event_name === 'SessionEnd'
      const st = processTranscript(transcript, sid, loadState(sid), { final: isEnd })
      if (isEnd) dropState(sid); else saveState(sid, st)
    }
  }
} catch (e) { try { fs.appendFileSync(path.join(os.tmpdir(), 'work-history-logger.err'), `${new Date().toISOString()} ${e?.stack || e}\n`) } catch {} }
process.exit(0)
