// Stop 훅 : 턴 묶음 판정(보이는 CDX 칸 중 Y 아닌 칸을 Codex 1회로) → 아소카 종료 승인('종료 승인 : <승인|보류> — <근거>' 줄) 강제
//   (2026-11-10 마스터 "각 CDX마다 … 반드시 검증단계를 누락시키지 말고, 총괄검수가 끝나면 반드시 파다완 아소카의 종료 승인이 있어야 모든 프로세스를 종료" · 선택 "턴 묶음 1회 판정"·"아소카(메인) 직접 승인")
// 실행 : 루트 .claude/settings.json Stop(동기, timeout 300) — 판정 결과·차단 횟수 캐시 .omc/state/codex-gate/turn/<세션>.json, 승인 기록 .omc/state/codex-gate/approvals.jsonl
//   어떤 예외도 종료를 막지 않는다(차단하지 않고 turn/errors.log 에 기록). 절차 정본 .claude/engineering/40. loop/codex_procedure.md 13절 규칙 7
// 보류 : 판정자 미가용·실기기·마스터 권한 = 보류 승인 줄 있으면 첫 Stop 허용(없을 때만 차단), 미가용 확인 뒤 10분은 Codex 재호출 생략(래퍼 --skip-judge)
// 시험 : node .claude/hooks/turn-gate.mjs --selftest (가짜 판정자 CODEX_JS · 상태 루트 격리 — Codex 실호출 없음)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
import { stateOf, sayOf, capMid, tailJsonl, readJsonl, textOf, kst, changedFiles, splitScope, costOf, packGroups, jobsFor, judgeOne, nextIter, runGenerator, genText, requestMd, ledgerSummary, readAgent, toolLines, redact } from './codex-gate.mjs'
import { buildRequestGraph, loadLoops, partBase, agentRounds, toolEventsOf, groupTools, promptsOf, harnessTouched, shortType, approvalOf, turnKey } from '../../scripts/request-graph.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const stRoot = () => path.resolve(process.env.CODEX_GATE_STATE || path.join(ROOT, '.omc', 'state'))
const S = () => { const s = stateOf(stRoot()); return { ...s, turn: path.join(stRoot(), 'codex-gate', 'turn'), approvals: path.join(stRoot(), 'codex-gate', 'approvals.jsonl') } }
const C = {
  wrapper: path.join(ROOT, 'scripts', 'codex-verify.mjs'),
  rules: path.join(ROOT, '.claude', 'engineering', '50. graph', 'anakins_graph.md'),
  runs: path.join(ROOT, '.omc', 'state', 'request-graph', 'runs.jsonl'),
  budgetMs: 270e3,
  coolMs: 10 * 60e3,        // 판정자 미가용(인증 만료·한도) 확인 뒤 Codex 재호출 생략 시간(coordinator 2026-11-10 — 턴마다 5칸 재호출 결함), codex-gate cooldownMs 와 같은 값          // 훅 timeout 300초 안 — 판정·증거·생성기 전부
  cap: 3,                   // 한 턴 연속 차단 합계 상한(Claude Code 강제 종료 상한 8 전 — 마스터 브리프 T-2)
  groupBudget: 360 * 1024,  // codex-gate 묶음 예산과 같은 값 — 하네스 파일이 넘으면 c3 를 파일 묶음 원장(-pN)으로 따로 판정
  envFlag: 'CODEX_GATE_ACTIVE',
  noScope: 'docs/__codex-gate-no-files__',
  human: ['judge-unavailable', 'device', 'master-permission', 'in-progress'],   // 1회 차단 뒤 '보류' 줄로 종료 허용(판정자 미가용·실기기·마스터 권한 = 메인이 고칠 수 없음, in-progress = 서브에이전트 수정 진행 중 — 칸 상태 표 필수)
  table: '응답에 칸별 판정 상태 표(| 칸 | 상태 Y/N/보류 | 보류·N 사유 | 원장 |)를 적을 것 — Y 아닌 칸은 사유 필수',   // 2026-11-10 c6-turn-f7dc16 D-001
  held: new Set(['H', 'G']),   // 서브에이전트 실행 중 '수정 진행 중' 보류 칸(산출 미완료라 증거 없음 — 결함 9), P·X·T 는 응답만으로 계속 판정
  respCells: new Set(['P', 'X', 'T']),   // 증거에 메인 응답이 들어가는 칸 — 응답만 바뀌면 이 칸만 다음 회차(결함 9)
}
/** 응답의 칸별 상태 표 : 표 줄('|' 시작·끝) 2줄 이상 + 칸 표기(c1~c6 또는 '칸') */
export const hasCellTable = s => { const ls = String(s || '').split('\n').filter(l => /^\s*\|.*\|\s*$/.test(l)); return ls.length >= 2 && ls.some(l => /\bc[1-6]\b|칸/.test(l)) }
/**
 * 실행 중 서브에이전트(결함 7 — 메인 기록 기준) : Agent·Task·Workflow 백그라운드 실행 결과('launched' + agentId/Task ID) 또는 그 id 로 SendMessage(재개) 뒤에
 *   같은 id 의 작업 알림(<task-notification><task-id>id … status ≠ running)이 아직 없으면 실행 중. 동기 실행(결과가 곧 보고)은 대상 아님, 6시간 넘은 실행은 버림(알림 유실 대비)
 */
export function runningAgents(recs, now = Date.now(), maxAgeMs = 6 * 3600e3) {
  const uses = new Map(), launch = new Map(), done = new Map(), txt = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => typeof b === 'string' ? b : b?.text || '').join('\n') : ''
  for (const j of recs) {
    if (j.isSidechain) continue
    const t = ms(j.timestamp); if (t == null) continue
    if (j.type === 'assistant' && Array.isArray(j.message?.content)) for (const b of j.message.content) if (b?.type === 'tool_use' && ['Agent', 'Task', 'Workflow', 'SendMessage'].includes(b.name)) uses.set(b.id, { name: b.name, t, to: String(b.input?.to || '') })
    const body = j.type === 'user' ? j.message?.content : j.type === 'attachment' && j.attachment?.type === 'queued_command' ? j.attachment.prompt : null
    if (Array.isArray(body)) for (const b of body) if (b?.type === 'tool_result' && uses.has(b.tool_use_id)) {
      const u = uses.get(b.tool_use_id), s = txt(b.content), m = /agentId: (\w+)|Task ID: (\w+)/.exec(s)
      if (u.name === 'SendMessage') { if (launch.has(u.to)) launch.set(u.to, Math.max(launch.get(u.to), u.t)) } else if (m && /launched/i.test(s)) launch.set(m[1] || m[2], u.t)
    }
    for (const m of txt(body).matchAll(/<task-notification>[\s\S]*?<task-id>(\w+)<\/task-id>[\s\S]*?(?:<\/task-notification>|$)/g)) if (!/<status>running<\/status>/.test(m[0])) done.set(m[1], Math.max(done.get(m[1]) ?? 0, t))
  }
  return [...launch].filter(([id, t]) => now - t < maxAgeMs && !((done.get(id) ?? -1) >= t)).map(([id]) => id)
}
/** 칸 정의 : 그래프 CDX 칸 → 원장 칸 번호 · 묶음 기준 ID 접두 · 늘 판정(always) — 하네스(도구 1건 이상)·루프(N 1회 이상 또는 반복 2회 이상)는 그래프가 보일 때만 */
export const CELLS = [
  { slot: '1.1.1.1', no: 1, prefix: 'P', name: '프롬프트', always: true },
  { slot: '1.1.2.1', no: 2, prefix: 'X', name: '컨텍스트', always: true },
  { slot: '1.1.3.1', no: 3, prefix: 'H', name: '하네스' },
  { slot: '1.1.4.1', no: 4, prefix: 'L', name: '루프' },
  { slot: '1.1.5.1', no: 5, prefix: 'G', name: '그래프', always: true },
  { slot: '1.1.5.2.1', no: 6, prefix: 'T', name: '총괄', always: true },
]
const AC = {
  P: ['메인 브리프·SendMessage 가 마스터 요청 항목을 빠짐없이, 요청에 없는 해석을 더하지 않고 전달한다(서브에이전트 없는 메인 단독 턴은 해당 없음 = met)', '브리프마다 쓰기 허용·금지 경로와 명령·파일·수치로 판정 가능한 완료 기준이 있다(브리프 없으면 해당 없음 = met)', '메인 응답이 마스터 요청 항목별 결과를 보고하고 못 한 항목은 사유를 밝힌다'],
  X: ['이 턴이 쓴 맥락(훅 주입·읽은 파일·collect 결과)이 요청 처리에 필요한 근거를 덮는다', 'collect 결과의 주장·수치에 출처(경로:줄·명령)가 있다(collect 없으면 해당 없음 = met)', '확인하지 못한 값은 [확인중]·[TBD] 로 표기된다'],
  H: ['하네스 파일 변경(훅·settings·에이전트 정의·운용 기준서)이 규칙과 정합하고 우회·회귀가 없다(변경 없으면 해당 없음 = met)', '도구 사용 기록에 금지 행위(원격 푸시·비밀 출력·운영 DB 적용·Codex 직접 실호출) 흔적이 없다', '하네스 파일을 바꿨다면 selftest·node --check 통과 근거가 메인 응답·보고에 있다(변경 없으면 해당 없음 = met)'],
  L: ['되돌림(N)마다 회송·재판정 기록이 있고 마지막 판정이 Y 이거나 사유 있는 보류다', '반복 실행·판정 회차가 상한 5 이내다', '같은 결함 반복·상한 도달은 메인 응답에 보고된다'],
  G: ['생성기 실행 종료 코드가 0 이다', '요청 md 의 엔지니어링 N/5·검증 누락·위반 수가 칸별 판정 요약과 모순이 없다', '그래프 표시가 정본 규칙(anakins_graph.md)을 어기지 않는다'],
  T: ['칸별 최종 판정 요약에서 Y 아닌 칸·보류 사유가 메인 응답에 보고된다', '마스터 요청 항목마다 결과 근거(파일·명령·수치)가 메인 응답에 있다', '메인 응답이 칸별 판정·원장과 모순되지 않는다'],
}

