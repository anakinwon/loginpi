/**
 * efficiency_compare.mjs — 5종 도구(Agent/MCP/Skill/Hook/Plugin) 이용효율 대시보드 (v2 : 산출 ÷ 투입 3축, 2026-10-06, 정의 docs/TOOL_EFFICIENCY_METRICS.md)
 *   원천 : ~/.claude/projects/<프로젝트>/*.jsonl 세션 기록(+ <sid>/subagents/*.jsonl) → 사람 프롬프트 단위(턴)로 분할(시스템 주입 메시지는 턴을 나누지 않음)
 *   산출 : 완료 = 다음 사람 프롬프트가 정정(REWORK 어휘)이 아님 · 작업량 = 도구 호출 수 · 유효 작업량 = 완료 × 작업량
 *   투입 : 작업 시간(인접 메시지 간격 10분 이하 합) · 비용(USD, 단가 없는 모델 턴 제외) · 시도(오류 호출 비중)
 *   효율 : 완료·시간·비용·시도 효율 = 같은 층(카테고리 × 호출 수 구간) 안에서 사용 턴 값의 기준 턴 대비 상대차(%) · throughput = 완료 턴당 유효 작업량(카테고리 층)
 *   판정 : 완료·시간·비용 중 2축 이상 +10% → 좋음(−25% 이하 축 없을 때), 2축 이상 −10% → 나쁨 · v1 유효율(오류 0 AND 정정 아님)은 대조용으로 병기
 *          기준 = 5종 도구를 하나도 쓰지 않은 턴 · 훅은 상시 장치라 사용/미사용 비교 대상이 아니므로 부담·적중으로 따로 평가
 *   출력 : scripts/tooldash/efficiency_compare.json · efficiency_turns.json(턴 원자료) · work-statistics/main-dashboard/tool-efficiency.html
 *   실행 : node scripts/tooldash/efficiency_compare.mjs [--home H] [--project P] [--min N]   (N = 층별 기준 턴 최소치, 기본 5)
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'

const A = Object.fromEntries(process.argv.slice(2).map((v, i, a) => v.startsWith('--') ? [v.slice(2), a[i + 1]] : null).filter(Boolean))
const HOME = (A.home || process.env.TOOLDASH_HOME || os.homedir()).replace(/\\/g, '/')
const PROJECT = (A.project || process.env.TOOLDASH_PROJECT || process.cwd()).replace(/\\/g, '/')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SESS_DIR = `${HOME}/.claude/projects/${PROJECT.replace(/[^A-Za-z0-9]/g, '-')}`
const OUT_JSON = path.join(HERE, 'efficiency_compare.json')
const OUT_HTML = path.join(PROJECT, 'work-statistics', 'main-dashboard', 'tool-efficiency.html')   // HTML 시각화 공통 폴더
const MIN_N = +(A.min || 5)
const { costUsd, categorize } = await import(pathToFileURL(path.join(PROJECT, 'scripts/work-history-core.mjs')).href)   // 카테고리 규칙은 작업 이력 로거와 동일

const KINDS = ['Agent', 'MCP', 'Skill', 'Plugin']            // 턴마다 쓸지 선택하는 도구 → 사용/기준 비교. Plugin = 플러그인 제공 스킬·MCP 호출(플러그인 훅은 훅 부담으로만 집계)
const KIND_KO = { Agent: '에이전트', MCP: 'MCP 서버', Skill: '스킬', Plugin: '플러그인', Hook: '훅' }
const HOOK_EXEC_TYPES = new Set(['hook_success', 'hook_cancelled', 'async_hook_response'])      // usage.mjs 와 동일 규칙
const PLUGIN_SKILL_RE = /^(ponytail|document-skills|example-skills|claude-mem|claude-code-setup|frontend-design|context-mode):/
const PLUGIN_HOOK_RE = /plugins\/cache|PLUGIN_ROOT|ponytail|claude-mem|context-mode|prior observations/i
/** 다음 프롬프트가 정정인지 판정하는 어휘 (화면에 그대로 노출 — 조정 가능) */
const REWORK_WORDS = ['아니', '다시', '잘못', '틀렸', '틀린', '정정', '수정해', '바꿔', '말고', '왜 ', '안 됐', '안됐', '안 돼', '안돼', '오류', '에러', '실패', '빠졌', '누락', '원복', '되돌', '아닌데', '아닌가', '이상해', '고쳐']
const REWORK_RE = new RegExp('(' + REWORK_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')')
// 사람이 쓴 프롬프트가 아닌 주입 메시지 → 턴을 나누지 않고 정정 판정에서도 제외. 스킬 본문("Base directory for this skill")은 Skill 호출 직후 user 메시지로 들어오므로 여기서 거르지 않으면 스킬 턴이 두 토막으로 갈라진다(v1 결함)
// [Image …] 프롬프트는 사용자가 직접 올린 화면이므로 사람 턴으로 유지
const SYSTEM_PROMPT_RE = /^\s*(<task-notification>|Another Claude session|Claude session message|Base directory for this skill|<command-|Caveat:)/
const ACTIVE_GAP_MS = 10 * 60e3                              // 인접 메시지 간격이 이 값을 넘으면 사용자 부재·백그라운드 대기로 보고 작업 시간에서 제외
const CALL_BUCKETS = [[0, 5], [6, 20], [21, 50], [51, Infinity]]  // 호출 수 구간(규모 층) : 같은 규모끼리 비교
const bucketOf = n => CALL_BUCKETS.findIndex(([lo, hi]) => n >= lo && n <= hi)
const BUCKET_KO = CALL_BUCKETS.map(([lo, hi]) => hi === Infinity ? `${lo}+` : `${lo}~${hi}`)
const VIOLATION_RE = /금지 ([1-9]\d*)건/                      // 문체 규칙 검사 훅의 위반 보고 형식
const KST = 9 * 3600e3
const kstDate = ts => new Date(new Date(ts).getTime() + KST).toISOString().slice(0, 10)

