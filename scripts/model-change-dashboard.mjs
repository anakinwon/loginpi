/**
 * model-change-dashboard.mjs : 기준 시각 이후 요청마다 "작업 시작·종료 | 작업 유형 | 모델&버전 흐름 | effort 흐름 | 비용 | 작업 지시서 | 작업 결과서 | 기타" 대시보드 (2026-10-08 지시)
 * 원천 : work-history jsonl(loadRows : 턴 경계·유형·비용) + 세션 기록 ~/.claude/projects/<프로젝트>/<sid>.jsonl(메인 모델·effort·지시문·응답) + <sid>/subagents/*.jsonl(서브에이전트 모델·effort)
 * 실행 : node scripts/model-change-dashboard.mjs [--from ISO시각] [--out 경로]  (수동 실행 ; Stop 훅 미등록)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRows } from './work-history-stats.mjs'
import { CATEGORIES, makeRedactor, costUsd } from './work-history-core.mjs'
import { modelLabel } from '../.claude/subagent-statusline.mjs'

// 자동 실행(Stop 훅, --quiet)은 PC별 사용자 전역 설정 env MODEL_CHANGE_DASHBOARD=1 일 때만 : 공동작업자 PC가 추적 중인 HTML을 덮어쓰지 않도록
if (process.argv.includes('--quiet') && process.env.MODEL_CHANGE_DASHBOARD !== '1') process.exit(0)
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), argOf = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d
const FROM = Date.parse(argOf('--from', '2026-10-09T09:43:26+09:00'))   // 모니터링 시작 시각 : loginpi teamAnakin 도입 첫 요청
if (Number.isNaN(FROM)) { console.error('--from 값이 ISO 시각이 아님'); process.exit(2) }
const OUT = path.resolve(argOf('--out', path.join(PROJECT, 'work-statistics/mywork/myClaudeModelChage_4_myWorkStyle.html')))
const SESS_DIR = path.join(process.env.TOOLDASH_HOME || os.homedir(), '.claude/projects', (process.env.TOOLDASH_PROJECT || PROJECT).replace(/[^A-Za-z0-9]/g, '-'))   // Claude Code 프로젝트 폴더 규칙 : 영숫자 외 전부 '-'
const CUT = { cell: 160, full: 6000 }                                   // 표 셀 미리보기·펼침 최대 글자
const COMPARE = [['claude-opus-5-5', 'Opus 5.5'], ['claude-fable-5-1', 'Fable 5.1']]   // 단일 모델 100% 사용 가정 비교 대상(2026-10-08 지시)
const TOKEN_KEYS = ['input', 'cache_read', 'cache_create', 'output']
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))
const redact = makeRedactor({ workspaceRoot: PROJECT })

// ── 턴 : part 합산 ───────────────────────────────────────────────────────────
const turnsById = new Map()
for (const r of loadRows({})) {
  if (!r.ts_req || Date.parse(r.ts_req) < FROM) continue
  const key = (r.id || '').replace(/\.\d+$/, '') || r.ts_req
  const t = turnsById.get(key)
  const tk = {}; for (const x of [r, ...(r.agents_detail || [])]) for (const k of TOKEN_KEYS) tk[k] = (tk[k] || 0) + (x.tokens?.[k] || 0)   // 서브에이전트 토큰 포함
  if (!t) { turnsById.set(key, { ...r, tk, skills: [...(r.skills || [])], agents: [...(r.agents || [])] }); continue }
  for (const k of TOKEN_KEYS) t.tk[k] += tk[k]
  for (const k of ['cost_usd', 'cost_agents_usd', 'tools_total', 'tool_errors', 'files_changed', 'elapsed_ms']) t[k] = (t[k] || 0) + (r[k] || 0)
  t.ts_res = r.ts_res || t.ts_res; t.skills.push(...(r.skills || [])); t.agents.push(...(r.agents || []))
  t.interrupted = r.interrupted; t.superseded = t.superseded || r.superseded
}
const seenReq = new Set()   // ponytail: 시각+요청 머리글 기준 중복 제거, 근본 대책은 로거의 이어받은 세션 재기록 방지
const turns = [...turnsById.values()].filter(t => { const k = t.ts_req + '|' + (t.req_head || ''); if (seenReq.has(k)) return false; seenReq.add(k); return true }).sort((a, b) => Date.parse(b.ts_req) - Date.parse(a.ts_req))

// ── 세션 기록 : 세션별 1회 읽기 ─────────────────────────────────────────────────
const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] } }
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : ''
const sessions = new Map()
// ── 도구 사용 : Agent · Hook · MCP · Skill · Plugin (세션 기록의 tool_use 블록과 훅 실행 기록) ─────────────
const KINDS = ['Agent', 'Hook', 'MCP', 'Skill', 'Plugin']
const scriptOf = cmd => { const m = String(cmd || '').match(/[\w.-]+\.(?:mjs|cjs|js|py|sh|ps1)\b/g); return m ? m.at(-1) : 'inline' }   // 스크립트 파일 없는 인라인 명령(echo 등)
const pluginOfPath = cmd => (String(cmd || '').replace(/\\/g, '/').match(/\/plugins\/cache\/[^/]+\/([^/]+)\//) || [])[1]
/** 기록 1건 → [{kind, name}] : mcp__plugin_<플러그인>_<서버>__도구 는 Plugin + MCP, 플러그인 스킬(이름:스킬)은 Skill + Plugin */
function toolsOf(j) {
  const out = []
  if (j.type === 'assistant') for (const b of j.message?.content || []) {
    if (b?.type !== 'tool_use') continue
    if (b.name === 'Agent' || b.name === 'Task') out.push({ kind: 'Agent', name: b.input?.subagent_type || 'general-purpose' })
    else if (b.name === 'Workflow') out.push({ kind: 'Agent', name: 'Workflow' })
    else if (b.name === 'Skill') { const n = String(b.input?.skill || ''); out.push({ kind: 'Skill', name: n }); if (n.includes(':')) out.push({ kind: 'Plugin', name: n.split(':')[0] }) }
    else if (String(b.name).startsWith('mcp__')) { const srv = b.name.split('__')[1] || ''; if (srv.startsWith('plugin_')) { const [pl, ...rest] = srv.slice(7).split('_'); out.push({ kind: 'Plugin', name: pl }, { kind: 'MCP', name: rest.join('_') || pl }) } else out.push({ kind: 'MCP', name: srv }) }
  }
  // 슬래시 명령으로 실행한 스킬 : 사용자 기록의 <command-name> + <skill-format>true (내장 명령 /effort 등은 제외)
  if (j.type === 'user') { const tx = textOf(j.message?.content); const m = tx.match(/<command-name>\/?([^<\s]+)<\/command-name>/); if (m && /<skill-format>true/.test(tx)) out.push({ kind: 'Skill', name: `${m[1]} (/명령)` }) }
  // 응답 첫 줄 "활용 스킬:" 선언 : 실제 로드(Skill 도구·슬래시) 기록과 구분해 (선언)으로 표시
  if (j.type === 'assistant') { const m = textOf(j.message?.content).match(/^활용 스킬\s*:\s*(.+)$/m); if (m && !/^없음/.test(m[1].trim())) for (const n of m[1].replace(/\([^)]*\)/g, '').split('·')) { const nm = n.trim(); if (nm) out.push({ kind: 'Skill', name: `${nm} (선언)` }) } }
  const hook = (ev, cmd) => { out.push({ kind: 'Hook', name: `${ev}·${scriptOf(cmd)}` }); const pl = pluginOfPath(cmd); if (pl) out.push({ kind: 'Plugin', name: pl }) }
  if (j.type === 'attachment' && j.attachment?.type === 'hook_success') hook(j.attachment.hookEvent || j.attachment.hookName, j.attachment.command)
  // 프로젝트 라우터 훅은 출력만 기록됨(hook_success 없음) : 출력 머리말로 식별
  if (j.type === 'attachment' && /^hook_(system_message|additional_context)$/.test(j.attachment?.type)) { const c = [].concat(j.attachment.content || []).join(' '); if (/^\s*(\[모델 단계 계획\]|권장 effort)/.test(c)) out.push({ kind: 'Hook', name: `${j.attachment.hookEvent || 'UserPromptSubmit'}·model-advisor.mjs` }) }
  if (j.type === 'system' && j.subtype === 'stop_hook_summary') for (const h of j.hookInfos || []) hook('Stop', h.command)
  return out.map(x => ({ ...x, name: String(x.name).replace(/["'`]/g, '') })).filter(x => x.name)   // 명령 문자열에서 묻어온 따옴표 제거
}
function session(sid) {
  if (sessions.has(sid)) return sessions.get(sid)
  const ev = [], users = [], texts = [], tools = [], subTools = {}
  for (const j of readJsonl(path.join(SESS_DIR, `${sid}.jsonl`))) {
    const ts = Date.parse(j.timestamp)
    if (j.isSidechain) continue
    for (const x of toolsOf(j)) tools.push({ ts, ...x })
    if (j.type === 'assistant') {
      if (j.message?.model && !/^</.test(j.message.model)) ev.push({ ts, model: j.message.model, effort: j.perTurnEffort || j.effort || null, who: '' })
      const tx = textOf(j.message?.content); if (tx.trim()) texts.push({ ts, id: j.message?.id, tx })
    } else if (j.type === 'user' && !j.isMeta) {
      const tx = textOf(j.message?.content); if (tx.trim()) users.push({ ts, tx })
    }
  }
  const sub = path.join(SESS_DIR, sid, 'subagents')
  if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub).filter(f => f.endsWith('.jsonl'))) {
    let who = '서브에이전트'; try { who = JSON.parse(fs.readFileSync(path.join(sub, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType || who } catch { /* meta 없음 : 기본 이름 */ }
    subTools[f] = []
    for (const j of readJsonl(path.join(sub, f))) {
      if (j.type !== 'assistant') continue
      subTools[f].push(...toolsOf(j))
      if (j.message?.model && !/^</.test(j.message.model)) ev.push({ ts: Date.parse(j.timestamp), model: j.message.model, effort: j.perTurnEffort || j.effort || null, who, aid: f })
    }
  }
  ev.sort((x, y) => x.ts - y.ts)
  const s = { ev, users, texts, tools, subTools }; sessions.set(sid, s); return s
}

/** 메인 구간 [from, to] 안의 메인 기록을 "직전 기록 ~ 이 기록" 시간으로 배분(기록 시각 = API 호출 종료 시각) ; 조각마다 시간 경계 보존(도구 배정용) */
function mainSpan(mainEv, from, to, f) {
  const out = []; let prev = from
  for (const e of mainEv) if (e.ts > from && e.ts <= to) { out.push({ label: f(e), ms: e.ts - prev, from: prev, to: e.ts }); prev = e.ts }
  const last = [...mainEv].reverse().find(e => e.ts <= to)
  if (to > prev) out.push({ label: f(last || mainEv.find(e => e.ts > to) || {}), ms: to - prev, from: prev, to })   // 구간 끝까지 남은 시간은 직전 메인 설정
  return out
}
/** 흐름 = 메인 구간과 서브에이전트 구간(파일별 1개 : 호출 직전 메인 기록 ~ 마지막 기록)을 시간순으로 잇고 연속 같은 라벨은 합침(조각 목록 유지) */
// ponytail: 병렬 서브에이전트는 먼저 시작한 쪽에 겹친 시간을 배분(합계 100% 유지), 겹침 표시가 필요하면 행별 간트로 교체
function flowOf(ev, a, b, fMain, fSub) {
  const mainEv = ev.filter(e => !e.who), ivs = []
  for (const aid of [...new Set(ev.filter(e => e.who).map(e => e.aid))]) {
    const xs = ev.filter(e => e.aid === aid), lastMain = [...mainEv].reverse().find(e => e.ts < xs[0].ts)
    ivs.push({ s: Math.max(a, lastMain ? lastMain.ts : a), e: Math.min(b, xs.at(-1).ts), label: fSub(xs.at(-1)), aid })
  }
  ivs.sort((x, y) => x.s - y.s)
  const seg = []; let cur = a
  for (const iv of ivs) {
    if (iv.s > cur) seg.push(...mainSpan(mainEv, cur, iv.s, fMain))
    const s0 = Math.max(iv.s, cur); if (iv.e > s0) seg.push({ label: iv.label, ms: iv.e - s0, from: s0, to: iv.e, aid: iv.aid })
    cur = Math.max(cur, iv.e)
  }
  if (b > cur) seg.push(...mainSpan(mainEv, cur, b, fMain))
  return seg.filter(x => x.label).reduce((o, x) => { if (o.at(-1)?.label === x.label) { o.at(-1).ms += x.ms; o.at(-1).pieces.push(x) } else o.push({ label: x.label, ms: x.ms, pieces: [x] }); return o }, [])
}
/** 흐름 구간마다 사용 도구 : 메인 조각은 그 시간 범위의 메인 기록, 서브에이전트 조각은 그 에이전트 기록 전체 ; 턴 종료 직후 5초(Stop 훅)는 마지막 구간 */
function attachTools(seg, s, a, b) {
  const uniq = xs => { const m = {}; for (const x of xs) (m[x.kind] ||= new Set()).add(x.name); return m }
  const inSpan = pc => s.tools.filter(x => x.ts >= (pc.from === a ? a - 2000 : pc.from) && x.ts <= pc.to)
  let carry = []   // 서브에이전트 구간 중 메인이 쓴 도구(슬래시 명령·훅 등) : 다음 메인 구간으로 넘김
  seg.forEach((g, i) => {
    const xs = []
    for (const pc of g.pieces || []) {
      if (pc.aid) { xs.push(...(s.subTools[pc.aid] || [])); carry.push(...inSpan(pc)) }
      else { xs.push(...carry, ...inSpan(pc)); carry = [] }
    }
    if (i === seg.length - 1) xs.push(...carry, ...s.tools.filter(x => x.ts > b && x.ts <= b + 5000))
    g.tools = uniq(xs)
  })
  return seg
}

function detail(t) {
  const s = session(t.session_id || ''), a = Date.parse(t.ts_req), b = t.ts_res ? Date.parse(t.ts_res) : Date.now()
  const ev = s.ev.filter(e => e.ts >= a && e.ts <= b + 1000)
  const me = e => `${modelLabel(e.model)} · ${e.effort || t.effort || '[확인중]'}`   // 모델과 effort는 같은 기록에서 함께 바뀌므로 한 라벨로 합침
  const flowSeg = flowOf(ev, a, b, e => e.model ? me(e) : '', e => `${me(e)}(${e.who})`)
  const req = s.users.filter(u => Math.abs(u.ts - a) <= 10e3).sort((x, y) => Math.abs(x.ts - a) - Math.abs(y.ts - a))[0]?.tx || t.req_head || ''
  const inWin = s.texts.filter(x => x.ts >= a && x.ts <= b + 1000), lastId = inWin.at(-1)?.id
  const res = inWin.filter(x => x.id === lastId).map(x => x.tx).join('\n')
  return { flow: attachTools(flowSeg.length ? flowSeg : [{ label: `${modelLabel(t.model)} · ${t.effort || '[확인중]'}`, ms: b - a }], s, a, b), req, res }
}

// ── HTML ────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmtTs = ms => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 19)
/** 작업일시 두 줄 : 같은 날이면 1줄 날짜 / 2줄 시작~종료 시각, 날짜가 다르면 1줄 시작 일시 / 2줄 ~ 종료 일시 */
const spanTs = t => { const a = fmtTs(Date.parse(t.ts_req)); if (!t.ts_res) return `${a.slice(0, 10)}<br>${a.slice(11)} ~ <span class="tbd">진행 중</span>`; const b = fmtTs(Date.parse(t.ts_res)); return b.slice(0, 10) === a.slice(0, 10) ? `${a.slice(0, 10)}<br>${a.slice(11)} ~ ${b.slice(11)}` : `${a} ~<br>${b}` }
const toolsCell = xs => xs.map((g, i) => { const parts = KINDS.filter(k => g.tools?.[k]?.size).map(k => `<b class="k k${k}">${k}</b> ${[...g.tools[k]].sort((x, y) => x.endsWith('(선언)') - y.endsWith('(선언)')).map(n => n.endsWith('(선언)') ? `<span class="muted">${esc(n)}</span>` : esc(n)).join(' · ')}`); return `<div class="tl2"><i class="ix">${i + 1}</i>${parts.length ? parts.join('<br>') : '<span class="muted">-</span>'}</div>` }).join('')
const toolsText = xs => xs.map((g, i) => `${i + 1}) ` + (KINDS.filter(k => g.tools?.[k]?.size).map(k => `${k}: ${[...g.tools[k]].join(', ')}`).join(' / ') || '-')).join(' ; ')
const usd = v => '$' + (v || 0).toFixed(2)
/** 흐름 칸(순서 + 구간 비율%) + 그 아래 시간 비율 막대(구간 폭 = 소요 비중) */
function flow(xs, cls) {
  const tot = xs.reduce((s, x) => s + x.ms, 0) || 1, pct = x => Math.round(100 * x.ms / tot)
  const sec = ms => ms >= 60e3 ? `${Math.floor(ms / 60e3)}분 ${Math.round(ms / 1e3) % 60}초` : `${Math.round(ms / 1e3)}초`
  const chips = xs.map(x => `<span class="${cls}${x.label.includes('(') ? ' sub' : ''}" title="${esc(`${x.label} : ${sec(x.ms)} (${pct(x)}%)`)}"><i class="ix">${xs.indexOf(x) + 1}</i>${esc(x.label)} <b>${pct(x)}%</b></span>`).join('<i class="ar">&gt;</i>')
  const bar = xs.map(x => `<i class="seg ${cls}b${x.label.includes('(') ? ' subb' : ''}" style="flex:${Math.max(x.ms, 1)}" title="${esc(`${x.label} : ${sec(x.ms)} (${pct(x)}%)`)}"></i>`).join('')
  return `${chips}<div class="bar">${bar}</div>`
}
const doc = s => { s = redact(s).trim(); if (!s) return '<span class="muted">-</span>'; const head = s.length > CUT.cell ? s.slice(0, CUT.cell) + '…' : s; return s.length > CUT.cell ? `<details><summary>${esc(head)}</summary><div class="full">${esc(s.slice(0, CUT.full))}${s.length > CUT.full ? '\n…(이하 생략)' : ''}</div></details>` : `<div class="full">${esc(s)}</div>` }

const actualOf = t => (t.cost_usd || 0) + (t.cost_agents_usd || 0)
const cmpOf = t => COMPARE.map(([id, label]) => { const v = costUsd(t.tk, id) || 0; return { label, v, save: v - actualOf(t) } })
/** 가정 비용 + 절감(+)·초과(-) : 좋음 다홍·나쁨 네이비(2026-10-06 상태색 규칙) */
const cmpLine = c => `<div class="cmpl"><span class="muted">${c.label}</span> ${usd(c.v)} <span class="${Math.abs(c.save) < 0.005 ? 'muted' : c.save >= 0 ? 'good' : 'bad'}">${Math.abs(c.save) < 0.005 ? '동일' : `${c.save >= 0 ? '절감' : '초과'} ${usd(Math.abs(c.save))}`}</span></div>`
const rows = turns.map(t => ({ t, d: detail(t) }))
const flowText = xs => { const tot = xs.reduce((s, x) => s + x.ms, 0) || 1; return xs.map(x => `${x.label} ${Math.round(100 * x.ms / tot)}%`).join(' > ') }
const exportRows = rows.map(({ t, d }) => { const c = cmpOf(t); return { ym: fmtTs(Date.parse(t.ts_req)).slice(0, 7), span: spanTs(t).replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/ ~ $/, ' ~'), start: fmtTs(Date.parse(t.ts_req)), end: t.ts_res ? fmtTs(Date.parse(t.ts_res)) : '진행 중', type: CAT_LABEL[t.category] || t.category || '-', flow: flowText(d.flow), tools: toolsText(d.flow), cost: +actualOf(t).toFixed(4), cmp: c.map(x => [+x.v.toFixed(4), +x.save.toFixed(4)]), req: redact(d.req).slice(0, CUT.full), res: redact(d.res).slice(0, CUT.full), note: '' } })
const totalCost = rows.reduce((s, { t }) => s + (t.cost_usd || 0) + (t.cost_agents_usd || 0), 0)
const changed = rows.filter(({ d }) => d.flow.length > 1).length
const body = rows.map(({ t, d }) => {
  const notes = [
    t.elapsed_ms != null ? `소요 ${Math.round(t.elapsed_ms / 1000)}초` : '',
    t.tools_total ? `도구 ${t.tools_total}회${t.tool_errors ? ` · 오류 ${t.tool_errors}` : ''}` : '',
    t.agents.length ? `에이전트 ${[...new Set(t.agents.map(x => x.type || x.name || x))].join('·')}` : '',
    t.skills.length ? `스킬 ${[...new Set(t.skills)].join('·')}` : '',
    t.files_changed ? `파일 변경 ${t.files_changed}` : '',
    t.ultrathink ? 'ultrathink' : '',
    t.interrupted ? '중단' : t.superseded ? '대체됨' : !t.ts_res ? '진행 중' : '',
  ].filter(Boolean)
  exportRows[rows.findIndex(r => r.t === t)].note = notes.join(' / ')
  return `<tr data-ym="${fmtTs(Date.parse(t.ts_req)).slice(0, 7)}"><td class="no num"></td><td class="nw">${spanTs(t)}</td>
<td class="nw">${esc(CAT_LABEL[t.category] || t.category || '-')}</td><td>${flow(d.flow, 'm')}</td><td class="tools">${toolsCell(d.flow)}</td>
<td class="nw num cost">${usd(actualOf(t))}</td><td class="nw num">${cmpOf(t).map(cmpLine).join('')}</td><td class="doc">${doc(d.req)}</td><td class="doc">${doc(d.res)}</td><td class="note">${notes.map(esc).join('<br>')}</td></tr>`
}).join('\n')

const PAGE_SIZE = 10
const COLS = 10   // # · 작업일시 · 유형 · 흐름 · 비용 · 단일 모델 가정 · 지시서 · 결과서 · 기타
// 화면 스크립트 : 연·월 필터 → 필터 결과 순서로 # 번호 → 10줄 페이지 ; 다운로드는 필터와 무관한 전체 목록(UTF-8 BOM CSV, 엑셀에서 한글·줄바꿈 유지)
const CLIENT = `(() => {
  const PAGE = ${PAGE_SIZE}, data = JSON.parse(document.getElementById('rowdata').textContent)
  const trs = [...document.querySelectorAll('tbody tr[data-ym]')], fy = document.getElementById('fy'), fm = document.getElementById('fm')
  const pg = document.getElementById('pg'), cnt = document.getElementById('cnt'); let page = 1
  const btn = (label, p, cur, dis) => '<button type="button" data-p="' + p + '"' + (cur ? ' aria-current="page"' : '') + (dis ? ' disabled' : '') + '>' + label + '</button>'
  function render() {
    const ym = fy.value ? fy.value + (fm.value ? '-' + fm.value : '') : (fm.value ? '-' + fm.value : '')
    const hit = trs.filter(tr => !ym || (fy.value ? tr.dataset.ym.startsWith(ym) : tr.dataset.ym.endsWith(ym)))
    const pages = Math.max(1, Math.ceil(hit.length / PAGE)); page = Math.min(Math.max(1, page), pages)
    trs.forEach(tr => { tr.hidden = true })
    hit.forEach((tr, i) => { tr.cells[0].textContent = i + 1; tr.hidden = Math.floor(i / PAGE) + 1 !== page })
    const a = hit.length ? (page - 1) * PAGE + 1 : 0, b = Math.min(page * PAGE, hit.length)
    cnt.textContent = !trs.length ? '' : hit.length ? '조회 ' + hit.length + '건 중 ' + a + '–' + b : '조회 0건'
    const none = document.getElementById('none'); if (none) none.hidden = hit.length > 0   // 기록 0건 페이지에는 안내 행이 없음
    let h = btn('‹ 이전', page - 1, false, page === 1)
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 2) h += btn(p, p, p === page); else if (Math.abs(p - page) === 3) h += '<span class="muted">…</span>'
    pg.innerHTML = hit.length ? h + btn('다음 ›', page + 1, false, page === pages) : ''
  }
  pg.addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b && !b.disabled) { page = +b.dataset.p; render() } })
  fy.addEventListener('change', () => { page = 1; render() }); fm.addEventListener('change', () => { page = 1; render() })
  document.getElementById('dl').addEventListener('click', () => {
    const q = v => { if (typeof v === 'number') return String(v); v = String(v == null ? '' : v); if (/^[=+\\-@\\t\\r]/.test(v)) v = "'" + v; return /[",\\r\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
    const head = ['#', '작업일시', '작업시작일시', '작업종료일시', '작업 유형', '모델&버전 · Effort 흐름', '사용 도구', '비용(USD)']
    data.cols.forEach(c => head.push(c + ' 100% 사용 시 비용(USD)', c + ' 대비 절감(USD, 음수 = 초과)'))
    head.push('작업 지시서', '작업 결과서', '기타 설명')
    const lines = [head.map(q).join(',')].concat(data.rows.map((r, i) => [i + 1, r.span, r.start, r.end, r.type, r.flow, r.tools, r.cost].concat(...r.cmp, r.req, r.res, r.note).map(q).join(',')))
    const blob = new Blob(['\\ufeff' + lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'myClaudeModelChange_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.csv'
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 0)
  })
  render()
})()`
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>요청별 모델·effort 변경 이력</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--page:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--w:#2a78d6;--o:#eb6834;--ring:rgba(11,11,11,.10);--hd:#1f3a68}
@media (prefers-color-scheme: dark){:root{color-scheme:dark;--surface:#1a1a19;--page:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--w:#3987e5;--o:#d95926;--ring:rgba(255,255,255,.10);--hd:#2b4677}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:13.5px/1.5 "Nanum Gothic","Malgun Gothic",system-ui,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:1600px;margin:0 auto;padding:24px}h1{font-size:21px;margin:0 0 4px}.meta{color:var(--ink2);font-size:12.5px;margin:0 0 14px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:0 0 14px}.tile{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:10px 14px}.tl{color:var(--ink2);font-size:12.5px}.tv{font-size:22px;font-weight:700}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:6px 10px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:1800px}th,td{border-bottom:1px solid var(--grid);padding:7px 8px;text-align:left;vertical-align:top}th,th.num{color:#fff;background:var(--hd);position:sticky;top:0;white-space:nowrap;font-weight:700;text-align:center;vertical-align:middle}th small{color:rgba(255,255,255,.75)!important}.ix{display:inline-block;min-width:15px;height:15px;line-height:15px;border-radius:8px;background:var(--axis);color:var(--ink);font-size:10px;font-style:normal;text-align:center;margin-right:4px;vertical-align:1px}.tools{min-width:230px;max-width:340px;font-size:12.5px}.tl2{margin:0 0 5px;line-height:1.45}.k{font-size:11px;padding:0 4px;border-radius:3px;margin-right:2px;color:#fff}.kAgent{background:#2a78d6}.kHook{background:#52514e}.kMCP{background:#8a5cc2}.kSkill{background:#1f8a5a}.kPlugin{background:#b2611a}td.cost{color:var(--w);font-weight:700}.cmpl{white-space:nowrap}.cmpl+.cmpl{margin-top:4px}
.nw{white-space:nowrap}.num{text-align:right}.doc{min-width:240px;max-width:380px}.note{min-width:170px;word-break:keep-all;color:var(--ink2);font-size:12.5px}
.m,.e{display:inline-block;border:1px solid var(--axis);border-radius:5px;padding:0 6px;margin:1px 0;white-space:nowrap}.m{border-color:var(--w);color:var(--w)}.e{border-color:var(--o);color:var(--o)}.sub{border-style:dashed}
.m b,.e b{font-weight:700;margin-left:2px}.bar{display:flex;gap:2px;height:7px;margin-top:4px;min-width:200px}.seg{display:block;border-radius:2px;min-width:2px}.mb{background:var(--w)}.eb{background:var(--o)}.subb{opacity:.45}
.ar{color:var(--muted);margin:0 3px;font-style:normal}.full{white-space:pre-wrap;word-break:break-word}summary{cursor:pointer;white-space:pre-wrap;word-break:break-word}details[open] summary{color:var(--muted)}
.muted{color:var(--muted)}.good{color:#e8503a;font-weight:700}.bad{color:#1f3a68;font-weight:700}@media (prefers-color-scheme: dark){.good{color:#f0705c}.bad{color:#5b7fc2}}th small{font-weight:400;color:var(--muted)}.tbd{color:#d03b3b;font-weight:700}.empty{padding:28px;text-align:center;color:var(--ink2)}.ctl{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 10px}.ctl select,.ctl button,.pg button{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--axis);border-radius:6px;padding:4px 10px;cursor:pointer}.sp{flex:1}.pg{display:flex;gap:4px;justify-content:center;margin:12px 0 0;flex-wrap:wrap}.pg button[aria-current]{background:var(--w);border-color:var(--w);color:#fff}.pg button:disabled{opacity:.4;cursor:default}td.no{color:var(--muted)}
</style></head><body><main>
<h1>요청별 모델·effort 변경 이력</h1>
<p class="meta">기준 시각 ${fmtTs(FROM)} 이후 요청 · 갱신 ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })} (매 턴 종료 시 자동) · 모델 흐름의 점선 칸·옅은 막대 = 서브에이전트 단계 · 칸의 % 와 막대 폭 = 턴 소요 중 시간 비율 · 비용은 API 단가 환산값(구독제, 청구액 아님) · 100% 사용 시 = 같은 토큰량에 그 모델 단가 적용(모델별 토큰량 차이 미반영), 절감 = 가정 비용 - 실제 비용 · 경로·비밀값은 마스킹</p>
<div class="tiles"><div class="tile"><div class="tl">요청</div><div class="tv">${rows.length}</div></div><div class="tile"><div class="tl">턴 안에서 모델·effort 변경</div><div class="tv">${changed}</div></div><div class="tile"><div class="tl">비용 합계(API 환산)</div><div class="tv">${usd(totalCost)}</div></div>${COMPARE.map(([id, l]) => { const v = rows.reduce((s, { t }) => s + (costUsd(t.tk, id) || 0), 0), d = v - totalCost; return `<div class="tile"><div class="tl">${l} 100% 사용 시</div><div class="tv">${usd(v)}</div><div class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '절감' : '초과'} ${usd(Math.abs(d))}</div></div>` }).join('')}</div>
<div class="ctl"><label>연도 <select id="fy"><option value="">전체</option>${[...new Set(exportRows.map(r => r.ym.slice(0, 4)))].sort().reverse().map(y => `<option>${y}</option>`).join('')}</select></label><label>월 <select id="fm"><option value="">전체</option>${Array.from({ length: 12 }, (_, i) => `<option>${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label><span id="cnt" class="muted"></span><span class="sp"></span><button id="dl" type="button">전체 목록 엑셀 다운로드</button></div>
<div class="card"><table><thead><tr><th class="num">#</th><th>작업일시</th><th>작업 유형</th><th>모델&amp;버전 · Effort 흐름</th><th>사용 도구<br><small>Agent · Hook · MCP · Skill · Plugin</small></th><th class="num">비용</th><th class="num">${COMPARE.map(([, l]) => l.replace(' ', '')).join('/')} 100% 사용시<br><small>가정 비용 · 실제 대비</small></th><th>작업 지시서</th><th>작업 결과서</th><th>기타 설명</th></tr></thead>
<tbody>${body ? body + `<tr id="none" hidden><td colspan="${COLS}" class="empty">조회 결과가 없습니다</td></tr>` : `<tr><td colspan="${COLS}" class="empty">기준 시각 이후 완료된 요청 없음 : 다음 요청부터 자동 기록</td></tr>`}</tbody></table></div>
<nav id="pg" class="pg" aria-label="페이지"></nav>
</main>
<script type="application/json" id="rowdata">${JSON.stringify({ cols: [...COMPARE.map(([, l]) => l)], rows: exportRows }).replace(/</g, '\\u003c')}</script>
<script>${CLIENT}</script></body></html>`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, html)
if (!args.includes('--quiet')) console.log(`${path.relative(PROJECT, OUT)} : 요청 ${rows.length}건, 턴 내 변경 ${changed}건`)
