/**
 * work-history-rows : 대시보드(model-change-dashboard.mjs)와 재수행 CLI(request-resume.mjs)가 같이 쓰는 행 순서·상태 판정 순수 함수
 * 대시보드 # 번호 = buildTurns 결과 순서(기준 시각 이후 · part 합산 · 중복 제거 · 최신순) + 1 — 둘이 이 함수 하나만 쓰므로 번호가 어긋나지 않는다
 * 실행 파일 아님 : import 해서 사용 (시험 test/request-resume.test.mjs)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_FROM = '2026-10-09T09:43:26+09:00'   // 대시보드 모니터링 시작 시각 : loginpi teamAnakin 도입 첫 요청
export const TOKEN_KEYS = ['input', 'cache_read', 'cache_create', 'output']
const LIVE_MS = 10 * 60e3                                   // 세션 기록이 이 시간 안에 바뀌었으면 '살아 있을 수 있음'

/** 저장소 루트 : WORKSPACE_ROOT/loginpi 우선(워크트리에서 실행해도 원래 체크아웃의 데이터), 없으면 이 파일 기준 */
export const projectRoot = () => process.env.WORKSPACE_ROOT ? path.join(process.env.WORKSPACE_ROOT, 'loginpi') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 턴 키 = 레코드 id 에서 part 를 뗀 <session_id>:<turn> */
export const turnKey = r => (r.id || '').replace(/\.\d+$/, '') || r.ts_req

/** Claude Code 가 자동으로 넣는 중단 표식(사용자 요청 아님) — 로거 work-history-logger.mjs 가 거르는 정규식과 같은 모양 */
export const isInterruptMarker = s => /^\[Request interrupted by user[^\]]*\]$/.test(String(s || '').trim())

