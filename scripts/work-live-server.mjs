#!/usr/bin/env node
/**
 * work-live-server — Claude Code 세션 기록(transcript JSONL)을 API 호출 단위로 읽어 컨텍스트·턴별 토큰·분당 사용량·비용을
 * 실시간 대시보드(SSE)로 보여주는 로컬 서버. 집계 규칙(중복 제거·턴 경계·컨텍스트·단가)은 work-history 로거와 동일하다.
 * 실행: node scripts/work-live-server.mjs   (옵션: --port 3777 --interval 2000 --dir <기록 디렉터리> --no-open)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { costUsd, makeRedactor } from './work-history-core.mjs'
import { parseArgs } from './work-history-stats.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..')
const WORKSPACE_ROOT = (process.env.WORKSPACE_ROOT || path.dirname(PROJECT)).replace(/\\/g, '/').replace(/\/+$/, '')
const redact = makeRedactor({ workspaceRoot: WORKSPACE_ROOT })

const TZ = 'Asia/Seoul'
const DEFAULTS = { port: 3777, interval: 2000 }
const MAX_CALLS = 300          // 세션당 보관하는 최근 API 호출 수
const RECENT_CALLS = 30        // 표에 내보내는 최근 호출 수
const RATE_MINUTES = 10        // 분당 사용량 구간
const KEEP_MINUTES = 60        // 분 버킷 보관 범위
const FRESH_DAYS = 7           // 읽어 들일 세션 기록의 최근성
const HEAD_CHARS = 80          // 요청문 머리말 길이
const WATCH_DEBOUNCE = 300
const PING_MS = 15000

// ── 시각 (로거와 동일한 KST 표기) ───────────────────────────────────────────────
const fmtParts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const local = ts => { const d = ts instanceof Date ? ts : new Date(ts); return isNaN(d) ? '' : fmtParts.format(d).replace('T', ' ') }
const dayOf = ts => local(ts).slice(0, 10)
const minuteOf = ts => local(ts).slice(0, 16)

// ── 세션 기록 디렉터리 (절대경로의 비영숫자를 하이픈으로 치환한 이름) ──────────────
export function transcriptDirFor(projectPath, home = os.homedir()) {
  return path.join(home, '.claude', 'projects', String(projectPath).replace(/[^A-Za-z0-9]/g, '-'))
}

// ── 증분 읽기 (로거와 동일: offset 이후 바이트만 읽고, 개행 없이 끝난 꼬리는 보류) ──
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
const parse = l => { try { return JSON.parse(l) } catch { return null } }

// ── 요청 판별 (로거와 동일) ────────────────────────────────────────────────────
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
function userText(j) { const c = j.message?.content; if (typeof c === 'string') return c; if (Array.isArray(c) && !c.some(b => b.type === 'tool_result')) return c.filter(b => b.type === 'text').map(b => b.text).join('\n'); return null }
function classifyPrompt(text) {
  const t = String(text || '').trim()
  if (!t || t.startsWith('<local-command-caveat>') || t.startsWith('<system-reminder>') || t.startsWith('<command-args>')) return null
  if (/^\[Request interrupted by user[^\]]*\]$/.test(t)) return null
  if (/^Another Claude session sent a message:|^<(teammate|agent)-message\b/.test(t)) return { kind: 'EVENT', text: t }
  if (t.startsWith('<command-name>')) return { kind: 'COMMAND', text: t }
  if (t.startsWith('<local-command-stdout>')) return { kind: 'COMMAND', text: t }
  if (t.startsWith('<task-notification>')) return { kind: 'EVENT', text: t }
  return { kind: 'REQUEST', text: t }
}

// ── 상태 ──────────────────────────────────────────────────────────────────────
const emptyTokens = () => ({ api_calls: 0, input: 0, cache_read: 0, cache_create: 0, output: 0, thinking: 0 })
const TOKEN_KEYS = ['input', 'cache_read', 'cache_create', 'output', 'thinking']

export function createState(dir = '') {
  return { dir, sessions: new Map(), files: new Map(), days: new Map(), minutes: new Map() }
}
function getSession(state, sid) {
  let s = state.sessions.get(sid)
  if (!s) {
    s = { session_id: sid, short: String(sid).slice(0, 8), model: null, started: null, last_ts: null, turn: 0, turns: [], calls: [], totals: { ...emptyTokens(), cost: 0 }, agent_totals: { ...emptyTokens(), cost: 0 }, context_now: 0, seenReq: new Set() }
    state.sessions.set(sid, s)
  }
  return s
}
function openTurn(s, ts, text, mid) {
  const prev = s.turns[s.turns.length - 1]
  if (prev) prev.done = true                                   // 뒤에 다음 요청이 왔으므로 이전 턴은 끝난 것으로 본다
  s.turn += 1
  s.turns.push({ turn: s.turn, ts_req: ts, ts_local: local(ts), req_head: cut(redact(text), HEAD_CHARS), mid_turn: !!mid, tokens: emptyTokens(), cost: 0, api_calls: 0, done: false })
}
function addDay(state, day, tk, cost, agent) {
  let d = state.days.get(day)
  if (!d) { d = { ...emptyTokens(), cost: 0, cost_agents: 0 }; state.days.set(day, d) }
  d.api_calls += 1; for (const k of TOKEN_KEYS) d[k] += tk[k]
  d.cost += cost; if (agent) d.cost_agents += cost
}
function addMinute(state, key, tk) {
  let m = state.minutes.get(key)
  if (!m) { m = { output: 0, cache_create: 0, input: 0 }; state.minutes.set(key, m) }
  m.output += tk.output; m.cache_create += tk.cache_create; m.input += tk.input
}

/** transcript 한 줄을 상태에 반영한다. opts.agent 가 참이면 서브에이전트 기록(세션에 귀속하되 메인 합계와 분리). */
export function ingestLine(state, j, opts = {}) {
  if (!j || typeof j !== 'object') return state
  const agent = !!opts.agent
  const sid = opts.sid || j.sessionId || j.session_id || 'unknown'
  const s = getSession(state, sid)
  const ts = j.timestamp || null
  if (ts) { if (!s.started || ts < s.started) s.started = ts; if (!s.last_ts || ts > s.last_ts) s.last_ts = ts }

  if (j.type === 'assistant' && (agent || !j.isSidechain)) {   // 메인 기록의 isSidechain 줄은 서브에이전트 기록과 중복되므로 제외
    if (j.message?.model && !/^</.test(j.message.model) && !agent) s.model = j.message.model
    const rid = j.requestId || j.uuid
    const u = j.message?.usage
    if (!u) return state
    if (!agent && !s.turn) return state                        // 요청 전(턴 없음) 호출은 로거와 동일하게 집계하지 않는다
    if (s.seenReq.has(rid)) return state                       // 스트리밍 조각은 requestId 를 공유 — 1회만 집계
    s.seenReq.add(rid)
    const tk = { input: u.input_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_create: u.cache_creation_input_tokens || 0, output: u.output_tokens || 0, thinking: u.output_tokens_details?.thinking_tokens || 0 }
    const model = j.message?.model || s.model
    const cost = costUsd(tk, model) || 0
    const context = tk.input + tk.cache_read + tk.cache_create
    const bucket = agent ? s.agent_totals : s.totals
    bucket.api_calls += 1; for (const k of TOKEN_KEYS) bucket[k] += tk[k]; bucket.cost += cost
    if (!agent) {
      s.context_now = context
      const turn = s.turns[s.turns.length - 1]
      if (turn) { turn.api_calls += 1; turn.tokens.api_calls += 1; for (const k of TOKEN_KEYS) turn.tokens[k] += tk[k]; turn.cost += cost }
    }
    s.calls.push({ ts, ts_local: local(ts), turn: agent ? null : s.turn, ...tk, context, cost, agent })
    if (s.calls.length > MAX_CALLS) s.calls.shift()
    addDay(state, dayOf(ts || Date.now()), tk, cost, agent)
    addMinute(state, minuteOf(ts || Date.now()), tk)
    return state
  }
  if (agent) return state

  if (j.type === 'user' && !j.isMeta && !j.isSidechain) {
    const text = userText(j); if (text == null) return state   // tool_result 만 담긴 사용자 줄 → 요청 아님
    if (/^\[Request interrupted by user[^\]]*\]$/.test(text.trim())) return state
    const c = classifyPrompt(text); if (!c) return state
    if (c.kind === 'REQUEST') openTurn(s, ts, c.text, false)
    return state
  }
  if (j.type === 'queue-operation' && j.operation === 'remove' && j.reason === 'absorbed_mid_turn' && j.content) {
    const c = classifyPrompt(j.content); if (c?.kind === 'REQUEST') openTurn(s, ts, c.text, true)
  }
  return state
}