/** tool_use 이름 → 종류·항목명·플러그인명 (usage.mjs classify 와 같은 규칙, 플러그인명 추출만 추가) */
function classify(name, input = {}) {
  if (name === 'Agent' || name === 'Task') return { kind: 'Agent', item: input.subagent_type || input.name || 'general', plugin: null }
  if (name.startsWith('mcp__')) { const srv = name.split('__')[1] || ''; const m = srv.match(/^plugin_([^_]+)_/); return { kind: 'MCP', item: srv, plugin: m ? m[1] : null } }
  if (name === 'Skill') { const sk = input.skill || ''; return { kind: 'Skill', item: sk, plugin: PLUGIN_SKILL_RE.test(sk) ? sk.split(':')[0] : null } }
  return null
}
const promptText = m => typeof m.content === 'string' ? m.content : m.content.filter(p => p.type === 'text').map(p => p.text || '').join('\n')
const newTurn = (session, ts, text) => ({ session, start: ts, end: ts, date: kstDate(ts), category: categorize(text).category, prompt_head: text.slice(0, 80), api_calls: 0, tokens: { input: 0, cache_read: 0, cache_create: 0, output: 0 }, cost: 0, model: null, tool_calls: 0, errors: 0, res_chars: 0, kinds: new Set(), items: new Set(), hooks: [], hook_chars: 0, hook_cancelled: 0, hook_violations: 0, rework_next: 0, active_ms: 0, last_ts: ts, priced: 1 })
const addUsage = (t, u, model) => {
  t.api_calls++; t.model ||= model
  const tk = { input: u.input_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_create: u.cache_creation_input_tokens || 0, output: u.output_tokens || 0 }
  for (const k in tk) t.tokens[k] += tk[k]
  const c = costUsd(tk, model); if (c == null) t.priced = 0; t.cost += c || 0   // 단가 없는 모델이 섞인 턴은 비용 지표에서 제외(0으로 두지 않음)
}
const addActive = (t, ts) => {                               // 인접 메시지 간격 중 상한 이하만 작업 시간으로 합산
  const gap = new Date(ts) - new Date(t.last_ts); if (gap > 0 && gap <= ACTIVE_GAP_MS) t.active_ms += gap; t.last_ts = ts
}
const isPrompt = m => typeof m?.content === 'string' || (Array.isArray(m?.content) && m.content.some(p => p.type === 'text') && !m.content.some(p => p.type === 'tool_result'))

async function* lines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const l of rl) { if (!l) continue; try { yield JSON.parse(l) } catch { /* 깨진 줄 무시 */ } }
}

// ── 1차 : 메인 스레드 → 턴 분할 ──────────────────────────────────────────
const turnsBySession = new Map()   // sid → turns[]
const seen = new Set()             // requestId 중복 제거(스트리밍 조각)
const mainFiles = fs.readdirSync(SESS_DIR).filter(f => f.endsWith('.jsonl')).map(f => path.join(SESS_DIR, f))
for (const file of mainFiles) {
  const sid = path.basename(file, '.jsonl'); const turns = []; let cur = null
  for await (const j of lines(file)) {
    if (j.isSidechain) continue
    const ts = j.timestamp; if (!ts) continue
    if (j.type === 'user' && isPrompt(j.message)) {
      const text = promptText(j.message)
      // 직전 턴의 결과 판정 : 시스템 주입 메시지는 건너뛰고 그다음 사람 프롬프트로 판정(백그라운드 알림을 정정으로 오판 방지)
      if (SYSTEM_PROMPT_RE.test(text)) { if (cur) addActive(cur, ts); continue }
      for (let i = turns.length - 1; i >= 0 && turns[i].rework_next == null; i--) turns[i].rework_next = REWORK_RE.test(text) ? 1 : 0
      cur = newTurn(sid, ts, text); cur.rework_next = null; turns.push(cur); continue
    }
    if (!cur) continue
    cur.end = ts; addActive(cur, ts)
    if (j.type === 'assistant') {
      const u = j.message?.usage, rid = j.requestId || j.message?.id || j.uuid
      if (u && rid && !seen.has(rid)) { seen.add(rid); addUsage(cur, u, j.message?.model) }
      for (const p of (Array.isArray(j.message?.content) ? j.message.content : [])) {
        if (p.type === 'text') cur.res_chars += (p.text || '').length
        if (p.type === 'tool_use') {
          cur.tool_calls++
          const c = classify(p.name, p.input || {}); if (!c) continue
          cur.kinds.add(c.kind); cur.items.add(`${c.kind}/${c.item}`)
          if (c.plugin) { cur.kinds.add('Plugin'); cur.items.add(`Plugin/${c.plugin}`) }
        }
      }
    } else if (j.type === 'user' && Array.isArray(j.message?.content)) {
      for (const p of j.message.content) if (p.type === 'tool_result' && p.is_error) cur.errors++
    } else if (j.type === 'attachment' && j.attachment?.hookName && HOOK_EXEC_TYPES.has(j.attachment.type)) {
      const a = j.attachment, content = a.content || a.stdout || ''
      cur.hooks.push(a.hookName); cur.hook_chars += content.length
      if (a.type === 'hook_cancelled') cur.hook_cancelled++
      const v = content.match(VIOLATION_RE); if (v) cur.hook_violations += +v[1]
      if (PLUGIN_HOOK_RE.test(JSON.stringify(a))) cur.hook_plugin_runs = (cur.hook_plugin_runs || 0) + 1   // 플러그인 훅은 상시 장치 → 플러그인 "사용"으로 세지 않고 훅 부담에만 포함
    }
  }
  turnsBySession.set(sid, turns)
}
// ── 2차 : 서브에이전트 토큰·비용을 시각이 속한 부모 턴에 합산 ─────────────────
for (const [sid, turns] of turnsBySession) {
  const dir = path.join(SESS_DIR, sid, 'subagents'); if (!fs.existsSync(dir) || !turns.length) continue
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
    for await (const j of lines(path.join(dir, f))) {
      if (j.type !== 'assistant' || !j.message?.usage || !j.timestamp) continue
      const rid = j.requestId || j.message?.id || j.uuid; if (!rid || seen.has(rid)) continue; seen.add(rid)
      const t = [...turns].reverse().find(t => t.start <= j.timestamp) || turns[0]     // 시작 시각이 앞선 마지막 턴
      addUsage(t, j.message.usage, j.message.model)
      for (const p of (Array.isArray(j.message.content) ? j.message.content : [])) { if (p.type === 'tool_use') t.tool_calls++; if (p.type === 'tool_result' && p.is_error) t.errors++ }
    }
  }
}
const turns = [...turnsBySession.values()].flat().filter(t => t.api_calls > 0)
if (!turns.length) { console.error(`턴 없음: ${SESS_DIR}`); process.exit(2) }
for (const t of turns) {
  t.rework_next = t.rework_next ? 1 : 0                     // 세션 마지막 턴(다음 사람 프롬프트 없음)은 정정 아님
  t.valid = t.errors === 0 && t.rework_next === 0 ? 1 : 0   // v1 유효 턴(대조용으로 유지)
  t.delivered = t.rework_next === 0 ? 1 : 0                 // v2 완료 : 오류 유무와 무관, 다음 사람 프롬프트가 정정이 아니면 완료
  t.work_units = t.tool_calls                               // v2 작업량 : 도구 호출 수(서브에이전트 포함)
  t.delivered_work = t.delivered * t.work_units             // v2 유효 작업량 = 모든 효율의 분자
  t.bucket = bucketOf(t.tool_calls)
  delete t.last_ts
}
// 턴 단위 원자료(프롬프트 앞 80자만) — 산식 검증·재분석용
fs.writeFileSync(path.join(HERE, 'efficiency_turns.json'), JSON.stringify(turns.map(t => ({ ...t, kinds: [...t.kinds], items: [...t.items] })), null, 0))

