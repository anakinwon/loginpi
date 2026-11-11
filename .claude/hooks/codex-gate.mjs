// SubagentStop 훅 : 파일을 바꾼 서브에이전트가 끝나면 그 결과의 Codex 루프 판정(scripts/codex-verify.mjs --init → --confirm-real)을 자동 실행하고 결과를 메인에 알린다
//   (2026-11-10 마스터 결정 — verify 폐지·훅 자동 실행 / 개정 "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수" — 원장 c4-<주제>-<agentId 앞 6자> 하나, 절차 정본 .claude/engineering/40. loop/codex_procedure.md 13절)
// 실행 : 루트 .claude/settings.json SubagentStart(`--base` : 시작 스냅샷 git stash create) + SubagentStop(판정, timeout 600) + PostToolUse·UserPromptSubmit(`--flush` : 쌓인 판정 결과를 메인 additionalContext 로 1회 전달 — 서브에이전트 안 호출(입력 agent_id)은 건너뜀)
//   PostToolUse·UserPromptSubmit 등록 = codex-flush.mjs(얇은 진입 — pending 이 있을 때만 이 파일을 불러 flushOut, 출력 바이트 동일 · 2026-11-11 P1). `--flush` 는 그대로 남김(같은 출력)
//   판정 대상 = 파일 변경 1건 이상 + NO_GATE 밖 에이전트, 하네스 파일도 같은 c4 scope(계약 AC-4 — 하네스 1건 이상이면 항상 : 규칙 정합·우회·회귀 없음, 훅이 돌린 node --check 증거 checks.md 는 .md 아닌 하네스가 있을 때만), N = 실제 결함만·형식 지적 = notes '참고 :' 줄(Y 유지, 2026-11-12), 생성물 제외, 프롬프트 상한 넘을 때만 파일 묶음 -p1… (묶음 AND), 같은 요청의 BLOCKED c4 원장 1회 재판정
//   SubagentStop 의 additionalContext 는 서브에이전트에게 가서 그 에이전트가 계속 돈다(Claude Code 2.1.321 스키마 설명) → 메인 전달은 결과 파일 + 메인 쪽 훅 flush 로 한다
// 시험 : node .claude/hooks/codex-gate.mjs --selftest (가짜 판정자 CODEX_JS — Codex 실호출 없음)
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scrub, isSecretPath, canAttachBody, buildPrompt, importSpecs, makeResolver } from '../../scripts/codex-verify.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
/** 상태 루트(원장·pending·기준선) — 기본 .omc/state, env CODEX_GATE_STATE = 시험 격리(2026-11-10 E : 시험이 실제 pending 에 가짜 결과를 써 메인에 전달된 사고). 원장 루트는 래퍼에 env CODEX_LOOP_ROOT 로 넘긴다 */
export const stateOf = s => ({
  loops: path.join(s, 'loop'),
  pending: path.join(s, 'codex-gate', 'pending'),   // 메인에 아직 안 알린 판정 결과(gitignore)
  sent: path.join(s, 'codex-gate', 'sent'),
  base: path.join(s, 'codex-gate', 'base'),   // 에이전트별 시작 스냅샷(SubagentStart '--base')
  attrib: path.join(s, 'codex-gate', 'attrib'),   // 에이전트별 종료 시점 변경 귀속 { wrote, files, at } — request-graph 가 우선 사용(c4-fail-5-aeb16d-p2 D-001)
})
const C = {
  wrapper: path.join(ROOT, 'scripts', 'codex-verify.mjs'),
  generator: path.join(ROOT, 'scripts', 'request-graph.mjs'),
  ...stateOf(path.resolve(process.env.CODEX_GATE_STATE || path.join(ROOT, '.omc', 'state'))),
  reserve: 16 * 1024,       // 묶음 예산 여유 — 범위 목록·이전 회차 결함·가림 표식(budgetOf)
  minBudget: 120 * 1024,    // 묶음 예산 하한(계약·증거가 아주 커도 이만큼은 diff + 본문)
  refEach: 6000, refBody: 12000, refMax: 32000,   // 참조 발췌 글자 상한(항목당 · 결함 함수 본문·파일당 · 묶음당 — budgetOf 가 증거 몫으로 3바이트/자 뺌)
  rulesVer: '2026-11-11d',  // 분할·참조·귀속 규칙 버전 — gate.json·attrib 기록에 남기고, 바뀌면 scope-missing 재시도 상한(retryMax)을 1회 풀어 주고 옛 귀속 기록은 다시 계산(회송 [2]c · 2026-11-11a = 셸 귀속 실행 시각 조건 · 11b = 셸 cd 작업 디렉터리 추적 · 11c = 인터프리터 쓰기 귀속·자동 검사 증거 · 11d = 추적 불가 cwd 시간창 귀속(fail-closed)·자동 selftest 실행 제거)
  checkMs: 60e3,            // 자동 검사(checksOf — node --check 만) 총 시간 상한, 넘으면 '시간 초과' 기록·판정 계속
  noScope: 'docs/__codex-gate-no-files__',   // 파일 scope 없는 판정(옛 원장 재판정 대비) — 없는 경로 = 변경·본문 0, 판정 본체는 증거
  retry: ['scope-too-broad', 'judge-unavailable', 'lock', 'scope-missing'],   // 자동 재판정 사유(device·master-permission·budget·ledger 는 사람 몫) — scope-missing = 묶음 분할로 대조 근거가 빠진 판정(2026-11-10 c4-fail-5-aeb16d), 새 분할로 재판정
  retryMax: 3,              // scope-missing 같은 회차 BLOCKED 기록 상한(쿨다운 없는 사유라 무한 재판정 방지)
  cooldownMs: 10 * 60e3,    // judge-unavailable(사용량 한도 등) 재판정 쿨다운
  budgetMs: 560e3,          // 훅 timeout 600초 안 — --init·export·판정 전부
  minJudgeMin: 1,           // 남은 시간이 이보다 짧으면 판정하지 않고 BLOCKED(judge-unavailable) 기록
  briefMax: 20000, reportMax: 40000, srcMax: 30000,   // 증거 글자 상한(넘으면 앞뒤 보존·가운데 생략 — 래퍼 파일 본문 상한과 같은 규칙)
  genMs: 90e3,              // 생성기 재실행(증거) 시간 상한
  envFlag: 'CODEX_GATE_ACTIVE',   // 훅이 띄운 프로세스 표식 — 재진입 금지
  legacy: 'anakin_phase-verify',  // 폐지된 판정 실행자 — 과거 실행이 끝나도 판정하지 않음(재판정 금지)
}
/** 귀속 규칙 판(그래프 하네스 캐시 키 — request-graph loadAgentHarness ver) */
export const RULES_VER = C.rulesVer
/** 래퍼 상한 사본(scripts/codex-verify.mjs C.maxPromptBytes·maxEvidenceBytes·maxFileEmbedBytes — 래퍼가 C 를 내보내지 않아 사본, selftest 가 래퍼 원문과 대조) */
export const W = { prompt: 600 * 1024, evidence: 200_000, file: 200 * 1024 }
/** 프롬프트 고정 머리(판정 규칙·프로젝트 규칙 발췌·구획 표식 — 빈 구획으로 래퍼 buildPrompt 를 실제 조립해 잰 값) */
const HEAD_BYTES = Buffer.byteLength(buildPrompt({ task: '', evidence: '', diffText: '', scope: '', iter: 1, nonce: '0'.repeat(16) }))
// 하네스 경로(scripts/request-graph.mjs HARNESS_RE 와 같은 정의 — 훅은 생성기 의존성을 싣지 않으려고 사본, 시험이 두 값 일치를 확인)
export const HARNESS_RE = /(^|[\\/])\.claude[\\/](hooks|agents|skills|engineering[\\/]40\. loop)[\\/]|(^|[\\/])\.claude[\\/]settings[^\\/]*\.json$/
/** 생성물(생성기 산출 — scope 제외, 생성기 실행 증거로만) · 판정 제외 경로(상태·음성·작업 이력) */
export const GEN_RE = /^\.claude\/engineering\/50\. graph\/(myRequestGraph\.html$|request-flow\/|requests\/)|^work-statistics\//
const EXCLUDE_RE = /^(\.omc|voice|work-history|work-statistics)\//
/**
 * 판정 비대상 에이전트(2026-11-10 개정 — 13절 규칙 3 · request-graph NO_GATE 와 같은 값, selftest 가 일치 확인)
 *   읽기 전용·보고형(수집·결론·검수·커밋·팀장 — 그래프 에이전트는 2026-11-12 폐지) = 파일을 바꿔도 판정하지 않는다 — review 는 Bash 셸 2차 귀속이 병렬 세션 변경을 끌어올 수 있어 포함
 */
export const NO_GATE = new Set(['anakin_phase-collect', 'anakin_phase-decide', 'anakin_phase-review', 'anakin_phase-commit', 'teamanakin-admin'])
const TARGET = '산출물(하네스 파일 포함) — 브리프의 완료 기준 충족 / 근거·반론 검토 / 지적의 근거'   // c4 검수 대상(13절 표) — 자동 계약 AC-2

/** 원장 id 주제 : 설명(영문·숫자만) 또는 에이전트 종류 짧은 이름, 30자 */
export function slugOf(type, desc) {
  const s = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (s(desc).length >= 3 ? s(desc) : s(String(type || 'agent').replace(/^anakin_phase-|^teamanakin-/, '')) || 'agent').slice(0, 30).replace(/-+$/, '')
}
/** 판정 계획 : 파일을 바꾼 비대상 밖 에이전트 = [{ no: 4, id: c4-<주제>-<agentId 앞 6자> }] 하나, 그 밖 = [] */
export function planFor({ type, agentId, desc, changed = [] }) {
  if (!type || type === C.legacy || NO_GATE.has(type) || !changed.length) return []
  const tag = String(agentId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'a00000', slug = slugOf(type, desc)
  return [{ no: 4, id: `c4-${slug}-${tag}`.slice(0, 60) }]
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
 *   Bash·PowerShell = 명령 문자열(redact, 500자) + 출력 앞 2줄 + 끝 8줄(빈 줄 제외·겹치면 합침·가운데 생략 표식, redact, 줄당 200자 — 2026-11-11 P4 : 끝의 시험 요약·종료 줄이 증거에서 빠짐) / Read·Write·Edit = 경로만(본문·바꾼 글 제외) / Agent = 종류·설명 / SendMessage = 받는 쪽 / Grep·Glob = 패턴·경로 / 그 밖 = 이름만
 */
const outExcerpt = x => { const ls = redact(x).split('\n').filter(l => l.trim()).map(l => l.slice(0, 200)); return ls.length <= 10 ? ls : [...ls.slice(0, 2), `…(가운데 ${ls.length - 10}줄 생략)`, ...ls.slice(-8)] }
export function toolLines(recs, who = 'main') {
  const out = new Map(); for (const j of recs) if (j?.type === 'user' && Array.isArray(j.message?.content)) for (const b of j.message.content) if (b?.type === 'tool_result') out.set(b.tool_use_id, Array.isArray(b.content) ? b.content.filter(c => c?.type === 'text').map(c => c.text).join('\n') : String(b.content ?? ''))
  return recs.flatMap(j => j?.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use').map(b => {
    const t = Date.parse(j.timestamp), at = Number.isFinite(t) ? kst(t).slice(11) : '--:--:--', i = b.input || {}
    const d = SHELL.has(b.name) ? `$ ${redact(String(i.command ?? '')).replace(/\s*\n\s*/g, ' ⏎ ').slice(0, 500)}${out.has(b.id) ? `\n    → ${outExcerpt(out.get(b.id)).join('\n    → ') || '(출력 없음)'}` : ''}`
      : PATHS.has(b.name) ? String(i.file_path || i.notebook_path || '') : b.name === 'Agent' || b.name === 'Task' ? `${i.subagent_type || 'general-purpose'} — ${String(i.description || '').slice(0, 80)}`
        : b.name === 'SendMessage' ? `→ ${i.to || '?'}` : b.name === 'Grep' || b.name === 'Glob' ? redact(`${i.pattern || ''} ${i.path || ''}`).trim().slice(0, 200) : ''
    return `${at} ${b.name} [${who}]${d ? ' : ' + d : ''}`
  }) : [])
}
/** 상한 넘는 글 = 앞뒤 보존·가운데 생략(래퍼 fileBlock 과 같은 분할 규칙 — 첫 지시·마지막 응답을 둘 다 남긴다) */
export const capMid = (x, n) => { x = String(x || ''); if (x.length <= n) return x; const h = Math.floor(n / 2); return x.slice(0, h) + `\n…[가운데 ${x.length - n}자 생략 — 상한 ${n}자, 앞뒤 보존]…\n` + x.slice(-h) }
/** 증거용 파일 본문(2026-11-10 보안 검토) : 비밀 경로 = 읽지 않음(경로만), 허용 확장자 밖 = 경로·크기만, 허용 = redact(capMid) */
export function fileExcerpt(rel, max, root = ROOT) {
  if (isSecretPath(rel)) return '(본문 미첨부 — 비밀 경로)'
  if (!canAttachBody(rel)) { let n = '?'; try { n = fs.statSync(path.join(root, rel)).size } catch { /* 없음 */ } return `(본문 미첨부 — 허용 확장자 아님, 크기 ${n} 바이트)` }
  try { return redact(capMid(fs.readFileSync(path.join(root, rel), 'utf8'), max)) } catch { return '(읽기 실패 — 삭제됨)' }
}
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
  // 재개(SendMessage·백그라운드 알림으로 같은 에이전트가 다시 시작) = 첫 스냅샷 유지 — 원장은 그 에이전트 산출 전체를 판정한다
  //   (2026-11-10 c4-fail-5-aeb16d iter-3 : 재개 때 스냅샷을 덮어써 scope diff 0건 → 본문·diff 없는 판정 → scope-missing)
  const had = baseOf(agentId, root); if (had) return had
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
 *     같은 시간 다른 에이전트·메인 기록이 쓴 경로(others — Write·Edit + 셸 쓰는 형태 shellWrites) = 제외하고 건수만(반환 배열 .excluded — 계약 '병렬 에이전트 귀속 제외 n건')
 *     단 이 에이전트 명령도 그 경로를 쓰는 형태로 적었으면 귀속(둘 다 쓴 파일) — 읽기·실행 명령의 글롭·디렉터리 일치만으로는 귀속하지 않음(c4-aeb16d-ae440b D-001)
 *   반환 = 저장소 상대 posix 정렬 배열 + .excluded(숫자) + .own(1차 집합)
 *   until = 2차 시각 상한(끝난 실행을 나중에 보는 request-graph 용 — 훅은 정지 직후라 없음)
 */