// ── 스캔 ──────────────────────────────────────────────────────────────────────
function listTargets(dir) {
  const out = []
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  const cutoff = Date.now() - FRESH_DAYS * 86400e3
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
    const file = path.join(dir, e.name)
    let st; try { st = fs.statSync(file) } catch { continue }
    if (st.mtimeMs < cutoff) continue
    const sid = e.name.replace(/\.jsonl$/, '')
    out.push({ file, sid, agent: false })
    const subDir = path.join(dir, sid, 'subagents')
    let subs; try { subs = fs.readdirSync(subDir) } catch { subs = [] }
    for (const f of subs) if (f.endsWith('.jsonl')) out.push({ file: path.join(subDir, f), sid, agent: true })
  }
  return out
}
function pruneMinutes(state, now) {
  const oldest = minuteOf(now - KEEP_MINUTES * 60000)
  for (const k of state.minutes.keys()) if (k < oldest) state.minutes.delete(k)
}
/** 디렉터리를 훑어 마지막 오프셋 이후만 읽어 상태에 반영한다 (O(Δ)). */
export function refresh(state, now = Date.now()) {
  for (const t of listTargets(state.dir)) {
    const prev = state.files.get(t.file) || { offset: 0 }
    let r; try { r = readFrom(t.file, prev.offset) } catch { continue }
    for (const l of r.lines) { const j = parse(l); if (j) ingestLine(state, j, { sid: t.sid, agent: t.agent }) }
    state.files.set(t.file, { offset: r.next })
  }
  pruneMinutes(state, now)
  return state
}