const iso = t => new Date(t).toISOString()
const ms = v => { const t = Date.parse(v); return Number.isNaN(t) ? null : t }
const relOf = p => { const r = path.relative(ROOT, path.resolve(ROOT, String(p || ''))).replace(/\\/g, '/'); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : null }
const isReq = s => !!s && !/^\s*(<local-command|<command-|<task-notification>|<teammate-message|<agent-message|<user-prompt-submit-hook|Another Claude session sent a message:|\[Request interrupted)/.test(s)
const clean = s => String(s || '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
const tools = recs => recs.flatMap(j => j?.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use').map(b => ({ t: ms(j.timestamp), b })) : [])

/** 메인 세션 기록 → 이 턴 { a(시작 시각), prompts } : 시작 = 마지막 마스터 요청(type 'user' 사람 글 — 훅 차단 사유는 attachment 라 새 턴이 아님), 그 뒤 큐 입력(queued_command)도 같은 턴 요청 */
export function turnOf(recs) {
  const rs = recs.filter(j => !j.isSidechain).map(j => ({ j, t: ms(j.timestamp), text: clean(sayOf(j) || '') })).filter(r => r.t != null && isReq(r.text))
  const k = rs.findLastIndex(r => r.j.type === 'user')
  return k < 0 ? null : { a: rs[k].t, prompts: rs.slice(k).map(r => ({ t: r.t, text: r.text })) }
}
/** 이 턴에 일한 서브에이전트(최상위 subagents/ — 시작 이후 바뀐 기록만) : [{ ag(그래프 agents_detail 모양), recs }] — 회차 = 턴 시작 뒤 시작한 전달 회차만 */
export function subagentsOf(dir, a, now = Date.now()) {
  let fs0 = []; try { fs0 = fs.readdirSync(dir).filter(f => /^agent-.+\.jsonl$/.test(f)) } catch { return [] }
  return fs0.flatMap(f => {
    const p = path.join(dir, f); try { if (fs.statSync(p).mtimeMs < a) return [] } catch { return [] }
    const recs = tailJsonl(p, Infinity), rounds = agentRounds(recs, { alive: now - fs.statSync(p).mtimeMs < 10 * 60e3 }).filter(r => r.t0 != null && r.t0 >= a)
    if (!rounds.length) return []
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(p.replace(/\.jsonl$/, '.meta.json'), 'utf8')) } catch { /* meta 없음 */ }
    const t1s = rounds.map(r => r.t1).filter(v => v != null), run = rounds.some(r => r.run), type = meta.customAgentType || meta.spawnedAgentType || meta.agentType || '서브에이전트'
    return [{ recs: recs.filter(j => (ms(j.timestamp) ?? 0) >= a), ag: { agent_id: f.slice(6, -6), type, name: meta.description, ts_start: iso(rounds[0].t0), ts_end: run || !t1s.length ? null : iso(Math.max(...t1s)), live: run, errors: rounds.reduce((s, r) => s + (r.errors || 0), 0), ...(rounds.length >= 2 ? { rounds } : {}), harness: harnessTouched(recs) } }]
  })
}

/** 칸 계약(자동) — 칸 검수 대상 + 기본 AC 3개. 묶음 판정 때 래퍼가 AC-n → <접두>-n 으로 바꾼다 */
export const turnContract = (cell, id, key, a) => [`# 자동 계약 — ${id} (turn-gate 턴 묶음 판정, ${new Date().toISOString()})`, '',
  `- 판정 대상 : 메인 세션 턴 ${key}(마스터 요청 ${kst(a)}) 의 칸 c${cell.no} ${cell.name}(그래프 ${cell.slot})`, '- 기준선 : 없음(HEAD 기준 — 같은 시간 다른 세션 변경이 섞일 수 있음, 하네스 칸 scope = 턴 시작 뒤 바뀐 하네스 파일)', '',
  '## 완료 기준', ...AC[cell.prefix].map((x, i) => `- AC-${i + 1} : ${x}`), ''].join('\n')

/**
 * 이 턴 관련 서브에이전트(2026-11-10 c1·c2-turn-f7dc16 — 브리프 근거인 수집 보고·SendMessage 가 증거에 없었음) : 이 턴 실행 + 이 턴 작업 알림 task-id + 브리프·SendMessage 가 가리킨 agent id(a+16진 16자)
 *   → [{ id, type, desc, brief(받은 지시 = 첫 프롬프트 + SendMessage 추가 지시), report(정지 응답 전부), notes(이 턴 알림 결과 요지) }] 최대 6개
 */
export function relatedAgents(x, dir) {
  const notes = new Map()
  for (const j of x.mainRecs) { const s = j.type === 'user' ? textOf(j.message?.content) : j.type === 'attachment' && j.attachment?.type === 'queued_command' ? textOf(j.attachment.prompt) : ''; for (const m of s.matchAll(/<task-notification>[\s\S]*?<task-id>(\w+)<\/task-id>([\s\S]*?)(?:<\/task-notification>|$)/g)) { const r = /<result>([\s\S]*?)(?:<\/result>|$)/.exec(m[2]); notes.set(m[1], [...(notes.get(m[1]) || []), `${kst(ms(j.timestamp))} ${(/<status>(\w+)/.exec(m[2]) || [])[1] || ''} : ${(r ? r[1] : (/<summary>([\s\S]*?)<\/summary>/.exec(m[2]) || [])[1] || '').trim()}`]) } }
  const said = x.mainTools.filter(({ b }) => ['Agent', 'Task', 'SendMessage'].includes(b.name)).map(({ b }) => JSON.stringify(b.input || {})).join('\n')
  const ids = [...new Set([...x.agents.map(s => s.ag.agent_id), ...notes.keys(), ...(said.match(/\ba[0-9a-f]{16}\b/g) || [])])].filter(id => fs.existsSync(path.join(dir, `agent-${id}.jsonl`))).slice(0, 6)
  return ids.map(id => { const a = readAgent(readJsonl(path.join(dir, `agent-${id}.jsonl`))); let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(dir, `agent-${id}.meta.json`), 'utf8')) } catch { /* meta 없음 */ } return { id, type: m.agentType || m.spawnedAgentType || '서브에이전트', desc: m.description || '', brief: a.brief, report: a.report, notes: notes.get(id) || [] } })
}
/**
 * 칸별 증거 글 — 묶음 증거 상한 300KB(래퍼 evidenceCap) 안 : 칸당 약 20,000자(한글 3바이트 기준 60KB) 이하
 *   P = 요청 · 브리프·SendMessage · 관련 서브에이전트 받은 지시·최종 보고 · 응답 / X = 훅 주입 · 읽은 파일 · 작업 알림 요지 · 산출 중 파일 발췌 / H = 도구 기록(명령·출력 앞 2줄, 비밀 가림 · 파일 = 경로만)
 */