export function changedFiles(writes, t0, base = null, root = ROOT, { shell = [], others = new Set(), until = null } = {}) {
  const own = new Set(writes.map(p => relOf(p, root)).filter(Boolean)), out = new Set(own)
  const fresh = f => { try { const m = fs.statSync(path.join(root, f)).mtimeMs; return t0 != null && m >= t0 - 1000 && (until == null || m <= until + 1000) } catch { return false } }
  let excluded = 0
  // 셸 귀속은 명령 근거가 있을 때만(2026-11-10 c4-anakin-arch-4-claude-a11648 — 링크 점검 Bash 하나로 병렬 실행이 셸로 고친 파일까지 끌어옴) :
  //   shell = 그 에이전트의 Bash·PowerShell 명령 — 문자열 또는 { c, t, t1 }(명령 시각·결과 시각, attributeOf 가 넘김). 후보는 명령에 그 경로 또는 그 디렉터리(저장소 루트 제외)가 나올 때만 귀속
  //   시각 있는 명령(2026-11-11 c4-build-4-a609bd·5-a04677·6-aed1dc 오귀속) = 파일 수정 시각이 그 명령 실행 중([t, t1] ±1초)일 때만 — 형제가 `node -e` 로 쓴 파일(shellWrites 로 안 보임)·
  //     아직 기록에 안 실린 형제 Edit 가 '이 에이전트의 test/*.test.mjs 글롭·grep 경로 언급'으로 붙던 문제. t1 없음(백그라운드·결과 전) = 상한 없음
  //   ponytail: 수정 시각은 마지막 1개뿐 — 같은 파일을 뒤에 다른 실행이 또 고치면 이 에이전트 셸 쓰기는 빠짐(그 실행이 기록에 있으면 원래도 제외 대상). 정확히 하려면 명령 전후 파일 해시 기록
  //   cd 뒤 상대 표기(2026-11-11 후속 2) = 명령 글을 그 cwd 기준 저장소 상대로 바꿔(rootText — shellWrites 와 cwd 해석 공유) 비교, 저장소 밖·추적 불가 cwd 의 상대 언급은 근거 아님
  //   인라인 인터프리터(2026-11-11c — c4-c-ecc-flush-a1dd68 `cd /c/…; node -e "…writeFileSync('.claude/settings.json')"; for …; done` = 0건 귀속·원장 없음, c4-build-abc938 `cd …/references && node - <<'EOF'` 누락) :
  //     쓰기 대상이 코드 안에 있어 글로 확정할 수 없음(복합 셸 + cd = cwd 추적 불가로 상대 언급까지 버려짐) → 그 명령 실행 중([t, t1] ±1초, 둘 다 있을 때만) 수정 시각이 바뀐 파일을 귀속, 다른 실행이 쓴 경로(others)는 위처럼 제외
  //     ponytail: 실행 중 같은 시각에 다른 세션(기록 밖)이 고친 파일도 붙음 — 시간창이 짧아(보통 수 초) 감수, 오귀속이 나오면 명령 전후 해시 비교로
  //   추적 불가 cwd(2026-11-11d 보안 검토 S-2 — 종전 = 상대 쓰기 누락 = 판정 없이 통과, fail-open) : 세그먼트 하나라도 cwd = null 이면 인터프리터와 같은 시간창 귀속(ip) — fail-closed, others 제외 규칙 동일
  const sh = (Array.isArray(shell) ? shell : []).map(x => typeof x === 'string' ? { c: x } : x).filter(x => x && typeof x.c === 'string')
    .map(x => { const g = shellSegs(x.c, root).segs; return { ...x, rc: rootText(x.c, root), ip: g.some(s => s.cwd === null) || INTERP_RE.test(g.map(s => s.s).join('\n')) } })
  const T = sh.map(x => x.c).join('\n').replace(/\\/g, '/')
  const names = (c, f) => { c = c.replace(/\\/g, '/'); const d = path.posix.dirname(f); return c.includes(f) || (d !== '.' && new RegExp(`(^|[^\\w.-])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|[^\\w.-]|$)`).test(c)) }
  const mtOf = f => { try { return fs.statSync(path.join(root, f)).mtimeMs } catch { return NaN } }
  const win = (x, m) => m >= x.t - 1000 && (!Number.isFinite(x.t1) || m <= x.t1 + 1000)
  const said = f => sh.some(x => names(x.rc, f) && (!Number.isFinite(x.t) || win(x, mtOf(f))))
  const ran = f => sh.some(x => x.ip && Number.isFinite(x.t) && Number.isFinite(x.t1) && win(x, mtOf(f)))   // 인라인 인터프리터·추적 불가 cwd 명령 실행 중 수정(백그라운드·시각 없음 = 근거 아님)
  // 다른 실행도 쓴 경로(others — Write·Edit·셸 쓰는 형태) = 이 에이전트 명령이 그 경로를 '쓰는 형태'로 적었을 때만 귀속, 읽기·실행·글롭·디렉터리 일치뿐이면 제외(c4-aeb16d-ae440b D-001)
  const mine = new Set(sh.flatMap(x => [...shellWrites(x.c, root)]).map(p => relOf(p, root)).filter(Boolean))
  if (T) {
    const cand = base ? [...git(['diff', '--name-only', '-z', base], root).stdout.split('\0'), ...git(['ls-files', '--others', '--exclude-standard', '-z'], root).stdout.split('\0')]
      : (g => g.status === 0 ? g.stdout.split('\0').filter(e => e && !e.startsWith('R')).map(e => e.slice(3)) : [])(git(['status', '--porcelain', '-uall', '-z'], root))
    for (const f of new Set(cand)) if (f && !out.has(f) && fresh(f)) { if (others.has(f) && !mine.has(f)) excluded++; else if (said(f) || mine.has(f) || ran(f)) out.add(f) }   // mine = 쓰는 형태 대상(-tDIR 처럼 경로가 글자로 안 드러나도, D-002) · ran = 인라인 인터프리터 실행 중 수정(11c)
  }
  return Object.assign([...out].filter(f => !EXCLUDE_RE.test(f)).sort(), { excluded, own })
}
const absOf = (p, root = ROOT) => path.resolve(root, String(p).replace(/^\/([a-z])\//i, '$1:/'))
const relOf = (p, root = ROOT) => { const r = path.relative(root, absOf(p, root)).replace(/\\/g, '/'); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : null }   // Git Bash /c/… = c:/…
/**
 * 셸 명령이 '쓰는 형태'로 명시한 경로(2026-11-10 c4-aeb16d-ae440b D-001 — 병렬 에이전트가 `cat >> f <<EOF` 로 쓴 파일이 다른 에이전트의 `node --test test/*.test.mjs` 디렉터리 일치로 오귀속)
 *   = `>`·`>>` 리다이렉트 대상 · tee 인자 · sed -i 파일 · cp/mv/install·Copy-Item·Move-Item(-Destination 또는 위치 인자) 대상 — 원본 2개 이상·끝 '/'·판정 시점 root 기준 이미 있는 디렉터리 = 대상/원본이름도(c4-build-a9fcfc D-001)
 *   · Set-Content·Add-Content·Out-File(-Path·-FilePath·-LiteralPath 또는 첫 위치 인자)
 *   heredoc 본문·따옴표 안 글은 보지 않는다(본문의 `a > b`·`=>` 오검출 방지). /dev/*·$null·nul·변수 대상 제외. 반환 = 명령에 적힌 그대로의 경로 Set(cwd ≠ 루트의 상대 대상만 아래 작업 디렉터리 규칙으로 절대경로)
 *   값 받는 옵션(c4-build-a9fcfc D-002 — `cp -t <대상>` 대상 누락) : POSIX(cp·mv·install·sed·tee) = 대소문자 구분·묶음(-rt)·--긴옵션(=값 · 띄운 값)·`--` 처리,
 *     -t·--target-directory = 대상 디렉터리(원본마다 대상/원본이름), -T = 대상 그대로 / PowerShell = 값 받는 매개변수 소비(-Filter 등)·4자 이상 유일 접두 약어(-Dest)
 *   작업 디렉터리(2026-11-11 후속 2 — `cd <dir> && cat > f` 의 f 가 저장소 루트 기준으로 풀려 저장소 밖 Temp·하위 앱 쓰기가 오귀속) : 세그먼트 순서로 cwd 누적(shellSegs),
 *     cwd ≠ 루트 세그먼트의 상대 대상 = 그 cwd 기준 절대경로로 반환(relOf 가 저장소 밖 = null), cwd 추적 불가 뒤 상대 대상 = 반환 안 함(오귀속보다 누락), 절대 대상 = 그대로
 *   ponytail: 복합 셸(서브셸·묶음·제어문·명령 치환)에서 cd 이후 상대 쓰기 = 여기서는 반환 안 함(오귀속 방지 — 대신 changedFiles 가 그 명령 시간창 귀속, 11d fail-closed) — 단순 연쇄에서만 cwd 추적,
 *     `a && cd x; cat > f` 처럼 && 실패로 건너뛴 cd 는 실행됐다고 봄, 파이프·& 안 cd 도 이어진다고 봄,
 *     PowerShell 별칭(-LP 등 쓰기 cmdlet 매개변수)은 못 봄 — 오귀속이 다시 나오면 push-guard 렉서 수준으로
 */
const PX_VAL = { cp: 'tS', mv: 'tS', install: 'tSmog', sed: 'efl', tee: '' }   // POSIX 값 받는 짧은 옵션(대소문자 구분)
const PX_LONG = { 'target-directory': '-t', suffix: '-S', mode: '-m', owner: '-o', group: '-g', expression: '-e', file: '-f', 'line-length': '-l' }   // 값 받는 긴 옵션 → 짧은 키
const PS_VAL = ['path', 'filepath', 'literalpath', 'destination', 'encoding', 'value', 'width', 'inputobject', 'stream', 'delimiter', 'filter', 'include', 'exclude', 'credential', 'tosession', 'fromsession']   // PowerShell 값 받는 매개변수
const CD_CMD = new Set(['cd', 'chdir', 'pushd', 'sl', 'set-location', 'push-location'])
// 복합 셸 = 서브셸·묶음 ( ) { } · 명령 치환 $( 백틱 · 제어 키워드 · popd(가린 글 기준 — 따옴표·heredoc 본문 안은 안 봄)
const COMPLEX_RE = /[(){}`]|(^|[\s;&|])(if|then|elif|else|fi|while|until|do|done|for|select|case|esac|popd|pop-location)(?=$|[\s;&|])/i
const isAbsP = p => path.isAbsolute(String(p).replace(/^\/([a-z])\//i, '$1:/'))
// 인라인 인터프리터(코드 안에서 파일을 쓸 수 있는 형태 — changedFiles ran, 가린 글 기준이라 따옴표·heredoc 본문 안 글은 안 봄) :
//   node·bun·perl·ruby -e/--eval/-p/--print/- · python·py -c/- · 인터프리터 + heredoc(<<). node --test·--check·스크립트 파일 실행은 해당 없음
const INTERP_RE = /(^|[\s;&|(])(?:(?:node|bun|perl|ruby)(?:\.exe)?(?:\s+-\S+)*?\s+(?:-e|--eval|-p|--print|-)(?=\s|$)|(?:python[\d.]*|py)(?:\.exe)?(?:\s+-\S+)*?\s+(?:-c|-)(?=\s|$)|(?:node|bun|perl|ruby|python[\d.]*|py)(?:\.exe)?\s[^\n]*<<)/im
/**
 * 셸 명령 → 세그먼트(&&·||·;·|·&·줄바꿈 순서) [{ s: 가린 글, cwd: 그 세그먼트 실행 디렉터리(절대, 추적 불가 = null) }] + 표식 원문(q 따옴표 · b heredoc 본문 · r 리다이렉트 대상)
 *   가림 = 따옴표 \u0001N\u0001 · heredoc 본문 \u0003N\u0003 · 리다이렉트 대상 \u0002N\u0002 — 본문·따옴표 안 `>`·`;`·`(` 는 보지 않는다
 *   단순 연쇄(cd·cd /d·chdir·pushd·Set-Location·sl·Push-Location 과 일반 명령을 &&·;·||·줄바꿈으로 이음) = root 에서 cwd 누적 — 상대 = 현재 cwd 기준, Git Bash /c/… = absOf,
 *     인자 없음·~·-·$VAR·%VAR% 대상 = 추적 불가(절대경로 cd 로 다시 추적). 그 cd 세그먼트의 리다이렉트는 cd 전 cwd
 *   복합 셸(COMPLEX_RE, 2026-11-11 c4-2-cd-a10f27 회송 결정 — 경계 사례마다 새 구멍) = cd 계열 낱말이 처음 나온 세그먼트부터 끝까지 추적 불가(그룹 리다이렉트 포함),
 *     그 앞 세그먼트 = 루트 확정, cd 계열이 없으면 전부 루트(서브셸은 부모 cwd 상속)
 */
function shellSegs(cmd, root = ROOT) {
  const q = [], b = [], r = [], R = path.resolve(root), un = w => w.replace(/\u0001(\d+)\u0001/g, (_, i) => q[+i])
  const s = String(cmd ?? '').replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/g, (_, h, _q, _t, body) => `${h} \u0003${b.push(body) - 1}\u0003`)   // heredoc 본문 가림(머리 줄의 리다이렉트는 남김)
    .replace(/'([^']*)'|"((?:\\.|[^"\\])*)"/g, (_, a, c) => `\u0001${q.push(a ?? c) - 1}\u0001`)
    .replace(/(?<![=\-<>])(?:[0-9]|&)?>>?(?![&>])\s*([^\s;&|<>()]+)/g, (_, t) => ` \u0002${r.push(t) - 1}\u0002 `)
  const complex = COMPLEX_RE.test(s), segs = []; let cwd = R
  for (const seg of s.split(/&&|\|\||[;|&\n]/)) {
    const ws = seg.replace(/[\u0002\u0003]\d+[\u0002\u0003]/g, ' ').split(/\s+/).filter(Boolean)
    if (complex) { if (ws.some(w => CD_CMD.has(un(w).replace(/^[$({`]+/, '').toLowerCase()))) cwd = null; segs.push({ s: seg, cwd }); continue }   // 복합 = 첫 cd 세그먼트부터 추적 불가
    segs.push({ s: seg, cwd })
    const i0 = ws.findIndex(w => !/^\w+=/.test(w)); if (i0 < 0 || !CD_CMD.has(path.basename(un(ws[i0])).toLowerCase().replace(/\.exe$/, ''))) continue
    const args = ws.slice(i0 + 1); let t
    for (let i = 0; i < args.length && t === undefined; i++) {
      if (/^-(path|literalpath|lp|pspath)$/i.test(args[i])) t = args[i + 1] ?? null
      else if (!/^\/d$/i.test(args[i]) && !/^-\w/.test(args[i]) && !/^\d*[<>]/.test(args[i])) t = args[i]   // cd /d · -P·-L·-PassThru 등 옵션 · 2>&1 꼬리 건너뜀
    }
    const d = t == null ? '' : un(t)
    cwd = d && !/^~|^-$|[$%`]/.test(d) && (cwd || isAbsP(d)) ? absOf(d, cwd || R) : null
  }
  return { segs, q, b, r, R, un }
}
/** 명령 글을 저장소 루트 기준 글로(changedFiles said 용 — shellWrites 와 cwd 해석 공유) : cd 없음 = 원문 그대로, cwd ≠ 루트 세그먼트 = 낱말을 그 cwd 기준 저장소 상대로(저장소 밖·추적 불가 상대 = 버림, 절대 = 저장소 안이면 상대로) */
function rootText(cmd, root = ROOT) {
  const { segs, b, r, R, un } = shellSegs(cmd, root)
  if (segs.every(x => x.cwd === R)) return String(cmd ?? '')
  return segs.map(({ s, cwd }) => {
    const raw = un(s.replace(/\u0002(\d+)\u0002/g, (_, i) => r[+i])).replace(/\u0003(\d+)\u0003/g, (_, i) => b[+i])
    return cwd === R ? raw : raw.split(/[\s'"`;|&<>()=,]+/).filter(t => t && !/^[-$%~]/.test(t)).map(t => isAbsP(t) ? relOf(t, root) : cwd ? relOf(absOf(t, cwd), root) : null).filter(Boolean).join(' ')
  }).join('\n')
}
export function shellWrites(cmd, root = ROOT) {
  const { segs, r: rd, R, un } = shellSegs(cmd, root), out = new Set()
  let cwd = R
  const add = w => { const p = un(w).trim(); if (!p || /^(\/dev\/|\$|=|&)|^nul$/i.test(p)) return; if (cwd === R || isAbsP(p)) out.add(p); else if (cwd) out.add(absOf(p, cwd)) }   // cd 뒤 상대 = 그 cwd 기준 절대, 추적 불가 = 제외
  const isDir = p => { try { return fs.statSync(absOf(p, cwd || R)).isDirectory() } catch { return false } }
  const into = (dst, srcs, dir = false) => {
    if (typeof dst !== 'string') return; const d = un(dst); add(d)
    if (dir || srcs.length > 1 || /[\\/]$/.test(d) || isDir(d)) for (const src of srcs) if (typeof src === 'string') add(path.posix.join(d.replace(/\\/g, '/'), path.posix.basename(un(src).replace(/\\/g, '/'))))
  }
  for (const { s: seg, cwd: c } of segs) {
    cwd = c
    for (const [, i] of seg.matchAll(/\u0002(\d+)\u0002/g)) add(rd[+i])   // 리다이렉트 대상(그 세그먼트 cwd)
    const ws = seg.replace(/[\u0002\u0003]\d+[\u0002\u0003]/g, ' ').trim().split(/\s+/).filter(Boolean), i0 = ws.findIndex(w => !/^\w+=/.test(w)); if (i0 < 0) continue
    const cmdName = path.basename(un(ws[i0])).toLowerCase().replace(/\.exe$/, ''), args = ws.slice(i0 + 1), pos = [], named = {}, pv = PX_VAL[cmdName]
    for (let i = 0; i < args.length; i++) {
      const a = args[i]; let m
      if (pv != null) {   // POSIX : 대소문자 구분(-T ≠ -t · -E ≠ -e), 묶음 -rt·-tDIR, --긴옵션=값·--긴옵션 값, -- 뒤 = 위치 인자
        if (a === '--') { pos.push(...args.slice(i + 1)); break }
        if ((m = /^--([\w-]+)(?:=(.*))?$/.exec(a))) { const s = PX_LONG[m[1]]; if (m[2] != null) named[s || a.split('=')[0]] = m[2]; else if (s && i + 1 < args.length) named[s] = args[++i]; else named[a] = true }
        else if (/^-[^-]/.test(a)) for (let j = 1; j < a.length; j++) {
          const c = a[j]
          if (cmdName === 'sed' && c === 'i') { named['-i'] = true; break }   // -i 뒤 글자 = 백업 접미(-i.bak · -ie)
          if (pv.includes(c)) { named['-' + c] = j + 1 < a.length ? a.slice(j + 1) : args[++i]; break }
          named['-' + c] = true
        }
        else pos.push(a)
      } else if (/^-/.test(a) && a !== '-') {   // PowerShell(대소문자 무시) : 값 받는 매개변수 소비, 4자 이상 유일 접두 약어 = 전체 이름
        let k = a.toLowerCase().replace(/:$/, ''); const hit = PS_VAL.filter(p => ('-' + p).startsWith(k))
        if (!PS_VAL.includes(k.slice(1)) && k.length >= 5 && hit.length === 1) k = '-' + hit[0]
        if (PS_VAL.includes(k.slice(1)) && i + 1 < args.length) named[k] = args[++i]; else named[k] = true
      } else pos.push(a)
    }
    const has = re => Object.keys(named).some(k => re.test(k))
    if (cmdName === 'tee') pos.forEach(add)
    else if (cmdName === 'sed' && has(/^(-i|--in-place)/)) pos.slice(named['-e'] || named['-f'] ? 0 : 1).forEach(add)
    else if (['cp', 'mv', 'install'].includes(cmdName)) {
      if (typeof named['-t'] === 'string') into(named['-t'], pos, true)   // -t DIR · --target-directory[=]DIR = 원본마다 DIR/원본이름
      else if (pos.length >= 2) named['-T'] ? add(pos.at(-1)) : into(pos.at(-1), pos.slice(0, -1))
    } else if (['set-content', 'add-content', 'out-file'].includes(cmdName)) { const p = named['-path'] || named['-filepath'] || named['-literalpath'] || pos[0]; if (typeof p === 'string') add(p) }
    else if (['copy-item', 'move-item'].includes(cmdName)) {
      const ps = named['-path'] || named['-literalpath'], src = typeof ps === 'string' ? ps : pos[0]
      into(named['-destination'] || (typeof ps === 'string' ? pos[0] : pos[1]), [src])
    }
  }
  return out
}
/** 기록의 쓰기 = Write·Edit·MultiEdit·NotebookEdit 대상 + Bash·PowerShell 명령의 쓰는 형태 대상(shellWrites) — { t, p } */
const writesOf = (recs, root = ROOT) => recs.flatMap(j => j?.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use').flatMap(b =>
  ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name) ? [{ t: Date.parse(j.timestamp), p: String(b.input?.file_path || b.input?.notebook_path || '') }]
    : SHELL.has(b.name) ? [...shellWrites(b.input?.command, root)].map(p => ({ t: Date.parse(j.timestamp), p })) : []) : [])