// ── 스냅샷 ────────────────────────────────────────────────────────────────────
const cacheHit = t => { const seen = t.cache_read + t.cache_create + t.input; return seen ? +(t.cache_read / seen).toFixed(4) : null }
const viewTokens = t => ({ api_calls: t.api_calls, input: t.input, cache_read: t.cache_read, cache_create: t.cache_create, output: t.output, thinking: t.thinking, cost: +t.cost.toFixed(4), cache_hit: cacheHit(t) })
const viewCall = (c, short) => ({ ts: c.ts, local: c.ts_local, session: short, turn: c.turn, input: c.input, cache_read: c.cache_read, cache_create: c.cache_create, output: c.output, thinking: c.thinking, context: c.context, cost: +c.cost.toFixed(4), agent: c.agent })
function viewSession(s, full) {
  const base = { session_id: s.session_id, short: s.short, model: s.model, started: s.started, started_local: local(s.started), last_ts: s.last_ts, last_local: local(s.last_ts), turns_count: s.turns.length, context_now: s.context_now, totals: viewTokens(s.totals), agent_totals: viewTokens(s.agent_totals) }
  if (!full) return base
  return { ...base, turns: s.turns.map(t => ({ turn: t.turn, ts_req: t.ts_req, ts_local: t.ts_local, req_head: t.req_head, mid_turn: t.mid_turn, done: t.done, api_calls: t.api_calls, cost: +t.cost.toFixed(4), tokens: { ...t.tokens } })), calls: s.calls.map(c => viewCall(c, s.short)) }
}
/** 페이지가 그대로 그릴 수 있는 형태의 현재 집계. */
export function snapshot(state, opts = {}) {
  const now = opts.now || Date.now()
  const live = [...state.sessions.values()].filter(s => s.totals.api_calls > 0 || s.turns.length > 0)
  const byRecent = live.slice().sort((a, b) => String(b.last_ts || '').localeCompare(String(a.last_ts || '')))
  const today = dayOf(now)
  const d = state.days.get(today) || { ...emptyTokens(), cost: 0, cost_agents: 0 }
  const rate = []
  for (let i = RATE_MINUTES - 1; i >= 0; i--) {
    const key = minuteOf(now - i * 60000); const m = state.minutes.get(key)
    rate.push({ minute: key.slice(11), output: m ? m.output : 0, cache_create: m ? m.cache_create : 0, input: m ? m.input : 0 })
  }
  const recent = []
  for (const s of live) for (const c of s.calls) recent.push(viewCall(c, s.short))
  recent.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
  return {
    now: new Date(now).toISOString(), now_local: local(now), dir: path.basename(state.dir || ''), interval: opts.interval || null,
    current: byRecent[0] ? viewSession(byRecent[0], true) : null,
    sessions_today: byRecent.filter(s => dayOf(s.last_ts || s.started || now) === today).map(s => viewSession(s, false)),
    today: { api_calls: d.api_calls, input: d.input, cache_read: d.cache_read, cache_create: d.cache_create, output: d.output, thinking: d.thinking, cost: +d.cost.toFixed(4), cost_agents: +d.cost_agents.toFixed(4), cache_hit: cacheHit(d) },
    rate, recent_calls: recent.slice(0, RECENT_CALLS),
  }
}

