// SubagentStop 훅 : 서브에이전트가 끝나면 그 결과의 Codex 판정(scripts/codex-verify.mjs --init → --confirm-real)을 자동 실행하고 결과를 메인에 알린다
//   (2026-11-10 마스터 결정 — anakin_phase-verify 폐지, "Codex 실행 주체 = 훅 자동 실행", 절차 정본 .claude/engineering/40. loop/codex_procedure.md 13절)
// 실행 : 루트 .claude/settings.json SubagentStart(`--base` : 시작 스냅샷 git stash create) + SubagentStop(판정, timeout 600) + PostToolUse·UserPromptSubmit(`--flush` : 쌓인 판정 결과를 메인 additionalContext 로 1회 전달 — 서브에이전트 안 호출(입력 agent_id)은 건너뜀)
//   큰 산출(2026-11-10 c4 회송) : 칸별 scope 분리(c3 하네스 · c4 그 밖 · 생성물 제외 · c1 파일 없음), 프롬프트 상한 넘으면 원장을 파일 묶음 -p1… 로 나눔(묶음 AND), 같은 요청의 BLOCKED 원장 1회 재판정
//   SubagentStop 의 additionalContext 는 서브에이전트에게 가서 그 에이전트가 계속 돈다(Claude Code 2.1.321 스키마 설명) → 메인 전달은 결과 파일 + 메인 쪽 훅 flush 로 한다
// 시험 : node .claude/hooks/codex-gate.mjs --selftest (가짜 판정자 CODEX_JS — Codex 실호출 없음)
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scrub } from '../../scripts/codex-verify.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
/** 상태 루트(원장·pending·기준선) — 기본 .omc/state, env CODEX_GATE_STATE = 시험 격리(2026-11-10 E : 시험이 실제 pending 에 가짜 결과를 써 메인에 전달된 사고). 원장 루트는 래퍼에 env CODEX_LOOP_ROOT 로 넘긴다 */
export const stateOf = s => ({
  loops: path.join(s, 'loop'),
  pending: path.join(s, 'codex-gate', 'pending'),   // 메인에 아직 안 알린 판정 결과(gitignore)
  sent: path.join(s, 'codex-gate', 'sent'),
  base: path.join(s, 'codex-gate', 'base'),   // 에이전트별 시작 스냅샷(SubagentStart '--base')
})
const C = {
  wrapper: path.join(ROOT, 'scripts', 'codex-verify.mjs'),
  generator: path.join(ROOT, 'scripts', 'request-graph.mjs'),
  graphRules: path.join(ROOT, '.claude', 'engineering', '50. graph', 'anakins_graph.md'),
  reqMd: path.join(ROOT, '.claude', 'engineering', '50. graph', 'requests'),
  ...stateOf(path.resolve(process.env.CODEX_GATE_STATE || path.join(ROOT, '.omc', 'state'))),
  groupBudget: 360 * 1024,  // 묶음당 diff + 본문 추정 상한 — 래퍼 maxPromptBytes 600KB 에서 고정 구획·증거·규칙 문맥 몫을 뺀 값
  embedCap: 200 * 1024,     // 래퍼 maxFileEmbedBytes(파일 1개 본문 상한)
  noScope: 'docs/__codex-gate-no-files__',   // 파일 scope 없는 판정(c1·바꾼 파일 0건) — 없는 경로 = 변경·본문 0, 판정 본체는 증거
  retry: ['scope-too-broad', 'judge-unavailable', 'lock'],   // 자동 재판정 사유(device·master-permission·budget·ledger 는 사람 몫)
  cooldownMs: 10 * 60e3,    // judge-unavailable(사용량 한도 등) 재판정 쿨다운
  budgetMs: 560e3,          // 훅 timeout 600초 안 — --init·export·판정 전부
  minJudgeMin: 1,           // 남은 시간이 이보다 짧으면 판정하지 않고 BLOCKED(judge-unavailable) 기록
  briefMax: 20000, reportMax: 40000, srcMax: 30000,   // 증거 글자 상한(넘으면 앞뒤 보존·가운데 생략 — 래퍼 파일 본문 상한과 같은 규칙)
  genMs: 90e3,              // 생성기 재실행(증거) 시간 상한
  envFlag: 'CODEX_GATE_ACTIVE',   // 훅이 띄운 프로세스 표식 — 재진입 금지
  legacy: 'anakin_phase-verify',  // 폐지된 판정 실행자 — 과거 실행이 끝나도 판정하지 않음(재판정 금지)
}
// 하네스 경로(scripts/request-graph.mjs HARNESS_RE 와 같은 정의 — 훅은 생성기 의존성을 싣지 않으려고 사본, 시험이 두 값 일치를 확인)
export const HARNESS_RE = /(^|[\\/])\.claude[\\/](hooks|agents|skills|engineering[\\/]40\. loop)[\\/]|(^|[\\/])\.claude[\\/]settings[^\\/]*\.json$/
/** 생성물(생성기 산출 — scope 제외, 생성기 실행 증거로만) · 판정 제외 경로(상태·음성·작업 이력) */
export const GEN_RE = /^\.claude\/engineering\/50\. graph\/(myRequestGraph\.html$|request-flow\/|requests\/)|^work-statistics\//
const EXCLUDE_RE = /^(\.omc|voice|work-history|work-statistics)\//
/**
 * 에이전트 종류 → 판정할 원장 칸(codex_procedure.md 13절 표 · request-graph CDX_OF 와 같은 매핑, verify 제외)
 *   brief = 첫 프롬프트(브리프)를 c1 원장으로 함께 판정, sfx = 원장 id 접미(-decide·-review·-commit·-admin)
 *   표에 없는 일반 에이전트 = 바꾼 파일 있으면 c4(산출형) · 없으면 c2(조사형), 하네스 파일 변경 = c3 추가(build·일반 공통)
 */
export const GATE_OF = {
  'anakin_phase-collect': [{ no: 2 }],
  'anakin_phase-build': [{ no: 4 }, { no: 1, brief: true }],
  'anakin_phase-decide': [{ no: 4, sfx: 'decide' }, { no: 1, brief: true }],
  'anakin_phase-review': [{ no: 4, sfx: 'review' }],
  'anakin_phase-graph': [{ no: 5 }],
  'anakin_phase-commit': [{ no: 6, sfx: 'commit' }],
  'teamanakin-admin': [{ no: 6, sfx: 'admin' }],
}
const TARGET = {   // 칸별 검수 대상(13절 표 요약) — 자동 계약의 AC 문구
  1: '메인 브리프 — 요구 항목 누락·추가 해석 없음 / 쓰기 허용·금지 경로 명시 / 완료 기준이 명령·파일·수치로 판정 가능',
  2: '수집·조사 결과 — 주장·수치마다 출처(경로:줄·명령) / 필요한 근거 누락 없음 / 미확인은 [확인중]·[TBD]',
  3: '하네스 파일 변경(훅·settings·에이전트 정의·운용 기준서) — 규칙 정합 / 우회·회귀 없음 / selftest 통과 근거',
  4: '산출물·결론·검수 결과 — 브리프의 완료 기준 충족 / 결론 근거·반론 검토 / 지적의 근거',
  5: 'graph 보고 — 엔지니어링 N/5·미수행·비정상이 생성기 출력과 일치 / 판독이 정본 정의를 따름',
  6: '총괄·커밋·승인 — 요청 항목마다 근거 / 결과 간 모순 없음 / 커밋 묶음·메시지 규칙·비밀 없음 / 승인 등급이 칸별 결과와 일치',
}

/** 원장 id 주제 : 설명(영문·숫자만) 또는 에이전트 종류 짧은 이름, 30자 */
export function slugOf(type, desc) {
  const s = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (s(desc).length >= 3 ? s(desc) : s(String(type || 'agent').replace(/^anakin_phase-|^teamanakin-/, '')) || 'agent').slice(0, 30).replace(/-+$/, '')
}
/** 판정 계획 : [{ id, no, brief }] — 원장 id = c<칸>-<주제>[-접미]-<agentId 앞 6자>(병렬 대상 접미 D-004) */
export function planFor({ type, agentId, desc, changed = [] }) {
  if (!type || type === C.legacy) return []
  const base = GATE_OF[type] || [{ no: changed.length ? 4 : 2 }]
  const harness = changed.some(f => HARNESS_RE.test(f)) && !base.some(x => x.no === 3) && (type === 'anakin_phase-build' || !GATE_OF[type])
  const tag = String(agentId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'a00000', slug = slugOf(type, desc)
  return [...base, ...(harness ? [{ no: 3 }] : [])].map(x => ({ ...x, id: `c${x.no}-${slug}${x.sfx ? '-' + x.sfx : ''}-${tag}`.slice(0, 60) }))
}

export const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : [] } catch { return [] } }) } catch { return [] } }
export const tailJsonl = (f, bytes = 4 * 2 ** 20) => { try { const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, start = Math.max(0, size - bytes), buf = Buffer.alloc(size - start); fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd); const ls = buf.toString('utf8').split('\n'); if (start) ls.shift(); return ls.flatMap(l => { try { return l ? [JSON.parse(l)] : [] } catch { return [] } }) } catch { return [] } }
export const textOf = c => typeof c === 'string' ? c : Array.isArray(c) && !c.some(b => b?.type === 'tool_result') ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : ''   // 도구 결과 묶음 = 글 아님(request-graph textOf 와 같은 규칙)
export const kst = t => new Date(t).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
/**
 * 사용자 측 지시 글(2026-11-10 c1-build-ab3cb5 D-002 근본 수정 — 실기록 2026-11-10 agent-ab3cb567….jsonl·메인 세션 기록에서 확인한 형태) → 글 | null
 *   ① type 'user' 글 : 도구 결과·system-reminder 로 시작하는 글 제외. isMeta 는 origin.kind 'coordinator'(에이전트가 쉬는 사이 받은 SendMessage — 'The coordinator sent a message …')만,
 *      origin 이 있으면 coordinator·human 만(task-notification 등 제외), origin 없음 = 첫 프롬프트·옛 기록
 *   ② type 'attachment' · attachment.type 'queued_command' : 작업 중 받은 SendMessage(origin coordinator) · 메인이 바쁠 때 들어온 마스터 입력(origin human, prompt = 문자열 또는 블록 배열)
 *      origin 없음 = commandMode 'prompt' 만(task-notification 제외), peer(다른 세션) 제외
 */
const SAY = new Set(['coordinator', 'human'])
export function sayOf(j) {
  if (j?.type === 'user') {
    const o = j.origin?.kind, t = textOf(j.message?.content)
    return t.trim() && !/^\s*<system-reminder>/.test(t) && (o ? SAY.has(o) : !j.isMeta) ? t : null
  }
  const a = j?.type === 'attachment' && j.attachment?.type === 'queued_command' ? j.attachment : null
  if (!a || (a.origin ? !SAY.has(a.origin.kind) : a.commandMode !== 'prompt')) return null
  const t = textOf(a.prompt); return t.trim() ? t : null
}
/**
 * 비밀 가림(2026-11-10 c3-turn-f7dc16 AC-2 — 증거에 명령 문자열을 싣기 전에) : 래퍼 scrub(PEM·JWT·Bearer·sk-·gh*_·AKIA·접속 문자열·URL 자격·cred 이름 값) + 환경변수 대입 값
 *   ENV 대입 = 이름에 KEY·SECRET·TOKEN·PASSWORD·PASS·URL·DSN·CREDENTIAL·AUTH 가 들어간 대문자 이름 = 값(따옴표 값 또는 공백 없는 6자 이상)
 */
const ENV_RE = /\b([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|URL|DSN|CREDENTIALS?|AUTH)[A-Z0-9_]*\s*=\s*)("[^"\n]*"|'[^'\n]*'|[^\s"'\[]{6,})/g
export const redact = x => scrub(String(x ?? '')).text.replace(ENV_RE, '$1[REDACTED:env]')
const SHELL = new Set(['Bash', 'PowerShell']), PATHS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
/**
 * 도구 사용 기록 줄(2026-11-10 c3-turn-f7dc16 AC-2 · c2-collect-ac25ad AC-2 — 이름만으로는 금지 행위·근거 명령을 판정할 수 없음) : 시각순 'HH:MM:SS 도구 [누구] : 상세'
 *   Bash·PowerShell = 명령 문자열(redact, 500자) + 출력 앞 2줄(redact, 줄당 200자) / Read·Write·Edit = 경로만(본문·바꾼 글 제외) / Agent = 종류·설명 / SendMessage = 받는 쪽 / Grep·Glob = 패턴·경로 / 그 밖 = 이름만
 */