function evidenceOf(cell, x) {
  const P = x.prompts.map(p => `--- 마스터 메시지 (${kst(p.t)}) ---\n${p.text}`).join('\n\n')
  const resp = capMid(x.response || '(메인 응답 없음)', 6000)
  if (cell.prefix === 'P') {
    const br = x.mainTools.filter(({ b }) => ['Agent', 'Task', 'SendMessage'].includes(b.name)).map(({ t, b }) => b.name === 'SendMessage' ? `### SendMessage → ${b.input?.to || '?'} (${kst(t)})\n${capMid(b.input?.message ?? b.input?.content ?? '', 3000)}` : `### Agent ${b.input?.subagent_type || 'general-purpose'} (${kst(t)}) — ${b.input?.description || ''}\n${capMid(b.input?.prompt || '', 4000)}`)
    const rep = (x.related || []).map(r => `### ${r.type} ${r.id.slice(0, 6)}${r.desc ? ` — ${r.desc}` : ''}\n#### 받은 지시(첫 프롬프트 + SendMessage 추가 지시)\n${capMid(r.brief || '(없음)', 2500)}\n#### 최종 보고(정지 응답 전부)\n${capMid(r.report || '(보고 없음)', 4000)}`)
    return { 'request.md': capMid(P, 3000), 'briefs.md': capMid(br.join('\n\n') || '(이 턴 브리프·SendMessage 없음 — 메인 단독 턴)', 6000), 'reports.md': capMid(rep.join('\n\n') || '(이 턴 관련 서브에이전트 보고 없음)', 9000), 'response.md': capMid(x.response || '(메인 응답 없음)', 3000) }
  }
  if (cell.prefix === 'X') {
    const hooks = x.mainRecs.filter(j => j.type === 'attachment' && j.attachment?.hookEvent).map(j => `${kst(ms(j.timestamp)).slice(11)} ${j.attachment.hookEvent}${j.attachment.hookName ? ' ' + j.attachment.hookName : ''} [${j.attachment.type}]${j.attachment.type === 'hook_additional_context' ? ' : ' + String(j.attachment.content ?? '').replace(/\s+/g, ' ').slice(0, 300) : ''}`)
    const reads = [...new Set([...x.mainTools, ...x.agents.flatMap(s => tools(s.recs))].filter(({ b }) => b.name === 'Read').map(({ b }) => relOf(b.input?.file_path) || '(저장소 밖 경로)'))]
    const notes = (x.related || []).flatMap(r => r.notes.map(n => `- ${r.type} ${r.id.slice(0, 6)} ${capMid(n, 800)}`))
    const ex = [...new Set(x.writes.map(p => relOf(p)).filter(Boolean))].slice(0, 4).map(f => { let t = '(읽기 실패 — 삭제됨)'; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8') } catch { /* 없음 */ } return `### ${f} (현재 본문 발췌)\n${redact(capMid(t, 1500))}` })
    return { 'context.md': capMid(`## 훅 주입·실행 ${hooks.length}건\n${hooks.join('\n')}\n\n## 읽은 파일(Read) ${reads.length}건\n${reads.join('\n')}\n\n## 이 턴 작업 알림(서브에이전트 결과 요지) ${notes.length}건\n${notes.join('\n') || '(없음)'}\n`, 9000), 'products.md': capMid(ex.join('\n\n') || '(이 턴 Write·Edit 산출 파일 없음)', 7000) }
  }
  if (cell.prefix === 'H') return { 'tools.md': capMid(`## 도구 사용 기록(시각순 — Bash·PowerShell = 명령 + 출력 앞 2줄, 비밀 가림 / Read·Write·Edit = 경로만)\n${x.toolText || '(도구 사용 없음)'}\n\n## 훅 실행(묶음)\n${x.toolLog.filter(l => / hook /.test(l)).join('\n')}\n`, 14000), 'harness-files.txt': x.harness.length ? x.harness.join('\n') + '\n' : '(이 턴 하네스 파일 변경 없음)\n', 'response.md': capMid(x.response || '(메인 응답 없음)', 3000) }
  if (cell.prefix === 'L') return { 'loop.md': capMid(x.loopText, 10000) }
  if (cell.prefix === 'G') return { 'generator.txt': x.gen ? genText(x.gen) : '(생성기 실행 없음)\n', 'request-md.md': x.reqMd ? `<!-- ${x.reqMd.f} -->\n${capMid(x.reqMd.text, 8000)}` : '(이 요청의 요청 md 없음)\n', 'graph-rules.md': capMid(x.rules, 10000) }
  return { 'summary.md': capMid(`## 마스터 요청\n${capMid(P, 3000)}\n\n## 칸별 최종 판정 요약(이 턴 그래프 — 이번 묶음 판정 전)\n${x.cellText}\n\n## 이 턴 원장(턴 시작 뒤 시작)\n${x.ledgers}\n\n## 메인 응답\n${resp}\n`, 16000) }
}

/** 묶음 판정 실행(래퍼 --bundle) → BUNDLE_RESULT 객체 | null. 시간 상한 넘으면 kill */
function runBundle(manifest, id, min, deadline, skip = null, skipReason = null) {
  return new Promise(res => {
    const ch = spawn(process.execPath, [C.wrapper, '--bundle', manifest, '--id', id, '--timeout-min', min.toFixed(2), '--confirm-real', ...(skip ? ['--skip-judge', skip] : []), ...(skip && skipReason ? ['--skip-reason', skipReason] : [])], { cwd: ROOT, env: { ...process.env, [C.envFlag]: '1', CODEX_LOOP_ROOT: S().loops }, windowsHide: true })
    let out = ''; const kill = setTimeout(() => { try { ch.kill() } catch { /* 이미 끝남 */ } }, Math.max(5e3, deadline - Date.now()))
    ch.stdout.on('data', d => { out += d }); ch.stderr.on('data', d => { out += d })
    ch.on('close', code => { clearTimeout(kill); const m = /BUNDLE_RESULT (\{.*\})\s*$/m.exec(out); let r = null; try { r = m ? JSON.parse(m[1]) : null } catch { /* 깨진 출력 */ } res(r || { code: code ?? 3, verdict: 'BLOCKED', reason: 'judge-unavailable', detail: `묶음 판정 실행 실패(종료 ${code}) : ${out.trim().split('\n').at(-1) || '출력 없음'}`, cells: [] }) })
    ch.on('error', e => { clearTimeout(kill); res({ code: 3, verdict: 'BLOCKED', reason: 'judge-unavailable', detail: e.message, cells: [] }) })
  })
}
/** 칸 원장 마지막 판정 결과의 미해결 결함 요약(최대 n) */
function defectsOf(id, iter, n = 6) {
  try { const r = JSON.parse(fs.readFileSync(path.join(S().loops, id, `iter-${iter}.codex.json`), 'utf8')); return (r.defects || []).filter(d => ['open', 'regressed', 'contested'].includes(d.status)).slice(0, n).map(d => `${d.id} ${d.file}${d.line ? ':' + d.line : ''} ${String(d.summary).slice(0, 160)}`) } catch { return [] }
}

/**
 * 턴 판정 : 이 턴을 그래프와 같은 규칙으로 계산 → 보이는 CDX 칸 중 Y 아닌 칸만 Codex 1회(래퍼 --bundle) — 하네스 파일이 묶음 예산을 넘으면 c3 는 파일 묶음 원장(-pN, codex-gate judgeOne)으로 따로
 *   반환 { verdict: 'Y'|'N'|'hold'|'blocked', cells: [{ id, prefix, no, iter, verdict, reason? }], judged(이번에 판정한 칸 수), skipped(이미 Y), detail }
 */
export async function judgeTurn(x, { deadline, cool = null, runGen = () => runGenerator(['--md', '--trigger', 'stop']), only = null, hold = new Set(), prev = [] } = {}) {
  // 이 턴 원장만(2026-11-10 — 같은 시간창의 다른 세션·다른 요청 원장을 '이미 Y' 로 세지 않게) : 이 턴 칸 원장(c<N>-turn-<요청키>) + 이 턴 서브에이전트 접미(-<agentId 앞 6자>) 원장
  const tags = new Set(x.agents.map(s => String(s.ag.agent_id).replace(/[^A-Za-z0-9]/g, '').slice(0, 6)))
  const loops = loadLoops(S().loops).filter(l => { const b = partBase(l.id); return b.endsWith(`-turn-${x.key}`) || tags.has(b.slice(-6)) })
  let runs = []; try { runs = fs.readFileSync(C.runs, 'utf8').split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : [] } catch { return [] } }) } catch { /* 기록 없음 */ }
  const t = { key: x.key, session_id: x.sid, session: x.sid.slice(0, 8), turn: 'stop', ts_req: iso(x.a), ts_res: iso(x.now), req_head: x.prompts[0]?.text.slice(0, 200) || '', prompts: x.prompts, agents_detail: x.agents.map(s => s.ag), toolEvents: x.events, resources: { hooks: [] } }
  const nodes = buildRequestGraph(t, loops, { now: x.now, runs }), by = id => nodes.find(n => n.id === id)
  // 칸 고르기(결함 7·9) : only = null(첫 판정 — 그래프 Y 아닌 칸) | 'all'(산출 바뀜 — 보이는 칸 전부 다음 회차, Y 캐시 금지 c3-codex-ac436f D-001) | Set(응답만 바뀜 — P·X·T)
  //   hold = 서브에이전트 실행 중 '수정 진행 중' 보류 칸(H·G — 직전 결과가 PASS 아니면 Codex 없이 원장 BLOCKED(in-progress)), 나머지 = 직전 결과 재사용(prev)
  const prevOf = c => prev.find(r => r.prefix === c.prefix), isY = c => by(c.slot)?.verdict?.yn === 'Y' || prevOf(c)?.verdict === 'PASS'
  const want = CELLS.filter(c => c.always || by(c.slot))
  const held = want.filter(c => hold.has(c.prefix) && !isY(c))
  const todo = want.filter(c => !held.includes(c) && (only === 'all' ? true : only ? only.has(c.prefix) : by(c.slot)?.verdict?.yn !== 'Y'))
  const reuse = prev.filter(r => !todo.some(c => c.prefix === r.prefix) && !held.some(c => c.prefix === r.prefix)), skipped = want.length - todo.length - held.length
  x.cellText = want.map(c => `- c${c.no} ${c.name}(${c.slot}) : ${by(c.slot)?.statusLabel || '그래프에 없음(이 턴 판정 대상)'}${todo.includes(c) ? ' → 이번 묶음 판정' : held.includes(c) ? ' → 보류(수정 진행 중)' : prevOf(c) ? ` → 직전 ${prevOf(c).iter ?? '-'}회차 ${prevOf(c).verdict} 재사용` : ''}`).join('\n')
  x.loopText = [by('1.1.4') ? `## SA-루프 : ${by('1.1.4').statusLabel}\n${(by('1.1.4').lines || []).join('\n')}` : '## SA-루프 : 반복·되돌림 0건', ...nodes.filter(n => /\.1$/.test(n.id) && n.rounds).map(n => `## ${n.label} : ${n.statusLabel}\n${(n.chips || []).map(c => c.txt).join('\n')}`), ...x.agents.filter(s => s.ag.rounds).map(s => `## ${s.ag.type} 전달 ${s.ag.rounds.length}회`)].join('\n\n')
  x.ledgers = ledgerSummary(x.a, S().loops)
  const idOf = c => `c${c.no}-turn-${x.key}`, bid = `bundle-turn-${x.key}`, bdir = path.join(S().loops, bid)
  // 보류 칸 = 원장에 BLOCKED(in-progress) 만(래퍼 --skip-judge --skip-reason, Codex 호출 없음) — 그래프 '검증 보류(수정 진행 중)'
  const holdRun = async () => {
    if (!held.length) return []
    const hc = held.map(c => { const id = idOf(c), dir = path.join(S().loops, id), ev = path.join(dir, `evidence-${nextIter(path.join(dir, 'ledger.json'))}`); fs.mkdirSync(ev, { recursive: true }); fs.writeFileSync(path.join(dir, 'contract.md'), turnContract(c, id, x.key, x.a)); fs.writeFileSync(path.join(ev, 'hold.txt'), `서브에이전트 실행 중(${(x.running || []).join(', ')}) — 산출 미완료라 이 칸은 수정 진행 중 보류\n`); return { id, no: c.no, prefix: c.prefix, contract: path.join(dir, 'contract.md'), evidence: ev } })
    fs.mkdirSync(bdir, { recursive: true }); const mf = path.join(bdir, 'manifest-hold.json'); fs.writeFileSync(mf, JSON.stringify({ scope: [], cells: hc }, null, 1))
    const r = await runBundle(mf, bid, 0.5, deadline, `서브에이전트 실행 중 — ${(x.running || []).join(', ')}`, 'in-progress')
    return hc.map(c => ({ id: c.id, no: c.no, prefix: c.prefix, iter: (r.cells || []).find(y => y.id === c.id)?.iter ?? null, verdict: 'BLOCKED', reason: 'in-progress' }))
  }
  const fold = (got, extra = {}) => { const all = [...reuse, ...got].sort((p, q) => p.no - q.no), vs = all.map(r => r.verdict), reasons = [...new Set(all.filter(r => r.verdict === 'BLOCKED').flatMap(r => String(r.reason || 'judge-unavailable').split(',')))]
    return { verdict: vs.includes('FAIL') ? 'N' : vs.includes('BLOCKED') ? (reasons.every(r => C.human.includes(r)) ? 'hold' : 'blocked') : 'Y', cooled: !!cool, cells: all.map(({ id, no, prefix, iter, verdict: v, reason }) => ({ id, no, prefix, iter, verdict: v, ...(reason ? { reason } : {}) })), judged: got.filter(r => !held.some(c => c.prefix === r.prefix)).length, held: held.length, skipped, reasons, detail: '', ...extra } }
  if (!todo.length) return fold(await holdRun())
  if (todo.some(c => c.prefix === 'G') && !cool) { x.gen = runGen(); x.reqMd = requestMd({ sessionId: x.sid, requestAt: x.a }); try { x.rules = fs.readFileSync(C.rules, 'utf8') } catch { x.rules = '(정본 규칙 파일 없음)' } }
  // 하네스 칸 scope : 묶음 예산 안이면 묶음에, 넘으면 파일 묶음 원장으로 따로(기존 분할 규칙)
  const hc = todo.find(c => c.prefix === 'H'), costs = Object.fromEntries(x.harness.map(f => [f, costOf(f, 'HEAD')])), split = !cool && hc && x.harness.length && packGroups(x.harness, costs, C.groupBudget).length > 1
  const inBundle = todo.filter(c => !(split && c === hc))
  const cells = inBundle.map(c => {
    const id = idOf(c), dir = path.join(S().loops, id), ev = path.join(dir, `evidence-${nextIter(path.join(dir, 'ledger.json'))}`)
    fs.mkdirSync(ev, { recursive: true }); fs.writeFileSync(path.join(dir, 'contract.md'), turnContract(c, id, x.key, x.a))
    for (const [f, txt] of Object.entries(evidenceOf(c, x))) fs.writeFileSync(path.join(ev, f), txt)
    return { id, no: c.no, prefix: c.prefix, contract: path.join(dir, 'contract.md'), evidence: ev }
  })
  fs.mkdirSync(bdir, { recursive: true })
  const manifest = path.join(bdir, 'manifest.json'); fs.writeFileSync(manifest, JSON.stringify({ scope: inBundle.includes(hc) && x.harness.length ? x.harness : [], cells }, null, 1))
  const min = Math.min(4, (deadline - Date.now() - 25e3) / 60e3)
  const ctx = { type: 'main-turn', agentId: x.key, brief: evidenceOf(CELLS[0], x)['briefs.md'], report: x.response, generated: [], genRuns: [], baseRef: null, request: x.prompts.map(p => p.text).join('\n\n'), requestAt: x.a, t0: x.a, sessionId: x.sid }
  const [b, hs] = await Promise.all([
    cells.length && (min >= 0.5 || cool) ? runBundle(manifest, bid, Math.max(min, 0.5), deadline, cool) : Promise.resolve({ verdict: 'BLOCKED', reason: 'judge-unavailable', detail: 'Stop 훅 시간 예산 부족', cells: [] }),
    split ? Promise.all(jobsFor([{ no: 3, id: idOf(hc) }], { harness: x.harness, product: [] }, f => costs[f]).map(j => judgeOne(j, ctx, deadline).catch(e => ({ ...j, verdict: 'BLOCKED', reason: `judge-unavailable : ${e.message}` })))) : Promise.resolve([]),
  ])
  const got = [...(b.cells || []).map(r => ({ ...r, ...(r.verdict === 'BLOCKED' ? { reason: b.reason || r.reason || 'judge-unavailable' } : {}) })), ...hs.map(r => ({ id: r.id, no: 3, prefix: 'H', iter: r.iter, verdict: r.verdict, ...(r.reason ? { reason: String(r.reason).split(' : ')[0] } : {}) }))]
  for (const c of cells) if (!got.some(r => r.id === c.id)) got.push({ ...c, iter: null, verdict: 'BLOCKED', reason: b.reason || 'judge-unavailable' })   // 래퍼가 칸 결과를 못 낸 경우
  got.push(...await holdRun())   // 묶음 판정 뒤(같은 묶음 원장 잠금 — 순차)
  return fold(got, { detail: b.detail || '' })
}