// ── 페이지 ────────────────────────────────────────────────────────────────────
// 시각 체계(토큰·다크모드·차트 클래스·툴팁)는 work-history-report.mjs 와 동일하게 맞춘다. 외부 스크립트·폰트 없음.
const PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>실시간 토큰 사용량</title>
<style>
:root{color-scheme:light;--bg:#f6f5f2;--surface:#fcfcfb;--line:#e4e2dc;--grid:#ebe9e3;--ink:#0b0b0b;--ink2:#52514e;--ink3:#8a8884;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s7:#4a3aa7;--s8:#e34948;--other:#9a9893;--bad:#c0392b;
  --sans:system-ui,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;--mono:ui-monospace,Consolas,"D2Coding",monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s7:#9085e9;--s8:#e66767;--other:#6f6e69;--bad:#e66767}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s7:#9085e9;--s8:#e66767;--other:#6f6e69;--bad:#e66767}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans)}
.wrap{max-width:1180px;margin:0 auto;padding-block:24px 44px;padding-inline:16px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px;margin-bottom:20px}
h1{font-size:22px;font-weight:600;margin:0;letter-spacing:-.01em}
.meta{color:var(--ink2);font-family:var(--mono);font-size:12px}
.livedot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--s3);margin-right:7px}
.livedot.stale{background:var(--ink3)}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.kpi div{background:var(--surface);border:1px solid var(--line);padding:14px 16px}
.kpi b{display:block;font-size:26px;font-weight:600;font-family:var(--mono);font-variant-numeric:tabular-nums;line-height:1.1;margin:4px 0}
.kpi span{font-size:11px;letter-spacing:.06em;color:var(--ink3)}
.kpi small{color:var(--ink2)}
.meter{height:6px;margin-top:9px;background:var(--grid);background:color-mix(in srgb,var(--fill) 18%,var(--surface));overflow:hidden}
.meter i{display:block;height:100%;background:var(--fill)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:16px}
section{background:var(--surface);border:1px solid var(--line);padding:16px 18px 12px;min-width:0}
section.wide{grid-column:1/-1}
h3{font-size:14px;font-weight:600;margin:0 0 2px}
.desc{color:var(--ink2);font-size:12px;margin:0 0 10px}
.chart{width:100%;height:auto;display:block;font-family:var(--sans)}
.chart .grid{stroke:var(--grid);stroke-width:1;display:initial}
.chart .tick{fill:var(--ink3);font-size:11px;font-variant-numeric:tabular-nums}
.chart .lbl{fill:var(--ink);font-size:11px}
.chart .val{fill:var(--ink);font-size:12px;font-family:var(--mono);font-variant-numeric:tabular-nums}
.chart .mark{cursor:default;outline:none}
.chart .mark:hover rect:not([fill="transparent"]),.chart .mark:focus rect:not([fill="transparent"]){filter:brightness(1.12)}
.chart .mark:focus-visible rect[fill="transparent"]{stroke:var(--ink);stroke-width:1}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;padding:0;margin:0 0 10px;font-size:12px;color:var(--ink2)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.scroll{overflow-x:auto;max-width:100%}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th{text-align:left;color:var(--ink3);font-weight:500;font-size:11px;letter-spacing:.05em;border-bottom:1px solid var(--line);padding:6px 8px;white-space:nowrap}
td{padding:6px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
td.num{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
td.req{color:var(--ink2);max-width:420px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 9px;font-size:12px;border-radius:3px;max-width:380px;display:none;z-index:9;font-family:var(--mono)}
footer{margin-top:20px;color:var(--ink3);font-size:12px}
@media (prefers-reduced-motion:no-preference){.chart .mark rect{transition:filter .12s}}
</style>
<div class="wrap">
<header>
  <h1>실시간 토큰 사용량</h1>
  <span class="meta"><i id="dot" class="livedot stale"></i><span id="dirname">-</span> · <span id="ago">연결 중</span></span>
</header>
<div class="kpi" id="kpi"></div>
<div class="grid">
  <section class="wide"><h3>컨텍스트 추이</h3><p class="desc">현재 세션의 API 호출별 컨텍스트 크기 · 옅은 세로선은 턴 경계</p><div id="cA"></div></section>
  <section><h3>턴별 토큰</h3><p class="desc">턴마다 신규 입력·캐시 생성·출력을 쌓아 표시 (출력 아래 옅은 부분이 thinking)</p><div id="cB"></div></section>
  <section><h3>분당 사용량 (최근 10분)</h3><p class="desc">1분 단위 출력 토큰과 캐시 생성 토큰</p><div id="cC"></div></section>
  <section class="wide"><h3>최근 API 호출 30건</h3><p class="desc">세션 전체에서 최근 호출부터 · a 표시는 서브에이전트</p><div id="tC"></div></section>
  <section class="wide"><h3>오늘 세션 목록</h3><p class="desc">오늘(KST) 활동한 세션</p><div id="tS"></div></section>
</div>
<footer id="foot">집계 규칙은 work-history 로거와 동일 · 127.0.0.1 전용</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>
(function(){
var S=null, lastAt=0, interval=2000, polling=null, es=null;
var tip=document.getElementById('tip');
var MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return MAP[c]}) }
function num(n){ return Number(n||0).toLocaleString() }
function kfmt(n){ n=Number(n)||0; return n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n) }
function usd(v){ return v==null?'-':(Number(v)<1?'$'+Number(v).toFixed(3):'$'+Number(v).toFixed(2)) }
function pc(v){ return v==null?'-':(100*Number(v)).toFixed(1)+'%' }
function hms(s){ return s?String(s).slice(11,19):'-' }
function svgOpen(w,h,aria){ return '<div class="scroll"><svg class="chart" viewBox="0 0 '+w+' '+h+'" style="min-width:'+Math.min(w,520)+'px" role="img" aria-label="'+esc(aria)+'">' }
var CLOSE='</svg></div>';
function legend(ps){ var h=''; for(var i=0;i<ps.length;i++) h+='<li><i style="background:'+ps[i][1]+'"></i>'+esc(ps[i][0])+'</li>'; return '<ul class="legend">'+h+'</ul>' }
function none(){ return '<p class="desc">데이터 없음</p>' }
function mark(tip,body,tab){ return '<g class="mark"'+(tab?' tabindex="0"':'')+' data-tip="'+esc(tip)+'">'+body+'</g>' }