export function toolLines(recs, who = 'main') {
  const out = new Map(); for (const j of recs) if (j?.type === 'user' && Array.isArray(j.message?.content)) for (const b of j.message.content) if (b?.type === 'tool_result') out.set(b.tool_use_id, Array.isArray(b.content) ? b.content.filter(c => c?.type === 'text').map(c => c.text).join('\n') : String(b.content ?? ''))
  return recs.flatMap(j => j?.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use').map(b => {
    const t = Date.parse(j.timestamp), at = Number.isFinite(t) ? kst(t).slice(11) : '--:--:--', i = b.input || {}
    const d = SHELL.has(b.name) ? `$ ${redact(String(i.command ?? '')).replace(/\s*\n\s*/g, ' ⏎ ').slice(0, 500)}${out.has(b.id) ? `\n    → ${redact(out.get(b.id)).split('\n').filter(l => l.trim()).slice(0, 2).map(l => l.slice(0, 200)).join('\n    → ') || '(출력 없음)'}` : ''}`
      : PATHS.has(b.name) ? String(i.file_path || i.notebook_path || '') : b.name === 'Agent' || b.name === 'Task' ? `${i.subagent_type || 'general-purpose'} — ${String(i.description || '').slice(0, 80)}`
        : b.name === 'SendMessage' ? `→ ${i.to || '?'}` : b.name === 'Grep' || b.name === 'Glob' ? redact(`${i.pattern || ''} ${i.path || ''}`).trim().slice(0, 200) : ''
    return `${at} ${b.name} [${who}]${d ? ' : ' + d : ''}`
  }) : [])
}
/** 상한 넘는 글 = 앞뒤 보존·가운데 생략(래퍼 fileBlock 과 같은 분할 규칙 — 첫 지시·마지막 응답을 둘 다 남긴다) */
export const capMid = (x, n) => { x = String(x || ''); if (x.length <= n) return x; const h = Math.floor(n / 2); return x.slice(0, h) + `\n…[가운데 ${x.length - n}자 생략 — 상한 ${n}자, 앞뒤 보존]…\n` + x.slice(-h) }
const git = (args, root = ROOT) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30e3, maxBuffer: 64 * 2 ** 20 })
/**
 * 서브에이전트 기록 → { brief, report, finals, t0, t1, writes } (2026-11-10 B — 훅 자동 계약 범위 보강)
 *   brief = 첫 프롬프트 + 이후 모든 사용자 측 메시지(sayOf — SendMessage 추가 지시 = user isMeta coordinator · attachment queued_command, 마스터 직접 입력, 시각순 — 시스템 알림·도구 결과 제외)
 *   report = 지시 구간마다 마지막 assistant 글(= 그 구간 최종 응답)을 시각순으로, t0·t1 = 첫·끝 기록 시각, writes = Write·Edit 대상 경로(도구 입력값 중 경로만)
 */
export function readAgent(recs) {
  const ts = j => Date.parse(j.timestamp)
  // 지시 = sayOf(첫 프롬프트·SendMessage 두 형태·마스터 직접 입력). 같은 글이 연달아 두 형태로 남으면 1건
  const idx = []; let prev = null
  recs.forEach((j, i) => { const t = sayOf(j); if (t != null && t !== prev) idx.push(i); if (t != null) prev = t })
  // 정지 글(2026-11-10 c2-collect-ac25ad AC-1 — 본 보고 뒤 백그라운드 알림으로 깨어나 쓴 보충만 남던 문제) : 구간 안에서 assistant 글 다음 대화 기록(assistant·user)이 user 이거나 없음 = 그때 멈춘 응답
  const segs = idx.map((i, k) => recs.slice(i, k + 1 < idx.length ? idx[k + 1] : recs.length)), say = j => j.type === 'assistant' || j.type === 'user'
  const stops = segs.map(sg => sg.filter((j, n) => j.type === 'assistant' && textOf(j.message?.content).trim() && sg.slice(n + 1).find(say)?.type !== 'assistant'))
  const prompts = idx.map(i => recs[i]), finals = segs.map(sg => sg.filter(j => j.type === 'assistant' && textOf(j.message?.content).trim()).at(-1))
  const head = (k, j, what) => k ? `\n\n--- ${what} ${k + 1} (${Number.isFinite(ts(j)) ? kst(ts(j)) : '시각 없음'}) ---\n` : ''
  const tAll = recs.map(ts).filter(Number.isFinite)
  const writes = recs.flatMap(j => j.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use' && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name)).map(b => String(b.input?.file_path || b.input?.notebook_path || '')) : []).filter(Boolean)
  return {
    brief: prompts.map((j, k) => head(k, j, '추가 지시') + sayOf(j)).join(''),
    report: finals.map((j, k) => j ? head(k, j, '최종 응답') + [...stops[k].filter(x => x !== j).map(x => `[중간 정지 응답 ${Number.isFinite(ts(x)) ? kst(ts(x)) : ''}]\n${textOf(x.message.content)}\n\n`), textOf(j.message.content)].join('') : '').join(''),
    finals: finals.map(j => j ? textOf(j.message.content) : ''),
    t0: tAll.length ? Math.min(...tAll) : null, t1: tAll.length ? Math.max(...tAll) : null, writes,
    tSay: prompts.length && Number.isFinite(ts(prompts.at(-1))) ? ts(prompts.at(-1)) : null,   // 마지막 전달 지시 시각(c1-build-ab3cb5 D-003 — request.md 범위 끝)
  }
}
/**
 * 메인 세션 기록 → 마스터 요청 { t, text } (2026-11-10 B) : 에이전트 시작(t0) 직전 마지막 사람 요청부터 에이전트 종료(t1)까지의 마스터 메시지 전부(시각순)
 *   제외 = 훅 주입문·system-reminder 블록·명령 메타·작업 알림·팀원 메시지·중단 표기. t = 첫 요청 시각(재판정 범위 '같은 요청'의 기준)
 *   c1-build-ab3cb5 D-003 : 훅은 t1 = 그 에이전트에 마지막으로 전달된 지시 시각(readAgent tSay)을 넘긴다 — t1 뒤 tNow 까지 들어온 마스터 메시지는
 *   그 에이전트에 전달되지 않은 다른 요청이라 본문에서 빼고 건수만 '후속 요청(이 에이전트 범위 아님)' 줄로 남긴다(later)
 */
export function requestOf(recs, t0, t1 = null, tNow = null, brief = '') {
  const clean = s => String(s).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  const isReq = s => !!s && !/^\s*(<local-command|<command-|<bash-|<task-notification>|<teammate-message|<agent-message|<user-prompt-submit-hook|Another Claude session sent a message:|\[Request interrupted|Stop hook feedback:)/.test(s)
  const rs = recs.filter(j => !j.isSidechain).map(j => ({ t: Date.parse(j.timestamp), text: clean(sayOf(j) || '') })).filter(r => Number.isFinite(r.t) && isReq(r.text))   // 마스터 입력 = user 글 · 바쁠 때 들어온 queued_command(origin human) 둘 다(sayOf)
  let k = t0 == null ? rs.length - 1 : rs.findLastIndex(r => r.t <= t0)
  // 결함 8-4(c1-build-a9509f D-001 — 시작 직전 마지막 메시지가 'Signed in to Codex' 같은 상태 알림이면 실제 요청이 빠짐) : 시작 = 브리프가 인용한 가장 이른 마스터 메시지(직전 10건 안, 머리 16자 일치 — 공백·따옴표 무시)
  const nz = s => String(s).replace(/[\s"'“”‘’`]+/g, ''), nb = nz(brief)
  if (nb && k > 0) for (let i = Math.max(0, k - 9); i < k; i++) { const h = nz(rs[i].text).slice(0, 16); if (h.length >= 12 && nb.includes(h)) { k = i; break } }
  if (k < 0) return null
  const xs = rs.slice(k).filter((r, i) => !i || t1 == null || r.t <= t1)
  // c1-codex-ac436f D-001 : 에이전트 시작(t0) 뒤 ~ 마지막 전달 지시(t1) 사이 마스터 메시지는 다른 요청일 수 있다(실행 중 새 요청 큐) → 본문과 나눠 표기, 전달 여부 = 브리프 '추가 지시'
  const pre = xs.filter((r, i) => !i || t0 == null || r.t <= t0), mid = xs.slice(pre.length)
  const later = t1 == null || tNow == null ? 0 : rs.slice(k + 1).filter(r => r.t > t1 && r.t <= tNow).length
  return { t: xs[0].t, later, text: pre.map((r, i) => (pre.length > 1 ? `--- 마스터 메시지 ${i + 1} (${kst(r.t)}) ---\n` : '') + r.text).join('\n\n')
    + (mid.length ? `\n\n=== 에이전트 실행 중 들어온 마스터 메시지 ${mid.length}건(시작 ${kst(t0)} 뒤 ~ 마지막 전달 지시 ${kst(t1)}) — 이 에이전트에 전달된 것은 브리프의 '추가 지시'에 있다. 추가 지시로 전달되지 않은 메시지는 다른 요청(새 요청 큐)일 수 있어 이 브리프의 누락으로 보지 않는다 ===\n\n` + mid.map((r, i) => `--- 실행 중 마스터 메시지 ${i + 1} (${kst(r.t)}) ---\n${r.text}`).join('\n\n') : '')
    + (later ?`\n\n--- 후속 요청(이 에이전트 범위 아님) : 마지막 지시 ${kst(t1)} 뒤 마스터 메시지 ${later}건 — 이 에이전트에 전달되지 않아 판정 대상에서 제외 ---` : '') }
}

/** 기준선(2026-11-10 c4 회송 — 다른 세션 미커밋 변경 섞임 방지) : SubagentStart 때 `git stash create`(작업 트리를 건드리지 않는 스냅샷 커밋, 깨끗하면 HEAD)를 에이전트별로 남긴다 */
export function snapshotBase(agentId, root = ROOT) {
  if (!agentId) return null
  const s = git(['stash', 'create'], root), sha = (s.status === 0 && s.stdout.trim()) || git(['rev-parse', 'HEAD'], root).stdout.trim()
  if (!/^[0-9a-f]{40}$/.test(sha)) return null
  fs.mkdirSync(C.base, { recursive: true }); fs.writeFileSync(path.join(C.base, `${String(agentId).replace(/[^\w-]/g, '')}.txt`), sha)
  return sha
}
export const baseOf = (agentId, root = ROOT) => { try { const sha = fs.readFileSync(path.join(C.base, `${String(agentId).replace(/[^\w-]/g, '')}.txt`), 'utf8').trim(); return /^[0-9a-f]{40}$/.test(sha) && git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], root).status === 0 ? sha : null } catch { return null } }
/**
 * 그 에이전트가 바꾼 파일(저장소 상대 posix) : 기준선 있음 = `git diff --name-only <기준선>`(작업 트리 대 시작 스냅샷 — 다른 세션의 이전 변경 제외) ∪ 시작 뒤 수정된 미추적 ∪ 기록의 Write·Edit 대상
 *   기준선 없음 = git 변경 중 수정 시각 ≥ 시작 시각 ∪ Write·Edit 대상(종전 — 같은 시간 다른 세션 변경은 섞일 수 있음, 계약에 '기준선 없음' 기록)
 */
/**
 * 결함 8(2026-11-10 c4-build-a9509f scope 오귀속 — 병렬 에이전트·이전 세션 미커밋 변경이 섞이고 gitignore 산출물은 빠짐) 귀속 규칙 :
 *   1차 = 그 에이전트 기록의 Write·Edit·NotebookEdit 대상(정확히 그 에이전트가 쓴 파일, gitignore 무관 — 무시 대상 본문은 증거 written-files.md)
 *   2차(보조) = 그 에이전트가 Bash·PowerShell 을 썼을 때만 : (기준선 diff ∪ 미추적, 기준선 없음 = git status) ∩ 수정 시각 ≥ 시작 — 기준선 이전 미커밋 변경은 시각 조건으로 빠짐
 *     같은 시간 다른 에이전트·메인 기록이 Write·Edit 한 경로(others) = 제외하고 건수만(반환 배열 .excluded — 계약 '병렬 에이전트 귀속 제외 n건')
 *   반환 = 저장소 상대 posix 정렬 배열 + .excluded(숫자) + .own(1차 집합)
 */
export function changedFiles(writes, t0, base = null, root = ROOT, { shell = true, others = new Set() } = {}) {
  const own = new Set(writes.map(p => relOf(p, root)).filter(Boolean)), out = new Set(own)
  const fresh = f => { try { return t0 != null && fs.statSync(path.join(root, f)).mtimeMs >= t0 - 1000 } catch { return false } }
  let excluded = 0
  if (shell) {
    const cand = base ? [...git(['diff', '--name-only', '-z', base], root).stdout.split('\0'), ...git(['ls-files', '--others', '--exclude-standard', '-z'], root).stdout.split('\0')]
      : (g => g.status === 0 ? g.stdout.split('\0').filter(e => e && !e.startsWith('R')).map(e => e.slice(3)) : [])(git(['status', '--porcelain', '-uall', '-z'], root))
    for (const f of new Set(cand)) if (f && !out.has(f) && fresh(f)) { if (others.has(f)) excluded++; else out.add(f) }
  }
  return Object.assign([...out].filter(f => !EXCLUDE_RE.test(f)).sort(), { excluded, own })
}
const relOf = (p, root = ROOT) => { const r = path.relative(root, path.resolve(root, p)).replace(/\\/g, '/'); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : null }
const writesOf = recs => recs.flatMap(j => j?.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use' && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name)).map(b => ({ t: Date.parse(j.timestamp), p: String(b.input?.file_path || b.input?.notebook_path || '') })) : [])
/** 같은 세션 다른 실행(형제 서브에이전트 기록 · 메인 기록)이 t0 뒤 Write·Edit 한 파일(저장소 상대) — scope 귀속 제외용(c2-collect-ac25ad D-001) */
export function otherWrites(dir, self, mainTp, t0, root = ROOT) {
  const out = new Set(), add = recs => { for (const w of writesOf(recs)) if (w.p && !(w.t < (t0 ?? 0) - 1000)) { const r = relOf(w.p, root); if (r) out.add(r) } }
  let fs0 = []; try { fs0 = fs.readdirSync(dir).filter(f => /^agent-.+\.jsonl$/.test(f) && path.join(dir, f) !== path.resolve(self)) } catch { /* 폴더 없음 */ }
  for (const f of fs0) { try { if (fs.statSync(path.join(dir, f)).mtimeMs >= (t0 ?? 0) - 1000) add(readJsonl(path.join(dir, f))) } catch { /* 읽기 실패 = 건너뜀 */ } }
  if (mainTp && fs.existsSync(mainTp)) add(tailJsonl(mainTp, 8 * 2 ** 20).filter(j => !j.isSidechain))
  return out
}
/** 칸별 scope 분리(c4 회송 ①) : c3 = 하네스 경로만 · c4·c2·c5·c6 = 그 밖 산출 파일 · 생성물(설계도판·슬롯 md·실데이터판) = scope 제외(생성기 실행 증거로만) · c1 = 파일 없음 */
export function splitScope(changed) {
  const gen = changed.filter(f => GEN_RE.test(f)), rest = changed.filter(f => !GEN_RE.test(f))
  return { harness: rest.filter(f => HARNESS_RE.test(f)), product: rest.filter(f => !HARNESS_RE.test(f)), generated: gen }
}
/** 파일 1개의 프롬프트 비용 추정(바이트) = diff 본문(래퍼 diff 구획) + 본문 삽입(래퍼 files 구획 — 파일당 200KB 상한 · 줄 번호 15% 가산) */
export function costOf(f, ref, root = ROOT) {
  let size = 0; try { size = fs.statSync(path.join(root, f)).size } catch { /* 삭제 = 본문 없음 */ }
  const d = git(['diff', ref, '--', `:(literal)${f}`], root)
  return Buffer.byteLength(d.stdout || '') + Math.min(size, C.embedCap) * 1.15 + 200
}
/** 파일 묶음(c4 회송 ②) : 큰 것부터 첫 맞춤(first-fit decreasing)으로 묶음당 예산 이하. 혼자 넘는 파일 = 단독 묶음(래퍼가 가운데 생략), 묶음 안은 경로순 — 결정적 */
export function packGroups(files, costs, budget = C.groupBudget) {
  const gs = []
  for (const f of [...files].sort((a, b) => costs[b] - costs[a] || a.localeCompare(b))) { const g = gs.find(x => x.cost + costs[f] <= budget); if (g) { g.files.push(f); g.cost += costs[f] } else gs.push({ files: [f], cost: costs[f] }) }
  return gs.map(g => g.files.sort()).sort((a, b) => a[0].localeCompare(b[0]))
}
/**
 * 판정 작업 목록 : planFor 의 칸마다 scope 파일을 정하고 프롬프트 상한(래퍼 maxPromptBytes 600KB — 고정 구획·증거 몫을 빼고 묶음당 C.groupBudget)을 넘으면
 *   원장을 파일 묶음으로 나눈다 → id '<원장>-p1'…'-pN'(묶음 AND — 전부 PASS 일 때만 그 칸 Y, 생성기 mergeParts 와 같은 규칙)
 */
export function jobsFor(plan, sc, cost) {
  return plan.flatMap(p => {
    const files = p.no === 1 ? [] : p.no === 3 ? sc.harness : sc.product
    const gs = files.length ? packGroups(files, Object.fromEntries(files.map(f => [f, cost(f)]))) : [[]]
    return gs.length <= 1 ? [{ ...p, files: gs[0] }] : gs.map((g, i) => ({ ...p, id: `${p.id}-p${i + 1}`, base: p.id, part: [i + 1, gs.length], files: g }))
  })
}
/** 자동 계약(contract.md) — 브리프 원문 + 칸 검수 대상 + 기본 AC + 기준선·묶음·생성물 표기 */
export function contractOf({ id, no, brief, type, agentId, files = [], part, generated = [], baseRef, own = null, excluded = 0, shell = false }) {
  return [`# 자동 계약 — ${id} (codex-gate 훅, ${new Date().toISOString()})`, '',
    `- 판정 대상 : ${type} (${agentId}) 의 ${no === 1 ? '브리프(첫 프롬프트) 대 요청 원문 — 파일 scope 없음' : '최종 결과'}`, `- 칸 c${no} 검수 대상 : ${TARGET[no]}`,
    `- 기준선 : ${baseRef ? `${baseRef} (SubagentStart 스냅샷 — 이 에이전트 시작 뒤 변경만)` : '기준선 없음 (SubagentStart 스냅샷 없음 — HEAD 기준, 같은 시간 다른 세션 변경이 섞일 수 있음)'}`,
    ...(no === 1 ? [] : [`- scope = 이 칸 파일 ${files.length}건${part ? ` · 묶음 ${part[0]}/${part[1]} — 이 칸은 모든 묶음 PASS 일 때만 Y(AND), 이 묶음 밖 파일은 판정하지 않는다(unverifiable 아님)` : ''}`]),
    ...(no === 1 || !own ? [] : [`- scope 귀속 : 이 에이전트 Write·Edit 기록 ${files.filter(f => own.includes(f)).length}건(gitignore 무관 — 무시 대상 본문은 evidence written-files.md) · Bash·PowerShell 변경 보조 ${files.filter(f => !own.includes(f)).length}건${shell ? '(시작 뒤 수정 시각)' : '(셸 미사용 = 없음)'} · 병렬 에이전트 귀속 제외 ${excluded}건(같은 시간 다른 실행이 Write·Edit 한 경로) · 기준선 이전 미커밋 변경 = 제외`]),
    ...(generated.length && no !== 1 ? [`- 생성물 ${generated.length}건은 scope 제외 — 생성기 실행 증거(evidence generated.txt)로만 본다`] : []), '',
    '## 완료 기준', no === 1
      ? '- AC-1 : 브리프가 목표·범위(쓰기 허용·금지 경로)·완료 기준을 명시한다\n- AC-2 : 완료 기준이 명령·파일·수치로 판정 가능하다\n- AC-3 : 요청 원문(evidence request.md)에 없는 추가 해석·누락이 없다'
      : `- AC-1 : 최종 보고가 브리프의 요구 항목 중 이 scope 에 해당하는 것을 다루고, 못 한 항목은 사유와 함께 밝힌다\n- AC-2 : ${TARGET[no]}\n- AC-3 : scope 파일이 브리프의 쓰기 범위 안이고 비밀값이 없다`,
    '', '## 브리프(첫 프롬프트 원문)', '', '```text', capMid(brief || '(브리프 없음)', C.briefMax), '```', ''].join('\n')   // 앞뒤 보존(c3-build-ab3cb5 D-001 — 앞만 자르면 뒤쪽 추가 지시가 빠짐)
}

/** 원장 다음 회차 = 판정 회차 최대 + 1(BLOCKED 는 회차 미소모 — 같은 회차 재실행) */
export const nextIter = ledgerFile => { try { const l = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); return Math.max(0, ...(l.iters || []).map(x => x.iter)) + 1 } catch { return 1 } }
const run = (args, env, ms) => new Promise(res => {
  const ch = spawn(process.execPath, [C.wrapper, ...args], { cwd: ROOT, env, windowsHide: true }); let out = ''
  const kill = setTimeout(() => { try { ch.kill() } catch { /* 이미 끝남 */ } }, ms)
  ch.stdout.on('data', d => { out += d }); ch.stderr.on('data', d => { out += d })
  ch.on('close', code => { clearTimeout(kill); res({ code: code ?? 3, out: out.slice(-600) }) }); ch.on('error', e => { clearTimeout(kill); res({ code: 3, out: e.message }) })
})
const VERDICT = { 0: 'PASS', 1: 'FAIL', 2: 'BLOCKED' }
/**
 * 원장 1개 판정 : 계약·증거·gate.json(재판정용 작업 기록) 저장 → --init → --confirm-real. 종료 3(호출 오류)·시간 초과 = BLOCKED 로 기록(사용량 한도·기기 오류 포함)
 *   증거(래퍼 maxEvidenceBytes 200KB 안) = 최종 보고(c1 은 브리프·요청 원문) + 파일 목록 + diff stat + 생성물 목록 — 파일별 diff·hunk 는 래퍼 diff 구획이 scope 한정으로 싣는다
 */
export async function judgeOne(job, ctx, deadline) {
  const dir = path.join(C.loops, job.id), iter = (fs.mkdirSync(dir, { recursive: true }), nextIter(path.join(dir, 'ledger.json')))
  const ev = path.join(dir, `evidence-${iter}`), ref = ctx.baseRef || 'HEAD'
  if (ctx.keep) keepEvidence(job, ctx, dir, ev, ref)   // 재판정 : 첫 판정 때 만든 계약·증거 유지(묶음으로 새로 나뉜 원장은 기준 원장 것을 복사해 scope 만 고침)
  else { fs.mkdirSync(ev, { recursive: true }); writeEvidence(job, ctx, dir, ev, ref) }
  fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ agentType: ctx.type, agentId: ctx.agentId, no: job.no, files: job.files, part: job.part || null, base: job.base || null, baseRef: ctx.baseRef || null, requestAt: ctx.requestAt ?? null, generated: ctx.generated || [] }))
  return judgeRun(job, dir, ev, ref, iter, deadline)
}
/**
 * 생성기 재실행(A2 c5 원천 · A4 생성물 증거) : 실제 종료 코드·출력 끝 + files 지정 시 재실행 전후 생성물 내용 변화(0건 = 에이전트 산출물 = 생성기 산출 그대로)
 *   ponytail: 동기 실행 1회 약 10초 — 훅 시간 예산(560초) 안, 생성기가 느려지면 C.genMs 에서 끊고 종료 코드 칸에 사유
 */