// ── 지표 : 결과(유효율) 기준, 기준선 = 도구 미사용 턴, 카테고리 층화 ──────────────
const CTRL = turns.filter(t => t.kinds.size === 0)
const sum = (ts, f) => ts.reduce((s, t) => s + f(t), 0)
// v2(docs/TOOL_EFFICIENCY_METRICS.md) : 산출 = 완료 × 작업량(도구 호출 수), 투입 = 시간·비용·시도 3축. v1 유효율·비용은 대조용으로 함께 산출
function group(ts) {
  const n = ts.length, nv = sum(ts, t => t.valid), calls = sum(ts, t => t.tool_calls)
  const nd = sum(ts, t => t.delivered), dw = sum(ts, t => t.delivered_work), mins = sum(ts, t => t.active_ms) / 60e3
  const priced = ts.filter(t => t.priced), pricedDw = sum(priced, t => t.delivered_work), pricedCost = sum(priced, t => t.cost)   // 단가 없는 모델 턴은 비용 축에서 제외
  return {
    n, n_valid: nv, valid_rate: n ? nv / n : null, cost_per_valid: nv ? sum(ts, t => t.cost) / nv : null, cost_per_turn: n ? sum(ts, t => t.cost) / n : null, err_rate: calls ? sum(ts, t => t.errors) / calls : null, rework_rate: n ? sum(ts, t => t.rework_next) / n : null,
    delivered_rate: n ? nd / n : null,                      // 완료율
    work_per_min: mins ? dw / mins : null,                  // 유효 작업량 / 작업 시간(분)
    work_per_usd: pricedCost ? pricedDw / pricedCost : null, n_priced: priced.length,   // 유효 작업량 / USD
    waste_rate: calls ? sum(ts, t => t.errors) / calls : null,   // 헛호출 비중 = 오류 호출 ÷ 호출 수 (회복 호출은 미집계 : 문서 3-2 recovery_calls [확인중])
    throughput: nd ? dw / nd : null,                        // 완료 턴당 유효 작업량(절대 작업량)
    active_min_per_turn: n ? mins / n : null, work_units_per_turn: n ? calls / n : null,
  }
}
const pct = (w, o, higherBetter) => (o == null || w == null || !o) ? null : +(((higherBetter ? w - o : o - w) / o) * 100).toFixed(1)
const effs = (gw, go) => ({
  valid: pct(gw.valid_rate, go.valid_rate, true), cost: pct(gw.cost_per_valid, go.cost_per_valid, false),   // v1 대조값
  delivered: pct(gw.delivered_rate, go.delivered_rate, true), time: pct(gw.work_per_min, go.work_per_min, true), cost2: pct(gw.work_per_usd, go.work_per_usd, true), attempt: pct(gw.waste_rate, go.waste_rate, false),
})
// 판정 : 완료·시간·비용 3축 중 2축 이상 +10% → 좋음(단, 어느 축도 −25% 이하 아님), 2축 이상 −10% → 나쁨. 엇갈린 축은 이름으로 표기
function judge(e) {
  if (!e) return { verdict: '표본 부족', off: [] }
  const axes = { 완료: e.delivered, 시간: e.time, 비용: e.cost2 }, vals = Object.values(axes).filter(v => v != null)
  const up = vals.filter(v => v >= 10).length, down = vals.filter(v => v <= -10).length
  const verdict = up >= 2 && !vals.some(v => v <= -25) ? '좋음' : down >= 2 ? '나쁨' : '차이 없음'
  const off = Object.entries(axes).filter(([, v]) => v != null && (verdict === '좋음' ? v < 0 : verdict === '나쁨' ? v > 0 : false)).map(([k]) => k)
  return { verdict, off }
}
const geo = e => { const vs = [e.delivered, e.time, e.cost2].filter(v => v != null).map(v => 1 + v / 100); return vs.length && vs.every(v => v > 0) ? +((Math.pow(vs.reduce((a, b) => a * b, 1), 1 / vs.length) - 1) * 100).toFixed(1) : null }   // 합성값 : 정렬 전용
function compare(pred) {
  const W = turns.filter(pred)
  // 층 = 카테고리 × 호출 수 구간(같은 규모끼리 비교). throughput 만은 카테고리 층(규모를 맞추면 "큰 턴을 가능하게 한다"는 효과가 지워짐)
  const key = t => `${t.category}|${t.bucket}`
  const strata = [...new Set(W.map(key))].map(k => {
    const [category, b] = k.split('|'), w = W.filter(t => key(t) === k), o = CTRL.filter(t => key(t) === k), ok = o.length >= MIN_N
    const gw = group(w), go = group(o)
    return { category, bucket: BUCKET_KO[+b], n_with: w.length, n_ctrl: o.length, ok, with: gw, ctrl: go, eff: ok ? effs(gw, go) : null }
  }).sort((a, b) => b.n_with - a.n_with)
  const used = strata.filter(s => s.ok), covered = sum(used, s => s.n_with), excluded = W.length - covered
  const base = { n_with: W.length, n_ctrl: CTRL.length, covered, excluded, strata }
  if (W.length < MIN_N || covered < MIN_N) return { ...base, ok: false }
  // 층별 지표를 사용 턴 수로 가중 평균 → 사용 턴의 구성비 기준으로 양쪽을 같은 저울에 올린다
  const FIELDS = ['valid_rate', 'cost_per_valid', 'cost_per_turn', 'err_rate', 'rework_rate', 'delivered_rate', 'work_per_min', 'work_per_usd', 'waste_rate', 'active_min_per_turn', 'work_units_per_turn']
  const stdOver = (rows, side, fields) => Object.fromEntries(fields.map(f => { let num = 0, den = 0; for (const s of rows) { const v = s[side][f]; if (v == null) continue; num += s.n_with * v; den += s.n_with } return [f, den ? num / den : null] }))
  const gw = stdOver(used, 'with', FIELDS), go = stdOver(used, 'ctrl', FIELDS)
  gw.n_priced = sum(used, s => s.with.n_priced); go.n_priced = sum(used, s => s.ctrl.n_priced)
  // throughput : 카테고리 층만
  const catRows = [...new Set(W.map(t => t.category))].map(c => { const w = W.filter(t => t.category === c), o = CTRL.filter(t => t.category === c); return { n_with: w.length, ok: o.length >= MIN_N, with: group(w), ctrl: group(o) } }).filter(r => r.ok)
  gw.throughput = stdOver(catRows, 'with', ['throughput']).throughput; go.throughput = stdOver(catRows, 'ctrl', ['throughput']).throughput
  const eff = effs(gw, go); eff.throughput = pct(gw.throughput, go.throughput, true); eff.composite = geo(eff)
  return { ...base, ok: true, with: gw, ctrl: go, eff, ...judge(eff) }
}
// 훅 : 상시 장치 → 부담(실행·주입 글자)과 적중(차단·위반 보고)
const hookTurns = turns.filter(t => t.hooks.length)
const hookNames = new Map(); for (const t of turns) for (const h of t.hooks) hookNames.set(h, (hookNames.get(h) || 0) + 1)
const HOOK = {
  runs: sum(turns, t => t.hooks.length), turns_covered: hookTurns.length, coverage: hookTurns.length / turns.length,
  chars_total: sum(turns, t => t.hook_chars), chars_per_turn: hookTurns.length ? sum(turns, t => t.hook_chars) / hookTurns.length : 0,
  cancelled: sum(turns, t => t.hook_cancelled), violations: sum(turns, t => t.hook_violations), plugin_runs: sum(turns, t => t.hook_plugin_runs || 0),
  items: [...hookNames].sort((a, b) => b[1] - a[1]).map(([name, runs]) => { const ts = turns.filter(t => t.hooks.includes(name)); return { name, runs, turns: ts.length, chars_per_run: sum(ts, t => t.hook_chars) / Math.max(1, sum(ts, t => t.hooks.length)), cancelled: sum(ts, t => t.hook_cancelled), violations: sum(ts, t => t.hook_violations) } }),
}
const purposes = fs.existsSync(path.join(HERE, 'purposes.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'purposes.json'), 'utf8')) : {}
const purposeOf = (kind, name) => purposes[kind]?.[name] || Object.entries(purposes.hook_prefix || {}).find(([p]) => name.startsWith(p))?.[1] || ''
const itemNames = new Map(); for (const t of turns) for (const it of t.items) itemNames.set(it, (itemNames.get(it) || 0) + 1)
const result = {
  generated_at: new Date().toISOString(), min_n: MIN_N, turns: turns.length, sessions: turnsBySession.size, ctrl_turns: CTRL.length, ctrl: group(CTRL),
  range: { from: turns.map(t => t.date).sort()[0], to: turns.map(t => t.date).sort().at(-1) },
  rework_words: REWORK_WORDS,
  formula: 'v2(docs/TOOL_EFFICIENCY_METRICS.md) : 완료 = 다음 사람 프롬프트가 정정 아님 · 작업량 = 도구 호출 수 · 유효 작업량 = 완료 × 작업량 · 완료 효율 = 완료율 상대차 · 시간 효율 = 유효 작업량/작업 분 상대차 · 비용 효율 = 유효 작업량/USD 상대차(단가 없는 모델 턴 제외) · 시도 효율 = 오류 호출 비중 상대차 · throughput = 완료 턴당 유효 작업량(카테고리 층) · 층 = 카테고리 × 호출 수 구간, 기준 턴 ' + MIN_N + '개 이상 층만 사용 턴 구성비로 재가중 · 판정 = 완료·시간·비용 중 2축 ±10% · v1 유효율(오류 0 AND 정정 아님)·유효 1건당 비용은 대조용',
  active_gap_min: ACTIVE_GAP_MS / 60e3, buckets: BUCKET_KO,
  kinds: KINDS.map(k => ({ kind: k, label: KIND_KO[k], ...compare(t => t.kinds.has(k)),
    items: [...itemNames].filter(([it]) => it.startsWith(k + '/')).sort((a, b) => b[1] - a[1]).map(([it]) => { const name = it.slice(k.length + 1); const r = compare(t => t.items.has(it)); delete r.strata; return { name, purpose: purposeOf(k, name), ...r } }) })),
  hook: HOOK,
}
fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 1))