// 컨텍스트 추이 — 단일 계열(면+선), 끝점만 직접 라벨
function chartA(calls){
  calls=(calls||[]).filter(function(c){return !c.agent});
  if(!calls.length) return none();
  var W=1080,H=220,pL=54,pR=14,pT=18,pB=26,pw=W-pL-pR,ph=H-pT-pB,n=calls.length;
  var max=1,i; for(i=0;i<n;i++) if(calls[i].context>max) max=calls[i].context;
  max=Math.ceil(max*1.08);
  var slot=n>1?pw/(n-1):0;
  var X=function(i){ return n>1?pL+slot*i:pL+pw/2 };
  var Y=function(v){ return pT+ph-(v/max)*ph };
  var s=svgOpen(W,H,'현재 세션의 API 호출별 컨텍스트 크기');
  for(i=0;i<3;i++){ var v=Math.round(max*i/2); s+='<line x1="'+pL+'" y1="'+Y(v).toFixed(1)+'" x2="'+(W-pR)+'" y2="'+Y(v).toFixed(1)+'" class="grid"/><text x="'+(pL-6)+'" y="'+(Y(v)+4).toFixed(1)+'" class="tick" text-anchor="end">'+kfmt(v)+'</text>' }
  for(i=1;i<n;i++) if(calls[i].turn!==calls[i-1].turn) s+='<line x1="'+X(i).toFixed(1)+'" y1="'+pT+'" x2="'+X(i).toFixed(1)+'" y2="'+(pT+ph)+'" class="grid"/>';
  var d=''; for(i=0;i<n;i++) d+=(i?'L':'M')+X(i).toFixed(1)+' '+Y(calls[i].context).toFixed(1)+' ';
  s+='<path d="M'+X(0).toFixed(1)+' '+(pT+ph)+' '+d.slice(1).replace(/^/,'L')+'L'+X(n-1).toFixed(1)+' '+(pT+ph)+' Z" fill="var(--s1)" opacity="0.16"/>';
  s+='<path d="'+d.trim()+'" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  var last=calls[n-1];
  s+='<circle cx="'+X(n-1).toFixed(1)+'" cy="'+Y(last.context).toFixed(1)+'" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/>';
  s+='<text x="'+(X(n-1)-9).toFixed(1)+'" y="'+(Y(last.context)-10).toFixed(1)+'" class="val" text-anchor="end">'+kfmt(last.context)+'</text>';
  var hw=n>1?slot:pw, tab=n<=60;
  for(i=0;i<n;i++){ var c=calls[i];
    var t='#'+(c.turn==null?'-':c.turn)+' '+hms(c.local)+' · 컨텍스트 '+num(c.context)+' = 입력 '+num(c.input)+' + 캐시읽기 '+num(c.cache_read)+' + 캐시생성 '+num(c.cache_create)+' · 출력 '+num(c.output)+' · '+usd(c.cost);
    s+=mark(t,'<rect x="'+(X(i)-hw/2).toFixed(1)+'" y="'+pT+'" width="'+hw.toFixed(1)+'" height="'+ph+'" fill="transparent"/>',tab);
  }
  return s+CLOSE;
}

// 턴별 토큰 — 누적 세로 막대 3계열, 세그먼트 사이 2px 여백, 맨 위 4px 라운드
function chartB(turns){
  turns=(turns||[]).slice(-24);
  if(!turns.length) return none();
  var W=560,H=228,pL=50,pR=12,pT=18,pB=30,pw=W-pL-pR,ph=H-pT-pB,n=turns.length,i;
  var tot=function(t){ return (t.tokens.output||0)+(t.tokens.cache_create||0)+(t.tokens.input||0) };
  var max=1; for(i=0;i<n;i++) max=Math.max(max,tot(turns[i]));
  var slot=pw/n, bw=Math.min(32,slot*0.62);
  var Y=function(v){ return pT+ph-(v/max)*ph };
  var s=svgOpen(W,H,'턴별 토큰 누적 막대');
  for(i=0;i<3;i++){ var v=Math.round(max*i/2); s+='<line x1="'+pL+'" y1="'+Y(v).toFixed(1)+'" x2="'+(W-pR)+'" y2="'+Y(v).toFixed(1)+'" class="grid"/><text x="'+(pL-6)+'" y="'+(Y(v)+4).toFixed(1)+'" class="tick" text-anchor="end">'+kfmt(v)+'</text>' }
  var every=n>12?2:1;
  for(i=0;i<n;i++){
    var t=turns[i], cx=pL+slot*i+slot/2, x=cx-bw/2, acc=0, body='', top='var(--s1)';
    var segs=[['input',t.tokens.input||0,'var(--s2)'],['cache_create',t.tokens.cache_create||0,'var(--s3)'],['output',t.tokens.output||0,'var(--s1)']];
    for(var q=0;q<segs.length;q++){
      var v=segs[q][1]; if(v<=0) continue;
      if(segs[q][0]==='output'){
        var th=Math.min(t.tokens.thinking||0,v);
        if(th>0){ body+='<rect x="'+x.toFixed(1)+'" y="'+Y(acc+th).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,Y(acc)-Y(acc+th)-2).toFixed(1)+'" fill="var(--s1)" opacity="0.45"/>'; }
        body+='<rect x="'+x.toFixed(1)+'" y="'+Y(acc+v).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,Y(acc+th)-Y(acc+v)-2).toFixed(1)+'" fill="var(--s1)"/>';
      } else {
        body+='<rect x="'+x.toFixed(1)+'" y="'+Y(acc+v).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,Y(acc)-Y(acc+v)-2).toFixed(1)+'" fill="'+segs[q][2]+'"/>';
      }
      top=segs[q][2]; acc+=v;
    }
    if(acc>0) body+='<rect x="'+x.toFixed(1)+'" y="'+Y(acc).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="4" rx="3" fill="'+top+'"/>';
    var tp='#'+t.turn+' '+hms(t.ts_local)+(t.done?'':' (진행 중)')+' · 합계 '+num(acc)+' = 입력 '+num(t.tokens.input)+' + 캐시생성 '+num(t.tokens.cache_create)+' + 출력 '+num(t.tokens.output)+'(thinking '+num(t.tokens.thinking)+') · 캐시읽기 '+num(t.tokens.cache_read)+' · API '+t.api_calls+'회 · '+usd(t.cost)+(t.req_head?' · '+t.req_head:'');
    s+=mark(tp,'<rect x="'+(cx-slot/2).toFixed(1)+'" y="'+pT+'" width="'+slot.toFixed(1)+'" height="'+ph+'" fill="transparent"/>'+body,true);
    if(i%every===0) s+='<text x="'+cx.toFixed(1)+'" y="'+(H-10)+'" class="lbl" text-anchor="middle">'+t.turn+'</text>';
  }
  return legend([['신규 입력','var(--s2)'],['캐시 생성','var(--s3)'],['출력','var(--s1)']])+s+CLOSE;
}