export function runGenerator(args, files = null, root = ROOT) {
  const h = f => { try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(root, f))).digest('hex') } catch { return null } }
  const before = (files || []).map(h)
  const r = spawnSync(process.execPath, [C.generator, ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: C.genMs, env: { ...process.env, [C.envFlag]: '1' } })
  const code = r.status ?? (r.error ? `실행 오류 ${r.error.code || r.error.message}` : `신호 ${r.signal}`)
  return { cmd: `node scripts/request-graph.mjs ${args.join(' ')}`, code, out: ((r.stdout || '') + (r.stderr || '')).trim().slice(-2000), ...(files ? { files: files.length, changed: files.filter((f, i) => before[i] !== h(f)) } : {}) }
}
export const genText = g => `$ ${g.cmd}\n종료 코드 : ${g.code}\n출력(끝 2000자) :\n${g.out || '(출력 없음)'}\n${g.files ? `재실행 전후 생성물 내용 변화 : ${g.changed.length}건 / 대상 ${g.files}건${g.changed.length ? ' — ' + g.changed.join(', ') : ' (에이전트가 남긴 생성물 = 생성기 산출 그대로)'}\n` : ''}`
/** c5 원천 : 이 요청의 요청 md(생성기 산출 requests/ — 파일명 'YYYY-MM-DD HHmm <세션 8자>-<턴> …') 발췌, 없으면 그 세션 최신 md */
export function requestMd(ctx) {
  let fs0 = []; try { fs0 = fs.readdirSync(C.reqMd).filter(f => f.endsWith('.md')) } catch { return null }
  const sid = String(ctx.sessionId || '').slice(0, 8), when = ctx.requestAt != null ? kst(ctx.requestAt).slice(0, 16).replace(':', '') : null
  const mine = fs0.filter(f => !sid || f.includes(` ${sid}-`)), m = fs.statSync.bind(fs)
  const f = (when && mine.find(x => x.startsWith(when))) || mine.sort((a, b) => m(path.join(C.reqMd, b)).mtimeMs - m(path.join(C.reqMd, a)).mtimeMs)[0]
  return f ? { f, text: fs.readFileSync(path.join(C.reqMd, f), 'utf8') } : null
}
/** c6 admin 원천 : 이 요청(요청 시각 이후 시작) 원장마다 판정 이력·마지막 판정 요약 */
export function ledgerSummary(since, loops = C.loops) {
  let ids = []; try { ids = fs.readdirSync(loops) } catch { return '(원장 폴더 없음)' }
  const out = ids.flatMap(id => {
    let l; try { l = JSON.parse(fs.readFileSync(path.join(loops, id, 'ledger.json'), 'utf8')) } catch { return [] }
    if (since != null && !(Date.parse(l.startedAt) >= since)) return []
    const ev = [...(l.iters || []).map(x => ({ at: x.at, t: `${x.iter}회차 ${x.verdict}${x.verdict === 'FAIL' ? `(열린 결함 ${(x.openDefects || []).length})` : ''}` })), ...(l.blocked || []).map(x => ({ at: x.at, t: `${x.iter}회차 BLOCKED(${x.reason})` }))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    const last = (l.iters || []).at(-1)
    return [`- ${id} : 최종 ${last ? `${last.iter}회차 ${last.verdict}` : '판정 없음'} · 이력 ${ev.map(e => e.t).join(' → ') || '없음'}`]
  })
  return out.length ? out.join('\n') + '\n' : '(이 요청 원장 없음)\n'
}
/** 첫 판정 계약·증거 쓰기 — 글 상한 넘으면 capMid(앞뒤 보존), 칸별 원천 증거(c5 생성기·요청 md·정본 규칙 / c6 commit git log·status / c6 admin 원장 요약 / 생성물 = 생성기 실제 실행) */
function writeEvidence(job, ctx, dir, ev, ref) {
  const put = (name, text) => fs.writeFileSync(path.join(ev, name), text)
  fs.writeFileSync(path.join(dir, 'contract.md'), contractOf({ ...job, ...ctx, files: job.files }))
  if (job.no === 1) { put('brief.md', capMid(ctx.brief, C.briefMax)); put('request.md', capMid(ctx.request || '(요청 원문 없음 — 메인 세션 기록 미확인)', C.briefMax)); return }
  put('report.md', capMid(ctx.report || '(최종 보고 없음)', C.reportMax))
  put('changed-files.txt', job.files.join('\n') + '\n')
  // 결함 8-1 : 이 에이전트가 직접 쓴 파일 중 git 이 보지 않는 것(gitignore — 래퍼 diff·미추적 목록에 안 잡힘) = 현재 본문 첨부(capMid·비밀 가림, 비밀 경로 제외)
  const ign = new Set(job.files.length ? git(['check-ignore', '--', ...job.files]).stdout.split(/\r?\n/).filter(Boolean).map(f => f.replace(/\\/g, '/')) : [])
  const body = job.files.filter(f => ign.has(f) && (ctx.own || []).includes(f) && !/(^|\/)(\.env[^/]*|[^/]*\.(pem|key)|id_rsa[^/]*|\.credentials[^/]*)$/i.test(f))
  if (body.length) put('written-files.md', body.map(f => { let t; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8') } catch { t = '(읽기 실패 — 삭제됨)' } return `=== FILE ${f} (gitignore 대상 — 이 에이전트 Write·Edit 기록, 현재 본문) ===\n${redact(capMid(t, C.srcMax))}` }).join('\n\n') + '\n')
  put('tools.md', `## 이 에이전트 도구 사용 기록(시각순 — Bash·PowerShell = 명령 + 출력 앞 2줄, 비밀 가림 / 파일 도구 = 경로만)\n${capMid(ctx.tools || '(도구 사용 없음)', C.srcMax)}\n`)   // c2-collect-ac25ad AC-2 : 근거 명령·출력
  if (job.files.length) put('diffstat.txt', git(['diff', '--stat', ref, '--', ...job.files.map(f => `:(literal)${f}`)]).stdout.slice(0, 20000))
  const runs = ctx.genRuns || []
  if (ctx.generated?.length) put('generated.txt', `생성물 목록(scope 제외 — 생성기 실행 증거로만 판정)\n${ctx.generated.join('\n')}\n\n## 생성기 실제 실행(codex-gate 훅 재실행)\n${runs.length ? runs.map(genText).join('\n') : '(재실행 없음 — request-graph 생성물이 아님)\n'}`)
  if (job.no === 5) {
    put('generator.txt', runs.length ? runs.map(genText).join('\n') : '(생성기 재실행 기록 없음)\n')
    const rm = requestMd(ctx); put('request-md.md', rm ? `<!-- ${rm.f} -->\n${capMid(rm.text, C.srcMax)}` : '(이 요청의 요청 md 없음)\n')
    try { put('graph-rules.md', capMid(fs.readFileSync(C.graphRules, 'utf8'), C.srcMax)) } catch { put('graph-rules.md', '(정본 규칙 파일 없음)\n') }
  }
  if (job.no === 6 && job.sfx === 'commit') {
    const since = git(['log', `--since=${new Date(ctx.t0 ?? Date.now() - 3600e3).toISOString()}`, '--stat', '--format=commit %H%nDate: %aI%n%n    %s%n'])
    put('git-log.txt', since.stdout.trim() ? `$ git log --since=<에이전트 시작> --stat\n${since.stdout.slice(0, C.srcMax)}` : `(에이전트 시작 뒤 커밋 없음) $ git log -1 --stat\n${git(['log', '-1', '--stat']).stdout.slice(0, C.srcMax)}`)
    put('git-status.txt', `$ git status --short\n${git(['status', '--short']).stdout.slice(0, 20000)}`)
  }
  if (job.no === 6 && job.sfx === 'admin') put('ledgers.txt', `칸별 원장 최종 판정 요약(요청 시각 이후 시작한 원장)\n${ledgerSummary(ctx.requestAt ?? (ctx.t0 ?? Date.now()) - 3 * 3600e3)}`)
}
/** 재판정 증거 : 이 원장에 계약·증거가 있으면 그대로, 없으면(묶음으로 새로 나뉨) 기준 원장의 계약·마지막 증거를 복사하고 파일 목록·diff stat·묶음 표기만 고친다 */
function keepEvidence(job, ctx, dir, ev, ref) {
  if (fs.existsSync(path.join(dir, 'contract.md')) && fs.existsSync(ev)) return
  const from = path.join(C.loops, job.base || job.id)
  let last = null; try { last = fs.readdirSync(from).filter(f => /^evidence-\d+$/.test(f)).sort((a, b) => +b.slice(9) - +a.slice(9))[0] || null } catch { /* 기준 원장 없음 */ }
  fs.mkdirSync(ev, { recursive: true })
  if (last && path.join(from, last) !== ev) for (const f of fs.readdirSync(path.join(from, last))) fs.copyFileSync(path.join(from, last, f), path.join(ev, f))
  let c = ''; try { c = fs.readFileSync(path.join(from, 'contract.md'), 'utf8') } catch { c = contractOf({ ...job, ...ctx, files: job.files }) }
  if (job.part) c = c.replace(/^(- scope = ).*$/m, `$1이 칸 파일 ${job.files.length}건 · 묶음 ${job.part[0]}/${job.part[1]} — 이 칸은 모든 묶음 PASS 일 때만 Y(AND), 이 묶음 밖 파일은 판정하지 않는다(unverifiable 아님)`).replace(/^# 자동 계약 — \S+/m, `# 자동 계약 — ${job.id}`)
  fs.writeFileSync(path.join(dir, 'contract.md'), c)
  if (job.no !== 1) { fs.writeFileSync(path.join(ev, 'changed-files.txt'), job.files.join('\n') + '\n'); if (job.files.length) fs.writeFileSync(path.join(ev, 'diffstat.txt'), git(['diff', '--stat', ref, '--', ...job.files.map(f => `:(literal)${f}`)]).stdout.slice(0, 20000)) }
}
const lastLine = s => s.trim().split('\n').at(-1) || '출력 없음'
/**
 * 훅이 만든 BLOCKED(--init 실패·시간 예산 소진·호출 오류)를 원장에 기록(A3 — 재판정 대상이 되게) : 래퍼 --ingest(원장 쓰기는 래퍼만)로 iter-N.blocked-K.json + ledger.blocked[]
 *   원장이 없거나 깨져 있으면 래퍼가 BLOCKED(ledger) 결과 파일만 남긴다. 잠금(ledger.lock)이 남아 있으면 기록되지 않음 = 사유에 '원장 기록 실패'
 */
async function recordBlocked(job, dir, iter, reason, detail, env) {
  const raw = path.join(dir, 'gate-blocked.raw.json')
  fs.writeFileSync(raw, JSON.stringify({ verdict: 'BLOCKED', iter, criteria: [], defects: [], blocked: [{ reason, detail }], blocked_reason: detail, notes: 'codex-gate 훅 기록 — Codex 판정 전·중 실패(판정 아님, 같은 회차 재판정 대상)' }))
  const r = await run(['--id', job.id, '--iter', String(iter), '--ingest', raw], env, 20e3)
  return { ...job, iter, code: 2, verdict: 'BLOCKED', reason: `${reason} : ${detail}${r.code === 2 && /iter-\d+\.blocked-\d+\.json/.test(r.out) ? '' : ` (원장 기록 실패 — 래퍼 종료 ${r.code} : ${lastLine(r.out)})`}` }
}
/** --init → --confirm-real. 훅 쪽 실패(초기화·시간 예산·호출 오류)도 BLOCKED 로 원장에 기록 */
async function judgeRun(job, dir, ev, ref, iter, deadline) {
  const env = { ...process.env, [C.envFlag]: '1', CODEX_LOOP_ROOT: C.loops }, left = () => deadline - Date.now()
  const init = await run(['--init', '--id', job.id], env, Math.max(5e3, Math.min(30e3, left())))
  if (init.code !== 0) { const m = /BLOCKED\(([\w-]+)\)/.exec(init.out); return recordBlocked(job, dir, iter, m ? m[1] : 'judge-unavailable', `--init 실패(종료 ${init.code}) : ${lastLine(init.out)}`, env) }
  const min = (left() - 15e3) / 60e3
  if (min < C.minJudgeMin) return recordBlocked(job, dir, iter, 'judge-unavailable', '훅 시간 예산 소진(다음 SubagentStop 때 재판정)', env)
  const scope = (job.files.length ? job.files : [C.noScope]).join(',')
  const r = await run(['--task', path.join(dir, 'contract.md'), '--evidence', ev, '--id', job.id, '--iter', String(iter), '--scope', scope, '--diff', ref, '--timeout-min', min.toFixed(2), '--confirm-real'], env, left())
  if (![0, 1, 2].includes(r.code)) return recordBlocked(job, dir, iter, 'judge-unavailable', `호출 오류(종료 ${r.code}) : ${lastLine(r.out)}`, env)
  return { ...job, iter, code: r.code, verdict: VERDICT[r.code], ...(r.code === 2 ? { reason: lastLine(r.out) } : {}) }
}

/**
 * BLOCKED 자동 재판정 대상(c4 회송 ③) : 같은 요청(요청 시각 이후 시작한 원장) 안에서 마지막 기록이 BLOCKED 이고, 사유가 재시도 가능(scope-too-broad·judge-unavailable·lock)인 원장
 *   judge-unavailable 은 마지막 BLOCKED 뒤 C.cooldownMs 쿨다운, 묶음으로 대체된 기준 원장(split.json)·이번에 판정한 원장·작업 기록(gate.json) 없는 원장 제외. BLOCKED 는 회차 미소모 = 같은 회차 재실행
 */
export function retryTargets({ since, now = Date.now(), skip = new Set(), loops = C.loops } = {}) {
  let ids = []; try { ids = fs.readdirSync(loops) } catch { return [] }
  return ids.flatMap(id => {
    if (skip.has(id)) return []
    const dir = path.join(loops, id); let l, g
    try { l = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')); g = JSON.parse(fs.readFileSync(path.join(dir, 'gate.json'), 'utf8')) } catch { return [] }
    if (fs.existsSync(path.join(dir, 'split.json')) || fs.existsSync(path.join(dir, 'superseded.json')) || (since != null && Date.parse(l.startedAt) < since)) return []
    const lastB = (l.blocked || []).at(-1), lastI = (l.iters || []).at(-1)
    if (!lastB || (lastI && Date.parse(lastI.at) >= Date.parse(lastB.at))) return []
    const reasons = String(lastB.reason || '').split(',')
    if (!reasons.every(r => C.retry.includes(r))) return []
    if (reasons.includes('judge-unavailable') && now - Date.parse(lastB.at) < C.cooldownMs) return []
    return [{ id, no: g.no, files: g.files || [], part: g.part || null, base: g.base || null, reason: lastB.reason, gate: g }]
  })
}

/** 재판정 작업 : scope-too-broad 로 막힌 단일 원장 = 파일 묶음으로 다시 나눔(split.json 기록, 1묶음이면 같은 결과라 건너뜀), 그 밖 = 같은 원장 같은 회차 */
export function resplit(targets, costFor, loops = C.loops) {
  return targets.flatMap(t => {
    if (!String(t.reason).includes('scope-too-broad') || t.part) return [t]
    const cost = costFor(t), gs = packGroups(t.files, Object.fromEntries(t.files.map(f => [f, cost(f)])))
    if (gs.length <= 1) return []
    fs.writeFileSync(path.join(loops, t.id, 'split.json'), JSON.stringify({ at: new Date().toISOString(), parts: gs.map((_, i) => `${t.id}-p${i + 1}`) }))
    return gs.map((g, i) => ({ ...t, id: `${t.id}-p${i + 1}`, base: t.id, part: [i + 1, gs.length], files: g }))
  })
}
/**
 * 결함 8-5 : 같은 에이전트의 이번 판정 계획에 없는 이전 원장(옛 scope 로 나뉜 -pN 묶음·더는 해당 없는 c3 등) = superseded.json 표식 → 그래프(loadLoops)·재판정(retryTargets)에서 뺀다
 *   이번에 원장을 직접 판정하면(묶음 아님) 옛 split.json 은 split.superseded.json 으로(기준 원장이 다시 대표). 원장 본문·회차 기록은 지우지 않는다(이력 보존)
 */
export function supersede(agentId, jobs, loops = C.loops) {
  if (!agentId) return []
  const keep = new Set(jobs.flatMap(j => [j.id, ...(j.base ? [j.base] : [])])), out = []
  for (const j of jobs) if (!j.base) { const sp = path.join(loops, j.id, 'split.json'); try { if (fs.existsSync(sp)) fs.renameSync(sp, path.join(loops, j.id, 'split.superseded.json')) } catch { /* 경합 = 다음 판정 때 */ } }
  let ids = []; try { ids = fs.readdirSync(loops) } catch { return out }
  for (const id of ids) {
    if (keep.has(id) || fs.existsSync(path.join(loops, id, 'superseded.json'))) continue
    let g; try { g = JSON.parse(fs.readFileSync(path.join(loops, id, 'gate.json'), 'utf8')) } catch { continue }
    if (g.agentId !== agentId) continue
    fs.writeFileSync(path.join(loops, id, 'superseded.json'), JSON.stringify({ at: new Date().toISOString(), reason: 'scope 재산정 — 같은 에이전트의 이번 판정 계획에 없는 원장(codex-gate 결함 8 귀속 규칙)', by: [...keep] }))
    out.push(id)
  }
  return out
}
/** SubagentStop 입력 → 판정 결과 묶음(pending 파일). 판정 대상 아님 = null */
export async function gate(input, { deadline = Date.now() + C.budgetMs, root = ROOT } = {}) {
  if (process.env[C.envFlag] || input?.stop_hook_active) return null   // 재진입·연쇄 정지 방지
  const type = input?.agent_type, agentId = String(input?.agent_id || ''), tp = input?.agent_transcript_path
  if (!type || type === C.legacy || !tp || !fs.existsSync(tp)) return null
  let desc = ''; try { desc = JSON.parse(fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8')).description || '' } catch { /* meta 없음 */ }
  const recs = readJsonl(tp), a = readAgent(recs), baseRef = baseOf(agentId, root)
  // c2-collect-ac25ad D-001 : 같은 시간 같은 세션의 다른 서브에이전트·메인이 Write·Edit 한 파일은 이 에이전트도 쓰지 않았으면 scope 에서 뺀다(읽기 전용 수집에 남의 신규 파일이 섞인 사고)
  //   결함 8 : 1차 = 자기 Write·Edit 기록, Bash·PowerShell 을 쓴 에이전트만 2차(기준선 diff ∩ 시작 뒤 수정) — 병렬 귀속 제외 건수는 계약에
  const oth = otherWrites(path.dirname(tp), tp, input.transcript_path, a.t0, root), shell = recs.some(j => j.type === 'assistant' && Array.isArray(j.message?.content) && j.message.content.some(b => b?.type === 'tool_use' && SHELL.has(b.name)))
  const changed = changedFiles(a.writes, a.t0, baseRef, root, { shell, others: oth }), sc = splitScope(changed)
  const plan = planFor({ type, agentId, desc, changed: [...sc.harness, ...sc.product] })
  if (!plan.length) return null
  const req = input.transcript_path && fs.existsSync(input.transcript_path) ? requestOf(tailJsonl(input.transcript_path), a.t0, a.tSay ?? a.t1, Date.now(), a.brief) : null   // 범위 끝 = 마지막 전달 지시(D-003), 시작 = 브리프가 인용한 마스터 메시지(결함 8-4)
  // 최종 응답 = 지시 구간별 최종 응답 전부(시각순), 훅 입력 last_assistant_message 가 기록 끝과 다르면(기록 미반영) 마지막 구간 응답을 그것으로
  const lam = String(input.last_assistant_message || '').trim(), report = lam && a.finals.at(-1)?.trim() !== lam ? (a.report ? a.report.slice(0, a.report.length - (a.finals.at(-1) || '').length) : '') + lam : a.report
  // 생성기 재실행(A2·A4) : 설계도판 생성물 있음 = --design-only --md(전후 내용 비교), graph 에이전트·요청 md 생성물 = --md(실데이터판)
  const design = sc.generated.filter(f => /^\.claude\/engineering\/50\. graph\/(myRequestGraph\.html$|request-flow\/)/.test(f)), genRuns = []
  if (design.length) genRuns.push(runGenerator(['--design-only', '--md'], design, root))
  if (type === 'anakin_phase-graph' || sc.generated.some(f => f.includes('/requests/'))) genRuns.push(runGenerator(['--md', '--trigger', 'subagent'], null, root))
  const ctx = { type, agentId, brief: a.brief, report, own: [...changed.own], excluded: changed.excluded, shell, tools: toolLines(recs, String(type).replace(/^anakin_phase-|^teamanakin-/, '')).join('\n'), generated: sc.generated, genRuns, baseRef, request: req?.text, requestAt: req?.t ?? null, t0: a.t0, sessionId: input.session_id }
  const jobs = jobsFor(plan, sc, f => costOf(f, baseRef || 'HEAD', root))
  supersede(agentId, jobs)
  for (const b of new Set(jobs.filter(j => j.base).map(j => j.base))) { fs.mkdirSync(path.join(C.loops, b), { recursive: true }); fs.writeFileSync(path.join(C.loops, b, 'split.json'), JSON.stringify({ at: new Date().toISOString(), parts: jobs.filter(j => j.base === b).map(j => j.id) })) }
  const safe = p => p.catch(e => ({ iter: null, code: 2, verdict: 'BLOCKED', reason: `훅 오류 : ${e.message}` }))
  const results = await Promise.all(jobs.map(j => safe(judgeOne(j, ctx, deadline)).then(r => ({ ...j, ...r }))))
  // 같은 요청의 미해결 BLOCKED 원장 1회 재판정(남은 시간 예산 안)
  const done = new Set([...jobs.map(j => j.id), ...jobs.filter(j => j.base).map(j => j.base)])
  const re = !process.env.CODEX_GATE_NO_RETRY && deadline - Date.now() > 2 * 60e3 ? retryTargets({ since: req?.t ?? Date.now() - 3 * 3600e3, skip: done }) : []
  const reJobs = resplit(re, t => f => costOf(f, t.gate.baseRef || 'HEAD', root))
  const again = await Promise.all(reJobs.map(t => safe(judgeOne(t, { keep: true, type: t.gate.agentType, agentId: t.gate.agentId, generated: t.gate.generated, baseRef: t.gate.baseRef, requestAt: t.gate.requestAt }, deadline)).then(r => ({ ...t, ...r, re: true }))))
  const pick = ({ id, no, iter, code, verdict, reason, base, part, re }) => ({ id, no, iter, code, verdict, ...(reason ? { reason } : {}), ...(base ? { base, part } : {}), ...(re ? { re: true } : {}), ledger: path.relative(ROOT, path.join(C.loops, id)).replace(/\\/g, '/') })
  const rec = { at: new Date().toISOString(), agentType: type, agentId, changed: changed.length, baseRef: baseRef || null, results: [...results, ...again].map(pick) }
  fs.mkdirSync(C.pending, { recursive: true }); fs.writeFileSync(path.join(C.pending, `${Date.now()}-${agentId.slice(0, 12) || 'x'}.json`), JSON.stringify(rec))
  return rec
}
/** 판정 묶음 → 메인에 줄 글(묶음 원장은 AND 줄 추가) */
export function summarize(rec) {
  const own = rec.results.filter(r => !r.re), all = own.every(r => r.code === 0)
  const bases = [...new Set(own.filter(r => r.base).map(r => r.base))].map(b => { const ps = own.filter(r => r.base === b); return `${b} 묶음 ${ps.length}개 AND → ${ps.every(r => r.code === 0) ? 'Y' : ps.some(r => r.code === 1) ? 'N' : '보류'}` })
  return `[CDX 자동 판정 — codex-gate 훅] ${rec.agentType}(${rec.agentId.slice(0, 6)})${rec.baseRef ? '' : ' [기준선 없음]'} : ${own.map(r => `${r.id} ${r.iter ?? '-'}회차 ${r.verdict}(종료 ${r.code})${r.reason ? ` — ${r.reason}` : ''} · 원장 ${r.ledger}`).join(' / ')}`
    + (bases.length ? ` ; ${bases.join(' ; ')}` : '')
    + (rec.results.some(r => r.re) ? ` ; BLOCKED 재판정 : ${rec.results.filter(r => r.re).map(r => `${r.id} ${r.iter}회차 ${r.verdict}`).join(' / ')}` : '')
    + (all ? ' → 전부 PASS(Y) : 다음 단계 진행 가능' : ' → Y 아님 : FAIL 은 그 결과를 낸 에이전트에 결함(원장 iter-N.codex.json) 회송(재실행 끝나면 같은 원장 다음 회차를 훅이 자동 판정, 상한 5회), BLOCKED 는 다음 SubagentStop 때 훅이 재판정(사유 해소 필요 시 해소) — 전부 PASS 전 다음 단계 진행 금지')
}
/** --flush : 쌓인 판정 결과를 한 번만 메인에 전달(pending → sent) */
export function flush() {
  let fs0 = []; try { fs0 = fs.readdirSync(C.pending).filter(f => f.endsWith('.json')).sort() } catch { return '' }
  const out = []
  fs.mkdirSync(C.sent, { recursive: true })
  for (const f of fs0) { try { out.push(summarize(JSON.parse(fs.readFileSync(path.join(C.pending, f), 'utf8')))); fs.renameSync(path.join(C.pending, f), path.join(C.sent, f)) } catch { /* 깨진 파일 = 건너뜀 */ } }
  return out.join('\n')
}

const readStdin = async () => { let raw = ''; for await (const c of process.stdin) raw += c; try { return JSON.parse(raw) } catch { return {} } }
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain && process.argv[2] === '--selftest') {
  const assert = (await import('node:assert/strict')).default
  // 시험 격리(2026-11-10 E) : 원장·pending·sent·기준선을 임시 상태 루트로 — 실제 .omc/state 를 건드리지 않는다(자식 프로세스·래퍼는 env CODEX_GATE_STATE·CODEX_LOOP_ROOT 로 같은 루트)
  const realPending = C.pending, snap = d => { try { return Object.fromEntries(fs.readdirSync(d).map(f => [f, fs.readFileSync(path.join(d, f), 'utf8')])) } catch { return {} } }, before = snap(realPending)
  const stRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-state-'))
  Object.assign(C, stateOf(stRoot)); process.env.CODEX_GATE_STATE = stRoot
  assert.ok(!C.pending.startsWith(path.join(ROOT, '.omc')) && C.loops === path.join(stRoot, 'loop'))
  const rg = await import(pathToFileURL(path.join(ROOT, 'scripts', 'request-graph.mjs')).href)
  assert.equal(String(HARNESS_RE), String(rg.HARNESS_RE), '하네스 경로 정의 = 생성기와 같음')
  // 매핑 = 생성기 CDX_OF 와 같은 칸(verify 제외)
  const ids = (type, changed = [], desc = '') => planFor({ type, agentId: 'a1b2c3d4e5', desc, changed }).map(x => x.id)
  assert.deepEqual(ids('anakin_phase-collect'), ['c2-collect-a1b2c3'])
  assert.deepEqual(ids('anakin_phase-build', ['scripts/x.mjs'], 'C-1 verify 폐지'), ['c4-c-1-verify-a1b2c3', 'c1-c-1-verify-a1b2c3'])
  assert.deepEqual(ids('anakin_phase-build', ['.claude/hooks/x.mjs']), ['c4-build-a1b2c3', 'c1-build-a1b2c3', 'c3-build-a1b2c3'])
  assert.deepEqual(ids('anakin_phase-decide'), ['c4-decide-decide-a1b2c3', 'c1-decide-a1b2c3'])
  assert.deepEqual([ids('anakin_phase-review')[0], ids('anakin_phase-graph')[0], ids('anakin_phase-commit')[0], ids('teamanakin-admin')[0]], ['c4-review-review-a1b2c3', 'c5-graph-a1b2c3', 'c6-commit-commit-a1b2c3', 'c6-admin-admin-a1b2c3'])
  assert.deepEqual(ids('general-purpose'), ['c2-general-purpose-a1b2c3']); assert.deepEqual(ids('general-purpose', ['a.md', '.claude/settings.json']), ['c4-general-purpose-a1b2c3', 'c3-general-purpose-a1b2c3'])
  assert.deepEqual(ids('anakin_phase-verify'), []); assert.deepEqual(ids(''), [])
  for (const t of Object.keys(GATE_OF)) for (const id of ids(t)) assert.match(id, /^c[1-6]-[a-z0-9-]+-a[0-9a-f]{5}$/)   // 생성기 대상 접미 규칙(-a + 16진 5)
  assert.equal(rg.codexNo(ids('anakin_phase-graph')[0]), 5)
  // 기록 읽기 : 브리프·보고·Write 대상만(입력 본문은 안 읽음)
  const recs = [{ type: 'user', timestamp: '2026-11-10T01:00:00Z', message: { content: '브리프 원문 AC-1' } }, { type: 'user', isMeta: true, message: { content: 'meta' } },
    { type: 'assistant', timestamp: '2026-11-10T01:01:00Z', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'scripts/x.mjs', content: 'SECRET' } }, { type: 'tool_use', name: 'Bash', input: { command: 'echo SECRET' } }] } },
    { type: 'assistant', timestamp: '2026-11-10T01:02:00Z', message: { content: [{ type: 'text', text: '최종 보고' }] } }]
  assert.deepEqual(readAgent(recs), { brief: '브리프 원문 AC-1', report: '최종 보고', finals: ['최종 보고'], t0: Date.parse('2026-11-10T01:00:00Z'), t1: Date.parse('2026-11-10T01:02:00Z'), writes: ['scripts/x.mjs'], tSay: Date.parse('2026-11-10T01:00:00Z') })
  // B : 추가 지시(SendMessage)·구간별 최종 응답 전부 시각순, 도구 결과·시스템 알림 제외
  const more = [...recs, { type: 'user', timestamp: '2026-11-10T01:03:00Z', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }] } }, { type: 'user', timestamp: '2026-11-10T01:04:00Z', message: { content: '<system-reminder>알림</system-reminder>' } },
    { type: 'user', timestamp: '2026-11-10T01:05:00Z', message: { content: '<teammate-message teammate_id="team-lead">추가 지시 C-13</teammate-message>' } }, { type: 'assistant', timestamp: '2026-11-10T01:06:00Z', message: { content: [{ type: 'text', text: '중간 글' }] } }, { type: 'assistant', timestamp: '2026-11-10T01:07:00Z', message: { content: [{ type: 'text', text: '두 번째 최종' }] } }]
  const ra = readAgent(more)
  assert.ok(/^브리프 원문 AC-1\n\n--- 추가 지시 2 \(2026-11-10 10:05:00\) ---\n<teammate-message[^]*추가 지시 C-13/.test(ra.brief) && !ra.brief.includes('알림'))
  assert.ok(/^최종 보고\n\n--- 최종 응답 2 \(2026-11-10 10:07:00\) ---\n두 번째 최종$/.test(ra.report) && !ra.report.includes('중간 글')); assert.deepEqual(ra.finals, ['최종 보고', '두 번째 최종'])
  // B : 메인 요청 = 에이전트 시작 직전 요청 ~ 종료까지 마스터 메시지 전부(주입문·system-reminder 블록 제외, 시작 이전 요청·종료 뒤 요청 제외)
  const main = [{ type: 'user', timestamp: '2026-11-10T00:50:00Z', message: { content: '이전 요청' } }, { type: 'user', timestamp: '2026-11-10T00:59:00Z', message: { content: '이번 요청 <system-reminder>훅 주입 SECRET</system-reminder>' } },
    { type: 'attachment', timestamp: '2026-11-10T00:59:01Z', attachment: { hookEvent: 'UserPromptSubmit', content: '주입문' } }, { type: 'user', timestamp: '2026-11-10T01:00:30Z', message: { content: '<task-notification>x</task-notification>' } },
    { type: 'user', timestamp: '2026-11-10T01:03:00Z', message: { content: [{ type: 'text', text: '중간 추가 요청' }] } }, { type: 'user', timestamp: '2026-11-10T02:00:00Z', message: { content: '종료 뒤 요청' } }]
  const rq = requestOf(main, Date.parse('2026-11-10T01:00:00Z'), Date.parse('2026-11-10T01:07:00Z'))
  assert.equal(rq.t, Date.parse('2026-11-10T00:59:00Z')); assert.match(rq.text, /^이번 요청\n\n=== 에이전트 실행 중 들어온 마스터 메시지 1건\(시작 2026-11-10 10:00:00 뒤 ~ 마지막 전달 지시 2026-11-10 10:07:00\)[^\n]*추가 지시[^\n]*===\n\n--- 실행 중 마스터 메시지 1 \(2026-11-10 10:03:00\) ---\n중간 추가 요청$/)   // c1-codex-ac436f D-001 : 실행 중 메시지 = 본문과 분리
  assert.deepEqual(requestOf(main.slice(0, 2), Date.parse('2026-11-10T01:00:00Z')), { t: Date.parse('2026-11-10T00:59:00Z'), later: 0, text: '이번 요청' })
  // c1-build-ab3cb5 D-003 : 범위 끝 = 마지막 전달 지시 시각 — 그 뒤 마스터 메시지는 본문에서 빼고 '후속 요청(이 에이전트 범위 아님)' 건수만
  const rq3 = requestOf(main, Date.parse('2026-11-10T01:00:00Z'), Date.parse('2026-11-10T01:01:00Z'), Date.parse('2026-11-10T03:00:00Z'))
  assert.ok(rq3.text.startsWith('이번 요청') && !rq3.text.includes('중간 추가 요청') && !rq3.text.includes('종료 뒤 요청') && rq3.later === 2 && /후속 요청\(이 에이전트 범위 아님\) : 마지막 지시 2026-11-10 10:01:00 뒤 마스터 메시지 2건/.test(rq3.text), rq3.text)
  assert.equal(ra.tSay, Date.parse('2026-11-10T01:05:00Z'))   // 마지막 전달 지시 = 추가 지시(SendMessage) 시각
  // c1-build-ab3cb5 D-002 근본 : 실기록 형태 픽스처(2026-11-10 agent-ab3cb567….jsonl 207·324·879행 · 메인 세션 기록의 키 구성 그대로, 글만 바꿈)
  //   작업 중 SendMessage = attachment queued_command(origin coordinator, isMeta) · 쉬는 사이 SendMessage = user isMeta + origin coordinator · 중복 사본 api-request-blob(tool_result + system-reminder 글) = 제외
  const real = [
    { parentUuid: null, isSidechain: true, promptId: 'p1', agentId: 'ab3cb5', type: 'user', message: { role: 'user', content: '첫 브리프 C-13' }, uuid: 'u0', timestamp: '2026-11-10T00:39:19.388Z' },
    { type: 'assistant', timestamp: '2026-11-10T00:40:00Z', message: { content: [{ type: 'text', text: '작업 중 글' }] } },
    { parentUuid: 'u1', isSidechain: true, agentId: 'ab3cb5', attachment: { type: 'queued_command', prompt: 'C-15를 추가합니다 — 시작 노드', source_uuid: 's1', origin: { kind: 'coordinator' }, isMeta: true, reminderId: 'r1' }, type: 'attachment', uuid: 'u2', timestamp: '2026-11-10T00:42:47.055Z' },
    { type: 'api-request-blob', sessionId: 's', agentId: 'ab3cb5', hash: 'h', message: { role: 'user', content: [{ tool_use_id: 't', type: 'tool_result', content: 'x' }, { type: 'text', text: '<system-reminder id="b6">\nThe coordinator sent a message while you were working:\nC-15를 추가합니다 — 시작 노드</system-reminder>' }] } },
    { type: 'attachment', timestamp: '2026-11-10T00:43:00Z', attachment: { type: 'queued_command', prompt: '<task-notification>x</task-notification>', commandMode: 'task-notification' } },
    { type: 'attachment', timestamp: '2026-11-10T00:43:10Z', attachment: { type: 'queued_command', prompt: '다른 세션 글', origin: { kind: 'peer', name: 'loginpi-04' } } },
    { type: 'attachment', timestamp: '2026-11-10T00:43:20Z', attachment: { type: 'hook_success', content: '훅 출력' } },
    { parentUuid: 'u3', isSidechain: true, agentId: 'ab3cb5', attachment: { type: 'queued_command', prompt: 'C-15 적용 범위를 정정 — 세로 모드만', source_uuid: 's2', origin: { kind: 'coordinator' }, isMeta: true, reminderId: 'r2' }, type: 'attachment', uuid: 'u4', timestamp: '2026-11-10T00:44:23.733Z' },
    { type: 'assistant', timestamp: '2026-11-10T00:50:00Z', message: { content: [{ type: 'text', text: '첫 최종 보고' }] } },
    { parentUuid: 'u5', isSidechain: true, promptId: 'p2', agentId: 'ab3cb5', type: 'user', message: { role: 'user', content: 'The coordinator sent a message while you were working:\n훅 판정 결과 c1 FAIL' }, isMeta: true, uuid: 'u6', timestamp: '2026-11-10T00:55:02.295Z', origin: { kind: 'coordinator' } },
    { type: 'user', isMeta: true, timestamp: '2026-11-10T00:55:03Z', message: { content: '스킬 주입 메타(origin 없음)' } },
    { type: 'assistant', timestamp: '2026-11-10T01:10:00Z', message: { content: [{ type: 'text', text: '둘째 최종 보고' }] } }]
  const rr = readAgent(real)
  assert.deepEqual(rr.brief.split(/\n\n--- 추가 지시 \d \([^)]*\) ---\n/), ['첫 브리프 C-13', 'C-15를 추가합니다 — 시작 노드', 'C-15 적용 범위를 정정 — 세로 모드만', 'The coordinator sent a message while you were working:\n훅 판정 결과 c1 FAIL'])
  assert.deepEqual(rr.finals, ['작업 중 글', '', '첫 최종 보고', '둘째 최종 보고'])   // 지시 구간별 마지막 응답(구간에 응답 없으면 빈 글)
  // 메인 : 마스터가 메인 작업 중 입력 = attachment queued_command(origin human, prompt 문자열·블록 배열), 쉬는 때 입력 = user origin human, task-notification = 제외
  const mainReal = [{ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: '2026-11-10T00:38:45Z', message: { content: '루프 노드 되돌림 기준 계속' } },
    { type: 'attachment', isSidechain: false, timestamp: '2026-11-10T00:42:19Z', attachment: { type: 'queued_command', prompt: '시작 노드는 왼쪽 옆', commandMode: 'prompt', origin: { kind: 'human' } } },
    { type: 'attachment', isSidechain: false, timestamp: '2026-11-10T00:43:57Z', attachment: { type: 'queued_command', prompt: [{ type: 'text', text: '세로모드시' }, { type: 'image', source: {} }], commandMode: 'prompt', origin: { kind: 'human' } } },
    { type: 'user', isSidechain: false, origin: { kind: 'task-notification' }, timestamp: '2026-11-10T00:54:31Z', message: { content: '<task-notification>done</task-notification>' } }]
  { const tx = requestOf(mainReal, Date.parse('2026-11-10T00:39:19Z'), Date.parse('2026-11-10T01:10:00Z')).text; assert.ok(tx.startsWith('루프 노드 되돌림 기준 계속\n\n=== 에이전트 실행 중 들어온 마스터 메시지 2건') && tx.endsWith('--- 실행 중 마스터 메시지 1 (2026-11-10 09:42:19) ---\n시작 노드는 왼쪽 옆\n\n--- 실행 중 마스터 메시지 2 (2026-11-10 09:43:57) ---\n세로모드시') && !tx.includes('작업 중'), tx) }
  // c2-collect-ac25ad AC-1 : 한 구간 안에서 멈춘 응답(본 보고) 뒤 알림으로 깨어나 쓴 보충까지 = 보고 전부(마지막 = 최종), 도구 앞 중간 글은 제외
  { const W = (t, text) => ({ type: 'assistant', timestamp: t, message: { content: [{ type: 'text', text }] } }), TU = t => ({ type: 'assistant', timestamp: t, message: { content: [{ type: 'tool_use', id: 'x', name: 'Read', input: { file_path: 'a' } }] } })
    const r2 = readAgent([{ type: 'user', timestamp: '2026-11-10T01:00:00Z', message: { content: '수집 브리프' } }, W('2026-11-10T01:01:00Z', '도구 앞 글'), TU('2026-11-10T01:01:01Z'), { type: 'user', timestamp: '2026-11-10T01:01:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }] } }, W('2026-11-10T01:02:00Z', '본 보고 0~11절'),
      { type: 'attachment', timestamp: '2026-11-10T01:02:01Z', attachment: { type: 'hook_system_message' } }, { type: 'user', isMeta: true, origin: { kind: 'task-notification' }, timestamp: '2026-11-10T01:03:00Z', message: { content: '[SYSTEM NOTIFICATION] bg done' } }, W('2026-11-10T01:03:05Z', '보충')])
    assert.ok(r2.report.includes('본 보고 0~11절') && r2.report.endsWith('보충') && !r2.report.includes('도구 앞 글'), r2.report); assert.deepEqual(r2.finals, ['보충']) }
  // 비밀 가림(redact) + 도구 기록 줄(명령 문자열·출력 앞 2줄·파일 도구 = 경로만) — c3-turn-f7dc16 AC-2
  { const sec = 'ghp_' + 'A'.repeat(30), jwt = 'eyJ' + 'h'.repeat(12) + '.' + 'p'.repeat(8) + '.' + 's'.repeat(6)
    for (const [x, bad] of [[`git remote add o https://u:${'p4ss'.repeat(3)}@github.com/x`, 'p4ssp4ss'], [`curl -H "Authorization: Bearer ${'Z'.repeat(30)}"`, 'ZZZZZZZZ'], [`echo ${sec}`, sec], [`SUPABASE_SERVICE_ROLE_KEY=${jwt}`, jwt], ['DATABASE_URL=postgres://a:b@h/db', 'a:b@h'], ['PI_API_KEY="abc12345xyz"', 'abc12345xyz'], ['MY_TOKEN=plainvalue', 'plainvalue']]) { const r = redact(x); assert.ok(!r.includes(bad) && r.includes('[REDACTED'), `${x} → ${r}`) }
    assert.equal(redact('git log --oneline -1'), 'git log --oneline -1'); assert.equal(redact('NODE_ENV=production pnpm build'), 'NODE_ENV=production pnpm build')   // 비밀 아닌 명령은 그대로
    const tl = toolLines([{ type: 'assistant', timestamp: '2026-11-10T01:00:00Z', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: `git status && echo ${sec}` } }, { type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'scripts/x.mjs', old_string: 'SECRET_OLD', new_string: 'SECRET_NEW' } }, { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '.env' } }] } },
      { type: 'user', timestamp: '2026-11-10T01:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: `줄1 ${sec}\n\n줄2\n줄3 셋째` }] } }], 'build')
    assert.deepEqual(tl, [`10:00:00 Bash [build] : $ git status && echo [REDACTED:github-token]\n    → 줄1 [REDACTED:github-token]\n    → 줄2`, '10:00:00 Edit [build] : scripts/x.mjs', '10:00:00 Read [build] : .env']) }
  // c2-collect-ac25ad D-001 : 형제 서브에이전트·메인이 같은 시간에 쓴 파일 = 다른 실행 몫(otherWrites)
  { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-ow-')), wr = (t, p) => JSON.stringify({ type: 'assistant', timestamp: t, message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: p } }] } })
    try {
      fs.writeFileSync(path.join(d, 'agent-a1.jsonl'), wr('2026-11-10T01:00:00Z', 'x.md') + '\n'); fs.writeFileSync(path.join(d, 'agent-a2.jsonl'), [wr('2026-11-10T01:05:00Z', path.join(ROOT, 'test', 'turn-gate.test.mjs')), wr('2026-11-10T00:10:00Z', 'old.md')].join('\n') + '\n'); fs.writeFileSync(path.join(d, 'main.jsonl'), wr('2026-11-10T01:06:00Z', 'CLAUDE.md') + '\n')
      assert.deepEqual([...otherWrites(d, path.join(d, 'agent-a1.jsonl'), path.join(d, 'main.jsonl'), Date.parse('2026-11-10T01:00:00Z'))].sort(), ['CLAUDE.md', 'test/turn-gate.test.mjs'])   // 자기 기록·시작 전 쓰기 제외
    } finally { fs.rmSync(d, { recursive: true, force: true }) } }
  // 결함 8 귀속 : 임시 저장소 — 기준선 이전 미커밋 변경(old.md) 제외 · gitignore 산출물(ign/x.md) 포함 · 병렬 에이전트 A·B 가 쓴 파일이 서로 섞이지 않음(셸 쓴 A 의 보조 후보에서 B 파일 = 제외 건수)
  { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-scope-')), w = (f, s) => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), s) }
    try {
      for (const a of [['init', '-q'], ['config', 'user.email', 't@t'], ['config', 'user.name', 't']]) git(a, r)
      w('.gitignore', 'ign/\n'); w('old.md', '1'); w('keep.md', '1'); git(['add', '-A'], r); git(['commit', '-qm', 'base'], r)
      w('old.md', '2 — 이전 세션 미커밋'); const past = new Date(Date.now() - 3600e3); fs.utimesSync(path.join(r, 'old.md'), past, past)
      const t0 = Date.now() - 1000, base = git(['stash', 'create'], r).stdout.trim() || git(['rev-parse', 'HEAD'], r).stdout.trim()
      w('a.md', 'A 산출'); w('ign/x.md', 'A gitignore 산출'); w('b.md', 'B 산출'); w('bash-made.md', 'A 셸 산출')
      const A = changedFiles([path.join(r, 'a.md'), path.join(r, 'ign', 'x.md')], t0, base, r, { shell: true, others: new Set(['b.md']) })
      assert.deepEqual([...A], ['a.md', 'bash-made.md', 'ign/x.md']); assert.equal(A.excluded, 1); assert.deepEqual([...A.own].sort(), ['a.md', 'ign/x.md'])
      const B = changedFiles([path.join(r, 'b.md')], t0, base, r, { shell: false, others: new Set(['a.md', 'ign/x.md']) })
      assert.deepEqual([...B], ['b.md']); assert.equal(B.excluded, 0)   // 셸 미사용 = 자기 기록만(병렬 A 파일·기준선 이전 old.md 없음)
      assert.deepEqual([...changedFiles([], t0, null, r, { shell: true })].sort(), ['a.md', 'b.md', 'bash-made.md'])   // 기준선 없음 = git status ∩ 시작 뒤 수정(old.md 제외, gitignore 는 자기 기록으로만)
      assert.match(contractOf({ id: 'c4-x-a1b2c3', no: 4, type: 't', agentId: 'a1', files: [...A], own: [...A.own], excluded: A.excluded, shell: true }), /scope 귀속 : 이 에이전트 Write·Edit 기록 2건[^\n]*보조 1건\(시작 뒤 수정 시각\) · 병렬 에이전트 귀속 제외 1건/)
      // 결함 8-5 : 같은 에이전트 옛 묶음 원장(-p1·-p2)·더는 없는 칸 원장 = superseded 표식(다른 에이전트 원장은 그대로), 직접 판정 기준 원장의 split.json 은 치움
      const L = path.join(r, 'loops'), g = (id, agentId) => { fs.mkdirSync(path.join(L, id), { recursive: true }); fs.writeFileSync(path.join(L, id, 'gate.json'), JSON.stringify({ agentId })) }
      g('c4-b-a9509f-p1', 'a9509f1'); g('c4-b-a9509f-p2', 'a9509f1'); g('c3-b-a9509f', 'a9509f1'); g('c1-b-a9509f', 'a9509f1'); g('c4-b-a9509f', 'a9509f1'); g('c4-o-ae4137', 'ae41371'); fs.writeFileSync(path.join(L, 'c4-b-a9509f', 'split.json'), '{}')
      assert.deepEqual(supersede('a9509f1', [{ id: 'c4-b-a9509f' }, { id: 'c1-b-a9509f' }], L).sort(), ['c3-b-a9509f', 'c4-b-a9509f-p1', 'c4-b-a9509f-p2'])
      assert.ok(!fs.existsSync(path.join(L, 'c4-b-a9509f', 'split.json')) && fs.existsSync(path.join(L, 'c4-b-a9509f', 'split.superseded.json')) && !fs.existsSync(path.join(L, 'c4-o-ae4137', 'superseded.json')))
      const rg2 = await import(pathToFileURL(path.join(ROOT, 'scripts', 'request-graph.mjs')).href)
      for (const id of ['c4-b-a9509f-p1', 'c4-b-a9509f']) fs.writeFileSync(path.join(L, id, 'ledger.json'), JSON.stringify({ id, startedAt: new Date().toISOString(), iters: [{ iter: 1, at: new Date().toISOString(), verdict: 'FAIL', openDefects: [] }] }))
      assert.deepEqual(rg2.loadLoops(L).map(l => l.id), ['c4-b-a9509f'])   // 그래프 집계 = 대체 원장 제외
    } finally { fs.rmSync(r, { recursive: true, force: true }) } }
  // 결함 8-4 : 시작 직전 마지막 메시지가 상태 알림이어도 브리프가 인용한 요청부터(직전 10건 안)
  { const M = (t, text) => ({ type: 'user', timestamp: t, message: { content: text } })
    const rr = requestOf([M('2026-11-10T01:00:00Z', '무관한 이전 요청 문장입니다 길게'), M('2026-11-10T01:33:22Z', '내일 저녁 즈음, 새로운 PC로 개발 환경을 옮길 예정이이야!'), M('2026-11-10T01:36:31Z', '설치가이드 만들 시 반드시 구분해 줘'), M('2026-11-10T01:57:40Z', '<bash-input> codex login</bash-input>'), M('2026-11-10T01:58:29Z', 'Signed in to Codex')], Date.parse('2026-11-10T02:00:00Z'), null, null, '## 마스터 원문\n1. "내일 저녁 즈음, 새로운 PC로 개발 환경을 옮길 예정이야! …"\n2. "설치가이드 만들 시 반드시 구분해 줘"')
    assert.equal(rr.t, Date.parse('2026-11-10T01:33:22Z')); assert.ok(rr.text.includes('내일 저녁 즈음') && rr.text.includes('Signed in to Codex') && !rr.text.includes('무관한') && !rr.text.includes('bash-input'), rr.text) }
  // 상한 = 앞뒤 보존·가운데 생략
  const cm = capMid('가'.repeat(10) + '나'.repeat(10), 10); assert.ok(cm.startsWith('가'.repeat(5)) && cm.endsWith('나'.repeat(5)) && cm.includes('가운데 10자 생략'))
  assert.equal(capMid('짧음', 10), '짧음')
  assert.match(contractOf({ id: 'c1-x-a1b2c3', no: 1, brief: 'B', type: 't', agentId: 'a1' }), /기준선 없음[\s\S]*AC-1[\s\S]*AC-3[\s\S]*```text\nB\n```/)
  { const ct = contractOf({ id: 'c4-x-a1b2c3', no: 4, type: 't', agentId: 'a1', brief: '첫 지시 ' + 'x'.repeat(C.briefMax) + ' 끝 추가 지시 C-99' }); assert.ok(ct.includes('첫 지시') && ct.includes('끝 추가 지시 C-99') && ct.includes('가운데'), 'c3-build-ab3cb5 D-001 : 계약 브리프 앞뒤 보존') }
  assert.match(contractOf({ id: 'c4-x-a1b2c3-p2', no: 4, type: 't', agentId: 'a1', files: ['a'], part: [2, 3], generated: ['g'], baseRef: 'f'.repeat(40) }), /기준선 : f{40} \(SubagentStart[\s\S]*묶음 2\/3 — 이 칸은 모든 묶음 PASS 일 때만 Y\(AND\)[\s\S]*생성물 1건은 scope 제외/)
  // 칸별 scope 분리 · 생성물 제외(c4 회송 ①)
  const sc = splitScope(['.claude/hooks/a.mjs', 'scripts/x.mjs', '.claude/engineering/50. graph/myRequestGraph.html', '.claude/engineering/50. graph/request-flow/1 x.md', 'CLAUDE.md', '.claude/engineering/50. graph/anakins_graph.md'])
  assert.deepEqual(sc, { harness: ['.claude/hooks/a.mjs'], product: ['scripts/x.mjs', 'CLAUDE.md', '.claude/engineering/50. graph/anakins_graph.md'], generated: ['.claude/engineering/50. graph/myRequestGraph.html', '.claude/engineering/50. graph/request-flow/1 x.md'] })
  // 상한 초과 = 원장 분할(c4 회송 ②) : 묶음당 예산 이하, c1 = 파일 없음, c3 = 하네스만, 작으면 분할 없음
  const plan = planFor({ type: 'anakin_phase-build', agentId: 'a1b2c3d4e5', changed: [...sc.harness, ...sc.product] })
  const big = { 'scripts/x.mjs': 300e3, 'CLAUDE.md': 200e3, '.claude/engineering/50. graph/anakins_graph.md': 50e3, '.claude/hooks/a.mjs': 10e3 }
  const jobs = jobsFor(plan, sc, f => big[f])
  assert.deepEqual(jobs.map(j => [j.id, j.files, j.part || null, j.base || null]), [
    ['c4-build-a1b2c3-p1', ['.claude/engineering/50. graph/anakins_graph.md', 'scripts/x.mjs'], [1, 2], 'c4-build-a1b2c3'], ['c4-build-a1b2c3-p2', ['CLAUDE.md'], [2, 2], 'c4-build-a1b2c3'],   // 큰 것부터 첫 맞춤 : 300K + 50K ≤ 360K
    ['c1-build-a1b2c3', [], null, null], ['c3-build-a1b2c3', ['.claude/hooks/a.mjs'], null, null]])
  assert.ok(jobs.every(j => j.files.reduce((n, f) => n + big[f], 0) <= C.groupBudget || j.files.length === 1))
  assert.deepEqual(jobsFor(plan, sc, () => 1000).map(j => j.id), ['c4-build-a1b2c3', 'c1-build-a1b2c3', 'c3-build-a1b2c3'])
  assert.deepEqual(packGroups(['a', 'b', 'c'], { a: 400e3, b: 10, c: 20 }), [['a'], ['b', 'c']])   // 혼자 넘는 파일 = 단독 묶음
  // 묶음 AND = 생성기 mergeParts(전부 PASS 일 때만 PASS, 나뉘기 전 기준 원장은 대체)
  const row = (iter, verdict, t) => ({ iter, verdict, t0: t - 1, t1: t, run: false, blocked: verdict === 'BLOCKED' })
  const mp = xs => rg.mergeParts(xs).map(x => [x.id, x.rows.map(r => r.verdict)])
  assert.deepEqual(mp([{ id: 'c4-x-a1b2c3', rows: [row(1, 'BLOCKED', 1)] }, { id: 'c4-x-a1b2c3-p1', rows: [row(1, 'PASS', 5)] }, { id: 'c4-x-a1b2c3-p2', rows: [row(1, 'FAIL', 6), row(2, 'PASS', 9)] }]), [['c4-x-a1b2c3', ['FAIL', 'BLOCKED']]])   // 2회차 p1 판정 없음 = 보류
  assert.deepEqual(mp([{ id: 'c4-x-a1b2c3-p1', rows: [row(1, 'PASS', 5)] }, { id: 'c4-x-a1b2c3-p2', rows: [row(1, 'PASS', 6)] }, { id: 'c2-y', rows: [row(1, 'FAIL', 2)] }]), [['c2-y', ['FAIL']], ['c4-x-a1b2c3', ['PASS']]])
  // BLOCKED 재판정 대상 선별(c4 회송 ③)
  const lt = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-loops-')), T = Date.parse('2026-11-10T05:00:00Z'), iso = m => new Date(T + m * 60e3).toISOString()
  const mk = (id, ledger, extra = {}) => { fs.mkdirSync(path.join(lt, id)); fs.writeFileSync(path.join(lt, id, 'ledger.json'), JSON.stringify({ id, startedAt: iso(0), iters: [], blocked: [], ...ledger })); if (extra.gate !== false) fs.writeFileSync(path.join(lt, id, 'gate.json'), JSON.stringify({ agentType: 'anakin_phase-build', agentId: 'a1', no: 4, files: ['a', 'b'], part: null, base: null, baseRef: null, generated: [] })); if (extra.split) fs.writeFileSync(path.join(lt, id, 'split.json'), '{}') }
  try {
    mk('c4-broad', { blocked: [{ iter: 1, reason: 'scope-too-broad', at: iso(1) }] })
    mk('c4-unavail-old', { blocked: [{ iter: 1, reason: 'judge-unavailable', at: iso(1) }] })
    mk('c4-unavail-new', { blocked: [{ iter: 1, reason: 'judge-unavailable', at: iso(25) }] })
    mk('c4-device', { blocked: [{ iter: 1, reason: 'device', at: iso(1) }] })
    mk('c4-resolved', { blocked: [{ iter: 1, reason: 'lock', at: iso(1) }], iters: [{ iter: 1, at: iso(2), verdict: 'PASS' }] })
    mk('c4-split', { blocked: [{ iter: 1, reason: 'scope-too-broad', at: iso(1) }] }, { split: true })
    mk('c4-nogate', { blocked: [{ iter: 1, reason: 'lock', at: iso(1) }] }, { gate: false })
    mk('c4-old-request', { startedAt: iso(-60), blocked: [{ iter: 1, reason: 'lock', at: iso(1) }] })
    mk('c4-skip', { blocked: [{ iter: 1, reason: 'lock', at: iso(1) }] })
    const tg = retryTargets({ since: T - 1, now: T + 30 * 60e3, skip: new Set(['c4-skip']), loops: lt })
    assert.deepEqual(tg.map(t => t.id).sort(), ['c4-broad', 'c4-unavail-old'])   // 쿨다운·사람 몫 사유·해소됨·대체됨·기록 없음·이전 요청·이번 판정 제외
    const rj = resplit(tg, () => f => ({ a: 300e3, b: 300e3 })[f], lt)
    assert.deepEqual(rj.map(j => [j.id, j.files, j.part]).sort((x, y) => x[0].localeCompare(y[0])), [['c4-broad-p1', ['a'], [1, 2]], ['c4-broad-p2', ['b'], [2, 2]], ['c4-unavail-old', ['a', 'b'], null]])
    assert.ok(fs.existsSync(path.join(lt, 'c4-broad', 'split.json')))
    assert.deepEqual(resplit([{ id: 'c4-one', reason: 'scope-too-broad', files: ['a'] }], () => () => 1, lt), [])   // 1묶음 = 같은 결과라 건너뜀
  } finally { fs.rmSync(lt, { recursive: true, force: true }) }
  // 재진입 금지 · verify · 정지 연쇄
  assert.equal(await gate({ agent_type: 'anakin_phase-verify', agent_transcript_path: fileURLToPath(import.meta.url) }), null)
  assert.equal(await gate({ agent_type: 'anakin_phase-collect', stop_hook_active: true }), null)
  // 끝까지 : 가짜 판정자(CODEX_JS)로 --init → --confirm-real → pending → flush(메인 additionalContext)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-')), fake = path.join(tmp, 'fake-codex.mjs'), tp = path.join(tmp, 'agent-af00d1234.jsonl')
  const id = `c2-selftest-${process.pid}`.slice(0, 40)
  fs.writeFileSync(fake, ["import fs from 'node:fs'", "if (process.argv.includes('login')) process.exit(0)", "let s = ''", "process.stdin.on('data', d => (s += d))",
    "process.stdin.on('end', () => { const o = process.argv[process.argv.indexOf('-o') + 1]; fs.writeFileSync(o, JSON.stringify({ verdict: 'PASS', iter: 1, criteria: ['AC-1', 'AC-2', 'AC-3'].map(id => ({ id, status: 'met', met: true, evidence: 'fake' })), defects: [], blocked: [], blocked_reason: '', notes: '' })) })"].join('\n'))
  fs.writeFileSync(tp, recs.slice(0, 2).map(r => JSON.stringify(r)).join('\n') + '\n' + JSON.stringify({ type: 'assistant', timestamp: '2026-11-10T01:02:00Z', message: { content: [{ type: 'text', text: '수집 결과' }] } }) + '\n')
  fs.writeFileSync(tp.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ description: `selftest ${process.pid}` }))
  const prevPending = (() => { try { return fs.readdirSync(C.pending) } catch { return [] } })()
  process.env.CODEX_JS = fake; process.env.CODEX_GATE_NO_RETRY = '1'   // 시험이 실제 원장을 재판정하지 않게
  assert.match(snapshotBase('af00d1234') || '', /^[0-9a-f]{40}$/); assert.equal(baseOf('af00d1234'), fs.readFileSync(path.join(C.base, 'af00d1234.txt'), 'utf8'))   // 시작 스냅샷 = 이후 변경만 scope
  try {
    const rec = await gate({ agent_type: 'anakin_phase-collect', agent_id: 'af00d1234', agent_transcript_path: tp, last_assistant_message: '수집 결과' })
    const lid = rec.results[0].id
    assert.ok(rec.baseRef && fs.readFileSync(path.join(C.loops, lid, 'contract.md'), 'utf8').includes(`기준선 : ${rec.baseRef}`))
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(C.loops, lid, 'gate.json'), 'utf8')).agentId, 'af00d1234')   // 재판정용 작업 기록
    assert.equal(rec.results.length, 1); assert.match(lid, /^c2-selftest-\d+-af00d1$/); assert.equal(rec.results[0].code, 0, JSON.stringify(rec)); assert.equal(rec.results[0].verdict, 'PASS')
    assert.ok(fs.existsSync(path.join(C.loops, lid, 'ledger.json')) && fs.existsSync(path.join(C.loops, lid, 'iter-1.codex.json')) && fs.existsSync(path.join(C.loops, lid, 'contract.md')))
    assert.equal(nextIter(path.join(C.loops, lid, 'ledger.json')), 2)   // 다음 실행 = 같은 원장 다음 회차
    const msg = flush(); assert.match(msg, new RegExp(`${lid} 1회차 PASS\\(종료 0\\).*전부 PASS\\(Y\\)`)); assert.equal(flush(), '')   // 한 번만 전달
    // 훅 본체(stdin → stdout) : SubagentStop 은 systemMessage 만, --flush 는 hookSpecificOutput.additionalContext
    const hook = (args, input) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_JS: fake, CODEX_GATE_NO_RETRY: '1' } })
    const s1 = hook([], { hook_event_name: 'SubagentStop', agent_type: 'anakin_phase-collect', agent_id: 'af00d1234', agent_transcript_path: tp })
    assert.equal(s1.status, 0); const o1 = JSON.parse(s1.stdout); assert.ok(o1.systemMessage.includes('2회차 PASS') && !o1.hookSpecificOutput)
    const s2 = hook(['--flush'], { hook_event_name: 'PostToolUse' }); assert.equal(s2.status, 0); assert.match(JSON.parse(s2.stdout).hookSpecificOutput.additionalContext, /2회차 PASS/)
    assert.equal(JSON.parse(s2.stdout).hookSpecificOutput.hookEventName, 'PostToolUse')
    const s3 = hook(['--flush'], { hook_event_name: 'UserPromptSubmit' }); assert.equal(s3.stdout, '')   // 쌓인 것 없음 = 침묵
    fs.mkdirSync(C.pending, { recursive: true }); fs.writeFileSync(path.join(C.pending, `${Date.now()}-af00d1234.json`), JSON.stringify({ agentType: 't', agentId: 'af00d1234', results: [{ id: 'x', iter: 1, code: 0, verdict: 'PASS', ledger: 'l' }] }))
    assert.equal(hook(['--flush'], { hook_event_name: 'PostToolUse', agent_id: 'a999' }).stdout, '')   // 서브에이전트 안 도구 호출 = 메인 몫 안 가져감
    assert.match(hook(['--flush'], { hook_event_name: 'PostToolUse' }).stdout, /전부 PASS/)
    const sb = hook(['--base'], { hook_event_name: 'SubagentStart', agent_id: 'af00d1234', agent_type: 'anakin_phase-collect' }); assert.equal(sb.status, 0); assert.equal(sb.stdout, ''); assert.ok(baseOf('af00d1234'))   // --base 모드
    const s4 = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { input: '{"agent_type":"anakin_phase-collect","agent_transcript_path":"' + tp.replace(/\\/g, '\\\\') + '"}', encoding: 'utf8', env: { ...process.env, CODEX_JS: fake, [C.envFlag]: '1' } })
    assert.equal(s4.status, 0); assert.equal(s4.stdout, '')   // 훅이 띄운 프로세스 안 = 재진입 안 함
    assert.equal(hook([], 'not json').status, 0)   // 깨진 입력 = 세션 안 막음
    // A3 : 훅 시간 예산 소진 BLOCKED = 원장(iter-N.blocked-K.json + ledger.blocked)에 기록 → 쿨다운 뒤 재판정 대상
    const bl = await gate({ agent_type: 'anakin_phase-collect', agent_id: 'af00d1234', agent_transcript_path: tp }, { deadline: Date.now() + 20e3 })
    assert.equal(bl.results[0].verdict, 'BLOCKED'); assert.match(bl.results[0].reason, /^judge-unavailable : 훅 시간 예산 소진/); assert.ok(!bl.results[0].reason.includes('원장 기록 실패'), bl.results[0].reason)
    const lb = JSON.parse(fs.readFileSync(path.join(C.loops, lid, 'ledger.json'), 'utf8')).blocked.at(-1)
    assert.equal(lb.reason, 'judge-unavailable'); assert.equal(lb.iter, 3); assert.ok(fs.existsSync(path.join(C.loops, lid, 'iter-3.blocked-1.json')))
    assert.ok(retryTargets({ since: 0, now: Date.now() + C.cooldownMs + 60e3 }).some(t => t.id === lid))   // 재판정 대상에 들어감
    // A2·A4 : 칸별 원천 증거 — 생성기 재실행(가짜 생성기)은 실제 종료 코드·출력·전후 변화, c5 = 생성기 출력·요청 md·정본 규칙, c6 commit = git log·status, c6 admin = 원장 요약
    const fakeGen = path.join(tmp, 'fake-gen.mjs'), gf = path.join(tmp, 'g.txt'); fs.writeFileSync(fakeGen, "import fs from 'node:fs'\nconst f = process.argv.find(a => a.endsWith('g.txt')); if (f) fs.writeFileSync(f, String(Date.now()))\nconsole.log('가짜 생성기 실행 ok')\n"); fs.writeFileSync(gf, 'old')
    const gen0 = C.generator; C.generator = fakeGen
    try {
      const g1 = runGenerator([gf], ['g.txt'], tmp); assert.deepEqual([g1.code, g1.out, g1.files, g1.changed], [0, '가짜 생성기 실행 ok', 1, ['g.txt']])
      assert.match(genText(g1), /종료 코드 : 0\n출력\(끝 2000자\) :\n가짜 생성기 실행 ok\n재실행 전후 생성물 내용 변화 : 1건 \/ 대상 1건 — g\.txt/)
      assert.deepEqual(runGenerator(['--x'], ['g.txt'], tmp).changed, []); assert.match(genText({ cmd: 'c', code: 0, out: '', files: 1, changed: [] }), /0건 \/ 대상 1건 \(에이전트가 남긴 생성물 = 생성기 산출 그대로\)/)
      const ev = async (type, aid) => { const r = await gate({ agent_type: type, agent_id: aid, agent_transcript_path: tp }); const l = r.results[0]; return { l, files: fs.readdirSync(path.join(C.loops, l.id, `evidence-${l.iter}`)), read: f => fs.readFileSync(path.join(C.loops, l.id, `evidence-${l.iter}`, f), 'utf8') } }
      const g = await ev('anakin_phase-graph', 'ab0c5d111'); assert.equal(g.l.verdict, 'PASS', JSON.stringify(g.l))
      assert.ok(['generator.txt', 'request-md.md', 'graph-rules.md', 'report.md', 'tools.md'].every(f => g.files.includes(f)), g.files.join(','))
      assert.match(g.read('tools.md'), /^## 이 에이전트 도구 사용 기록[^\n]*\n\(도구 사용 없음\)/)   // 산출 칸 증거 = 도구 기록(명령·경로 — 줄 형식은 위 toolLines 시험)
      assert.match(g.read('generator.txt'), /\$ node scripts\/request-graph\.mjs --md --trigger subagent\n종료 코드 : 0\n출력\(끝 2000자\) :\n가짜 생성기 실행 ok/); assert.ok(g.read('graph-rules.md').length > 1000)
      const cm2 = await ev('anakin_phase-commit', 'ab0c6d222'); assert.ok(cm2.files.includes('git-log.txt') && cm2.files.includes('git-status.txt') && /^\$ git status --short/.test(cm2.read('git-status.txt')))
      const ad = await ev('teamanakin-admin', 'ab0c6d333'); assert.match(ad.read('ledgers.txt'), new RegExp(`- ${lid} : 최종 2회차 PASS · 이력 1회차 PASS → 2회차 PASS → 3회차 BLOCKED\\(judge-unavailable\\)`))
    } finally { C.generator = gen0 }
    fs.rmSync(path.join(C.loops, lid), { recursive: true, force: true })
  } finally {
    delete process.env.CODEX_JS; delete process.env.CODEX_GATE_NO_RETRY; delete process.env.CODEX_GATE_STATE
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(stRoot, { recursive: true, force: true })
  }
  // E : 실제 pending 은 시험 전후 바이트 그대로 — 변경·삭제·생성 모두 검출(c3-build-ab3cb5 D-002 : 종전엔 삭제된 파일을 비교에서 뺐음)
  //   삭제 = 시험 중 메인 flush 가 옮긴 것만 허용(실제 sent 에 같은 바이트로 있어야 함)
  //   생성 = 새 파일 전부 검사(c3-codex-ac436f D-002 — 시험 표식만 보던 약한 검사 폐기) : 다른 세션의 실제 판정만 허용 = 결과마다 원장 경로가 실제 원장 루트(.omc/state/loop/<id>)이고 그 폴더가 있어야 함(시험 원장 = 임시 루트라 탈락)
  const after = snap(realPending), realSent = snap(path.join(path.dirname(realPending), 'sent'))
  for (const [f, b] of Object.entries(before)) assert.equal(f in after ? after[f] : realSent[f], b, `실제 pending ${f in after ? '변경' : '삭제(flush 이동 아님)'} : ${f}`)
  const realRec = b => { try { const r = JSON.parse(b); return Array.isArray(r.results) && r.results.length > 0 && r.results.every(x => /^\.omc\/state\/loop\/[\w.-]+$/.test(x.ledger || '') && fs.existsSync(path.join(ROOT, x.ledger))) } catch { return false } }
  assert.ok(!realRec(JSON.stringify({ results: [{ ledger: '../tmp/loop/c2-x' }] })) && !realRec('{'), '출처 검사 자체')
  const leak = Object.entries(after).filter(([f, b]) => !(f in before) && !realRec(b)).map(([f]) => f)
  assert.deepEqual(leak, [], `실제 pending 에 출처 불명 새 파일(시험 결과 누출) : ${leak.join(', ')}`)
  console.log('selftest ok')
} else if (isMain) {
  // 훅 본체 : 어떤 실패도 세션을 막지 않는다(항상 종료 0)
  try {
    const input = await readStdin()
    if (process.argv[2] === '--base') { if (!process.env[C.envFlag] && input.agent_id && input.agent_type !== C.legacy) snapshotBase(input.agent_id) }   // SubagentStart : 시작 스냅샷(출력 없음)
    else if (process.argv[2] === '--flush') {
      // 서브에이전트 안의 도구 호출(입력 agent_id 있음 — Claude Code 2.1.321 스키마 "Present only when the hook fires from within a subagent")에서는 메인 몫을 가져가지 않는다
      const msg = process.env[C.envFlag] || input.agent_id ? '' : flush()
      if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name || 'PostToolUse', additionalContext: msg } }))
    } else {
      const rec = await gate(input)
      if (rec) process.stdout.write(JSON.stringify({ systemMessage: summarize(rec) }))
    }
  } catch { /* 판정 실패 = 침묵(세션 진행), 결과 파일이 없으면 메인은 원장 없음 = 검증 누락으로 본다 */ }
  process.exit(0)
}