/** loadRows 결과 → 대시보드 행 순서의 턴 목록 (part 합산, 서브에이전트 토큰 포함, 같은 시각+머리글 중복 제거, 최신순) */
export function buildTurns(rows, fromMs = Date.parse(DEFAULT_FROM)) {
  const byKey = new Map()
  for (const r of rows) {
    if (!r.ts_req || Date.parse(r.ts_req) < fromMs) continue
    const key = turnKey(r), t = byKey.get(key)
    const tk = {}; for (const x of [r, ...(r.agents_detail || [])]) for (const k of TOKEN_KEYS) tk[k] = (tk[k] || 0) + (x.tokens?.[k] || 0)
    if (!t) { byKey.set(key, { ...r, key, tk, skills: [...(r.skills || [])], agents: [...(r.agents || [])] }); continue }
    for (const k of TOKEN_KEYS) t.tk[k] += tk[k]
    for (const k of ['cost_usd', 'cost_agents_usd', 'tools_total', 'tool_errors', 'files_changed', 'elapsed_ms']) t[k] = (t[k] || 0) + (r[k] || 0)
    t.ts_res = r.ts_res || t.ts_res; t.skills.push(...(r.skills || [])); t.agents.push(...(r.agents || []))
    t.interrupted = r.interrupted; t.superseded = t.superseded || r.superseded
    t.incomplete = r.incomplete; t.absorbed = r.absorbed   // 상태는 마지막 part 기준 (앞 part 가 끊겨도 뒤 part 가 응답하면 완료)
  }
  const seen = new Set()   // ponytail: 시각+요청 머리글 기준 중복 제거, 근본 대책은 로거의 이어받은 세션 재기록 방지
  const list = [...byKey.values()].filter(t => { const k = t.ts_req + '|' + (t.req_head || ''); if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => Date.parse(b.ts_req) - Date.parse(a.ts_req))
  // 요청문이 중단 표식뿐인 턴 = 앞 턴의 중단 신호라 목록에서 뺀다(로거가 거르지만 읽기 쪽 방어). resolveTarget 이 그 id 를 받으면 앞 턴을 안내
  const markers = []
  const prevOf = t => list.find(x => x.session_id === t.session_id && Date.parse(x.ts_req) < Date.parse(t.ts_req) && !isInterruptMarker(x.req_head))   // list 최신순 → 첫 일치 = 바로 앞 턴
  const out = list.filter(t => !isInterruptMarker(t.req_head) || !markers.push({ marker: t, prev: prevOf(t) }))
  return Object.assign(out, { markers })
}

/**
 * 상태 판정(레코드 값만 봄 — 표·CLI·엑셀 공용) : 중단 > 대체됨 > 완료(ts_res 있음 ; loadRows 의 mid-turn 보정 ts_res_src='mid_turn' 포함)
 *   > 응답 없음(absorbed 인데 보정 안 됨 · incomplete = 세션이 턴 도중 끝남) > 진행 중(그 밖의 ts_res 없음 = 지금 실행 중인 세션의 마지막 턴)
 * 중단 = 마지막 part 가 응답 없이 끊긴 것만(interrupted + incomplete 또는 ts_res 없음 — 로거가 응답 없는 중단 part 에 incomplete 를 같이 붙임).
 *   interrupted 여도 마지막 part 가 응답으로 끝났으면 '중단 후 재개해 완료'라 완료(예 454cc053:27 — 중단 뒤 1,643자 최종 보고)
 */
export const STATUS = { running: '진행 중', interrupted: '중단', noreply: '응답 없음', superseded: '대체됨', done: '완료' }   // 순서 = 상태 필터 선택지 순서
export function turnStatus(t) {
  const cut = t.interrupted && (t.incomplete || !t.ts_res)
  const key = cut ? 'interrupted' : t.superseded ? 'superseded' : t.ts_res ? 'done' : t.absorbed || t.incomplete ? 'noreply' : 'running'
  return { key, label: STATUS[key], resumable: key !== 'done' }
}
/** 미완료 전체(재수행 대상) = 진행 중 + 중단 + 응답 없음 */
export const OPEN_KEYS = ['running', 'interrupted', 'noreply']

/**
 * 입력 → 턴 : 대시보드 # 번호(숫자) / 레코드 id(<session_id>:<turn>[.<part>]) / 세션 앞부분[:<turn>] (턴 생략 시 그 세션의 최신 턴)
 * → { turn, no } 또는 { error, candidates }
 */
export function resolveTarget(turns, input) {
  const s = String(input || '').trim()
  if (!s) return { error: '번호 또는 id 를 입력하세요', candidates: [] }
  if (/^#?\d+$/.test(s)) {
    const no = +s.replace('#', '')
    return turns[no - 1] ? { turn: turns[no - 1], no } : { error: `# ${no} 없음 (현재 1~${turns.length})`, candidates: [] }
  }
  const m = s.match(/^([0-9a-f-]{4,36})(?::(\d+)(?:\.\d+)?)?$/i)
  if (!m) return { error: `해석할 수 없는 입력 : ${s}`, candidates: [] }
  const [, sid, turnNo] = m
  const match = t => (t.session_id || t.session || '').toLowerCase().startsWith(sid.toLowerCase()) && (turnNo == null || String(t.turn) === turnNo)
  const hits = turns.filter(match)
  if (!hits.length) {
    const mk = turnNo != null && (turns.markers || []).find(m => match(m.marker))
    if (mk) return { error: `중단 표식 — 실제 요청은 ${mk.prev ? `${mk.prev.session}:${mk.prev.turn}` : '(앞 턴 기록 없음)'}`, candidates: mk.prev ? [mk.prev] : [] }
    return { error: `일치하는 요청 없음 : ${s}`, candidates: [] }
  }
  const sessions = new Set(hits.map(t => t.session_id))
  if (sessions.size > 1) return { error: `세션 앞부분 '${sid}' 가 세션 ${sessions.size}개와 일치 — 더 길게 입력`, candidates: hits.slice(0, 5) }
  return { turn: hits[0], no: turns.indexOf(hits[0]) + 1 }   // turns 가 최신순이라 hits[0] = 최신 턴
}

const CONT_RE = /^(이어서|계속|다시|마저|재시도|continue|go on|resume|retry)/i   // 이어가기 재지시 첫머리
const SHORT_REQ = 15                                                        // 이 글자 수 이하 = 짧은 재지시
const words = s => new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [])
/**
 * 후속 처리 추정 = '후속 처리됨 [확인중]' 보조 표시 : 상태 키(중단 등)는 그대로 두고 미완료 턴에만, 같은 세션의 바로 다음 1~3턴만 본다
 * 근거 필드(레코드에 있는 것만) : req_head(요청 머리글) · req_chars(요청 글자 수) · tags(유형 판정 — GIT·DEPLOY)
 *   ① 다음 턴 req_head 가 이어가기 말('이어서'·'계속'·'다시' …)로 시작  ② req_chars ≤ 15 짧은 재지시('[Image …' 같은 첨부만은 제외)
 *   ③ 다음 턴 req_head 가 원 요청 머리 앞 20자로 시작 = 같은 요청 다시 입력  ④ 다음 턴 tags 에 GIT·DEPLOY + 원 req_head 와 핵심어(2글자+) 겹침
 * 커밋 메시지는 레코드에 없어 ④는 요청문 핵심어로 대신한다(ponytail: 조사 붙은 한국어 낱말은 안 겹침 — 형태소 분석이 필요해지면 그때)
 * → { id: '<세션8자>:<턴>', why } 또는 null
 */