// 분당 사용량 — 계열마다 눈금이 다른 작은 배수(small multiples). 캐시 생성이 출력보다 자릿수가 커서
// 한 눈금에 겹쳐 그리면 출력 막대가 보이지 않으므로, 축을 공유하지 않고 위아래로 나눠 그린다.
function chartC(rate){
  rate=rate||[]; if(!rate.length) return none();
  var W=560,pL=52,pR=12,pT=16,rowH=62,vgap=20,pB=22;
  var H=pT+rowH*2+vgap+pB, pw=W-pL-pR, n=rate.length, slot=pw/n, bw=Math.min(14,slot*0.5), i, p;
  var series=[['출력','output','var(--s1)'],['캐시 생성','cache_create','var(--s3)']];
  var s=svgOpen(W,H,'최근 10분간 분당 출력 토큰과 캐시 생성 토큰 (계열별 눈금 분리)');
  for(p=0;p<2;p++){
    var key=series[p][1], col=series[p][2], top=pT+p*(rowH+vgap), base=top+rowH, max=1;
    for(i=0;i<n;i++) max=Math.max(max,rate[i][key]);
    s+='<line x1="'+pL+'" y1="'+base+'" x2="'+(W-pR)+'" y2="'+base+'" class="grid"/>';
    s+='<text x="'+pL+'" y="'+(top-3)+'" class="tick">'+esc(series[p][0])+'</text>';
    s+='<text x="'+(pL-6)+'" y="'+(top+9)+'" class="tick" text-anchor="end">'+kfmt(max)+'</text>';
    s+='<text x="'+(pL-6)+'" y="'+(base+4)+'" class="tick" text-anchor="end">0</text>';
    for(i=0;i<n;i++){
      var r=rate[i], cx=pL+slot*i+slot/2, h=(r[key]/max)*rowH, body='';
      if(r[key]>0){
        body+='<rect x="'+(cx-bw/2).toFixed(1)+'" y="'+(base-h).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+col+'"/>';
        body+='<rect x="'+(cx-bw/2).toFixed(1)+'" y="'+(base-h).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.min(4,h).toFixed(1)+'" rx="3" fill="'+col+'"/>';
      }
      var tp=r.minute+' · 출력 '+num(r.output)+' · 캐시 생성 '+num(r.cache_create)+' · 신규 입력 '+num(r.input);
      s+=mark(tp,'<rect x="'+(cx-slot/2).toFixed(1)+'" y="'+top+'" width="'+slot.toFixed(1)+'" height="'+rowH+'" fill="transparent"/>'+body,p===0);
    }
  }
  for(i=0;i<n;i++) if(i%2===0) s+='<text x="'+(pL+slot*i+slot/2).toFixed(1)+'" y="'+(H-6)+'" class="lbl" text-anchor="middle">'+esc(rate[i].minute)+'</text>';
  return legend([['출력','var(--s1)'],['캐시 생성','var(--s3)']])+s+CLOSE;
}