/** 같은 세션 다른 실행(형제 서브에이전트 기록 · 메인 기록)이 t0 뒤 쓴 파일(저장소 상대) — Write·Edit + 셸 쓰는 형태(shellWrites) · scope 귀속 제외용(c2-collect-ac25ad D-001 · c4-aeb16d-ae440b D-001) */
export function otherWrites(dir, self, mainTp, t0, root = ROOT) {
  const out = new Set(), add = ws => { for (const w of ws) if (w.r && !(w.t < (t0 ?? 0) - 1000)) out.add(w.r) }
  // 같은 세션의 모든 다른 에이전트 기록(최상위 + workflows/* — 진행 중 기록 포함, 2026-11-10 a11648 오귀속) : 워크플로 실행이면 subagents 뿌리부터
  dir = dir.replace(/[\\/]workflows[\\/][^\\/]+$/, '')
  let fs0 = []; try { fs0 = fs.readdirSync(dir, { recursive: true }).map(String).filter(f => /^agent-.+\.jsonl$/.test(path.basename(f)) && path.join(dir, f) !== path.resolve(self)) } catch { /* 폴더 없음 */ }
  for (const f of fs0) { try { const p = path.join(dir, f), st = fs.statSync(p); if (st.mtimeMs >= (t0 ?? 0) - 1000) add(writesCached(p, st, root, () => readJsonl(p))) } catch { /* 읽기 실패 = 건너뜀 */ } }
  try { if (mainTp) add(writesCached(mainTp, fs.statSync(mainTp), root, () => tailJsonl(mainTp, 8 * 2 ** 20).filter(j => !j.isSidechain))) } catch { /* 메인 기록 없음 */ }
  return out
}
/**
 * 기록별 쓰기 목록 기억(2026-11-11 P3-3 — 그래프가 실행마다 attributeOf 를 불러 같은 형제 기록을 N번 다시 읽던 것) : 키 = 경로·root, 크기·mtime 이 같으면 다시 읽지 않음(바뀌면 다시 읽어 덮어씀)
 *   ponytail: 같은 크기·mtime 으로 내용만 바뀐 기록은 못 잡음 — 기록은 덧붙이기만 하므로 크기가 바뀜
 */
const owCache = new Map()
function writesCached(p, st, root, load) {
  const k = `${path.resolve(p)}|${root}`, c = owCache.get(k)
  if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) return c.ws
  const ws = writesOf(load(), root).flatMap(w => { const r = w.p && relOf(w.p, root); return r ? [{ t: w.t, r }] : [] })
  owCache.set(k, { size: st.size, mtimeMs: st.mtimeMs, ws }); return ws
}
/**
 * 변경 귀속(gate · request-graph 공용 — 2026-11-10 c4-build-loop-only-aef4b3-p3 D-002 : 그래프가 Write·Edit 만 보고 셸 변경 실행의 누락을 못 잡음)
 *   1차 Write·Edit + Bash·PowerShell 을 썼으면 2차(기준선 diff ∩ 시간창, 병렬 실행 Write·Edit 제외) → splitScope. files = 판정 대상(하네스 + 산출, 생성물 제외) — 0건이면 원장 없음
 *   closed = 끝난 실행을 나중에 볼 때 2차 시각 상한 = 기록 마지막 시각
 */
export function attributeOf({ recs, tp, mainTp, agentId, root = ROOT, closed = false }) {
  const a = readAgent(recs), baseRef = baseOf(agentId, root)
  const oth = otherWrites(path.dirname(tp), tp, mainTp, a.t0, root)
  // 셸 명령 + 실행 시각창(명령 기록 시각 ~ 결과 기록 시각, 백그라운드 = 상한 없음) — changedFiles 2차 귀속이 '그 명령 실행 중 바뀐 파일'만 보게(2026-11-11 워크플로 병렬 오귀속)
  const done = new Map(); for (const j of recs) if (j?.type === 'user' && Array.isArray(j.message?.content)) for (const b of j.message.content) if (b?.type === 'tool_result') done.set(b.tool_use_id, Date.parse(j.timestamp))
  const cmds = recs.flatMap(j => j.type === 'assistant' && Array.isArray(j.message?.content) ? j.message.content.filter(b => b?.type === 'tool_use' && SHELL.has(b.name)).map(b => ({ c: String(b.input?.command ?? ''), t: Date.parse(j.timestamp), t1: b.input?.run_in_background ? NaN : done.get(b.id) ?? NaN })) : [])
  const changed = changedFiles(a.writes, a.t0, baseRef, root, { shell: cmds, others: oth, until: closed ? a.t1 : null }), sc = splitScope(changed)
  return { a, baseRef, shell: cmds.length > 0, changed, sc, files: [...sc.harness, ...sc.product] }
}
/**
 * 종료 시점 귀속 고정(2026-11-10 c4-fail-5-aeb16d-p2 D-001 — 그래프가 과거 실행의 셸 변경을 '지금' 파일 수정 시각으로 다시 판단해, 다른 실행이 같은 파일을 다시 고치면 wrote·누락 경보가 사라짐)
 *   훅(SubagentStop)이 attributeOf 결과를 attrib/<agentId>.json 에 남기고, 그래프는 attributionFor 로 이 기록을 우선 읽는다. 기록 없는 과거 실행만 지금 다시 판단 + est(추정) 표식
 */
const attribFile = agentId => path.join(C.attrib, `${String(agentId).replace(/[^\w-]/g, '')}.json`)
export function saveAttrib(agentId, res, now = Date.now()) {
  if (!agentId) return
  fs.mkdirSync(C.attrib, { recursive: true }); fs.writeFileSync(attribFile(agentId), JSON.stringify({ wrote: res.files.length > 0, files: res.files, at: new Date(now).toISOString(), rulesVer: C.rulesVer }))
}
/** 귀속 기록 — 귀속 규칙 버전(rulesVer)이 지금과 같을 때만(2026-11-11 c4-d-002-a5870f-p2 D-001 : 옛 규칙 기록의 오귀속이 그래프에 남음). 옛 판·버전 없음 = 기록 없음과 같게(다시 계산, 기록은 덮어쓰지 않음) */
export const loadAttrib = agentId => { try { const r = JSON.parse(fs.readFileSync(attribFile(agentId), 'utf8')); return Array.isArray(r.files) && r.rulesVer === C.rulesVer ? r : null } catch { return null } }
/** 귀속 기록 mtime(없음·옛 규칙 판 = 0) — 그래프 하네스 캐시 키(기록이 생기거나 다시 쓰이거나 규칙 판이 바뀌면 캐시를 버림, c4-fail-5-aeb16d-p2 iter-2 D-001) */
export const attribAt = agentId => { try { return agentId && loadAttrib(agentId) ? Math.round(fs.statSync(attribFile(agentId)).mtimeMs) : 0 } catch { return 0 } }
export function attributionFor(o) { const r = loadAttrib(o.agentId); return r ? { files: r.files, recorded: true } : { ...attributeOf(o), est: true } }
/** scope 분류 : 하네스 경로(계약 AC-4 조건) · 그 밖 산출 파일 — 둘 다 같은 c4 scope · 생성물(설계도판·슬롯 md·실데이터판) = scope 제외(생성기 실행 증거로만) */
export function splitScope(changed) {
  const gen = changed.filter(f => GEN_RE.test(f)), rest = changed.filter(f => !GEN_RE.test(f))
  return { harness: rest.filter(f => HARNESS_RE.test(f)), product: rest.filter(f => !HARNESS_RE.test(f)), generated: gen }
}
/** 파일 1개의 프롬프트 비용 추정(바이트) = diff 본문(래퍼 diff 구획) + 본문 삽입(래퍼 files 구획 — 파일당 200KB 상한 · 줄 번호 15% 가산) */
export function costOf(f, ref, root = ROOT) {
  let size = 0; try { size = fs.statSync(path.join(root, f)).size } catch { /* 삭제 = 본문 없음 */ }
  const d = git(['diff', ref, '--', `:(literal)${f}`], root)
  return Buffer.byteLength(d.stdout || '') + Math.min(size, W.file) * 1.15 + 200
}
/**
 * 묶음 예산(2026-11-10 AC-2 — 종전 고정 360KB 는 실측 고정 구획과 무관한 추정) = 래퍼 프롬프트 상한 − 규칙 머리(실측 HEAD_BYTES) − 계약 − 증거(+참조 발췌 몫, 래퍼 증거 상한까지) − 여유
 *   남는 몫 = 묶음의 diff + 변경 본문. 연관·규칙 문맥 본문은 래퍼가 남는 만큼만 싣는다(넘치면 역참조 → 정방향 → 문맥 순 제외)
 */
export const budgetOf = ({ contract = 0, evidence = W.evidence } = {}) => Math.max(C.minBudget, W.prompt - HEAD_BYTES - contract - Math.min(evidence + C.refMax * 3, W.evidence) - C.reserve)
/** 첫 판정 증거 추정(writeEvidence 와 같은 상한) = 보고 + 도구 기록 + 파일 목록·diff stat(2만)·생성물 */
const evidenceBytesOf = ctx => Buffer.byteLength(capMid(ctx.report || '', C.reportMax)) + Buffer.byteLength(capMid(ctx.tools || '', C.srcMax)) + 24e3
/** 재판정 고정 구획 실측 = 원장 계약 + 마지막 증거 폴더 */
const lastEvidence = d => { try { return fs.readdirSync(d).filter(f => /^evidence-\d+$/.test(f)).sort((a, b) => +b.slice(9) - +a.slice(9))[0] || null } catch { return null } }
export function sizesOf(dir) {
  const sz = f => { try { return fs.statSync(f).size } catch { return 0 } }, ev = lastEvidence(dir)
  let evidence = 0; if (ev) for (const f of fs.readdirSync(path.join(dir, ev))) evidence += sz(path.join(dir, ev, f))
  return { contract: sz(path.join(dir, 'contract.md')), evidence }
}
/** 저장소 본문 읽기(비밀 경로 = 읽지 않음) — 연관 판정·참조 발췌용 */
export const readRepo = (root = ROOT) => f => { if (isSecretPath(f)) return null; try { return fs.readFileSync(path.join(root, f), 'utf8') } catch { return null } }
const CODE_RE = /\.[cm]?[jt]sx?$/, esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 파일이 다른 모듈에서 가져다 쓰는 이름 : spec → Set(이름) — 이름 import · 구조 분해(import()·require) · 네임스페이스(import * as ns · const ns = await import(…) 의 ns.이름) */
const NAME_RES = [
  [/import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"\n]+)['"]/g, 'list'],
  [/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+import|require)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, 'list'],
  [/import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]([^'"\n]+)['"]/g, 'ns'],
  [/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+import|require)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, 'ns'],
]
function namesOf(text) {
  const m = new Map(), add = (s, n) => (m.get(s) || m.set(s, new Set()).get(s)).add(n)
  for (const [re, kind] of NAME_RES) for (const x of text.matchAll(re)) {
    if (kind === 'list') { for (const p of x[1].split(',')) { const n = p.trim().replace(/^type\s+/, '').split(/\s+as\s+|\s*:\s*/)[0].trim(); if (/^[\w$]+$/.test(n)) add(x[2], n) } }
    else for (const u of text.matchAll(new RegExp(`(?<![\\w$.])${esc(x[1])}\\.([\\w$]+)`, 'g'))) add(x[2], u[1])
  }
  return m
}
/**
 * scope 파일 사이 연관(2026-11-10 AC-1 — c4-fail-5-aeb16d-p1·p2 : 묶음이 연관 파일을 갈라 판정자가 대조 근거를 못 봄) → [{ from, to, kind, names, main }]
 *   import = 정적·동적 import·require(래퍼 importSpecs·makeResolver 와 같은 해석) / test = test/X.test.* ↔ 같은 이름 X.*(scripts·.claude/hooks 등) /
 *   doc = 코드 아닌 파일(문서)이 코드 파일 이름을 언급 — 군집에는 가장 많이 언급한 코드 하나에만 붙는다(main, 허브 문서가 군집을 모두 합치지 않게)
 */
export function linksOf(files, read) {
  const set = new Set(files), resolve = makeResolver(set, f => read(f) || ''), code = files.filter(f => CODE_RE.test(f)), out = []
  const stem = f => path.posix.basename(f).replace(/\.[^.]+$/, '')
  for (const f of code) {
    const t = read(f) || '', names = namesOf(t)
    for (const s of importSpecs(t)) { const to = resolve(f, s); if (to && to !== f && !out.some(l => l.from === f && l.to === to)) out.push({ from: f, to, kind: 'import', names: [...(names.get(s) || [])] }) }
    const m = /^(?:.*\/)?([^/]+)\.test\.[cm]?[jt]sx?$/.exec(f)
    if (m) for (const g of code) if (g !== f && stem(g) === m[1] && !out.some(l => l.from === f && l.to === g)) out.push({ from: f, to: g, kind: 'test', names: [] })
  }
  for (const d of files.filter(f => !CODE_RE.test(f))) {
    const t = read(d) || ''
    const hits = code.map(g => [g, (t.match(new RegExp(`(?<![\\w.-])${esc(path.posix.basename(g))}(?![\\w-])`, 'g')) || []).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    hits.forEach(([g], i) => out.push({ from: d, to: g, kind: 'doc', names: [], main: i === 0 }))
  }
  return out
}
/**
 * 파일 묶음(c4 회송 ② + 2026-11-10 AC-1) : 연관 군집(linksOf — import·시험 = 합침, 문서 = 가장 많이 언급한 코드 군집에) 단위로 큰 것부터 첫 맞춤(first-fit decreasing), 묶음당 예산 이하.
 *   군집 하나가 예산을 넘을 때만 그 군집을 파일 단위로 쪼갠다(혼자 넘는 파일 = 단독 묶음 — 래퍼가 가운데 생략). 묶음 안은 경로순 — 결정적
 */
export function packGroups(files, costs, budget = budgetOf(), links = []) {
  const up = new Map(files.map(f => [f, f])), top = f => { while (up.get(f) !== f) f = up.get(f); return f }
  for (const l of links) if ((l.kind !== 'doc' || l.main) && up.has(l.from) && up.has(l.to)) up.set(top(l.from), top(l.to))
  const cl = new Map(); for (const f of [...files].sort()) { const r = top(f); cl.set(r, [...(cl.get(r) || []), f]) }
  const sum = u => u.reduce((n, f) => n + costs[f], 0)
  const ffd = units => { const gs = []; for (const u of [...units].sort((a, b) => sum(b) - sum(a) || a[0].localeCompare(b[0]))) { const g = gs.find(x => x.cost + sum(u) <= budget); if (g) { g.files.push(...u); g.cost += sum(u) } else gs.push({ files: [...u], cost: sum(u) }) } return gs.map(g => g.files) }
  const units = [...cl.values()].flatMap(c => sum(c) <= budget ? [c] : ffd(c.map(f => [f])))
  return ffd(units).map(g => g.sort()).sort((a, b) => a[0].localeCompare(b[0]))
}
/** 정의 발췌 : 이름마다 최상위 선언(앞 주석 8줄까지) ~ 다음 최상위 줄 앞(60줄 상한), L = 그 파일 줄 번호 */
function defsOf(t, names, maxLines = 60) {
  const ls = t.split(/\r?\n/), out = []
  for (const n of names) {
    const re = new RegExp(`^\\s*(export\\s+)?(default\\s+)?(async\\s+)?(function\\*?|const|let|var|class)\\s+${esc(n)}(?![\\w$])`), i = ls.findIndex(l => re.test(l))
    if (i < 0) continue
    let s = i; while (s > 0 && i - s < 8 && /^\s*(\/\/|\/\*\*?|\*)/.test(ls[s - 1])) s--
    let e = i; while (e + 1 < ls.length && e - i < maxLines && !/^\S/.test(ls[e + 1])) e++
    if (e + 1 < ls.length && /^[}\])]/.test(ls[e + 1])) e++
    while (e > i && !ls[e].trim()) e--
    out.push(ls.slice(s, e + 1).map((l, k) => `L${s + k + 1}: ${l}`).join('\n'))
  }
  return out.join('\n…\n')
}
/** 사용 줄 발췌 : 낱말이 든 줄 ±k 줄(이어지지 않으면 '…') */
function linesOf(t, words, k = 2) {
  const ls = t.split(/\r?\n/), re = new RegExp(`(?<![\\w$])(${words.map(esc).join('|')})(?![\\w$])`), keep = new Set()
  ls.forEach((l, i) => { if (re.test(l)) for (let j = Math.max(0, i - k); j <= Math.min(ls.length - 1, i + k); j++) keep.add(j) })
  let prev = -1; return [...keep].sort((a, b) => a - b).map(i => { const s = `${prev >= 0 && i > prev + 1 ? '…\n' : ''}L${i + 1}: ${ls[i]}`; prev = i; return s }).join('\n')
}
/**
 * 참조 발췌(2026-11-10 AC-1) : 이 묶음 파일과 이어진 다른 묶음 파일의 관련 부분 — '참조(판정 대상 아님)' 구획(증거 related-ref.md)
 *   이 묶음이 가져다 씀 = 그 이름의 정의 / 다른 묶음이 이 묶음 것을 씀 = 쓰는 줄 ±2 / 시험·문서 = 이 묶음 파일 이름이 나오는 줄 ±2(없으면 앞뒤 발췌)
 *   비밀 경로·허용 확장자 밖 = 본문 없음, 전부 redact(래퍼가 증거를 한 번 더 가림)
 */
export function refsFor(group, links, read, extra = []) {
  const g = new Set(group), parts = new Map(), add = (f, x, why = '다른 묶음') => { if (x) parts.set(f, { why: parts.get(f)?.why || why, xs: [...(parts.get(f)?.xs || []), capMid(x, C.refBody)] }) }
  for (const l of links) {
    const inF = g.has(l.from); if (inF === g.has(l.to)) continue
    const other = inF ? l.to : l.from, mine = inF ? l.from : l.to
    if (isSecretPath(other) || !canAttachBody(other)) { add(other, '(본문 미첨부 — 비밀 경로·허용 확장자 아님)'); continue }
    const t = read(other); if (t == null) continue
    add(other, capMid(l.kind === 'import' && l.names.length ? (inF ? defsOf(t, l.names) : linesOf(t, l.names)) || t : linesOf(t, [path.posix.basename(mine)]) || t, C.refEach))
  }
  for (const [f, x, why] of extra) if (!isSecretPath(f) && canAttachBody(f)) add(f, x, why)
  if (!parts.size) return ''
  const body = [...parts].map(([f, { why, xs }]) => `=== 참조 ${f} (${why} — 판정 대상 아님) ===\n${capMid([...new Set(xs)].join('\n…\n'), C.refBody)}`).join('\n\n')
  return redact(`# 참조(판정 대상 아님) — 다른 묶음·scope 밖 연관 파일 발췌 ${parts.size}건\n이 묶음 파일과 import·시험·문서 언급으로 이어진 파일의 관련 함수 정의·사용 줄·시험 블록, 옛 묶음의 열린 결함(L = 그 파일 줄 번호). 이 파일들의 판정은 다른 묶음 몫이거나 scope 밖이다 — 여기서는 이 묶음 판정의 대조 근거로만 쓴다.\n\n${capMid(body, C.refMax)}\n`)
}
/** 최상위 선언(열 0) — 변경 함수 이름·결함 함수 찾기 */
const DECL_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/
/** 바뀐 줄을 품은 최상위 선언 이름들 */
export function changedNames(t, lines) {
  const ls = String(t || '').split(/\r?\n/), out = new Set()
  for (const n of lines) for (let i = Math.min(n, ls.length) - 1; i >= 0; i--) { const m = DECL_RE.exec(ls[i]); if (m) { out.add(m[1]); break } }
  return [...out]
}
/**
 * 시험 블록 발췌 : 열 0 의 test(·it(·describe( 부터 다음 블록 앞까지 중 이름이 호출·멤버 참조·import 형태로 나오는 블록(이름 길이 무관) — 드문 이름이 든 블록부터(이름마다 1/그 이름이 든 블록 수 합) 통째로 C.refBody 까지, 출력은 파일 순서
 *   ponytail: 단순 희소도 가중 — 바뀐 함수가 많아 블록이 넘치면 흔한 이름(상수 등) 블록이 빠진다
 */