const loadState = (sid, key) => { try { const s = JSON.parse(fs.readFileSync(path.join(S().turn, `${sid}.json`), 'utf8')); if (s.key === key) return s } catch { /* 새 턴 */ } return { key, blocks: 0 } }
const saveState = (sid, s) => { fs.mkdirSync(S().turn, { recursive: true }); fs.writeFileSync(path.join(S().turn, `${sid}.json`), JSON.stringify(s)) }
const record = r => { fs.mkdirSync(path.dirname(S().approvals), { recursive: true }); fs.appendFileSync(S().approvals, JSON.stringify(r) + '\n') }
const cellsTxt = st => (st.cells || []).map(r => `c${r.no}(${r.prefix}) ${r.iter ?? '-'}회차 ${r.verdict}${r.reason ? `(${r.reason})` : ''}`).join(' · ')
const summaryOf = st => `턴 묶음 판정 : ${st.verdict === 'Y' ? '전부 Y' : st.verdict === 'N' ? 'N 있음' : st.verdict === 'hold' ? `보류(${(st.reasons || []).map(x => x === 'in-progress' ? '수정 진행 중' : x).join(',')})` : 'BLOCKED'} — ${st.reused ? '변경 없음 — 직전 결과 재사용(Codex 0회)' : `판정 ${st.judged ?? 0}칸`}${st.held ? ` · 보류(수정 진행 중) ${st.held}칸` : ''}${st.skipped ? ` · 이미 Y ${st.skipped}칸` : ''}${st.cells?.length ? ` [${cellsTxt(st)}]` : ''}`