function table(cols,rows){
  if(!rows.length) return none();
  var h='<div class="scroll"><table><thead><tr>',i,q;
  for(i=0;i<cols.length;i++) h+='<th>'+esc(cols[i][0])+'</th>';
  h+='</tr></thead><tbody>';
  for(i=0;i<rows.length;i++){ h+='<tr>'; for(q=0;q<cols.length;q++) h+='<td class="'+(cols[q][2]||'')+'">'+cols[q][1](rows[i])+'</td>'; h+='</tr>' }
  return h+'</tbody></table></div>';
}
function tile(label,value,sub,extra){ return '<div>'+'<span>'+esc(label)+'</span><b>'+value+'</b><small>'+sub+'</small>'+(extra||'')+'</div>' }
function meter(p){ var c=p<60?'var(--s1)':p<85?'var(--s4)':'var(--s8)'; return '<div class="meter" style="--fill:'+c+'" title="컨텍스트 창 한도는 세션 기록에 없어 [확인중] — 아래 비율은 1,000,000 토큰 기준 환산값"><i style="width:'+Math.min(100,p).toFixed(1)+'%"></i></div>' }

function render(){
  if(!S) return;
  var cur=S.current, k='';
  if(!cur){ document.getElementById('kpi').innerHTML='<div><span>세션</span><b>-</b><small>최근 7일 안에 읽을 세션 기록이 없습니다</small></div>'; }
  else {
    var t=cur.totals, live=null, i;
    for(i=cur.turns.length-1;i>=0;i--){ if(!cur.turns[i].done){ live=cur.turns[i]; break } }
    if(!live && cur.turns.length) live=cur.turns[cur.turns.length-1];
    var ratio=cur.context_now/1e6*100;
    k+=tile('현재 컨텍스트',kfmt(cur.context_now),'환산 '+ratio.toFixed(1)+'% · '+esc(cur.model||'-'),meter(ratio));
    k+=tile('이번 턴 출력 토큰',kfmt(live?live.tokens.output:0),live?('#'+live.turn+' · API '+live.api_calls+'회 · '+usd(live.cost)):'-');
    k+=tile('세션 출력 토큰',kfmt(t.output),'thinking '+kfmt(t.thinking)+' 포함');
    k+=tile('세션 비용',usd(t.cost),'에이전트 '+usd(cur.agent_totals.cost)+' 별도');
    k+=tile('캐시 적중률',pc(t.cache_hit),'읽기 '+kfmt(t.cache_read)+' · 생성 '+kfmt(t.cache_create));
    k+=tile('API 호출 수',num(t.api_calls),'턴 '+cur.turns_count+'개 · 세션 '+esc(cur.short));
    k+=tile('에이전트 호출',num(cur.agent_totals.api_calls),'서브에이전트 API · 출력 '+kfmt(cur.agent_totals.output)+' · '+usd(cur.agent_totals.cost));   // 메인 집계와 분리된 서브에이전트 활동이 멈춘 듯 보이지 않도록 별도 타일
    k+=tile('오늘 총비용',usd(S.today.cost),'API '+num(S.today.api_calls)+'회 · 에이전트 '+usd(S.today.cost_agents)+' 포함');
    document.getElementById('kpi').innerHTML=k;
  }
  document.getElementById('cA').innerHTML=chartA(cur?cur.calls:[]);
  document.getElementById('cB').innerHTML=chartB(cur?cur.turns:[]);
  document.getElementById('cC').innerHTML=chartC(S.rate);
  document.getElementById('tC').innerHTML=table([
    ['시각',function(r){return esc(hms(r.local))},'num'],['세션',function(r){return esc(r.session)+(r.agent?' a':'')},''],
    ['턴',function(r){return r.turn==null?'-':String(r.turn)},'num'],
    ['in',function(r){return num(r.input)},'num'],['cache-read',function(r){return num(r.cache_read)},'num'],
    ['cache-new',function(r){return num(r.cache_create)},'num'],['out',function(r){return num(r.output)},'num'],
    ['thinking',function(r){return num(r.thinking)},'num'],['컨텍스트',function(r){return num(r.context)},'num'],
    ['비용',function(r){return esc(usd(r.cost))},'num']],S.recent_calls);
  document.getElementById('tS').innerHTML=table([
    ['세션',function(r){return esc(r.short)},''],['시작',function(r){return esc(hms(r.started_local))},'num'],
    ['마지막 활동',function(r){return esc(hms(r.last_local))},'num'],['턴 수',function(r){return String(r.turns_count)},'num'],
    ['출력 토큰',function(r){return num(r.totals.output)},'num'],['비용',function(r){return esc(usd(r.totals.cost))},'num'],
    ['모델',function(r){return esc(r.model||'-')},'req']],S.sessions_today);
}

function apply(snap){ S=snap; lastAt=Date.now(); if(snap.interval) interval=snap.interval; document.getElementById('dirname').textContent=snap.dir||'-'; render() }
function load(){ fetch('/api/live',{cache:'no-store'}).then(function(r){return r.json()}).then(apply).catch(function(){}) }
function startPolling(){ if(polling) return; polling=setInterval(load,interval); load() }