function testBlocks(t, names) {
  // 잡음 제어 = 길이가 아니라 형태(c4-scope-missing-ab2c5d D-002 — 짧은 이름 xx·q 도 바뀐 함수면 발췌) : 단어 경계 + 호출 name( · 멤버 참조 .name · import·구조 분해 { name }
  //   ponytail: 형태 3종만 — 맨 식별자 사용([...NO_GATE] 등)은 빠짐, 필요하면 문자열 밖 식별자 판정을 더한다
  const use = n => { const e = esc(n); return new RegExp(`(?<![\\w$])${e}\\s*\\(|\\.${e}(?![\\w$])|[{,]\\s*${e}\\s*(?:as\\s+[\\w$]+\\s*)?[,}]`) }
  const ls = t.split(/\r?\n/), st = ls.flatMap((l, i) => (/^(test|it|describe)\s*\(/.test(l) ? [i] : [])), ns = names.map(n => [n, use(n)])
  const bl = st.map((s, k) => { let e = (st[k + 1] ?? ls.length) - 1; while (e > s && !ls[e].trim()) e--; const tx = ls.slice(s, e + 1).join('\n'); return { s, e, hit: ns.filter(([, re]) => re.test(tx)).map(([n]) => n) } }).filter(b => b.hit.length)
  const df = n => bl.filter(b => b.hit.includes(n)).length, score = b => b.hit.reduce((x, n) => x + 1 / df(n), 0)
  let used = 0; const keep = [...bl].sort((a, b) => score(b) - score(a) || a.s - b.s).filter(b => { const n = ls.slice(b.s, b.e + 1).join('\n').length; if (used && used + n > C.refBody) return false; used += n; return true })
  return keep.sort((a, b) => a.s - b.s).map(({ s, e }) => ls.slice(s, e + 1).map((l, j) => `L${s + j + 1}: ${l}`).join('\n')).join('\n…\n')
}
/** 결함 줄을 품은 최상위 함수 본문 전체(400줄 상한) — 줄 번호가 밀렸으면 근처 선언 */
function bodyAt(t, line) {
  const ls = t.split(/\r?\n/); let i = Math.min(Math.max(1, line), ls.length) - 1
  while (i > 0 && !DECL_RE.test(ls[i])) i--
  const m = DECL_RE.exec(ls[i] || ''); return m ? defsOf(t, [m[1]], 400) : ''
}
const TEST_EXT = ['mjs', 'js', 'ts', 'cjs', 'tsx']
/**
 * scope 밖 짝 시험(회송 [2]b) : ① scope 코드 X 의 짝 시험 test/X.test.*·같은 폴더 X.test.*(scope 밖) = X 의 바뀐 함수 이름이 나오는 시험 블록
 *   ② scope 시험 test/X.test.* 이 가져다 쓰는 scope 밖 대상(상대 import) = 가져다 쓰는 이름의 정의. changed(f) = 그 파일의 바뀐 줄 번호(새 쪽)
 */
export function testRefs(group, all, read, changed = () => []) {
  const inAll = new Set(all), out = [], P = path.posix
  for (const f of group.filter(x => CODE_RE.test(x))) {
    const t = read(f) || ''
    const tm = /^(?:.*\/)?([^/]+)\.test\.[cm]?[jt]sx?$/.exec(f)
    if (tm) {
      const names = namesOf(t), seenTo = new Set()
      for (const s of importSpecs(t)) {
        if (!s.startsWith('.')) continue
        const b = P.normalize(P.join(P.dirname(f), s)), to = [b, ...TEST_EXT.map(e => `${b}.${e}`)].find(c => !inAll.has(c) && CODE_RE.test(c) && read(c) != null), ns = [...(names.get(s) || [])]
        if (to && ns.length) { seenTo.add(to); out.push([to, defsOf(read(to), ns), 'scope 밖 시험 대상']) }
      }
      // import 없이 경로로 띄우는 시험(spawn — 예 test/codex-verify.test.mjs) = 같은 이름 대상 scripts/X.*·.claude/hooks/X.*(scope 밖) 앞뒤 발췌
      for (const c of ['scripts', '.claude/hooks'].flatMap(d => TEST_EXT.map(e => `${d}/${tm[1]}.${e}`))) if (!inAll.has(c) && !seenTo.has(c)) { const tx = read(c); if (tx != null) out.push([c, capMid(tx, C.refBody), 'scope 밖 시험 대상(같은 이름)']) }
      continue
    }
    const ns = changedNames(t, changed(f)); if (!ns.length) continue
    const stem = P.basename(f).replace(/\.[^.]+$/, '')
    for (const tf of new Set(TEST_EXT.flatMap(e => [`test/${stem}.test.${e}`, `${P.dirname(f)}/${stem}.test.${e}`]))) {
      if (inAll.has(tf)) continue
      const tt = read(tf); if (tt != null) out.push([tf, testBlocks(tt, ns), `scope 밖 짝 시험 — ${f} 의 바뀐 함수 ${ns.slice(0, 8).join('·')}`])
    }
  }
  return out.filter(x => x[1])
}
/** 바뀐 줄 번호(새 쪽) — git diff -U0 hunk 머리. 미추적·오류 = [] */
export const changedLinesOf = (ref, root = ROOT) => f => {
  const out = []; for (const m of (git(['diff', '-U0', ref, '--', `:(literal)${f}`], root).stdout || '').matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) { const a = +m[1], n = m[2] == null ? 1 : +m[2]; for (let i = 0; i < Math.max(1, n); i++) out.push(a + i) }
  return out
}
/**
 * 판정 작업 목록 : planFor 의 c4 원장 scope = files(하네스 + 산출, 정렬). 묶음 예산(budgetOf)을 넘을 때만 원장을 연관 군집 단위 파일 묶음으로 나눈다
 *   → id '<원장>-p1'…'-pN'(묶음 AND — 전부 PASS 일 때만 Y, 생성기 mergeParts 와 같은 규칙), 묶음마다 다른 묶음 연관 파일 발췌 related
 */
export function jobsFor(plan, files, cost, { budget = budgetOf(), read = readRepo(), changed = () => [] } = {}) {
  return plan.flatMap(p => {
    if (!files.length) return [{ ...p, files: [] }]
    const links = linksOf(files, read), gs = packGroups(files, Object.fromEntries(files.map(f => [f, cost(f)])), budget, links), ref = g => refsFor(g, links, read, testRefs(g, files, read, changed))
    return gs.length <= 1 ? [{ ...p, files: gs[0], related: ref(gs[0]) }] : gs.map((g, i) => ({ ...p, id: `${p.id}-p${i + 1}`, base: p.id, part: [i + 1, gs.length], files: g, related: ref(g) }))
  })
}
/**
 * 판정 diff 기준 : scope 파일 중 하나라도 시작 스냅샷 대비 변경 0건인데 HEAD 대비 변경이 있으면 HEAD(재개 때 스냅샷이 다시 찍힌 옛 기록 구제 — 2026-11-10 c4-fail-5-aeb16d iter-3 빈 diff BLOCKED)
 *   전부가 아니라 하나라도 : 다시 찍힌 뒤 다른 실행이 일부 파일을 또 고치면 그 파일만 diff 에 남아 나머지 산출이 안 보인다(실측 — 이 원장의 codex-gate.mjs)
 */
export function diffRefOf(baseRef, files, root = ROOT) {
  if (!baseRef || !files.length) return baseRef || 'HEAD'
  const names = r => new Set(git(['diff', '--name-only', r, '--', ...files.map(f => `:(literal)${f}`)], root).stdout.split(/\r?\n/).filter(Boolean)), b = names(baseRef)
  return [...names('HEAD')].some(f => !b.has(f)) ? 'HEAD' : baseRef
}
const baseLine = (ref, baseRef) => `- 기준선 : ${!baseRef ? '기준선 없음 (SubagentStart 스냅샷 없음 — HEAD 기준, 같은 시간 다른 세션 변경이 섞일 수 있음)' : ref === baseRef ? `${baseRef} (SubagentStart 스냅샷 — 이 에이전트 시작 뒤 변경만)` : `HEAD — 시작 스냅샷 ${baseRef} 대비 scope 변경 0건(재개 때 다시 찍힌 스냅샷 — 2026-11-10 c4-fail-5-aeb16d), HEAD 기준이라 같은 시간 다른 세션 변경이 섞일 수 있음`}`
const scopeLine = (n, part, related) => `- scope = 이 원장 파일 ${n}건${part ? ` · 묶음 ${part[0]}/${part[1]} — 이 원장은 모든 묶음 PASS 일 때만 Y(AND), 이 묶음 밖 파일은 판정하지 않는다(unverifiable 아님)` : ''}${related ? ' · 다른 묶음 연관 파일 발췌 = 증거 related-ref.md(참조 — 판정 대상 아님, 이 묶음 판정의 대조 근거로만)' : ''}`
/** 자동 계약(contract.md, c4 전용) — 마스터 요청 원문 + 브리프 원문 + 검수 대상 + 기본 AC(하네스 파일 있으면 AC-4) + 기준선·묶음·생성물 표기 */
/** 하네스 파일 중 .md 아닌 것(코드·설정)이 있나 — checks.md(훅이 돌린 node --check) 생성 조건 */
const harnessCode = files => files.some(f => HARNESS_RE.test(f) && !/\.md$/i.test(f))
/** AC-4 줄(하네스 파일 1건 이상이면 항상) — 첫 계약·재분할 계약 공용. 2026-11-12 : 검사 근거 첨부 요구(checks.md·selftest 보고 원문) 문구 삭제 — 근거 누락은 참고 지적 */
const ac4Of = files => { const hz = files.filter(f => HARNESS_RE.test(f)); return hz.length ? [`- AC-4 : 하네스 파일 변경 ${hz.length}건(${hz.join(', ')}) — 규칙 정합 / 우회·회귀 없음`] : [] }
/**
 * 자동 검사 증거(2026-11-11c — 하네스 원장 BLOCKED 60건 중 26건 '증거·본문 누락') : scope 에 .md 아닌 하네스 파일이 1건 이상이면 훅이 직접 실행
 *   scope 안 .mjs·.js·.cjs(있는 파일) 마다 node --check ./<상대경로> → 명령·종료 코드·출력 끝 2줄(비밀 가림)
 *   총 상한 end(기본 C.checkMs) — 넘으면 '시간 초과' 적고 판정은 계속. 자식 env CODEX_GATE_ACTIVE=1. .md 아닌 하네스 파일이 없는 묶음 = '' (checks.md 안 만듦·지움)
 *   ponytail: 미검토 코드 자동 실행 금지(11d 보안 검토 S-1 — scope = 방금 서브에이전트가 쓴 코드, 종전 훅 --selftest 자동 실행 제거). node --check = 파싱만,
 *     selftest·node --test 는 build 가 실행하고 보고 원문에 적는다. './' = 파일 이름이 '-' 로 시작해도 node 옵션으로 읽히지 않게
 */
export function checksOf(files, root = ROOT, end = Date.now() + C.checkMs) {
  if (!harnessCode(files)) return ''   // .md 뿐인 묶음 = 실행할 검사 없음(c4-build-a73e25 D-001 — 재분할 때 옛 checks.md 정리)
  const cmds = files.filter(f => /\.(mjs|js|cjs)$/.test(f) && fs.existsSync(path.join(root, f))).map(f => ['--check', `./${f}`])
  const lim = `총 상한 ${Math.round((end - Date.now()) / 1000)}초`
  const out = cmds.map(a => {
    const left = end - Date.now(), cmd = `$ node ${a.join(' ')}`
    if (left <= 0) return `${cmd}\n종료 코드 : 시간 초과(실행 안 함 — ${lim})`
    const r = spawnSync(process.execPath, a, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: left, env: { ...process.env, [C.envFlag]: '1' } })
    const code = r.error?.code === 'ETIMEDOUT' ? `시간 초과(${lim})` : r.status ?? (r.error ? `실행 오류 ${r.error.code || r.error.message}` : `신호 ${r.signal}`)
    const tail = redact((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(l => l.trim() && !/^\s+at |^Node\.js v\d/.test(l)).slice(-2).map(l => l.slice(0, 300))   // 스택·버전 줄 빼고 끝 2줄(오류 줄이 남게)
    return `${cmd}\n종료 코드 : ${code}\n끝줄 : ${tail.join(' ⏎ ') || '(출력 없음)'}`
  })
  return `## 자동 검사(codex-gate 훅 실행 — node --check 만(파싱, 코드 실행 안 함) · ${lim}, env ${C.envFlag}=1 · selftest·node --test 는 build 보고 원문)\n\n${out.join('\n\n') || '(검사 대상 없음 — scope 에 .mjs·.js·.cjs 없음)'}\n`
}
export function contractOf({ id, brief, request, type, agentId, files = [], part, generated = [], baseRef, diffRef = baseRef, own = null, excluded = 0, shell = false, related = '' }) {
  return [`# 자동 계약 — ${id} (codex-gate 훅, ${new Date().toISOString()})`, '',
    `- 판정 대상 : ${type} (${agentId}) 의 최종 결과`, `- 검수 대상 : ${TARGET}`,
    baseLine(diffRef, baseRef), scopeLine(files.length, part, related),
    ...(own ? [`- scope 귀속 : 이 에이전트 Write·Edit 기록 ${files.filter(f => own.includes(f)).length}건(gitignore 무관 — 무시 대상 본문은 evidence written-files.md) · Bash·PowerShell 변경 보조 ${files.filter(f => !own.includes(f)).length}건${shell ? '(시작 뒤 수정 시각 + 명령에 경로·디렉터리, 또는 인라인 인터프리터 실행 중 수정)' : '(셸 미사용 = 없음)'} · 병렬 에이전트 귀속 제외 ${excluded}건(같은 시간 다른 실행이 Write·Edit 또는 셸 쓰는 형태로 쓴 경로 — 이 에이전트 명령이 읽기·실행·글롭·디렉터리로만 걸친 것) · 기준선 이전 미커밋 변경 = 제외`] : []),
    ...(generated.length ? [`- 생성물 ${generated.length}건은 scope 제외 — 생성기 실행 증거(evidence generated.txt)로만 본다`] : []), '',
    '## 완료 기준',
    '- AC-1 : 브리프(+추가 지시)가 요구한 기능 중 이 scope 에 해당하는 것이 scope 파일에 구현됐다',
    `- AC-2 : ${TARGET}`, '- AC-3 : scope 파일이 브리프의 쓰기 범위 안이고 비밀값이 없다',
    ...ac4Of(files),
    ...JUDGE_SCOPE,
    '- 브리프가 마스터 원문과 어긋나면 마스터 원문 기준으로 판정하고, 그 차이는 notes 에만 적는다(브리프 결함은 이 원장의 결함으로 세지 않는다 — 회송처가 메인)',
    '', '## 마스터 요청 원문', '', ...fenced(capMid(request || '(요청 원문 없음)', C.briefMax)),
    '', '## 브리프(첫 프롬프트 + 추가 지시)', '', ...fenced(capMid(brief || '(브리프 없음)', C.briefMax)), ''].join('\n')   // 앞뒤 보존(c3-build-ab3cb5 D-001 — 앞만 자르면 뒤쪽 추가 지시가 빠짐)
}
/** 판정 범위(2026-11-12 — 1회차 FAIL 73% 중 절차·형식 지적이 절반) : N = 실제 결함만, 형식 항목 = 참고 지적(Y 유지, notes '참고 :' 줄) — 래퍼 판정 규칙 8 과 같은 뜻 */
export const JUDGE_SCOPE = [
  '- N(FAIL) 대상 = 실제 결함만 : 로직·동작 오류 / 보안 취약·비밀값 노출 / 회귀 / 데이터 손실 / 브리프 쓰기 범위 밖 파일 변경 / 브리프가 요구한 기능 미구현',
  "- 참고 지적(Y 유지 — defects·unmet 으로 올리지 않고 notes 에 '참고 : ' 로 시작하는 줄로만) : 최종 보고의 누락·표현 / 계약·브리프 문구 불일치 / 증거 서식·node --check·selftest 근거 첨부 누락 / 문서 간 표기 정합",
]
/** 인용 울타리 = 본문의 가장 긴 ` 연속보다 1개 길게(최소 3) — 브리프 안 ``` 가 울타리를 일찍 닫아 뒤쪽 '- AC-n :' 인용이 기준 정의로 읽히던 문제(c4-build-a19b07 iter-2 형제) */
const fenced = s => { const f = '`'.repeat(Math.max(3, ...[...String(s).matchAll(/`+/g)].map(m => m[0].length + 1))); return [`${f}text`, s, f] }

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
 *   증거(래퍼 maxEvidenceBytes 200KB 안) = 최종 보고 + 파일 목록 + diff stat + 생성물 목록 — 파일별 diff·hunk 는 래퍼 diff 구획이 scope 한정으로 싣는다
 */
export async function judgeOne(job, ctx, deadline) {
  const dir = path.join(C.loops, job.id), hash = ctx.keep ? null : judgeHash(job, ctx, ctx.root), same = hash && passedSame(dir, hash)
  if (same) return { ...job, iter: same, code: 0, verdict: 'PASS', reason: '변경 없음 — 이전 PASS 유지' }   // 2026-11-11 P6 : 새 회차·증거·Codex 호출 없음(묶음 원장 = 이 PASS 가 AND 에 들어감)
  const iter = (fs.mkdirSync(dir, { recursive: true }), nextIter(path.join(dir, 'ledger.json')))
  const ev = path.join(dir, `evidence-${iter}`), ref = diffRefOf(ctx.baseRef, job.files)
  if (ctx.keep) keepEvidence(job, ctx, dir, ev, ref)   // 재판정 : 첫 판정 때 만든 계약·증거 유지(묶음으로 새로 나뉜 원장은 기준 원장 것을 복사해 scope 만 고침)
  else { fs.mkdirSync(ev, { recursive: true }); writeEvidence(job, ctx, dir, ev, ref) }
  putChecks(job, ctx, ev)   // c4-build-a73e25 D-001 : 첫 판정·재판정(재분할) 공통 — 이번 묶음 파일로 다시 만들거나, .md 아닌 하네스 파일이 없는 묶음이면 복사된 옛 checks.md 를 지움
  fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ agentType: ctx.type, agentId: ctx.agentId, rulesVer: C.rulesVer, no: job.no, files: job.files, part: job.part || null, base: job.base || null, baseRef: ctx.baseRef || null, requestAt: ctx.requestAt ?? null, generated: ctx.generated || [] }))
  const res = await judgeRun(job, dir, ev, ref, iter, deadline)
  // c4-build-a8915f D-001 : 통과 근거(passHash) = 원장에 실제 기록된 이번 회차 PASS 와 결합해 판정 뒤에만 쓴다 — 판정 전에 쓰면 판정·BLOCKED 기록이 모두 실패한 내용이 이전 PASS 로 재사용됨
  if (hash && res.code === 0) try { const it = (JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')).iters || []).at(-1), gf = path.join(dir, 'gate.json'); if (it?.verdict === 'PASS' && it.iter === iter) fs.writeFileSync(gf, JSON.stringify({ ...JSON.parse(fs.readFileSync(gf, 'utf8')), passHash: { hash, iter } })) } catch { /* 기록 실패 = 다음에 다시 판정(보수적) */ }
  return res
}
/**
 * 판정 내용 해시(2026-11-11 P6 — 같은 내용을 다시 판정하지 않음) = sha1(rulesVer + 계약의 완료 기준·마스터 요청 원문·브리프 + scope 파일 경로·내용)
 *   계약 머리(작성 시각·기준선·scope 줄)는 빼고, 없는 파일은 '(없음)'. 재판정(ctx.keep — BLOCKED 원장) 은 계산하지 않음
 */
export function judgeHash(job, ctx, root = ROOT) {
  const ct = contractOf({ ...ctx, ...job, files: job.files }), h = crypto.createHash('sha1').update(`${C.rulesVer}\0${ct.slice(ct.indexOf('\n## 완료 기준'))}`)
  for (const f of [...job.files].sort()) { h.update(`\0${f}\0`); try { h.update(fs.readFileSync(path.join(root, f))) } catch { h.update('\0(없음)') } }
  return h.digest('hex')
}
/** 재사용 조건 셋 다 : 원장 마지막 기록이 PASS 판정(뒤에 BLOCKED 없음) · gate.json passHash.iter = 그 PASS 회차 · passHash.hash = 지금 해시 → 그 회차, 아니면 null(FAIL·BLOCKED·해시 다름·회차 다름·기록 없음 = 다시 판정) */
export function passedSame(dir, hash) {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')), g = JSON.parse(fs.readFileSync(path.join(dir, 'gate.json'), 'utf8'))
    const it = (l.iters || []).at(-1), b = (l.blocked || []).at(-1)
    return it?.verdict === 'PASS' && g.passHash?.iter === it.iter && g.passHash.hash === hash && !(b && Date.parse(b.at) >= Date.parse(it.at)) ? it.iter : null
  } catch { return null }
}
/**
 * 생성기 재실행(생성물 증거) : 실제 종료 코드·출력 끝 + files 지정 시 재실행 전후 생성물 내용 변화(0건 = 에이전트 산출물 = 생성기 산출 그대로)
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
/** 첫 판정 계약·증거 쓰기 — 글 상한 넘으면 capMid(앞뒤 보존), 증거 = 보고·파일 목록·gitignore 본문·도구 기록·diff stat·생성물(생성기 실제 실행) */
function writeEvidence(job, ctx, dir, ev, ref) {
  const put = (name, text) => fs.writeFileSync(path.join(ev, name), text)
  fs.writeFileSync(path.join(dir, 'contract.md'), contractOf({ ...ctx, ...job, files: job.files, diffRef: ref }))
  if (job.related) put('related-ref.md', job.related)   // 2026-11-10 AC-1 : 다른 묶음 연관 파일 발췌(참조 — 판정 대상 아님)
  put('report.md', capMid(ctx.report || '(최종 보고 없음)', C.reportMax))
  put('changed-files.txt', job.files.join('\n') + '\n')
  // 결함 8-1 : 이 에이전트가 직접 쓴 파일 중 git 이 보지 않는 것(gitignore — 래퍼 diff·미추적 목록에 안 잡힘) = 현재 본문 첨부(fileExcerpt — 허용 확장자·비밀 경로 제외·redact)
  const ign = new Set(job.files.length ? git(['check-ignore', '--', ...job.files]).stdout.split(/\r?\n/).filter(Boolean).map(f => f.replace(/\\/g, '/')) : [])
  const body = job.files.filter(f => ign.has(f) && (ctx.own || []).includes(f))
  if (body.length) put('written-files.md', body.map(f => `=== FILE ${f} (gitignore 대상 — 이 에이전트 Write·Edit 기록, 현재 본문) ===\n${fileExcerpt(f, C.srcMax)}`).join('\n\n') + '\n')
  put('tools.md', `## 이 에이전트 도구 사용 기록(시각순 — Bash·PowerShell = 명령 + 출력 앞 2줄·끝 8줄, 비밀 가림 / 파일 도구 = 경로만)\n${capMid(ctx.tools || '(도구 사용 없음)', C.srcMax)}\n`)   // c2-collect-ac25ad AC-2 : 근거 명령·출력
  if (job.files.length) put('diffstat.txt', git(['diff', '--stat', ref, '--', ...job.files.map(f => `:(literal)${f}`)]).stdout.slice(0, 20000))
  const runs = ctx.genRuns || []
  if (ctx.generated?.length) put('generated.txt', `생성물 목록(scope 제외 — 생성기 실행 증거로만 판정)\n${ctx.generated.join('\n')}\n\n## 생성기 실제 실행(codex-gate 훅 재실행)\n${runs.length ? runs.map(genText).join('\n') : '(재실행 없음 — request-graph 생성물이 아님)\n'}`)
}
/**
 * 재판정 증거 : 첫 판정 때 만든 계약·증거(보고·도구 기록 등)를 쓴다 — 이 원장에 없으면(묶음으로 새로 나뉨) 출처 원장(src → 기준 원장)의 계약·마지막 증거를 복사.
 *   묶음이 다시 나뉠 수 있어(2026-11-10 scope-missing 재분할) 계약의 제목·기준선·scope 줄과 파일 목록·diff stat·참조 발췌는 매번 이번 작업 기준으로 고친다
 */
/**
 * 재분할 계약 고침 : 제목·기준선·scope 줄 + 하네스 목록·AC-4 를 이번 작업 파일(job.files)로 다시 셈(2026-11-10 c4-scope-missing-ab2c5d D-001 —
 *   하네스가 새로 들어온 묶음에 AC-4 가 없거나, 빠진 묶음에 옛 목록이 남던 문제). AC-4 는 옛 줄을 지우고 contractOf 와 같은 자리(AC-3 바로 뒤)에 다시 넣는다
 */
export const refreshContract = (c, job, ref, baseRef) => {
  const k = c.indexOf('\n## 마스터 요청 원문'), head = k < 0 ? c : c.slice(0, k)   // 머리(정의)만 고침 — 인용 구획(원문·브리프)의 같은 모양 줄('- AC-4 :' 등)은 그대로(c4-build-a19b07 iter-2 형제)
  return head.replace(/^# 자동 계약 — \S+/m, `# 자동 계약 — ${job.id}`).replace(/^- 기준선 : .*$/m, baseLine(ref, baseRef)).replace(/^- scope = .*$/m, scopeLine(job.files.length, job.part, job.related))
    .replace(/^- AC-4 : .*\n/m, '').replace(/^(- AC-3 : .*)$/m, m => [m, ...ac4Of(job.files)].join('\n')) + (k < 0 ? '' : c.slice(k))
}
/** 자동 검사 증거 쓰기(11c) — checksOf(job.files) 결과로 checks.md 덮어쓰기, 빈 글 = 지움. 총 상한 = ctx.chk.end 하나(gate 가 첫 판정·재판정 ctx 에 같은 객체를 넘김 — 첫 검사 때 시작) */
export function putChecks(job, ctx, ev) {
  const chk = ctx.chk ??= {}, out = checksOf(job.files, ctx.root || ROOT, chk.end ??= Date.now() + C.checkMs), f = path.join(ev, 'checks.md')
  if (out) fs.writeFileSync(f, out); else fs.rmSync(f, { force: true })
}
function keepEvidence(job, ctx, dir, ev, ref) {
  const own = fs.existsSync(path.join(dir, 'contract.md')), from = own ? dir : path.join(C.loops, job.src || job.base || job.id)
  if (!fs.existsSync(ev)) { const last = lastEvidence(from); fs.mkdirSync(ev, { recursive: true }); if (last && path.join(from, last) !== ev) for (const f of fs.readdirSync(path.join(from, last))) fs.copyFileSync(path.join(from, last, f), path.join(ev, f)) }
  let c = ''; try { c = fs.readFileSync(path.join(from, 'contract.md'), 'utf8') } catch { c = contractOf({ ...ctx, ...job, files: job.files, diffRef: ref }) }
  const kept = job.related === undefined && fs.existsSync(path.join(ev, 'related-ref.md'))   // 참조 계산 안 됨 + 기존 파일 = 유지(계약 scope 줄 표기도 유지)
  fs.writeFileSync(path.join(dir, 'contract.md'), refreshContract(c, kept ? { ...job, related: '(기존 참조 유지)' } : job, ref, ctx.baseRef))
  fs.writeFileSync(path.join(ev, 'changed-files.txt'), job.files.join('\n') + '\n'); if (job.files.length) fs.writeFileSync(path.join(ev, 'diffstat.txt'), git(['diff', '--stat', ref, '--', ...job.files.map(f => `:(literal)${f}`)]).stdout.slice(0, 20000))
  // 참조 = 이번 작업이 계산한 값(빈 글 = 참조 없음 → 지움), 계산 안 됨(undefined) = 기존 파일 유지(D-003 형제 — 계산 안 한 경로가 참조를 지우지 않게)
  if (job.related) fs.writeFileSync(path.join(ev, 'related-ref.md'), job.related); else if (job.related === '') fs.rmSync(path.join(ev, 'related-ref.md'), { force: true })
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
 * BLOCKED 자동 재판정 대상(c4 회송 ③) : c4 원장(NO_GATE 에이전트 원장 제외) 중 같은 요청(요청 시각 이후 시작한 원장 — 또는 이번 요청·브리프 글 named 에 원장 id·기준 원장 id 가 나오는 원장) 안에서
 *   마지막 기록이 BLOCKED 이고, 사유가 재시도 가능(C.retry — scope-too-broad·judge-unavailable·lock·scope-missing)인 원장
 *   judge-unavailable 은 마지막 BLOCKED 뒤 C.cooldownMs 쿨다운, scope-missing 은 같은 회차 BLOCKED C.retryMax 건까지, 묶음으로 대체된 기준 원장(split.json)·이번에 판정한 원장·작업 기록(gate.json) 없는 원장 제외. BLOCKED 는 회차 미소모 = 같은 회차 재실행
 */
export function retryTargets({ since, now = Date.now(), skip = new Set(), loops = C.loops, named = '' } = {}) {
  let ids = []; try { ids = fs.readdirSync(loops) } catch { return [] }
  return ids.flatMap(id => {
    if (skip.has(id)) return []
    const dir = path.join(loops, id); let l, g
    try { l = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')); g = JSON.parse(fs.readFileSync(path.join(dir, 'gate.json'), 'utf8')) } catch { return [] }
    if (g.no !== 4 || NO_GATE.has(g.agentType)) return []   // 2026-11-10 개정 : 전환 전 c1·c2·c3·c5·c6·decide·review 원장은 재판정하지 않음
    if (fs.existsSync(path.join(dir, 'split.json')) || fs.existsSync(path.join(dir, 'superseded.json'))) return []
    if (since != null && Date.parse(l.startedAt) < since && !(named.includes(id) || (g.base && named.includes(g.base)))) return []
    const lastB = (l.blocked || []).at(-1), lastI = (l.iters || []).at(-1)
    if (!lastB || (lastI && Date.parse(lastI.at) >= Date.parse(lastB.at))) return []
    const reasons = String(lastB.reason || '').split(',')
    if (!reasons.every(r => C.retry.includes(r))) return []
    if (reasons.includes('judge-unavailable') && now - Date.parse(lastB.at) < C.cooldownMs) return []
    // scope-missing 재시도 상한 = 같은 회차 BLOCKED C.retryMax 건 — 단 분할·참조 규칙 버전(gate.json rulesVer)이 지금과 다르면 1회 더(회송 [2]c : 증거 규칙이 바뀐 뒤 판정, 그 판정이 rulesVer 를 새로 남겨 다음부터 상한 적용)
    if (reasons.includes('scope-missing') && g.rulesVer === C.rulesVer && (l.blocked || []).filter(b => b.iter === lastB.iter).length >= C.retryMax) return []
    return [{ id, no: g.no, files: g.files || [], part: g.part || null, base: g.base || null, reason: lastB.reason, gate: g }]
  })
}

/**
 * 판정기 미가용 쿨다운 중인 원장 : 마지막 기록이 judge-unavailable BLOCKED(뒤에 판정 없음)이고 C.cooldownMs 안 → 그 BLOCKED 기록, 아니면 null.
 *   본 판정 경로도 이 동안 판정·새 BLOCKED 기록을 하지 않는다(2026-11-12 결함 : 끝난 팀원이 메시지로 깨어날 때마다 SubagentStop 이 다시 판정해
 *   codex 미로그인 BLOCKED 가 몇 분 만에 6건 쌓여 루프 상한을 소모)
 */
export function cooling(id, now = Date.now(), loops = C.loops) {
  let l; try { l = JSON.parse(fs.readFileSync(path.join(loops, id, 'ledger.json'), 'utf8')) } catch { return null }
  const lastB = (l.blocked || []).at(-1), lastI = (l.iters || []).at(-1)
  if (!lastB || (lastI && Date.parse(lastI.at) >= Date.parse(lastB.at))) return null
  return String(lastB.reason || '').split(',').includes('judge-unavailable') && now - Date.parse(lastB.at) < C.cooldownMs ? lastB : null
}

/**
 * 재판정 작업 : ① scope-too-broad 로 막힌 단일 원장 = 파일 묶음으로 다시 나눔(1묶음이면 같은 결과라 건너뜀)
 *   ② scope-missing 으로 막힌 묶음 원장(-pN) = 기준 원장의 모든 묶음 파일을 연관 군집 규칙으로 다시 묶음(2026-11-10 AC-3) — 1묶음이면 기준 원장 하나로 판정(split.json → split.superseded.json),
 *      새 묶음에 없는 옛 묶음 = superseded.json. 계약·증거는 출처 원장(src)에서 복사, 묶음마다 참조 발췌 related
 *   ③ 그 밖(scope-missing 단일 원장 포함) = 같은 원장 같은 회차
 */
/** 원장 마지막 판정 결과(결함은 면제 제외) */
function lastResult(dir) {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')), it = (l.iters || []).at(-1); if (!it) return null
    const out = it.out && fs.existsSync(it.out) ? it.out : path.join(dir, `iter-${it.iter}.codex.json`), r = JSON.parse(fs.readFileSync(out, 'utf8'))
    return { ...r, defects: (r.defects || []).filter(d => !(l.waived || {})[d.id]) }
  } catch { return null }
}
/** 원장 마지막 판정의 열린 결함(open·regressed·contested, 면제 제외, 파일 있는 것) */
export const liveDefects = dir => (lastResult(dir)?.defects || []).filter(d => ['open', 'regressed', 'contested'].includes(d.status) && d.file)
/** 이의 인정 표식 구절(2026-11-11 c4-build-ad8596 D-001 회송 확정) — notes·기준 evidence 의 한 문장에 결함 id 와 함께 나오면 표식 */
export const ACK_PHRASES = ['결함이 아니', '수정할 필요가 없', '이의를 인정', '이의 인정', 'not a defect']
/** 반복 지적 승격 대상(2026-11-11 마스터 선택) = seenCount 2 이상 + (contested 또는 이의 인정 표식) — 회송 대신 팀장 면제 판단으로 안내만(판정·상한·면제 기록은 그대로) */
export function promotedDefects(dir) {
  const r = lastResult(dir); if (!r) return []
  const sents = [r.notes, ...(r.criteria || []).map(c => c.evidence)].flatMap(t => String(t || '').split(/\. |。|\n|·/))
  // 결함 id = 문장에서 뽑은 id 와 일치 비교(c4-build-ad8596 D-002 — 부분 문자열이면 'D-0040' 이 D-004 표식으로 잡힘)
  const acked = id => sents.some(s => new Set(s.match(/\b[A-Z]+-\d+\b/g) || []).has(id) && ACK_PHRASES.some(p => s.toLowerCase().includes(p)))
  return r.defects.filter(d => d.seenCount >= 2 && (d.status === 'contested' || acked(d.id)))
}
export function resplit(targets, costFor, loops = C.loops, { read = readRepo(), budgetFor = () => budgetOf(), changed = () => () => [], dry = false } = {}) {
  const seen = new Set(), now = () => new Date().toISOString()
  // 형제 묶음 원장 id·파일 전부(대체된 묶음 제외) — 단일 원장 = 자기 파일
  const sibs = t => {
    if (!t.part) return { old: [], files: t.files }
    const base = t.base || t.id; let old
    try { old = JSON.parse(fs.readFileSync(path.join(loops, base, 'split.json'), 'utf8')).parts || [] } catch { old = [t.id] }
    old = old.filter(p => !fs.existsSync(path.join(loops, p, 'superseded.json')))
    return { old, files: [...new Set(old.flatMap(p => { try { return JSON.parse(fs.readFileSync(path.join(loops, p, 'gate.json'), 'utf8')).files || [] } catch { return p === t.id ? t.files : [] } }))].sort() }
  }
  return targets.flatMap(t => {
    const missing = String(t.reason).includes('scope-missing'), broad = String(t.reason).includes('scope-too-broad')
    // 같은 원장 재시도(단일 scope-missing·lock·judge-unavailable, 묶음 원장의 scope-missing 밖 사유) = 참조를 지금 파일·바뀐 함수로 다시 만든다
    //   (c4-scope-missing-ab2c5d D-003 — related 없이 넘기면 keepEvidence 가 기존 related-ref.md 를 지우고 새 발췌 규칙도 못 받음)
    if (t.part ? !missing : !broad) { const all = sibs(t).files; return [{ ...t, related: refsFor(t.files, linksOf(all, read), read, testRefs(t.files, all, read, changed({ ...t, files: all }))) }] }
    const base = t.base || t.id; if (seen.has(base)) return []; seen.add(base)
    const { old, files } = sibs(t)
    const cost = costFor({ ...t, files }), links = linksOf(files, read), gs = packGroups(files, Object.fromEntries(files.map(f => [f, cost(f)])), budgetFor(t), links)
    if (!t.part && gs.length <= 1) return []
    // 회송 [2]a : 이전 회차 열린 결함 파일이 든 묶음 = 그 결함이 나온 묶음 번호(래퍼가 그 원장의 직전 결함을 싣는다 — 다른 번호로 가면 결함 파일이 scope 밖이 됨)
    const n = gs.length, num = new Array(n).fill(0), used = new Set(), defs = old.map(p => [p, liveDefects(path.join(loops, p))])
    for (const [p, ds] of defs) { const k = +p.slice(base.length + 2), gi = gs.findIndex((g, i) => !num[i] && ds.some(d => g.includes(d.file))); if (n > 1 && ds.length && k >= 1 && k <= n && !used.has(k) && gi >= 0) { num[gi] = k; used.add(k) } }
    for (let i = 0, k = 1; i < n; i++) if (!num[i]) { while (used.has(k)) k++; num[i] = k; used.add(k) }
    const ch = changed({ ...t, files }), extra = gs.map(g => testRefs(g, files, read, ch))
    const idOf = i => (n <= 1 ? base : `${base}-p${num[i]}`)
    // 결함이 나온 묶음 번호를 못 받은 결함(두 묶음 결함이 한 묶음으로 모임·1묶음) = 이어받은 묶음(없으면 결함 파일이 든 묶음)에 결함 목록 + 결함 파일이 그 묶음 밖이면 결함 함수 본문 전체
    for (const [p, ds] of defs) for (const d of ds) {
      const own = gs.findIndex((_, i) => idOf(i) === p), gi = own >= 0 ? own : Math.max(0, gs.findIndex(g => g.includes(d.file)))
      if (own >= 0 && gs[own].includes(d.file)) continue
      const tx = read(d.file), body = !gs[gi].includes(d.file) && tx != null ? `\n${bodyAt(tx, d.line || 1)}` : ''
      extra[gi].push([d.file, `옛 묶음 ${p} 열린 결함 ${d.id} (${d.file}:${d.line ?? '-'}) ${d.summary || ''}${body}`, '옛 묶음 열린 결함'])
    }
    const jobs = gs.map((g, i) => ({ ...t, id: idOf(i), base: n <= 1 ? null : base, part: n <= 1 ? null : [num[i], n], files: g, src: t.id, related: refsFor(g, links, read, extra[i]) })).sort((a, b) => a.id.localeCompare(b.id))
    if (dry) return jobs   // 미리보기(읽기 전용) — 원장 표식 안 씀
    const ids = new Set(jobs.map(j => j.id)), sp = path.join(loops, base, 'split.json')
    for (const p of old) if (!ids.has(p)) fs.writeFileSync(path.join(loops, p, 'superseded.json'), JSON.stringify({ at: now(), reason: 'scope-missing 재분할 — 연관 군집 묶음 규칙(2026-11-10 AC-3)', by: [...ids] }))
    fs.mkdirSync(path.join(loops, base), { recursive: true })
    if (gs.length <= 1) { if (fs.existsSync(sp)) fs.renameSync(sp, path.join(loops, base, 'split.superseded.json')) }
    else fs.writeFileSync(sp, JSON.stringify({ at: now(), parts: [...ids] }))
    return jobs
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
  if (!type || type === C.legacy || NO_GATE.has(type) || !tp || !fs.existsSync(tp)) return null   // 비대상 = 기록·git 조회 전에 끝냄
  let desc = ''; try { desc = JSON.parse(fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8')).description || '' } catch { /* meta 없음 */ }
  const recs = readJsonl(tp)
  // c2-collect-ac25ad D-001 : 같은 시간 같은 세션의 다른 서브에이전트·메인이 Write·Edit 한 파일은 이 에이전트도 쓰지 않았으면 scope 에서 뺀다(읽기 전용 수집에 남의 신규 파일이 섞인 사고)
  //   결함 8 : 1차 = 자기 Write·Edit 기록, Bash·PowerShell 을 쓴 에이전트만 2차(기준선 diff ∩ 시작 뒤 수정) — 병렬 귀속 제외 건수는 계약에 (request-graph 와 같은 함수 attributeOf)
  const { a, baseRef, shell, changed, sc, files } = attributeOf({ recs, tp, mainTp: input.transcript_path, agentId, root })
  try { saveAttrib(agentId, { files }) } catch { /* 기록 실패 = 그래프가 추정으로 대체 — 판정은 계속 */ }
  const plan = planFor({ type, agentId, desc, changed: files })
  if (!plan.length) return null   // 비대상(NO_GATE)·파일 변경 0건 = 판정 없음
  const req = input.transcript_path && fs.existsSync(input.transcript_path) ? requestOf(tailJsonl(input.transcript_path), a.t0, a.tSay ?? a.t1, Date.now(), a.brief) : null   // 범위 끝 = 마지막 전달 지시(D-003), 시작 = 브리프가 인용한 마스터 메시지(결함 8-4)
  // 최종 응답 = 지시 구간별 최종 응답 전부(시각순), 훅 입력 last_assistant_message 가 기록 끝과 다르면(기록 미반영) 마지막 구간 응답을 그것으로
  const lam = String(input.last_assistant_message || '').trim(), report = lam && a.finals.at(-1)?.trim() !== lam ? (a.report ? a.report.slice(0, a.report.length - (a.finals.at(-1) || '').length) : '') + lam : a.report
  // 생성기 재실행(생성물 증거) : 설계도판 생성물 있음 = --design-only --md(전후 내용 비교), 요청 md 생성물 = --md(실데이터판)
  const design = sc.generated.filter(f => /^\.claude\/engineering\/50\. graph\/(myRequestGraph\.html$|request-flow\/)/.test(f)), genRuns = []
  if (design.length) genRuns.push(runGenerator(['--design-only', '--md'], design, root))
  if (sc.generated.some(f => f.includes('/requests/'))) genRuns.push(runGenerator(['--md', '--trigger', 'subagent'], null, root))
  const chk = {}   // 자동 검사 총 상한 하나(이번 판정 묶음 + BLOCKED 재판정 묶음 공유 — putChecks)
  const ctx = { chk, type, agentId, brief: a.brief, report, own: [...changed.own], excluded: changed.excluded, shell, tools: toolLines(recs, String(type).replace(/^anakin_phase-|^teamanakin-/, '')).join('\n'), generated: sc.generated, genRuns, baseRef, request: req?.text, requestAt: req?.t ?? null, t0: a.t0, sessionId: input.session_id, root }
  // 묶음 예산(AC-2) = 래퍼 프롬프트 상한 − 이 판정의 실측 고정 구획(계약 + 증거 추정)
  const all = [...sc.harness, ...sc.product].sort(), read = readRepo(root), ref0 = diffRefOf(baseRef, all, root)
  const budget = budgetOf({ contract: Buffer.byteLength(contractOf({ ...ctx, id: plan[0].id, files: all })), evidence: evidenceBytesOf(ctx) })
  const jobs = jobsFor(plan, all, f => costOf(f, ref0, root), { budget, read, changed: changedLinesOf(ref0, root) })
  supersede(agentId, jobs)
  for (const b of new Set(jobs.filter(j => j.base).map(j => j.base))) { fs.mkdirSync(path.join(C.loops, b), { recursive: true }); fs.writeFileSync(path.join(C.loops, b, 'split.json'), JSON.stringify({ at: new Date().toISOString(), parts: jobs.filter(j => j.base === b).map(j => j.id) })) }
  const safe = p => p.catch(e => ({ iter: null, code: 2, verdict: 'BLOCKED', reason: `훅 오류 : ${e.message}` }))
  // 미해결 BLOCKED 원장 1회 재판정 — 같은 요청 + 이번 요청·브리프가 id 로 가리킨 원장(AC-3), 이번 판정과 동시에(이번 판정이 시간 예산을 다 써 재판정이 밀리지 않게)
  const done = new Set([...jobs.map(j => j.id), ...jobs.filter(j => j.base).map(j => j.base)])
  const re = !process.env.CODEX_GATE_NO_RETRY && deadline - Date.now() > 2 * 60e3 ? retryTargets({ since: req?.t ?? Date.now() - 3 * 3600e3, skip: done, named: `${req?.text || ''}\n${a.brief || ''}` }) : []
  const reRef = t => diffRefOf(t.gate.baseRef, t.files, root)
  const reJobs = resplit(re, t => { const r = reRef(t); return f => costOf(f, r, root) }, C.loops, { read, budgetFor: t => budgetOf(sizesOf(path.join(C.loops, t.id))), changed: t => changedLinesOf(reRef(t), root) })
  const coolOf = j => { const c = cooling(j.id); return c && { ...j, iter: c.iter, code: 2, verdict: 'BLOCKED', reason: `judge-unavailable : 쿨다운 중 판정 생략(새 기록 없음, 직전 ${c.at}) — 판정기 복구 뒤 판정` } }
  const [results, again] = await Promise.all([Promise.all(jobs.map(j => coolOf(j) || safe(judgeOne(j, ctx, deadline)).then(r => ({ ...j, ...r })))),
    Promise.all(reJobs.map(t => safe(judgeOne(t, { keep: true, chk, type: t.gate.agentType, agentId: t.gate.agentId, generated: t.gate.generated, baseRef: t.gate.baseRef, requestAt: t.gate.requestAt }, deadline)).then(r => ({ ...t, ...r, re: true }))))])
  const pick = ({ id, no, iter, code, verdict, reason, base, part, re }) => ({ id, no, iter, code, verdict, ...(reason ? { reason } : {}), ...(base ? { base, part } : {}), ...(re ? { re: true } : {}), ledger: path.relative(ROOT, path.join(C.loops, id)).replace(/\\/g, '/') })
  const rec = { at: new Date().toISOString(), agentType: type, agentId, changed: changed.length, baseRef: baseRef || null, results: [...results, ...again].map(pick) }
  fs.mkdirSync(C.pending, { recursive: true }); fs.writeFileSync(path.join(C.pending, `${Date.now()}-${agentId.slice(0, 12) || 'x'}.json`), JSON.stringify(rec))
  return rec
}
/** 판정 결과 notes 의 참고 지적 줄('참고 :' 로 시작) */
export const refNotes = notes => String(notes || '').split('\n').map(l => l.trim()).filter(l => /^참고\s*:/.test(l))
/** 판정 묶음 → 메인에 줄 글(묶음 원장은 AND 줄 추가) */
export function summarize(rec) {
  const own = rec.results.filter(r => !r.re), all = own.every(r => r.code === 0)
  const bases = [...new Set(own.filter(r => r.base).map(r => r.base))].map(b => { const ps = own.filter(r => r.base === b); return `${b} 묶음 ${ps.length}개 AND → ${ps.every(r => r.code === 0) ? 'Y' : ps.some(r => r.code === 1) ? 'N' : '보류'}` })
  const refs = own.filter(r => r.code === 0 || r.code === 1).map(r => ({ id: r.id, n: refNotes(lastResult(path.join(C.loops, r.id))?.notes).length })).filter(r => r.n)
  const promo = rec.results.filter(r => r.code === 1).flatMap(r => promotedDefects(path.join(C.loops, r.id)).map(d => `${r.id} ${d.id}(이의 ${d.seenCount}회)`))
  return `[CDX 자동 판정 — codex-gate 훅] ${rec.agentType}(${rec.agentId.slice(0, 6)})${rec.baseRef ? '' : ' [기준선 없음]'} : ${own.map(r => `${r.id} ${r.iter ?? '-'}회차 ${r.verdict}(종료 ${r.code})${r.reason ? ` — ${r.reason}` : ''} · 원장 ${r.ledger}`).join(' / ')}`
    + (bases.length ? ` ; ${bases.join(' ; ')}` : '')
    + (rec.results.some(r => r.re) ? ` ; BLOCKED 재판정 : ${rec.results.filter(r => r.re).map(r => `${r.id} ${r.iter}회차 ${r.verdict}`).join(' / ')}` : '')
    + (all ? ' → 전부 PASS(Y) : 다음 단계 진행 가능' : ' → Y 아님 : FAIL 은 그 결과를 낸 에이전트에 결함(원장 iter-N.codex.json) 회송(재실행 끝나면 같은 원장 다음 회차를 훅이 자동 판정, 상한 5회), BLOCKED 는 다음 SubagentStop 때 훅이 재판정(사유 해소 필요 시 해소) — 전부 PASS 전 다음 단계 진행 금지')
    + (refs.length ? ` ; 참고 지적 ${refs.reduce((n, r) => n + r.n, 0)}건(Y 유지 — 회송 대상 아님, 원장 notes) : ${refs.map(r => `${r.id} ${r.n}건`).join(' / ')}` : '')
    + (promo.length ? ` ; **반복 지적 승격** — 회송 대신 teamanakin-admin 면제 판단(13절 9항) : ${promo.join(' / ')} — 이 결함은 회송 목록에서 뺌(판정·상한 그대로)` : '')
}
/** --flush : 쌓인 판정 결과를 한 번만 메인에 전달(pending → sent) */
export function flush() {
  let fs0 = []; try { fs0 = fs.readdirSync(C.pending).filter(f => f.endsWith('.json')).sort() } catch { return '' }
  const out = []
  fs.mkdirSync(C.sent, { recursive: true })
  for (const f of fs0) { try { out.push(summarize(JSON.parse(fs.readFileSync(path.join(C.pending, f), 'utf8')))); fs.renameSync(path.join(C.pending, f), path.join(C.sent, f)) } catch { /* 깨진 파일 = 건너뜀 */ } }
  return out.join('\n')
}
/** --flush 훅 출력(codex-flush.mjs 얇은 진입과 공용 — 두 경로 출력 바이트 동일) : 훅이 띄운 프로세스·서브에이전트 안 호출(입력 agent_id — Claude Code 2.1.321 스키마 "Present only when the hook fires from within a subagent") = 메인 몫을 가져가지 않음(빈 글) */
export function flushOut(input) {
  const msg = process.env[C.envFlag] || input.agent_id ? '' : flush()
  return msg ? JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name || 'PostToolUse', additionalContext: msg } }) : ''
}

const readStdin = async () => { let raw = ''; for await (const c of process.stdin) raw += c; try { return JSON.parse(raw) } catch { return {} } }
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain && process.argv[2] === '--selftest') {
  const assert = (await import('node:assert/strict')).default
  delete process.env[C.envFlag]   // 훅이 띄운 프로세스(env CODEX_GATE_ACTIVE=1) 안에서 실행돼도 시험 안 gate() 는 격리 상태 루트에서 돌아야 함(11d 부터 훅은 selftest 를 자동 실행하지 않음 — 방어로 유지)
  // 시험 격리(2026-11-10 E) : 원장·pending·sent·기준선을 임시 상태 루트로 — 실제 .omc/state 를 건드리지 않는다(자식 프로세스·래퍼는 env CODEX_GATE_STATE·CODEX_LOOP_ROOT 로 같은 루트)
  const realPending = C.pending, snap = d => { try { return Object.fromEntries(fs.readdirSync(d).map(f => [f, fs.readFileSync(path.join(d, f), 'utf8')])) } catch { return {} } }, before = snap(realPending)
  const stRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-state-'))
  Object.assign(C, stateOf(stRoot)); process.env.CODEX_GATE_STATE = stRoot
  assert.ok(!C.pending.startsWith(path.join(ROOT, '.omc')) && C.loops === path.join(stRoot, 'loop'))
  const rg = await import(pathToFileURL(path.join(ROOT, 'scripts', 'request-graph.mjs')).href)
  assert.equal(String(HARNESS_RE), String(rg.HARNESS_RE), '하네스 경로 정의 = 생성기와 같음')
  assert.deepEqual([...NO_GATE].sort(), [...rg.NO_GATE].sort(), '판정 비대상 = 생성기와 같음')
  // 계획 = 파일을 바꾼 비대상 밖 에이전트만 c4 하나(2026-11-10 개정 — 하네스 파일도 같은 원장)
  const ids = (type, changed = [], desc = '') => planFor({ type, agentId: 'a1b2c3d4e5', desc, changed }).map(x => x.id)
  for (const t of NO_GATE) assert.deepEqual(ids(t, ['scripts/x.mjs', '.claude/hooks/x.mjs']), [], t)
  assert.deepEqual(ids('anakin_phase-build'), []); assert.deepEqual(ids('general-purpose'), [])
  assert.deepEqual(ids('anakin_phase-build', ['scripts/x.mjs'], 'C-1 verify 폐지'), ['c4-c-1-verify-a1b2c3'])
  assert.deepEqual(ids('anakin_phase-build', ['.claude/hooks/x.mjs']), ['c4-build-a1b2c3'])
  assert.deepEqual(ids('general-purpose', ['a.md', '.claude/settings.json']), ['c4-general-purpose-a1b2c3'])
  assert.deepEqual(ids('anakin_phase-verify', ['a.md']), []); assert.deepEqual(ids('', ['a.md']), [])
  assert.match(ids('anakin_phase-build', ['a.md'])[0], /^c4-[a-z0-9-]+-a[0-9a-f]{5}$/)   // 생성기 대상 접미 규칙(-a + 16진 5)
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
  // 비밀 가림(redact) + 도구 기록 줄(명령 문자열·출력 앞 2줄·끝 8줄·파일 도구 = 경로만) — c3-turn-f7dc16 AC-2
  { const sec = 'ghp_' + 'A'.repeat(30), jwt = 'eyJ' + 'h'.repeat(12) + '.' + 'p'.repeat(8) + '.' + 's'.repeat(6)
    for (const [x, bad] of [[`git remote add o https://u:${'p4ss'.repeat(3)}@github.com/x`, 'p4ssp4ss'], [`curl -H "Authorization: Bearer ${'Z'.repeat(30)}"`, 'ZZZZZZZZ'], [`echo ${sec}`, sec], [`SUPABASE_SERVICE_ROLE_KEY=${jwt}`, jwt], ['DATABASE_URL=postgres://a:b@h/db', 'a:b@h'], ['PI_API_KEY="abc12345xyz"', 'abc12345xyz'], ['MY_TOKEN=plainvalue', 'plainvalue']]) { const r = redact(x); assert.ok(!r.includes(bad) && r.includes('[REDACTED'), `${x} → ${r}`) }
    assert.equal(redact('git log --oneline -1'), 'git log --oneline -1'); assert.equal(redact('NODE_ENV=production pnpm build'), 'NODE_ENV=production pnpm build')   // 비밀 아닌 명령은 그대로
    const tl = toolLines([{ type: 'assistant', timestamp: '2026-11-10T01:00:00Z', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: `git status && echo ${sec}` } }, { type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'scripts/x.mjs', old_string: 'SECRET_OLD', new_string: 'SECRET_NEW' } }, { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '.env' } }] } },
      { type: 'user', timestamp: '2026-11-10T01:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: `줄1 ${sec}\n\n줄2\n줄3 셋째` }] } }], 'build')
    assert.deepEqual(tl, [`10:00:00 Bash [build] : $ git status && echo [REDACTED:github-token]\n    → 줄1 [REDACTED:github-token]\n    → 줄2\n    → 줄3 셋째`, '10:00:00 Edit [build] : scripts/x.mjs', '10:00:00 Read [build] : .env']) }
  // 2026-11-10 보안 검토 : 증거 본문 = 허용 확장자 + 공용 비밀 경로 제외 + redact
  { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-ex-')), w = (f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t) }
    try {
      for (const f of ['.env.local', 'credentials.json', 'id_rsa', '.npmrc', 'voice/x.md']) { w(f, 'BODY_SECRET'); assert.equal(fileExcerpt(f, 1500, d), '(본문 미첨부 — 비밀 경로)', f) }
      w('.claude/setup/pgm_list.md', '목록 본문\nPI_API_KEY="abc12345xyz"'); const pg = fileExcerpt('.claude/setup/pgm_list.md', 1500, d)
      assert.ok(pg.includes('목록 본문') && pg.includes('[REDACTED') && !pg.includes('abc12345xyz'), pg)
      w('a.png', 'PNG!'); assert.equal(fileExcerpt('a.png', 1500, d), '(본문 미첨부 — 허용 확장자 아님, 크기 4 바이트)')
    } finally { fs.rmSync(d, { recursive: true, force: true }) } }
  // c2-collect-ac25ad D-001 : 형제 서브에이전트·메인이 같은 시간에 쓴 파일 = 다른 실행 몫(otherWrites)
  { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-ow-')), wr = (t, p) => JSON.stringify({ type: 'assistant', timestamp: t, message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: p } }] } })
    try {
      fs.writeFileSync(path.join(d, 'agent-a1.jsonl'), wr('2026-11-10T01:00:00Z', 'x.md') + '\n'); fs.writeFileSync(path.join(d, 'agent-a2.jsonl'), [wr('2026-11-10T01:05:00Z', path.join(ROOT, 'test', 'x.test.mjs')), wr('2026-11-10T00:10:00Z', 'old.md')].join('\n') + '\n'); fs.writeFileSync(path.join(d, 'main.jsonl'), wr('2026-11-10T01:06:00Z', 'CLAUDE.md') + '\n')
      assert.deepEqual([...otherWrites(d, path.join(d, 'agent-a1.jsonl'), path.join(d, 'main.jsonl'), Date.parse('2026-11-10T01:00:00Z'))].sort(), ['CLAUDE.md', 'test/x.test.mjs'])   // 자기 기록·시작 전 쓰기 제외
    } finally { fs.rmSync(d, { recursive: true, force: true }) } }
  // 결함 8 귀속 : 임시 저장소 — 기준선 이전 미커밋 변경(old.md) 제외 · gitignore 산출물(ign/x.md) 포함 · 병렬 에이전트 A·B 가 쓴 파일이 서로 섞이지 않음(셸 쓴 A 의 보조 후보에서 B 파일 = 제외 건수)
  { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-scope-')), w = (f, s) => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), s) }
    try {
      for (const a of [['init', '-q'], ['config', 'user.email', 't@t'], ['config', 'user.name', 't']]) git(a, r)
      w('.gitignore', 'ign/\n'); w('old.md', '1'); w('keep.md', '1'); git(['add', '-A'], r); git(['commit', '-qm', 'base'], r)
      w('old.md', '2 — 이전 세션 미커밋'); const past = new Date(Date.now() - 3600e3); fs.utimesSync(path.join(r, 'old.md'), past, past)
      const t0 = Date.now() - 1000, base = git(['stash', 'create'], r).stdout.trim() || git(['rev-parse', 'HEAD'], r).stdout.trim()
      w('a.md', 'A 산출'); w('ign/x.md', 'A gitignore 산출'); w('b.md', 'B 산출'); w('bash-made.md', 'A 셸 산출')
      const A = changedFiles([path.join(r, 'a.md'), path.join(r, 'ign', 'x.md')], t0, base, r, { shell: ['node gen.mjs > bash-made.md && cat b.md'], others: new Set(['b.md']) })
      assert.deepEqual([...A], ['a.md', 'bash-made.md', 'ign/x.md']); assert.equal(A.excluded, 1); assert.deepEqual([...A.own].sort(), ['a.md', 'ign/x.md'])
      const B = changedFiles([path.join(r, 'b.md')], t0, base, r, { shell: [], others: new Set(['a.md', 'ign/x.md']) })
      assert.deepEqual([...B], ['b.md']); assert.equal(B.excluded, 0)   // 셸 미사용 = 자기 기록만(병렬 A 파일·기준선 이전 old.md 없음)
      assert.deepEqual([...changedFiles([], t0, null, r, { shell: ['cat a.md b.md bash-made.md'] })].sort(), ['a.md', 'b.md', 'bash-made.md']); assert.deepEqual([...changedFiles([], t0, null, r, { shell: ['node gen.mjs'] })], [])   // 명령에 경로·디렉터리 없음 = 셸 귀속 0건(시간창만으로 귀속 안 함)   // 기준선 없음 = git status ∩ 시작 뒤 수정(old.md 제외, gitignore 는 자기 기록으로만)
      assert.match(contractOf({ id: 'c4-x-a1b2c3', no: 4, type: 't', agentId: 'a1', files: [...A], own: [...A.own], excluded: A.excluded, shell: true }), /scope 귀속 : 이 에이전트 Write·Edit 기록 2건[^\n]*보조 1건\(시작 뒤 수정 시각 \+ 명령에 경로·디렉터리, 또는 인라인 인터프리터 실행 중 수정\) · 병렬 에이전트 귀속 제외 1건/)
      // 결함 8-5 : 같은 에이전트 옛 묶음 원장(-p1·-p2)·더는 없는 칸 원장 = superseded 표식(다른 에이전트 원장은 그대로), 직접 판정 기준 원장의 split.json 은 치움
      const L = path.join(r, 'loops'), g = (id, agentId) => { fs.mkdirSync(path.join(L, id), { recursive: true }); fs.writeFileSync(path.join(L, id, 'gate.json'), JSON.stringify({ agentId })) }
      g('c4-b-a9509f-p1', 'a9509f1'); g('c4-b-a9509f-p2', 'a9509f1'); g('c3-b-a9509f', 'a9509f1'); g('c1-b-a9509f', 'a9509f1'); g('c4-b-a9509f', 'a9509f1'); g('c4-o-ae4137', 'ae41371'); fs.writeFileSync(path.join(L, 'c4-b-a9509f', 'split.json'), '{}')
      assert.deepEqual(supersede('a9509f1', [{ id: 'c4-b-a9509f' }], L).sort(), ['c1-b-a9509f', 'c3-b-a9509f', 'c4-b-a9509f-p1', 'c4-b-a9509f-p2'])   // 옛 c1·c3 = 개정 뒤 대체
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
  { const ct = contractOf({ id: 'c4-x-a1b2c3', no: 4, brief: 'B', request: '마스터 원문 R', type: 't', agentId: 'a1', files: ['a.md'] }); assert.match(ct, /기준선 없음[\s\S]*AC-1[\s\S]*AC-3[\s\S]*## 마스터 요청 원문\n\n```text\n마스터 원문 R\n```[\s\S]*## 브리프\(첫 프롬프트 \+ 추가 지시\)\n\n```text\nB\n```/); assert.ok(!ct.includes('AC-4'), '하네스 없음 = AC-4 없음')
    assert.match(contractOf({ id: 'c4-x-a1b2c3', no: 4, type: 't', agentId: 'a1', files: ['a.md', '.claude/hooks/x.mjs'] }), /AC-4 : 하네스 파일 변경 1건\(\.claude\/hooks\/x\.mjs\)/) }
  { const ct = contractOf({ id: 'c4-x-a1b2c3', no: 4, type: 't', agentId: 'a1', brief: '첫 지시 ' + 'x'.repeat(C.briefMax) + ' 끝 추가 지시 C-99' }); assert.ok(ct.includes('첫 지시') && ct.includes('끝 추가 지시 C-99') && ct.includes('가운데'), 'c3-build-ab3cb5 D-001 : 계약 브리프 앞뒤 보존') }
  assert.match(contractOf({ id: 'c4-x-a1b2c3-p2', no: 4, type: 't', agentId: 'a1', files: ['a'], part: [2, 3], generated: ['g'], baseRef: 'f'.repeat(40) }), /기준선 : f{40} \(SubagentStart[\s\S]*묶음 2\/3 — 이 원장은 모든 묶음 PASS 일 때만 Y\(AND\)[\s\S]*생성물 1건은 scope 제외/)
  // 칸별 scope 분리 · 생성물 제외(c4 회송 ①)
  const sc = splitScope(['.claude/hooks/a.mjs', 'scripts/x.mjs', '.claude/engineering/50. graph/myRequestGraph.html', '.claude/engineering/50. graph/request-flow/1 x.md', 'CLAUDE.md', '.claude/engineering/50. graph/anakins_graph.md'])
  assert.deepEqual(sc, { harness: ['.claude/hooks/a.mjs'], product: ['scripts/x.mjs', 'CLAUDE.md', '.claude/engineering/50. graph/anakins_graph.md'], generated: ['.claude/engineering/50. graph/myRequestGraph.html', '.claude/engineering/50. graph/request-flow/1 x.md'] })
  // 상한 초과 = 원장 분할(c4 회송 ②) : 묶음당 예산 이하, 하네스 파일도 같은 c4 묶음, 작으면 분할 없음
  const plan = planFor({ type: 'anakin_phase-build', agentId: 'a1b2c3d4e5', changed: [...sc.harness, ...sc.product] })
  const big = { 'scripts/x.mjs': 300e3, 'CLAUDE.md': 200e3, '.claude/engineering/50. graph/anakins_graph.md': 50e3, '.claude/hooks/a.mjs': 10e3 }
  const allF = [...sc.harness, ...sc.product].sort(), B360 = 360 * 1024, nr = { budget: B360, read: () => null }, jobs = jobsFor(plan, allF, f => big[f], nr)
  assert.deepEqual(jobs.map(j => [j.id, j.files, j.part || null, j.base || null]), [
    ['c4-build-a1b2c3-p1', ['.claude/engineering/50. graph/anakins_graph.md', '.claude/hooks/a.mjs', 'scripts/x.mjs'], [1, 2], 'c4-build-a1b2c3'], ['c4-build-a1b2c3-p2', ['CLAUDE.md'], [2, 2], 'c4-build-a1b2c3']])   // 큰 것부터 첫 맞춤 : 300K + 50K + 10K ≤ 360K(하네스 파일도 같은 묶음)
  assert.ok(jobs.every(j => j.files.reduce((n, f) => n + big[f], 0) <= B360 || j.files.length === 1))
  assert.deepEqual(jobsFor(plan, allF, () => 1000, nr).map(j => [j.id, j.files.length]), [['c4-build-a1b2c3', 4]])
  assert.deepEqual(packGroups(['a', 'b', 'c'], { a: 400e3, b: 10, c: 20 }, B360), [['a'], ['b', 'c']])   // 혼자 넘는 파일 = 단독 묶음
  // 2026-11-10 AC-2 : 래퍼 상한 사본 = 래퍼 원문 값, 묶음 예산 = 상한 − 실측 고정 구획
  { const wt = fs.readFileSync(C.wrapper, 'utf8'), num = k => new RegExp(`${k}:\\s*([\\d_ *]+),`).exec(wt)[1].replace(/_/g, '').split('*').reduce((n, x) => n * Number(x.trim()), 1)
    assert.deepEqual([W.prompt, W.evidence, W.file], [num('maxPromptBytes'), num('maxEvidenceBytes'), num('maxFileEmbedBytes')], '래퍼 상한 사본 = 래퍼 C')
    assert.equal(budgetOf({ contract: 20e3, evidence: 50e3 }), W.prompt - HEAD_BYTES - 20e3 - (50e3 + C.refMax * 3) - C.reserve); assert.ok(HEAD_BYTES > 1000 && HEAD_BYTES < 40e3, String(HEAD_BYTES)) }
  // 묶음 AND = 생성기 mergeParts(전부 PASS 일 때만 PASS, 나뉘기 전 기준 원장은 대체)
  const row = (iter, verdict, t) => ({ iter, verdict, t0: t - 1, t1: t, run: false, blocked: verdict === 'BLOCKED' })
  const mp = xs => rg.mergeParts(xs).map(x => [x.id, x.rows.map(r => r.verdict)])
  assert.deepEqual(mp([{ id: 'c4-x-a1b2c3', rows: [row(1, 'BLOCKED', 1)] }, { id: 'c4-x-a1b2c3-p1', rows: [row(1, 'PASS', 5)] }, { id: 'c4-x-a1b2c3-p2', rows: [row(1, 'FAIL', 6), row(2, 'PASS', 9e6)] }]), [['c4-x-a1b2c3', ['FAIL', 'PASS']]])   // 판정 실행 2회(5·6ms 묶음, 9e6ms) — 2번째 실행 p1 행 없음 = 그 시점 최신 확정 PASS 이월(묶음마다 회차 번호 독립, c4-1-3-a6a80f 판정 시각 기준)
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
    mk('c4-missing', { blocked: [{ iter: 1, reason: 'scope-missing', at: iso(1) }] })   // 2026-11-10 AC-3 : scope-missing = 재판정 대상
    mk('c4-missing-max', { blocked: [1, 2, 3].map(k => ({ iter: 1, k, reason: 'scope-missing', at: iso(k) })) })   // 같은 회차 C.retryMax 건 = 제외(지금 규칙 버전으로 판정한 원장)
    { const gp = path.join(lt, 'c4-missing-max', 'gate.json'); fs.writeFileSync(gp, JSON.stringify({ ...JSON.parse(fs.readFileSync(gp, 'utf8')), rulesVer: C.rulesVer })) }
    mk('c4-missing-oldver', { blocked: [1, 2, 3].map(k => ({ iter: 1, k, reason: 'scope-missing', at: iso(k) })) })   // 회송 [2]c : 옛 규칙 버전(rulesVer 없음) = 상한이어도 1회 더
    mk('c4-named-old', { startedAt: iso(-60), blocked: [{ iter: 1, reason: 'scope-missing', at: iso(1) }] })   // 이전 요청이라도 이번 요청·브리프가 id 로 가리키면 대상
    for (const [id, g] of [['c1-old', { no: 1, agentType: 'anakin_phase-build' }], ['c4-decide-old', { no: 4, agentType: 'anakin_phase-decide' }]]) { mk(id, { blocked: [{ iter: 1, reason: 'lock', at: iso(1) }] }); const gp = path.join(lt, id, 'gate.json'); fs.writeFileSync(gp, JSON.stringify({ ...JSON.parse(fs.readFileSync(gp, 'utf8')), ...g })) }   // 개정 전 원장 = 재판정 제외
    const tg = retryTargets({ since: T - 1, now: T + 30 * 60e3, skip: new Set(['c4-skip', 'c4-missing', 'c4-named-old', 'c4-missing-oldver']), loops: lt })
    assert.deepEqual(tg.map(t => t.id).sort(), ['c4-broad', 'c4-unavail-old'])
    // 본 판정 쿨다운(2026-11-12) : judge-unavailable 직후 = 생략, 쿨다운 지남·다른 사유·뒤에 판정 있음 = 판정
    assert.equal(cooling('c4-unavail-new', T + 30 * 60e3, lt)?.reason, 'judge-unavailable'); assert.equal(cooling('c4-unavail-old', T + 30 * 60e3, lt), null)
    assert.equal(cooling('c4-device', T + 2 * 60e3, lt), null); assert.equal(cooling('c4-resolved', T + 2 * 60e3, lt), null); assert.equal(cooling('c4-none', T, lt), null)
    assert.deepEqual(retryTargets({ since: T - 1, now: T + 30 * 60e3, loops: lt, named: '브리프 : c4-named-old 재판정' }).map(t => t.id).filter(id => /missing|named/.test(id)).sort(), ['c4-missing', 'c4-missing-oldver', 'c4-named-old'])   // 쿨다운·사람 몫 사유·해소됨·대체됨·기록 없음·이전 요청·이번 판정 제외
    const rj = resplit(tg, () => f => ({ a: 300e3, b: 300e3 })[f], lt, { read: () => null, budgetFor: () => B360 })
    assert.deepEqual(rj.map(j => [j.id, j.files, j.part]).sort((x, y) => x[0].localeCompare(y[0])), [['c4-broad-p1', ['a'], [1, 2]], ['c4-broad-p2', ['b'], [2, 2]], ['c4-unavail-old', ['a', 'b'], null]])
    assert.ok(fs.existsSync(path.join(lt, 'c4-broad', 'split.json')))
    assert.deepEqual(resplit([{ id: 'c4-one', reason: 'scope-too-broad', files: ['a'] }], () => () => 1, lt, { read: () => null }), [])   // 1묶음 = 같은 결과라 건너뜀
    // AC-3 : scope-missing 묶음 원장 = 형제 묶음 파일 전부를 연관 군집으로 다시 묶음 — 1묶음이면 기준 원장 하나(옛 묶음 superseded, split.json 치움), 2묶음 이상이면 참조 발췌
    for (const [p, fl] of [['c4-sm-p1', ['x.mjs', 'z.md']], ['c4-sm-p2', ['y.mjs']]]) { fs.mkdirSync(path.join(lt, p)); fs.writeFileSync(path.join(lt, p, 'gate.json'), JSON.stringify({ files: fl })) }
    fs.mkdirSync(path.join(lt, 'c4-sm')); fs.writeFileSync(path.join(lt, 'c4-sm', 'split.json'), JSON.stringify({ parts: ['c4-sm-p1', 'c4-sm-p2'] }))
    const rd = f => ({ 'x.mjs': "import { yy } from './y.mjs'\nyy()\n", 'y.mjs': 'export const yy = () => 1\n', 'z.md': '무관\n' })[f]
    const tsm = [{ id: 'c4-sm-p1', base: 'c4-sm', part: [1, 2], reason: 'scope-missing', files: ['x.mjs', 'z.md'] }, { id: 'c4-sm-p2', base: 'c4-sm', part: [2, 2], reason: 'scope-missing', files: ['y.mjs'] }]
    const two = resplit(tsm, () => f => ({ 'x.mjs': 200e3, 'y.mjs': 100e3, 'z.md': 150e3 })[f], lt, { read: rd, budgetFor: () => B360 })
    assert.deepEqual(two.map(j => [j.id, j.files, j.src]), [['c4-sm-p1', ['x.mjs', 'y.mjs'], 'c4-sm-p1'], ['c4-sm-p2', ['z.md'], 'c4-sm-p1']])   // x↔y 연관 = 같은 묶음(종전 분할은 갈라 놓음)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(lt, 'c4-sm', 'split.json'), 'utf8')).parts, ['c4-sm-p1', 'c4-sm-p2'])
    const one = resplit(tsm, () => () => 1000, lt, { read: rd, budgetFor: () => B360 })
    assert.deepEqual(one.map(j => [j.id, j.files, j.part, j.base, j.src]), [['c4-sm', ['x.mjs', 'y.mjs', 'z.md'], null, null, 'c4-sm-p1']])
    assert.ok(fs.existsSync(path.join(lt, 'c4-sm-p1', 'superseded.json')) && fs.existsSync(path.join(lt, 'c4-sm-p2', 'superseded.json')) && !fs.existsSync(path.join(lt, 'c4-sm', 'split.json')) && fs.existsSync(path.join(lt, 'c4-sm', 'split.superseded.json')))
  } finally { fs.rmSync(lt, { recursive: true, force: true }) }
  // 재진입 금지 · verify · 정지 연쇄
  assert.equal(await gate({ agent_type: 'anakin_phase-verify', agent_transcript_path: fileURLToPath(import.meta.url) }), null)
  assert.equal(await gate({ agent_type: 'anakin_phase-collect', stop_hook_active: true }), null)
  // 끝까지 : 가짜 판정자(CODEX_JS)로 --init → --confirm-real → pending → flush(메인 additionalContext)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgate-')), fake = path.join(tmp, 'fake-codex.mjs'), tp = path.join(tmp, 'agent-af00d1234.jsonl')
  fs.writeFileSync(fake, ["import fs from 'node:fs'", "if (process.argv.includes('login')) process.exit(0)", "let s = ''", "process.stdin.on('data', d => (s += d))",
    "process.stdin.on('end', () => { const o = process.argv[process.argv.indexOf('-o') + 1]; fs.writeFileSync(o, JSON.stringify({ verdict: 'PASS', iter: 1, criteria: ['AC-1', 'AC-2', 'AC-3', ...(s.includes('AC-4 :') ? ['AC-4'] : [])].map(id => ({ id, status: 'met', met: true, evidence: 'fake' })), defects: [], blocked: [], blocked_reason: '', notes: '' })) })"].join('\n'))
  // 기록 2종 : 조회형(Write 없음) · 산출형(Write — 없는 경로 = diff·본문 0, 하네스 경로 1건 포함 → 계약 AC-4)
  const W2 = { type: 'assistant', timestamp: '2026-11-10T01:01:00Z', message: { content: ['docs/__cgate-selftest-a__.md', '.claude/hooks/__cgate-selftest-h__.mjs'].map(p => ({ type: 'tool_use', name: 'Write', input: { file_path: p } })) } }
  const tpRead = path.join(tmp, 'agent-ac011ec00.jsonl'), done1 = JSON.stringify({ type: 'assistant', timestamp: '2026-11-10T01:02:00Z', message: { content: [{ type: 'text', text: '산출 결과' }] } })
  fs.writeFileSync(tpRead, recs.slice(0, 2).map(r => JSON.stringify(r)).join('\n') + '\n' + done1 + '\n')
  // c4-build-a19b07 iter-2 : 브리프가 이전 브리프의 기준 정의 줄('- AC-9 :')·안쪽 울타리를 인용 — 계약 기준은 정의 줄 AC-1~4 만(가짜 판정자는 AC-9 를 안 냄 → 잡히면 unverifiable FAIL)
  const B9 = { ...recs[0], message: { content: '브리프 원문 AC-1\n이전 브리프 인용 :\n```\n- AC-8 : 안쪽 울타리\n```\n- AC-9 : 아소카.md 정합' } }
  fs.writeFileSync(tp, [B9, recs[1], W2].map(r => JSON.stringify(r)).join('\n') + '\n' + done1 + '\n')
  fs.writeFileSync(tp.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ description: `selftest ${process.pid}` }))
  const prevPending = (() => { try { return fs.readdirSync(C.pending) } catch { return [] } })()
  process.env.CODEX_JS = fake; process.env.CODEX_GATE_NO_RETRY = '1'   // 시험이 실제 원장을 재판정하지 않게
  assert.match(snapshotBase('af00d1234') || '', /^[0-9a-f]{40}$/); assert.equal(baseOf('af00d1234'), fs.readFileSync(path.join(C.base, 'af00d1234.txt'), 'utf8'))   // 시작 스냅샷 = 이후 변경만 scope
  { const b0 = baseOf('af00d1234'); fs.writeFileSync(path.join(C.base, 'af00d1234.txt'), git(['rev-parse', 'HEAD']).stdout.trim()); const h = baseOf('af00d1234'); assert.equal(snapshotBase('af00d1234'), h, '재개 = 첫 스냅샷 유지(2026-11-10 c4-fail-5-aeb16d)'); fs.writeFileSync(path.join(C.base, 'af00d1234.txt'), b0) }
  try {
    // 조회 에이전트(NO_GATE)·파일 변경 0건 = 판정 0회·원장 0개
    for (const [t, p] of [['anakin_phase-collect', tp], ['anakin_phase-review', tp], ['general-purpose', tpRead]]) assert.equal(await gate({ agent_type: t, agent_id: 'ac011ec00', agent_transcript_path: p }), null, t)
    assert.deepEqual((() => { try { return fs.readdirSync(C.loops) } catch { return [] } })(), [])
    const rec = await gate({ agent_type: 'anakin_phase-build', agent_id: 'af00d1234', agent_transcript_path: tp, last_assistant_message: '산출 결과' })
    const lid = rec.results[0].id
    assert.ok(rec.baseRef && fs.readFileSync(path.join(C.loops, lid, 'contract.md'), 'utf8').includes(`기준선 : ${rec.baseRef}`))
    { const gj = JSON.parse(fs.readFileSync(path.join(C.loops, lid, 'gate.json'), 'utf8')); assert.equal(gj.agentId, 'af00d1234'); assert.equal(gj.rulesVer, C.rulesVer) }   // 재판정용 작업 기록
    assert.equal(rec.results.length, 1); assert.match(lid, /^c4-selftest-\d+-af00d1$/); assert.equal(rec.results[0].code, 0, JSON.stringify(rec)); assert.equal(rec.results[0].verdict, 'PASS')
    assert.ok(fs.existsSync(path.join(C.loops, lid, 'ledger.json')) && fs.existsSync(path.join(C.loops, lid, 'iter-1.codex.json')) && fs.existsSync(path.join(C.loops, lid, 'contract.md')))
    assert.match(fs.readFileSync(path.join(C.loops, lid, 'evidence-1', 'checks.md'), 'utf8'), /^## 자동 검사[\s\S]*검사 대상 없음/)   // 11c : 하네스 scope = 훅이 checks.md 를 붙임(시험 훅 경로는 없는 파일 = 실행 대상 0)
    { const ct = fs.readFileSync(path.join(C.loops, lid, 'contract.md'), 'utf8'); assert.ok(ct.includes('## 마스터 요청 원문') && ct.includes('## 브리프(첫 프롬프트 + 추가 지시)') && ct.includes('AC-4 : 하네스') && !ct.includes('근거 = 증거 checks.md') && ct.includes('N(FAIL) 대상 = 실제 결함만'), ct)
      assert.ok(ct.includes('````text\n브리프 원문 AC-1') && ct.includes('- AC-9 : 아소카.md 정합\n````'), '울타리 = 본문 ``` 보다 길게')
      const rc = refreshContract(ct, { id: lid, files: ['docs/a.md'], part: null }, 'HEAD', null); assert.ok(rc.includes('- AC-9 : 아소카.md 정합') && !/^- AC-4 : 하네스/m.test(rc), '재분할 = 머리 정의만 고침, 브리프 인용 줄 보존') }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(C.loops, lid, 'ledger.json'), 'utf8')).criteriaIds, ['AC-1', 'AC-2', 'AC-3', 'AC-4'])
    { const lf = path.join(C.loops, lid, 'ledger.json'), l = JSON.parse(fs.readFileSync(lf, 'utf8')); l.criteriaIds = ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-9']; fs.writeFileSync(lf, JSON.stringify(l)) }   // 수정 전 판이 잘못 저장한 원장 — 다음 판정(s1, 2회차)이 계약에서 다시 셈해 PASS
    // P6 : 같은 내용 = 마지막 PASS 유지(Codex·새 회차 없음) — 아래 재판정 시험은 해시를 지워 '내용 바뀜'으로 만든다
    const gjf = path.join(C.loops, lid, 'gate.json'); assert.deepEqual(JSON.parse(fs.readFileSync(gjf, 'utf8')).passHash?.iter, 1, '확정 PASS 회차와 결합'); const unhash = () => { const g = JSON.parse(fs.readFileSync(gjf, 'utf8')); assert.deepEqual(Object.keys(g.passHash || {}), ['hash', 'iter']); assert.ok(!('hash' in g), '판정 전 해시 없음'); delete g.passHash; fs.writeFileSync(gjf, JSON.stringify(g)) }
    { const same = await gate({ agent_type: 'anakin_phase-build', agent_id: 'af00d1234', agent_transcript_path: tp, last_assistant_message: '산출 결과' }); assert.deepEqual([same.results[0].iter, same.results[0].verdict, same.results[0].reason], [1, 'PASS', '변경 없음 — 이전 PASS 유지']); assert.equal(nextIter(path.join(C.loops, lid, 'ledger.json')), 2) }   // 결과 글은 아래 flush 가 함께 가져감
    unhash()
    assert.deepEqual(fs.readdirSync(C.loops).filter(d => !/^c4-/.test(d)), [])   // c1·c3 원장 폴더 0개
    assert.equal(nextIter(path.join(C.loops, lid, 'ledger.json')), 2)   // 다음 실행 = 같은 원장 다음 회차
    const msg = flush(); assert.match(msg, new RegExp(`${lid} 1회차 PASS\\(종료 0\\).*전부 PASS\\(Y\\)`)); assert.equal(flush(), '')   // 한 번만 전달
    // 훅 본체(stdin → stdout) : SubagentStop 은 systemMessage 만, --flush 는 hookSpecificOutput.additionalContext
    const hook = (args, input) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_JS: fake, CODEX_GATE_NO_RETRY: '1' } })
    const s1 = hook([], { hook_event_name: 'SubagentStop', agent_type: 'anakin_phase-build', agent_id: 'af00d1234', agent_transcript_path: tp })
    assert.equal(s1.status, 0); const o1 = JSON.parse(s1.stdout); assert.ok(o1.systemMessage.includes('2회차 PASS') && !o1.hookSpecificOutput)
    const s2 = hook(['--flush'], { hook_event_name: 'PostToolUse' }); assert.equal(s2.status, 0); assert.match(JSON.parse(s2.stdout).hookSpecificOutput.additionalContext, /2회차 PASS/)
    assert.equal(JSON.parse(s2.stdout).hookSpecificOutput.hookEventName, 'PostToolUse')
    const s3 = hook(['--flush'], { hook_event_name: 'UserPromptSubmit' }); assert.equal(s3.stdout, '')   // 쌓인 것 없음 = 침묵
    fs.mkdirSync(C.pending, { recursive: true }); fs.writeFileSync(path.join(C.pending, `${Date.now()}-af00d1234.json`), JSON.stringify({ agentType: 't', agentId: 'af00d1234', results: [{ id: 'x', iter: 1, code: 0, verdict: 'PASS', ledger: 'l' }] }))
    assert.equal(hook(['--flush'], { hook_event_name: 'PostToolUse', agent_id: 'a999' }).stdout, '')   // 서브에이전트 안 도구 호출 = 메인 몫 안 가져감
    assert.match(hook(['--flush'], { hook_event_name: 'PostToolUse' }).stdout, /전부 PASS/)
    const sb = hook(['--base'], { hook_event_name: 'SubagentStart', agent_id: 'af00d1234', agent_type: 'anakin_phase-build' }); assert.equal(sb.status, 0); assert.equal(sb.stdout, ''); assert.ok(baseOf('af00d1234'))   // --base 모드
    const s4 = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { input: '{"agent_type":"anakin_phase-build","agent_transcript_path":"' + tp.replace(/\\/g, '\\\\') + '"}', encoding: 'utf8', env: { ...process.env, CODEX_JS: fake, [C.envFlag]: '1' } })
    assert.equal(s4.status, 0); assert.equal(s4.stdout, '')   // 훅이 띄운 프로세스 안 = 재진입 안 함
    assert.equal(hook([], 'not json').status, 0)   // 깨진 입력 = 세션 안 막음
    // A3 : 훅 시간 예산 소진 BLOCKED = 원장(iter-N.blocked-K.json + ledger.blocked)에 기록 → 쿨다운 뒤 재판정 대상
    unhash()   // s1 이 다시 남긴 해시 = 같은 내용 → 지워야 판정 경로(시간 예산 소진)로 감
    const bl = await gate({ agent_type: 'anakin_phase-build', agent_id: 'af00d1234', agent_transcript_path: tp }, { deadline: Date.now() + 20e3 })
    assert.equal(bl.results[0].verdict, 'BLOCKED'); assert.match(bl.results[0].reason, /^judge-unavailable : 훅 시간 예산 소진/); assert.ok(!bl.results[0].reason.includes('원장 기록 실패'), bl.results[0].reason)
    const lb = JSON.parse(fs.readFileSync(path.join(C.loops, lid, 'ledger.json'), 'utf8')).blocked.at(-1)
    assert.equal(lb.reason, 'judge-unavailable'); assert.equal(lb.iter, 3); assert.ok(fs.existsSync(path.join(C.loops, lid, 'iter-3.blocked-1.json')))
    assert.ok(retryTargets({ since: 0, now: Date.now() + C.cooldownMs + 60e3 }).some(t => t.id === lid))   // 재판정 대상에 들어감
    // 생성물 증거 — 생성기 재실행(가짜 생성기)은 실제 종료 코드·출력·전후 변화
    const fakeGen = path.join(tmp, 'fake-gen.mjs'), gf = path.join(tmp, 'g.txt'); fs.writeFileSync(fakeGen, "import fs from 'node:fs'\nconst f = process.argv.find(a => a.endsWith('g.txt')); if (f) fs.writeFileSync(f, String(Date.now()))\nconsole.log('가짜 생성기 실행 ok')\n"); fs.writeFileSync(gf, 'old')
    const gen0 = C.generator; C.generator = fakeGen
    try {
      const g1 = runGenerator([gf], ['g.txt'], tmp); assert.deepEqual([g1.code, g1.out, g1.files, g1.changed], [0, '가짜 생성기 실행 ok', 1, ['g.txt']])
      assert.match(genText(g1), /종료 코드 : 0\n출력\(끝 2000자\) :\n가짜 생성기 실행 ok\n재실행 전후 생성물 내용 변화 : 1건 \/ 대상 1건 — g\.txt/)
      assert.deepEqual(runGenerator(['--x'], ['g.txt'], tmp).changed, []); assert.match(genText({ cmd: 'c', code: 0, out: '', files: 1, changed: [] }), /0건 \/ 대상 1건 \(에이전트가 남긴 생성물 = 생성기 산출 그대로\)/)
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
    if (process.argv[2] === '--base') { if (!process.env[C.envFlag] && input.agent_id && input.agent_type !== C.legacy && !NO_GATE.has(input.agent_type)) snapshotBase(input.agent_id) }   // 비대상 = 스냅샷 생략   // SubagentStart : 시작 스냅샷(출력 없음)
    else if (process.argv[2] === '--flush') { const o = flushOut(input); if (o) process.stdout.write(o) }   // 서브에이전트 안 호출 = 빈 글(flushOut)
    else {
      const rec = await gate(input)
      if (rec) process.stdout.write(JSON.stringify({ systemMessage: summarize(rec) }))
    }
  } catch { /* 판정 실패 = 침묵(세션 진행), 결과 파일이 없으면 메인은 원장 없음 = 검증 누락으로 본다 */ }
  process.exit(0)
}