export function followUp(turns, t) {
  if (!turnStatus(t).resumable) return null
  const head = (t.req_head || '').replace(/…$/, '').trim(), kw = words(head), at = Date.parse(t.ts_req)
  const next = turns.filter(x => x.session_id === t.session_id && Date.parse(x.ts_req) > at).sort((a, b) => Date.parse(a.ts_req) - Date.parse(b.ts_req)).slice(0, 3)
  for (const x of next) {
    const h = (x.req_head || '').trim(), id = `${x.session}:${x.turn}`
    if (CONT_RE.test(h)) return { id, why: '이어가기 재지시' }
    if (x.req_chars != null && x.req_chars <= SHORT_REQ && !h.startsWith('[')) return { id, why: '짧은 재지시' }
    if (head.length >= 10 && h.startsWith(head.slice(0, 20))) return { id, why: '같은 요청 다시 입력' }
    if ((x.tags || []).some(g => g === 'GIT' || g === 'DEPLOY') && [...words(h)].some(w => kw.has(w))) return { id, why: '커밋·배포 턴이 같은 핵심어' }
  }
  return null
}
export const FOLLOW_LABEL = '후속 처리됨 [확인중]'

/** 세션이 살아 있는지 : 프로세스는 확인 불가라 기록 파일 수정 시각 + 같은 세션의 뒤 요청 유무로 추정 */
export function judgeLiveness({ mtimeMs, now = Date.now(), laterTurns = 0 }) {
  if (mtimeMs == null) return { live: false, text: '세션 기록 파일 없음 — 같은 세션 이어가기 불가, 새 세션으로 재실행' }
  const ago = Math.round((now - mtimeMs) / 60e3)
  if (laterTurns > 0) return { live: ago * 60e3 < LIVE_MS, text: `같은 세션에서 뒤 요청 ${laterTurns}건이 이어짐 — 이 요청은 이미 넘어감(세션 기록 ${ago}분 전 수정)` }
  if (now - mtimeMs < LIVE_MS) return { live: true, text: `세션 기록 ${ago}분 전 수정 — 아직 작업 중일 수 있음 [확인중]` }
  return { live: false, text: `세션 기록 ${ago}분 전 마지막 수정 — 종료 또는 유휴 추정 [확인중]` }
}

/**
 * 재수행 명령 : mode 'resume' = 같은 세션 이어가기(살아 있으면 --fork-session 으로 새 id 분기), 'new' = 새 세션에 원 요청문 + 이어서 지시
 * print = -p(비대화형). 반환 { file, args, cwd }
 */
export function buildCommand({ turn, mode, cwd, live = false, print = false, request = '' }) {
  const when = String(turn.ts_req || '').slice(0, 19).replace('T', ' ')
  // 같은 세션에 뒤 요청이 이어졌을 수 있어 '직전 요청'이라 하지 않고 시각·원 요청문으로 대상을 못 박는다
  const prompt = mode === 'resume'
    ? `[재수행] 이 세션에서 ${when} 에 받은 아래 요청이 끝나지 않았습니다(마지막 요청이 아닐 수 있음 — 이 요청만 대상). 지금까지 한 작업(git status·변경 파일·그때의 응답)을 먼저 확인하고, 이 요청의 남은 일만 이어서 마무리해 주세요.\n\n--- 원 요청 ---\n${request}`
    : `[재수행] 아래 요청을 ${when} 에 시작했으나 끝나지 않았습니다(세션 ${turn.session || ''}). 먼저 이전 결과(git status·git log·변경 파일·work-history 기록)를 확인해 이미 된 부분은 건너뛰고, 남은 부분만 이어서 진행해 주세요.\n\n--- 원 요청 ---\n${request}`
  const args = [...(mode === 'resume' ? ['--resume', turn.session_id, ...(live ? ['--fork-session'] : [])] : []), ...(print ? ['-p'] : []), prompt]
  return { file: 'claude', args, cwd }
}

/** 명령 표시용 문자열 (bash 기준 큰따옴표) */
export const commandText = ({ file, args, cwd }) => `cd "${cwd}" && ${[file, ...args.map(a => /^[\w./:-]+$/.test(a) ? a : `"${a.replace(/(["\\$`])/g, '\\$1')}"`)].join(' ')}`