function place(x,y){ if(x+tip.offsetWidth>innerWidth-8) x=innerWidth-tip.offsetWidth-8; if(y+tip.offsetHeight>innerHeight-8) y=y-tip.offsetHeight-28; tip.style.left=x+'px'; tip.style.top=y+'px' }
function show(g,x,y){ if(!g||!g.dataset.tip){ tip.style.display='none'; return } tip.textContent=g.dataset.tip; tip.style.display='block'; place(x,y) }
document.addEventListener('mousemove',function(e){ var g=e.target.closest?e.target.closest('.mark'):null; show(g,e.clientX+14,e.clientY+14) });
document.addEventListener('focusin',function(e){ var g=e.target.closest?e.target.closest('.mark'):null; if(!g) return; var b=g.getBoundingClientRect(); show(g,b.left,b.bottom+6) });
document.addEventListener('focusout',function(){ tip.style.display='none' });

setInterval(function(){
  var d=document.getElementById('dot'), a=document.getElementById('ago');
  if(!lastAt){ a.textContent='연결 중'; d.className='livedot stale'; return }
  var gap=Date.now()-lastAt;
  a.textContent='마지막 갱신 '+Math.round(gap/1000)+'초 전';
  d.className='livedot'+(gap>3*interval?' stale':'');
},1000);

try{ es=new EventSource('/api/events') }catch(e){ es=null }
if(es){
  es.addEventListener('message',function(e){ if(polling){ clearInterval(polling); polling=null } apply(JSON.parse(e.data)) });
  es.onerror=function(){ if(es.readyState===2) startPolling() };
  setTimeout(function(){ if(!lastAt) startPolling() },5000);
} else startPolling();
})();
</script>`

// ── 서버 ──────────────────────────────────────────────────────────────────────
const HELP = `work-live-server — 실시간 토큰 사용량 대시보드
  --port N        수신 포트 (기본 ${DEFAULTS.port})
  --interval ms   갱신 주기 (기본 ${DEFAULTS.interval})
  --dir PATH      세션 기록 디렉터리 (기본: 이 프로젝트의 ~/.claude/projects/<인코딩된 경로>)
  --no-open       시작 시 브라우저를 열지 않는다
  --help
exit: 0 정상, 1 인자 오류`

function openBrowser(url) {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
    const c = spawn(cmd, args, { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref()
  } catch {}
}

export function serve(state, opt) {
  const clients = new Set()
  const snap = () => snapshot(refresh(state), { interval: opt.interval })
  const push = () => { if (!clients.size) return; const data = 'data: ' + JSON.stringify(snap()) + '\n\n'; for (const res of clients) { try { res.write(data) } catch {} } }

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    if (req.method !== 'GET') { res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('GET only') }
    if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(PAGE) }
    if (url === '/favicon.ico') { res.writeHead(204); return res.end() }          // 브라우저 자동 요청 — 404 콘솔 오류만 막는다
    if (url === '/api/live') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(snap())) }
    if (url === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      res.write(': connected\n\n')
      clients.add(res)
      try { res.write('data: ' + JSON.stringify(snap()) + '\n\n') } catch {}
      req.on('close', () => clients.delete(res))
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found')
  })

  const timers = [setInterval(push, opt.interval), setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n') } catch {} } }, PING_MS)]
  let watcher = null, pending = null
  try {
    watcher = fs.watch(state.dir, { recursive: true }, () => {          // 기록이 append 되는 즉시 반영 (300ms 디바운스)
      if (pending) return
      pending = setTimeout(() => { pending = null; push() }, WATCH_DEBOUNCE)
    })
    watcher.on('error', () => {})
  } catch {}

  server.on('close', () => { for (const t of timers) clearInterval(t); if (pending) clearTimeout(pending); if (watcher) try { watcher.close() } catch {} })
  server.listen(opt.port, '127.0.0.1')
  return server
}

function main() {
  const { opt, errs } = parseArgs(process.argv.slice(2), { port: 'value', dir: 'value', interval: 'value', 'no-open': 'flag', help: 'flag' })
  if (opt.help) { console.log(HELP); process.exit(0) }
  const port = opt.port ? Number(opt.port) : DEFAULTS.port
  const interval = opt.interval ? Number(opt.interval) : DEFAULTS.interval
  if (!(port > 0 && port < 65536)) errs.push(`--port 값 오류: ${opt.port}`)
  if (!(interval >= 250)) errs.push(`--interval 값 오류(250 이상): ${opt.interval}`)
  if (errs.length) { console.error(errs.join('\n') + '\n\n' + HELP); process.exit(1) }
  const dir = opt.dir ? path.resolve(opt.dir) : transcriptDirFor(PROJECT)
  if (!fs.existsSync(dir)) { console.error(`세션 기록 디렉터리를 찾지 못했습니다: ${redact(dir)}\n--dir 로 지정하세요.\n\n${HELP}`); process.exit(1) }

  const state = refresh(createState(dir))
  const server = serve(state, { port, interval })
  server.on('listening', () => {
    const url = `http://127.0.0.1:${port}`
    console.log(`실시간 토큰 사용량 → ${url}  (세션 기록 ${path.basename(dir)} · 갱신 ${interval}ms · 세션 ${state.sessions.size}개)`)
    if (!opt['no-open']) openBrowser(url)
  })
  server.on('error', e => { console.error(`서버를 시작하지 못했습니다: ${e.message}`); process.exit(1) })
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