// ── HTML (외부 의존성 0, 라이트/다크, 표 = 접근성 뷰) ──────────────────────────
const C = { with: '#2a78d6', ctrl: '#eb6834', good: '#e8503a', goodD: '#f0705c', bad: '#1f3a68', badD: '#5b7fc2', grid: '#e1e0d9', gridD: '#2c2c2a' }   // 계열색 = dataviz 기본값 · 상태색 = 좋음 다홍 / 나쁨 네이비(2026-10-06 지시, 대비 3:1·CVD ΔE 20 이상 확인)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const f0 = v => v == null ? '-' : Math.round(v).toLocaleString('ko-KR')
const fp = v => v == null ? '-' : (v * 100).toFixed(0) + '%'
const fusd = v => v == null ? '-' : '$' + (+v).toFixed(2)
const sign = v => v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : ''
const fmtE = v => v == null ? '<span class="muted">-</span>' : `<b class="${sign(v)}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</b>`
const effCell = v => v == null ? '<td class="num muted">-</td>' : `<td class="num ${sign(v)}"><span class="dot"></span>${v > 0 ? '+' : ''}${v.toFixed(1)}%</td>`
/** 사용/기준 두 값을 같은 척도의 가로 막대 한 쌍으로. 비율은 100% 척도, 금액은 둘 중 큰 값 척도 */
function pair(w, o, fmt, max) {
  const mx = max || Math.max(w || 0, o || 0) || 1
  const bar = (v, cls, lab) => `<div class="row"><span class="lab">${lab}</span><div class="track"><div class="bar ${cls}" style="width:${Math.min(100, 100 * (v || 0) / mx).toFixed(1)}%" title="${lab} ${fmt(v)}"></div></div><span class="val">${fmt(v)}</span></div>`
  return `<div class="pair">${bar(w, 'w', '사용')}${bar(o, 'o', '기준')}</div>`
}
const f1 = v => v == null ? '-' : (+v).toFixed(1)
const vsign = v => v === '좋음' ? 'pos' : v === '나쁨' ? 'neg' : ''
/** 효율 축 1개 = 부호 있는 가로 막대(±100% 척도) + 수치 */
const axis = (lab, v) => `<div class="row"><span class="lab">${lab}</span><div class="track"><div class="bar ${sign(v)}" style="width:${Math.min(100, Math.abs(v || 0)).toFixed(1)}%"></div></div><span class="val">${fmtE(v)}</span></div>`
const axes = e => `<div class="pair axes">${axis('완료', e.delivered)}${axis('시간', e.time)}${axis('비용', e.cost2)}</div>`
const card = k => {
  const e = k.eff
  return `<section class="card ${vsign(k.verdict)}"><h3>${esc(k.label)} <small>${k.kind}</small></h3>
  ${k.ok ? `<div class="big"><span class="dot"></span>${k.verdict}${k.off.length ? `<span class="verdict">${k.off.join('·')} 축은 반대</span>` : ''}</div>
  <div class="sub">사용 ${k.n_with}턴(비교 반영 ${k.covered} · 층 부족으로 제외 ${k.excluded}) · 완료율 ${fp(k.with.delivered_rate)} vs 기준 ${fp(k.ctrl.delivered_rate)}</div>${axes(e)}
  <div class="mini">유효 작업량/분 ${f1(k.with.work_per_min)} vs ${f1(k.ctrl.work_per_min)} · 유효 작업량/USD ${f1(k.with.work_per_usd)} vs ${f1(k.ctrl.work_per_usd)} (단가 있는 턴 ${k.with.n_priced}/${k.ctrl.n_priced}) · 헛호출 ${fp(k.with.waste_rate)}/${fp(k.ctrl.waste_rate)} → 시도 효율 ${fmtE(e.attempt)}</div>
  <div class="mini">완료 턴당 유효 작업량(throughput) ${f1(k.with.throughput)} vs ${f1(k.ctrl.throughput)} 호출 → ${fmtE(e.throughput)} · 턴당 작업 시간 ${f1(k.with.active_min_per_turn)} vs ${f1(k.ctrl.active_min_per_turn)}분 · v1 유효율 효율(대조) ${fmtE(e.valid)}</div>`
  : `<div class="big muted">표본 부족</div><div class="sub">사용 ${k.n_with}턴 · 기준 턴이 ${MIN_N}개 이상인 층(카테고리 × 호출 수 구간)에 속한 사용 턴 ${k.covered}개 (${MIN_N}개 이상 필요)</div>`}
  </section>`
}
const hookCard = h => `<section class="card hook"><h3>훅 <small>Hook · 상시 장치라 사용/기준 비교 대상이 아님</small></h3>
  <div class="hgrid"><div><div class="hnum">${f0(h.runs)}</div><div class="hlab">실행 횟수 (플러그인 훅 ${f0(h.plugin_runs)})</div></div><div><div class="hnum">${fp(h.coverage)}</div><div class="hlab">턴 커버율 (${h.turns_covered}/${turns.length})</div></div><div><div class="hnum">${f0(h.chars_per_turn)}</div><div class="hlab">턴당 주입 글자 (부담)</div></div><div><div class="hnum">${f0(h.cancelled)}</div><div class="hlab">차단 (적중)</div></div><div><div class="hnum">${f0(h.violations)}</div><div class="hlab">위반 보고 건 (적중)</div></div></div>
  <div class="mini">부담 = 훅이 대화에 주입한 텍스트 양 · 적중 = 훅이 실제로 막았거나(hook_cancelled) 규칙 위반을 보고한 건수("금지 N건" 형식). 출력 없는 훅 실행은 세션 기록에 남지 않아 집계되지 않는다.</div></section>`