/**
 * Stop 입력 → 훅 출력 객체 | null(허용·침묵)
 *   ① 턴 = 마지막 마스터 요청 ~ 지금, 상태 캐시(같은 요청키) ② 차단 합계 cap(3) 도달 = 허용 + '승인 강제 실패' 기록(승인 기록·묶음 원장 폴더)
 *   ③ 판정 : 캐시 없음, 또는 N·BLOCKED 뒤 메인 도구 사용(재작업)이 있으면 다시 판정 ④ N·BLOCKED = 차단(결함·원장 경로) / 보류 사유(판정자 미가용·실기기·마스터 권한) = 1회 차단 뒤 '보류' 승인 줄로 허용
 *   ⑤ 종료 승인 줄 없으면 차단, 있으면 허용 + 승인 기록
 */
export async function turnGate(input, { now = Date.now(), deadline = now + C.budgetMs, changed = null, runGen } = {}) {
  if (process.env[C.envFlag]) return null
  const tp = input?.transcript_path; if (!tp || !fs.existsSync(tp)) return null
  const sid = String(input.session_id || path.basename(tp, '.jsonl')), recs = tailJsonl(tp, 8 * 2 ** 20), turn = turnOf(recs)
  if (!turn) return null
  const key = turnKey(sid, turn.a), st = loadState(sid, key), block = reason => { st.blocks = (st.blocks || 0) + 1; saveState(sid, st); return { decision: 'block', reason: `[turn-gate 차단 ${st.blocks}/${C.cap}] ${reason}` } }
  if (st.done) return null   // 이미 승인으로 끝난 턴(같은 요청에 다시 Stop) — 다시 막지 않음
  if ((st.blocks || 0) >= C.cap) {
    const why = `연속 차단 ${st.blocks}회 상한 — ${st.verdict ? summaryOf(st) : '판정 전'} · 종료 승인 줄 ${approvalOf(input.last_assistant_message) ? '있음(조건 미충족)' : '없음'}`
    record({ sid, key, ts_req: iso(turn.a), at: iso(now), kind: '강제 실패', why })
    try { const d = path.join(S().loops, `bundle-turn-${key}`); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'approval-forced.json'), JSON.stringify({ at: iso(now), why })) } catch { /* 기록 실패 = 승인 기록으로 충분 */ }
    st.done = true; saveState(sid, st)
    return { systemMessage: `[turn-gate] 승인 강제 실패 기록 후 종료 허용 — ${why}` }
  }
  const mainRecs = recs.filter(j => !j.isSidechain && (ms(j.timestamp) ?? 0) >= turn.a), mainTools = tools(mainRecs)
  const response = String(input.last_assistant_message || mainRecs.filter(j => j.type === 'assistant' && textOf(j.message?.content).trim()).map(j => textOf(j.message.content)).at(-1) || '')
  // 변경 감지(결함 7·9 · c3-codex-ac436f D-001) — 직전 판정 뒤 : 산출 = 메인 Write·Edit 또는 서브에이전트 완료 알림(BLOCKED 면 메인 도구 사용도), 응답 = last_assistant_message 해시
  //   첫 판정 = 그래프 Y 아닌 칸 · 산출 바뀜(실행 중 없음) = 보이는 칸 전부 다음 회차 · 응답만 바뀜(또는 실행 중) = P·X·T 만 · 아무것도 안 바뀜 = 직전 결과 재사용(Codex 0회)
  //   실행 중 서브에이전트(runningAgents) 있으면 H·G = '수정 진행 중' 보류(Codex 없이 원장 BLOCKED in-progress)
  const rh = crypto.createHash('sha1').update(response.replace(/^[ \t>*_-]*종료 승인\s*:.*$/gm, '').trim()).digest('hex'), after = t => t > ms(st.judgedAt), running = runningAgents(recs, now)   // 응답 해시 = 승인 줄 뺀 본문(승인 줄만 덧붙인 응답 = 같은 응답)
  const notified = mainRecs.some(j => after(ms(j.timestamp)) && /<task-notification>/.test(j.type === 'user' ? textOf(j.message?.content) : j.type === 'attachment' && j.attachment?.type === 'queued_command' ? textOf(j.attachment.prompt) : ''))
  const prodChanged = !!st.judgedAt && (mainTools.some(x => after(x.t) && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(x.b.name)) || notified || (st.verdict === 'blocked' && mainTools.some(x => after(x.t))))
  const respChanged = !!st.judgedAt && st.respHash !== rh
  const only = !st.judgedAt ? null : prodChanged && !running.length ? 'all' : prodChanged || respChanged ? new Set(C.respCells) : undefined
  const holdNow = running.length && (st.cells || []).some(r => C.held.has(r.prefix) && r.verdict !== 'PASS' && r.reason !== 'in-progress')   // 실행 중 새로 생긴 H·G 결함 = 보류로 바꿈(Codex 없음)
  if (only !== undefined || holdNow) {
    const agents = subagentsOf(path.join(path.dirname(tp), sid, 'subagents'), turn.a, now)
    const events = [...toolEventsOf(mainRecs).map(e => ({ ...e, who: 'main' })), ...agents.flatMap(s => toolEventsOf(s.recs).map(e => ({ ...e, who: shortType(s.ag.type) })))].sort((p, q) => p.t - q.t)
    const writes = [...mainTools, ...agents.flatMap(s => tools(s.recs))].filter(({ b }) => ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name)).map(({ b }) => String(b.input?.file_path || b.input?.notebook_path || '')).filter(Boolean)
    const harness = splitScope(changed ?? changedFiles(writes, turn.a)).harness
    const toolText = [...toolLines(mainRecs, 'main'), ...agents.flatMap(s => toolLines(s.recs, shortType(s.ag.type)))].sort().join('\n')   // 'HH:MM:SS' 머리 = 같은 날 시각순
    const x = { sid, key, a: turn.a, now, prompts: turn.prompts, agents, events, toolLog: groupTools(events).map(g => g.txt), toolText, mainRecs, mainTools, harness, response, writes, running }
    x.related = relatedAgents(x, path.join(path.dirname(tp), sid, 'subagents'))
    // 판정자 미가용 쿨다운 : 10분 안에 미가용을 이미 확인했으면 Codex 를 부르지 않고 칸 원장에 BLOCKED(judge-unavailable)만 기록(래퍼 --skip-judge)
    const uf = path.join(S().turn, 'unavailable.json'); let un = null; try { un = JSON.parse(fs.readFileSync(uf, 'utf8')) } catch { /* 기록 없음 */ }
    const cool = un && now - ms(un.at) < C.coolMs ? `판정자 미가용 쿨다운 — ${kst(ms(un.at))} 확인(10분 재사용, Codex 호출 생략) : ${String(un.detail || '').slice(0, 300)}` : null
    Object.assign(st, await judgeTurn(x, { deadline, cool, only: only === undefined ? new Set() : only, hold: running.length ? C.held : new Set(), prev: st.cells || [], ...(runGen ? { runGen } : {}) }), { judgedAt: iso(Date.now()), respHash: rh, running, reused: false })
    if (!cool && (st.reasons || []).includes('judge-unavailable')) { fs.mkdirSync(S().turn, { recursive: true }); fs.writeFileSync(uf, JSON.stringify({ at: iso(Date.now()), detail: st.detail || '' })) }
    saveState(sid, st)
  } else if (st.judged !== 0 || st.reused !== true) { st.judged = 0; st.reused = true; saveState(sid, st) }   // 변경 없음 = 같은 회차 결과 재사용(Codex 0회)
  const ledgerTxt = (st.cells || []).filter(r => r.verdict !== 'PASS').map(r => `c${r.no}(${r.prefix}) ${r.verdict}${r.reason ? `(${r.reason})` : ''} — 원장 .omc/state/loop/${r.id}${r.verdict === 'FAIL' ? ` · 결함 ${defectsOf(r.id, r.iter).join(' / ') || '(결과 파일 확인)'}` : ''}`).join(' ; ')
  if (st.verdict === 'N') return block(`${summaryOf(st)}. N 칸 결함 : ${ledgerTxt}. 결함 소유 단계(브리프 = 메인, 산출 = build 등)에 회송·재작업하고(같은 원장 다음 회차는 다음 Stop 때 자동 판정, 상한 5회) ${C.table}. 응답 끝에 '종료 승인 : <승인|보류> — <근거>' 줄을 쓸 것`)
  if (st.verdict === 'blocked') return block(`${summaryOf(st)}. BLOCKED : ${ledgerTxt}${st.detail ? ` — ${st.detail}` : ''}. 사유를 해소(잠금·scope·예산 확인)하고 다시 끝낼 것 — 해소할 수 없으면 ${C.table}. 응답 끝에 '종료 승인 : 보류 — <사유>' 줄`)
  const ap = approvalOf(input.last_assistant_message)
  const prog = (st.reasons || []).includes('in-progress')
  if (st.verdict === 'hold' && prog && ap?.kind === '보류' && !hasCellTable(input.last_assistant_message)) return block(`${summaryOf(st)}. 수정 진행 중 보류(서브에이전트 실행 중 ${(st.running || []).join(', ') || '-'}) : ${C.table}. 표와 '종료 승인 : 보류 —' 줄이 둘 다 있어야 보류로 끝낼 수 있다`)
  if (st.verdict === 'hold' && ap?.kind !== '보류') return block(`${summaryOf(st)}. 판정 보류(${(st.reasons || []).join(',')} — ${st.detail || '사유 미기록'}) : 메인이 고칠 수 없는 사유(Codex 인증 만료·한도 = 마스터 재로그인, 실기기·마스터 권한)라 Codex 판정 없이 보류로 끝낼 수 있다. ${prog ? '수정 진행 중(서브에이전트 실행 중 — 끝나면 다음 Stop 때 그 칸 재판정)도 보류 사유다. ' : ''}마스터 보고 항목에 넣고 ${C.table}. 응답 끝에 '종료 승인 : 보류 — <보류 사유>' 줄을 쓰고 끝낼 것(판정 보류 턴은 보류만 — 보류 줄이 이미 있으면 차단하지 않음)`)
  if (!ap) return block(`총괄 검수 결과 ${summaryOf(st)} 확인 후 ${C.table}. 응답 끝에 '종료 승인 : <승인|보류> — <근거>' 줄을 쓰고 끝낼 것`)
  record({ sid, key, ts_req: iso(turn.a), at: iso(now), kind: ap.kind, why: ap.why, verdict: st.verdict, ...(st.verdict === 'hold' ? { hold: { reasons: st.reasons, detail: st.detail, cooled: !!st.cooled, ...(prog ? { label: '보류(수정 진행 중)', running: st.running } : {}) } } : {}) })   // 보류 사유 = 승인 기록 + 칸 원장 BLOCKED + 그래프(1.2 보류 줄·CDX 칸 보류)
  st.done = true; saveState(sid, st)
  return { systemMessage: `[turn-gate] 종료 승인 ${ap.kind} — ${summaryOf(st)}` }
}
/** 훅 본체 : 예외 = 차단하지 않고 turn/errors.log 기록(종료를 영구히 막지 않는다) */
export async function hookMain(input, { gate = turnGate } = {}) {
  try { const r = await gate(input); return r ? JSON.stringify(r) : '' } catch (e) {
    try { fs.mkdirSync(S().turn, { recursive: true }); fs.appendFileSync(path.join(S().turn, 'errors.log'), `${new Date().toISOString()} ${String(e?.stack || e).slice(0, 2000)}\n`) } catch { /* 기록 실패도 침묵 */ }
    return ''
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain && process.argv[2] === '--selftest') {
  const assert = (await import('node:assert/strict')).default
  const st0 = fs.mkdtempSync(path.join(os.tmpdir(), 'tgate-state-')), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tgate-'))
  process.env.CODEX_GATE_STATE = st0   // 원장·승인 기록·캐시 = 임시 상태 루트(실제 .omc/state 를 건드리지 않음), 래퍼에는 CODEX_LOOP_ROOT 로 같은 루트
  assert.ok(S().loops.startsWith(st0) && S().approvals.startsWith(st0))
  // 순수 함수 : 턴 자르기(훅 차단 사유 attachment·task-notification 은 새 턴 아님, 큐 입력은 같은 턴), 계약
  const U = (t, text, extra = {}) => ({ type: 'user', timestamp: t, message: { content: text }, ...extra })
  const tr = turnOf([U('2026-11-10T00:50:00Z', '이전 요청'), U('2026-11-10T01:00:00Z', '이번 요청 <system-reminder>주입</system-reminder>'), { type: 'attachment', timestamp: '2026-11-10T01:01:00Z', attachment: { type: 'queued_command', prompt: '추가 지시', commandMode: 'prompt', origin: { kind: 'human' } } },
    { type: 'attachment', timestamp: '2026-11-10T01:02:00Z', attachment: { type: 'hook_blocking_error', hookEvent: 'Stop', content: '[turn-gate 차단]' } }, U('2026-11-10T01:03:00Z', '<task-notification>x</task-notification>'), U('2026-11-10T01:04:00Z', 'meta', { isMeta: true })])
  assert.deepEqual(tr, { a: Date.parse('2026-11-10T01:00:00Z'), prompts: [{ t: Date.parse('2026-11-10T01:00:00Z'), text: '이번 요청' }, { t: Date.parse('2026-11-10T01:01:00Z'), text: '추가 지시' }] })
  assert.match(turnContract(CELLS[2], 'c3-turn-k', 'k', Date.parse('2026-11-10T01:00:00Z')), /칸 c3 하네스\(그래프 1\.1\.3\.1\)[\s\S]*- AC-1 : 하네스 파일 변경[\s\S]*- AC-3 : /)
  assert.deepEqual(CELLS.map(c => c.prefix).join(''), 'PXHLGT'); assert.ok(Object.values(AC).every(a => a.length === 3))
  // 가짜 판정자 : 모드 파일(mode.txt) pass | fail-H(H-1 unmet + H-D-001) | unavail(종료 1 + token_expired — 인증 만료 = judge-unavailable 분류 확인)
  const fake = path.join(tmp, 'fake-codex.mjs')
  fs.writeFileSync(fake, ["import fs from 'node:fs'", "if (process.argv.includes('login')) process.exit(0)", "let s = ''", "process.stdin.on('data', d => (s += d))",
    "process.stdin.on('end', () => { const mf = new URL('mode.txt', import.meta.url), mode = fs.existsSync(mf) ? fs.readFileSync(mf, 'utf8').trim() : 'pass'; fs.appendFileSync(new URL('calls.log', import.meta.url), mode + '\\n')",
    "  if (mode === 'unavail') { process.stderr.write('401 Unauthorized: token_expired'); process.exit(1) }",
    "  const ids = [...new Set([...s.matchAll(/^- ([PXHLGT]-\\d+) : /gm)].map(m => m[1]))]",
    "  const bad = mode === 'fail-H' && ids.includes('H-1') ? 'H-1' : ''",
    "  const o = process.argv[process.argv.indexOf('-o') + 1]",
    "  fs.writeFileSync(o, JSON.stringify({ verdict: bad ? 'FAIL' : 'PASS', iter: 1, criteria: ids.map(id => ({ id, status: id === bad ? 'unmet' : 'met', met: id !== bad, evidence: 'fake' })), defects: bad ? [{ id: 'H-D-001', severity: 'high', status: 'open', file: '.claude/hooks/x.mjs', line: 3, summary: '가짜 하네스 결함', repro: 'r', fix_hint: 'f' }] : [], blocked: [], blocked_reason: '', notes: 'fake' })) })"].join('\n'))
  const log = path.join(tmp, 'calls.log'); fs.writeFileSync(log, '')
  process.env.CODEX_JS = fake; const setMode = m => fs.writeFileSync(path.join(tmp, 'mode.txt'), m)   // 판정자 환경은 래퍼가 허용 목록만 넘김(judgeEnv) → 모드·호출 기록은 가짜 옆 파일
  const calls = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length
  const sid = 'aa11bb22-0000-4000-8000-000000000001', sess = path.join(tmp, 'proj'); fs.mkdirSync(path.join(sess, sid, 'subagents'), { recursive: true })
  const tp = path.join(sess, `${sid}.jsonl`)
  const base = Date.now(), fresh = () => { process.env.CODEX_GATE_STATE = fs.mkdtempSync(path.join(st0, 's-')) }   // 시나리오마다 새 상태 루트(앞 시나리오 원장이 같은 시간창에 섞이지 않게)
  const mkTurn = (min, extra = []) => { const t = m => new Date(base - (min - m) * 60e3).toISOString(); fs.writeFileSync(tp, [U(t(0), `시험 요청 ${min}`), { type: 'assistant', timestamp: t(1), message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'anakin_phase-build', description: 'x', prompt: '브리프 AC-1 쓰기 허용 scripts/' } }] } }, { type: 'assistant', timestamp: t(2), message: { content: [{ type: 'text', text: '결과 보고' }] } }, ...extra].map(j => JSON.stringify(j)).join('\n') + '\n') }
  const opts = { changed: [], runGen: () => ({ cmd: 'node scripts/request-graph.mjs --md --trigger stop', code: 0, out: '가짜 생성기 ok' }) }
  const stop = (msg, extra = {}) => turnGate({ session_id: sid, transcript_path: tp, last_assistant_message: msg, stop_hook_active: false, ...extra }, opts)
  try {
    // ① 승인 줄 없음 = 판정(전부 Y) 뒤 차단 — 보이는 칸 P·X·H(도구 1건)·G·T, 루프 없음
    mkTurn(30)
    let r = await stop('결과 보고')
    assert.equal(r?.decision, 'block', JSON.stringify(r)); assert.match(r.reason, /총괄 검수 결과 턴 묶음 판정 : 전부 Y — 판정 5칸 \[c1\(P\) 1회차 PASS · c2\(X\) 1회차 PASS · c3\(H\) 1회차 PASS · c5\(G\) 1회차 PASS · c6\(T\) 1회차 PASS\][\s\S]*'종료 승인 : <승인\|보류> — <근거>' 줄/)
    assert.equal(calls(), 1, 'Codex 1회(묶음)')
    const key = loadState(sid, turnKey(sid, turnOf(tailJsonl(tp)).a)).key
    for (const no of [1, 2, 3, 5, 6]) assert.ok(fs.existsSync(path.join(S().loops, `c${no}-turn-${key}`, 'iter-1.codex.json')), `칸 원장 c${no}`)   // 묶음 결과가 칸별 원장으로 나뉨
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(S().loops, `c3-turn-${key}`, 'iter-1.codex.json'), 'utf8')).criteria.map(c => c.id), ['AC-1', 'AC-2', 'AC-3'])
    // ② 승인 줄 있음 + 전부 Y = 허용(재판정 없음 — 캐시), 승인 기록
    r = await stop('결과 보고\n\n종료 승인 : 승인 — 칸 전부 Y', { stop_hook_active: true })
    assert.match(r?.systemMessage || '', /종료 승인 승인 — 턴 묶음 판정 : 전부 Y/); assert.equal(r.decision, undefined); assert.equal(calls(), 1, '재진입은 캐시')
    assert.equal(JSON.parse(fs.readFileSync(S().approvals, 'utf8').trim().split('\n').at(-1)).kind, '승인')
    assert.equal(await stop('다시'), null)   // 승인으로 끝난 턴 = 다시 막지 않음
    // ③ N = 결함과 원장 경로를 담아 차단, 같은 턴 이미 Y 칸은 재판정에서 뺌(재작업 뒤)
    fresh(); mkTurn(20); setMode('fail-H')
    r = await stop('결과 보고')
    assert.equal(r.decision, 'block'); assert.match(r.reason, /N 칸 결함 : c3\(H\) FAIL — 원장 \.omc\/state\/loop\/c3-turn-[\w-]+ · 결함 D-001 \.claude\/hooks\/x\.mjs:3 가짜 하네스 결함/)
    assert.match(r.reason, /\| 칸 \| 상태 Y\/N\/보류 \| 보류·N 사유 \| 원장 \|/)   // c6-turn-f7dc16 D-001 : 차단 사유문 = 칸별 상태 표 지시
    setMode('pass')
    // ③-a 결함 7·9 : 아무것도 안 바뀜(승인 줄만 덧붙임) = 직전 회차 재사용, Codex 0회
    r = await stop('결과 보고\n종료 승인 : 승인 — 그대로'); assert.equal(r.decision, 'block'); assert.match(r.reason, /변경 없음 — 직전 결과 재사용\(Codex 0회\)[\s\S]*N 칸 결함/); assert.equal(calls(), 2, '변경 없음 = 재사용')
    // ③-b 결함 9 : 응답만 바뀜 = P·X·T 만 다음 회차(Codex 1회), H 는 직전 FAIL 재사용
    r = await stop('고침\n종료 승인 : 승인 — 고침'); assert.equal(r.decision, 'block'); assert.equal(calls(), 3, '응답만 바뀜 = 묶음 1회')
    assert.match(r.reason, /판정 3칸[^\[]*\[c1\(P\) 2회차 PASS · c2\(X\) 2회차 PASS · c3\(H\) 1회차 FAIL[^\]]*c6\(T\) 2회차 PASS\]/, r.reason)
    // ③-c c3-codex-ac436f D-001 : 산출 바뀜(메인 Write) = 보이는 칸 전부 다음 회차(Y 캐시 금지) — 되돌림으로 보이게 된 루프 칸 포함
    { const k20 = turnKey(sid, turnOf(tailJsonl(tp)).a); saveState(sid, { ...loadState(sid, k20), blocks: 0 }) }   // 시험 편의 : 위 3회 차단으로 상한(3)에 닿은 카운터만 되돌림(상한 동작은 ⑤ 시험)
    mkTurn(20, [{ type: 'assistant', timestamp: new Date(Date.now() + 1000).toISOString(), message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'scripts/x.mjs', content: '고침' } }] } }])
    r = await stop('고침\n종료 승인 : 승인 — H 재판정 Y')
    assert.equal(calls(), 4); assert.match(r?.systemMessage || '', /종료 승인 승인 — 턴 묶음 판정 : 전부 Y — 판정 6칸 \[c1\(P\) 3회차 PASS · c2\(X\) 3회차 PASS · c3\(H\) 2회차 PASS · c4\(L\) 1회차 PASS · c5\(G\) 2회차 PASS · c6\(T\) 3회차 PASS\]/, r?.systemMessage)
    // ④ 판정자 미가용(인증 만료) = 1회 차단 → '보류' 승인 줄로 허용(승인 줄은 보류만)
    fresh(); mkTurn(10); setMode('unavail')
    r = await stop('결과'); assert.equal(r.decision, 'block'); assert.match(r.reason, /판정 보류\(judge-unavailable — [^)]*token_expired/)   // 보류 줄 없음 = 차단
    r = await stop('결과\n종료 승인 : 승인 — 무시'); assert.equal(r.decision, 'block'); assert.match(r.reason, /보류 사유>' 줄을 쓰고 끝낼 것\(판정 보류 턴은 보류만/)
    r = await stop('결과\n종료 승인 : 보류 — Codex 인증 만료, 마스터 재로그인 필요'); assert.match(r?.systemMessage || '', /종료 승인 보류/); assert.equal(calls(), 5, '미가용 재판정 없음')
    assert.deepEqual(JSON.parse(fs.readFileSync(S().approvals, 'utf8').trim().split('\n').at(-1)).hold.reasons, ['judge-unavailable'])   // 보류 사유 = 승인 기록
    // ④-2 (coordinator 결함 2026-11-10) 보류 줄이 이미 있으면 차단 0회 + 쿨다운(10분) 안 새 요청은 Codex 호출 0회 — 칸 원장에는 BLOCKED(judge-unavailable) 기록
    mkTurn(8)
    r = await stop('결과\n종료 승인 : 보류 — Codex 인증 만료(쿨다운)')
    assert.match(r?.systemMessage || '', /종료 승인 보류 — 턴 묶음 판정 : 보류\(judge-unavailable\)/, JSON.stringify(r)); assert.equal(calls(), 5, '쿨다운 안 = Codex 호출 0회')
    const k8 = turnKey(sid, turnOf(tailJsonl(tp)).a), lb = JSON.parse(fs.readFileSync(path.join(S().loops, `c1-turn-${k8}`, 'ledger.json'), 'utf8')).blocked.at(-1)
    assert.equal(lb.reason, 'judge-unavailable'); assert.match(lb.blocked[0].detail, /판정자 미가용 쿨다운/)   // 보류 사유 = 칸 원장(그래프 CDX 칸 보류)
    // ⑦ 결함 7·9 : 서브에이전트 실행 중(Agent 백그라운드 실행 결과 'launched' + 완료 알림 없음) = H·G '수정 진행 중' 보류(Codex 없이 원장 BLOCKED in-progress), P·X·T 는 판정
    fresh(); setMode('fail-H')
    const AID = 'a0123456789abcdef', launch = [{ type: 'assistant', timestamp: new Date(base - 2.5 * 60e3).toISOString(), message: { content: [{ type: 'tool_use', id: 'tuL', name: 'Agent', input: { subagent_type: 'anakin_phase-build', description: '결함 수정', prompt: '회송' } }] } }, { type: 'user', timestamp: new Date(base - 2.4 * 60e3).toISOString(), message: { content: [{ type: 'tool_result', tool_use_id: 'tuL', content: [{ type: 'text', text: `Async agent launched successfully. agentId: ${AID} (internal)` }] }] } }]
    assert.deepEqual(runningAgents(launch, base), [AID]); assert.deepEqual(runningAgents([...launch, U(new Date(base).toISOString(), `<task-notification>\n<task-id>${AID}</task-id>\n<status>completed</status>\n<result>끝</result>\n</task-notification>`)], base), [])   // 완료 알림 = 실행 끝
    mkTurn(3, launch); const c0 = calls()
    r = await stop('보고 A'); assert.equal(r.decision, 'block'); assert.equal(calls(), c0 + 1, 'P·X·T 판정 1회(H·G 는 Codex 없음)')
    assert.match(r.reason, /턴 묶음 판정 : 보류\(수정 진행 중\) — 판정 3칸 · 보류\(수정 진행 중\) 2칸 \[c1\(P\) 1회차 PASS · c2\(X\) 1회차 PASS · c3\(H\) 1회차 BLOCKED\(in-progress\) · c5\(G\) 1회차 BLOCKED\(in-progress\) · c6\(T\) 1회차 PASS\]/, r.reason)
    const k3 = turnKey(sid, turnOf(tailJsonl(tp)).a)
    assert.equal(JSON.parse(fs.readFileSync(path.join(S().loops, `c3-turn-${k3}`, 'ledger.json'), 'utf8')).blocked.at(-1).reason, 'in-progress')   // 원장 = 보류(수정 진행 중)
    r = await stop('보고 A'); assert.equal(r.decision, 'block'); assert.equal(calls(), c0 + 1, '실행 중 + 변경 없음 = 재판정 0회'); assert.match(r.reason, /변경 없음 — 직전 결과 재사용/)
    r = await stop('보고 A\n\n| 칸 | 상태 | 사유 |\n|---|---|---|\n| c3 하네스 | 보류 | 수정 진행 중 |\n\n종료 승인 : 보류 — 수정 진행 중(build 실행 중)')
    assert.match(r?.systemMessage || '', /종료 승인 보류/, JSON.stringify(r)); assert.equal(JSON.parse(fs.readFileSync(S().approvals, 'utf8').trim().split('\n').at(-1)).hold.label, '보류(수정 진행 중)')
    // ⑤ 연속 차단 3회 상한 = 허용 + 승인 강제 실패 기록(승인 기록 · 묶음 원장 폴더)
    fresh(); mkTurn(5); setMode('pass')
    for (let i = 1; i <= 3; i++) { r = await stop('승인 줄 없음'); assert.equal(r.decision, 'block'); assert.match(r.reason, new RegExp(`차단 ${i}/3`)) }
    r = await stop('승인 줄 없음'); assert.match(r?.systemMessage || '', /승인 강제 실패 기록 후 종료 허용/)
    const k5 = turnKey(sid, turnOf(tailJsonl(tp)).a)
    assert.equal(JSON.parse(fs.readFileSync(S().approvals, 'utf8').trim().split('\n').at(-1)).kind, '강제 실패'); assert.ok(fs.existsSync(path.join(S().loops, `bundle-turn-${k5}`, 'approval-forced.json')))
    // ⑥ 훅 예외 = 차단 없이 허용(오류 기록), 깨진 입력·턴 없음 = 침묵, 훅이 띄운 프로세스 = 재진입 안 함
    assert.equal(await hookMain({}, { gate: () => { throw new Error('시험 예외') } }), ''); assert.match(fs.readFileSync(path.join(S().turn, 'errors.log'), 'utf8'), /시험 예외/)
    const sp = (input, env = {}) => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { input, encoding: 'utf8', env: { ...process.env, ...env } })
    for (const [inp, env] of [['not json', {}], [JSON.stringify({ transcript_path: tmp }), {}], [JSON.stringify({ session_id: sid, transcript_path: tp }), { [C.envFlag]: '1' }]]) { const s = sp(inp, env); assert.equal(s.status, 0); assert.equal(s.stdout, '', inp) }
  } finally {
    for (const k of ['CODEX_JS', 'CODEX_GATE_STATE']) delete process.env[k]
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(st0, { recursive: true, force: true })
  }
  console.log('selftest ok')
} else if (isMain) {
  let raw = ''; for await (const c of process.stdin) raw += c
  let input = {}; try { input = JSON.parse(raw) } catch { /* 깨진 입력 = 침묵 */ }
  const out = await hookMain(input)
  if (out) process.stdout.write(out)
  process.exit(0)
}