/** 종류별 카테고리 층 표 : 같은 카테고리 안에서 사용 vs 기준 */
const strataTable = k => `<details><summary>층별 비교 (카테고리 × 호출 수 구간, ${k.strata.length}개 층)</summary>
<table><thead><tr><th>카테고리</th><th>호출 수</th><th class="num">사용 턴</th><th class="num">기준 턴</th><th>완료율 (사용 vs 기준)</th><th class="num">완료 효율</th><th class="num">유효 작업량/분 (사용 / 기준)</th><th class="num">시간 효율</th><th class="num">유효 작업량/USD (사용 / 기준)</th><th class="num">비용 효율</th><th class="num">시도 효율</th></tr></thead><tbody>
${k.strata.map(s => s.ok
  ? `<tr><td>${esc(s.category)}</td><td>${s.bucket}</td><td class="num">${s.n_with}</td><td class="num">${s.n_ctrl}</td><td>${pair(s.with.delivered_rate, s.ctrl.delivered_rate, fp, 1)}</td>${effCell(s.eff.delivered)}<td class="num">${f1(s.with.work_per_min)} / ${f1(s.ctrl.work_per_min)}</td>${effCell(s.eff.time)}<td class="num">${f1(s.with.work_per_usd)} / ${f1(s.ctrl.work_per_usd)}</td>${effCell(s.eff.cost2)}${effCell(s.eff.attempt)}</tr>`
  : `<tr class="dim"><td>${esc(s.category)}</td><td>${s.bucket}</td><td class="num">${s.n_with}</td><td class="num">${s.n_ctrl}</td><td colspan="7" class="muted">기준 턴 부족 (${MIN_N}개 미만) · 비교에서 제외</td></tr>`).join('\n')}
</tbody></table></details>`
const table = k => `<h2>${esc(k.label)} <small>${k.kind} · 항목별</small></h2>
${strataTable(k)}
<table><thead><tr><th>도구</th><th>용도</th><th class="num">사용 턴</th><th class="num">비교 반영</th><th>판정</th><th>완료율 (사용 vs 기준)</th><th class="num">완료 효율</th><th class="num">시간 효율</th><th class="num">비용 효율</th><th class="num">시도 효율</th><th class="num">throughput (사용 / 기준 호출)</th><th class="num">v1 유효율 효율 (대조)</th></tr></thead><tbody>
${k.items.map(it => it.ok
  ? `<tr><td><code>${esc(it.name)}</code></td><td class="muted">${esc(it.purpose)}</td><td class="num">${it.n_with}</td><td class="num">${it.covered}</td><td class="${vsign(it.verdict)}">${it.verdict}${it.off.length ? ` <small>(${it.off.join('·')} 반대)</small>` : ''}</td><td>${pair(it.with.delivered_rate, it.ctrl.delivered_rate, fp, 1)}</td>${effCell(it.eff.delivered)}${effCell(it.eff.time)}${effCell(it.eff.cost2)}${effCell(it.eff.attempt)}<td class="num">${f1(it.with.throughput)} / ${f1(it.ctrl.throughput)}</td>${effCell(it.eff.valid)}</tr>`
  : `<tr class="dim"><td><code>${esc(it.name)}</code></td><td class="muted">${esc(it.purpose)}</td><td class="num">${it.n_with}</td><td class="num">${it.covered}</td><td colspan="8" class="muted">표본 부족 (비교 반영 사용 턴 ${MIN_N}개 이상 필요)</td></tr>`).join('\n') || '<tr><td colspan="12" class="muted">사용 기록 없음</td></tr>'}
</tbody></table>`
const hookTable = h => `<h2>훅 <small>Hook · 항목별 부담·적중</small></h2>
<table><thead><tr><th>훅</th><th>용도</th><th class="num">실행</th><th class="num">턴</th><th class="num">실행당 주입 글자 (부담)</th><th class="num">차단 (적중)</th><th class="num">위반 보고 건 (적중)</th></tr></thead><tbody>
${h.items.map(i => `<tr><td><code>${esc(i.name)}</code></td><td class="muted">${esc(purposeOf('Hook', i.name))}</td><td class="num">${i.runs}</td><td class="num">${i.turns}</td><td class="num">${f0(i.chars_per_run)}</td><td class="num">${i.cancelled}</td><td class="num">${i.violations}</td></tr>`).join('\n')}
</tbody></table>`
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>5종 도구 이용효율 — 산출(완료 × 작업량) ÷ 투입(시간·비용·시도), 사용 시 vs 미사용 시</title>
<style>
:root{--bg:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:${C.grid};--w:${C.with};--o:${C.ctrl};--good:${C.good};--bad:${C.bad};--card:#ffffff}
@media(prefers-color-scheme:dark){:root{--bg:#1a1a19;--ink:#ffffff;--ink2:#c3c2b7;--grid:${C.gridD};--w:#3987e5;--o:#d95926;--good:${C.goodD};--bad:${C.badD};--card:#222221}}
*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.5 "Nanum Gothic","Malgun Gothic",system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px}h3{font-size:15px;margin:0 0 6px}small{color:var(--ink2);font-weight:400}
.meta{color:var(--ink2);font-size:13px}.formula{margin:10px 0 18px;padding:10px 12px;border:1px solid var(--grid);border-radius:6px;font-size:13px;line-height:1.7}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--grid);border-radius:8px;padding:14px}.card.hook{grid-column:1/-1}
.big{font-size:34px;font-weight:700;letter-spacing:-.5px;display:flex;align-items:center;gap:8px}.verdict{font-size:14px;font-weight:600;padding:2px 8px;border:1px solid var(--grid);border-radius:12px;margin-left:4px}
.sub{color:var(--ink2);font-size:12px;margin-bottom:8px}.mini{font-size:12px;color:var(--ink2);margin-top:6px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--grid);flex:none;margin-right:4px}.pos .dot,.pos>.dot{background:var(--good)}.neg .dot,.neg>.dot{background:var(--bad)}
b.pos,td.pos{color:var(--good)}b.neg,td.neg{color:var(--bad)}.muted{color:var(--ink2)}.dim td{opacity:.6}
.pair{min-width:180px}.row{display:grid;grid-template-columns:38px 1fr auto;gap:6px;align-items:center;font-size:12px;margin:2px 0}.lab{color:var(--ink2)}.track{height:9px;background:var(--grid);border-radius:2px;overflow:hidden}.bar{height:100%}.bar.w{background:var(--w)}.bar.o{background:var(--o)}.bar.pos{background:var(--good)}.bar.neg{background:var(--bad)}.axes .val{min-width:62px;text-align:right}.val{font-variant-numeric:tabular-nums;color:var(--ink2)}
.hgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:6px 0}.hnum{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}.hlab{font-size:12px;color:var(--ink2)}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:6px 8px;border-bottom:1px solid var(--grid);text-align:left;vertical-align:middle}th{color:var(--ink2);font-weight:600;white-space:nowrap}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}code{font-size:12px}
.legend{display:flex;gap:16px;font-size:12px;color:var(--ink2);margin:8px 0 16px;flex-wrap:wrap}.legend i{display:inline-block;width:14px;height:9px;margin-right:4px;vertical-align:middle}
.note{margin-top:28px;padding:12px;border:1px solid var(--grid);border-radius:6px;font-size:13px}.note li{margin:3px 0}details{margin:6px 0 10px}summary{cursor:pointer;color:var(--ink2);font-size:13px}
</style></head><body>
<h1>5종 도구 이용효율 — 산출(완료 × 작업량) ÷ 투입(시간·비용·시도), 사용 시 vs 미사용 시</h1>
<div class="meta">세션 ${result.sessions}개 · 턴 ${result.turns}개(도구 미사용 기준 턴 ${result.ctrl_turns}개, 기준 유효율 ${fp(result.ctrl.valid_rate)}) · ${result.range.from} ~ ${result.range.to} · 생성 ${new Date(result.generated_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })} KST</div>
<div class="formula"><b>산출</b> : 완료 = 다음 <u>사람</u> 프롬프트가 정정이 아님 &nbsp;·&nbsp; 작업량 = 턴의 도구 호출 수 &nbsp;·&nbsp; <b>유효 작업량 = 완료 × 작업량</b><br>
<b>투입 3축</b> : 작업 시간(인접 메시지 간격 ${result.active_gap_min}분 이하만 합산) &nbsp;·&nbsp; 비용(USD, 단가 없는 모델 턴 제외) &nbsp;·&nbsp; 시도(오류 호출 ÷ 호출 수)<br>
<b>효율(%)</b> = 같은 층(카테고리 × 호출 수 구간 ${result.buckets.join('/')}) 안에서 (사용 − 기준) ÷ 기준 × 100 &nbsp;·&nbsp; 완료 효율 = 완료율 · 시간 효율 = 유효 작업량/분 · 비용 효율 = 유효 작업량/USD · 시도 효율 = 헛호출 비중(낮을수록 좋음) &nbsp;·&nbsp; <b>throughput</b> = 완료 턴당 유효 작업량(카테고리 층만, 절대 작업량)<br>
<b>판정</b> : 완료·시간·비용 3축 중 2축 이상 +10% → 좋음(어느 축도 −25% 이하 아닐 때) · 2축 이상 −10% → 나쁨 · 엇갈린 축은 이름으로 표기 &nbsp;·&nbsp; <b>기준 턴</b> = 5종 도구를 하나도 쓰지 않은 턴, 기준 턴 ${MIN_N}개 이상인 층만 사용 턴 구성비로 재가중<br>
<b>정정 판정 어휘</b> (다음 사람 프롬프트에 포함되면 재작업) : <code>${REWORK_WORDS.join(' · ')}</code> &nbsp;·&nbsp; 백그라운드 알림·타 세션 메시지·스킬 본문 주입은 사람 프롬프트가 아니므로 턴을 나누지 않고 판정에서도 건너뜀 &nbsp;·&nbsp; 정의 문서 <code>docs/TOOL_EFFICIENCY_METRICS.md</code></div>
<div class="legend"><span><i style="background:var(--w)"></i>사용 턴</span><span><i style="background:var(--o)"></i>기준 턴(도구 미사용)</span><span><span class="dot" style="background:var(--good)"></span>좋음(완료·시간·비용 중 2축 +10% 이상)</span><span><span class="dot" style="background:var(--bad)"></span>나쁨(2축 −10% 이하)</span><span><span class="dot"></span>차이 없음</span></div>
<div class="cards">${result.kinds.map(card).join('\n')}
${hookCard(result.hook)}</div>
${result.kinds.map(table).join('\n')}
${hookTable(result.hook)}
<div class="note"><b>읽는 법·주의</b><ul>
<li>효율은 산출 ÷ 투입이므로 산출(완료 × 작업량)을 먼저 정의하고 투입을 시간·비용·시도 3축으로 나눠 따로 보고한다. 축을 하나로 합친 점수로 좋고 나쁨을 정하지 않는다. 오류가 있어도 회복해서 끝낸 턴은 완료로 보고, 오류 호출은 시도 축(투입)에 계상한다.</li>
<li>같은 층(카테고리 × 호출 수 구간)끼리 비교하는 이유 : 호출이 많은 턴일수록 오류·정정이 생길 확률이 커서, 규모를 맞추지 않으면 큰 작업에 쓰이는 도구가 구조적으로 불리해진다. throughput만은 규모를 맞추지 않는다(큰 턴을 가능하게 하는 효과를 재는 지표).</li>
<li>v1(유효 턴 = 오류 0 AND 정정 아님, 카테고리 층만)과 판정이 다른 항목은 "v1 유효율 효율 (대조)" 열로 확인한다. v1에서는 스킬 본문 주입 메시지가 턴을 둘로 갈라 스킬 턴이 호출 1회짜리 작은 턴으로 집계되었다.</li>
<li>"사용 턴"은 그 도구가 한 번이라도 호출된 사용자 프롬프트 단위. "기준 턴"은 5종 도구를 하나도 쓰지 않은 턴이며, 다른 도구를 쓴 턴은 그 도구의 사용 턴이므로 기준에 넣지 않는다.</li>
<li>카테고리(FEATURE·FIX·GIT·DOCS 등)는 작업 이력 로거와 같은 규칙으로 프롬프트에서 분류. 기준 턴이 ${MIN_N}개 미만인 카테고리는 비교에서 제외한다("비교 반영" 열 = 실제 비교에 들어간 사용 턴 수).</li>
<li>정정 판정은 어휘 규칙이라 오탐·미탐이 있다(예: 새 요청에 "다시"가 들어간 경우). 위 어휘 목록은 <code>scripts/tooldash/efficiency_compare.mjs</code>의 REWORK_WORDS에서 조정한다. 세션의 마지막 턴은 다음 프롬프트가 없어 정정 없음으로 본다.</li>
<li>음수는 "그 도구를 쓴 턴이 같은 층의 기준 턴보다 그 축에서 뒤졌다"는 뜻이다. 도구 자체의 결함일 수도, 이 프로젝트에서 쓰는 방식의 문제일 수도 있으므로 항목별 표에서 어느 도구·층인지 확인한다. 관측 자료이므로 상관이며 인과가 아니다. 비용 축은 단가가 등록된 모델 턴만으로 계산한다(단가 있는 턴 수를 카드에 병기).</li>
<li>서브에이전트 토큰·비용·오류는 시각이 속한 부모 턴에 합산했다. 비용은 claude.com/pricing 공표 단가 기준 추정. 원천·산식 : <code>efficiency_compare.mjs</code> → <code>efficiency_compare.json</code> · 턴 원자료 <code>efficiency_turns.json</code></li>
</ul></div>
</body></html>`
fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true })
fs.writeFileSync(OUT_HTML, html)
console.log(`턴 ${result.turns} (세션 ${result.sessions}, ${result.range.from}~${result.range.to}) · 기준 턴 ${CTRL.length} (유효율 ${fp(result.ctrl.valid_rate)}) → ${OUT_JSON}\n→ ${OUT_HTML}`)
const fe = v => v == null ? '-' : (v > 0 ? '+' : '') + v + '%'
for (const k of result.kinds) console.log(`${k.kind.padEnd(7)} 사용 ${String(k.n_with).padStart(4)} (반영 ${String(k.covered).padStart(4)}) · ${k.ok ? `${k.verdict}${k.off.length ? '(' + k.off.join('·') + ' 반대)' : ''} · 완료 ${fe(k.eff.delivered)} · 시간 ${fe(k.eff.time)} · 비용 ${fe(k.eff.cost2)} · 시도 ${fe(k.eff.attempt)} · throughput ${fe(k.eff.throughput)} · v1 유효율 ${fe(k.eff.valid)}` : '표본 부족'}`)
console.log(`Hook    실행 ${HOOK.runs} · 커버 ${fp(HOOK.coverage)} · 턴당 주입 ${f0(HOOK.chars_per_turn)}자 · 차단 ${HOOK.cancelled} · 위반 보고 ${HOOK.violations}건`)
