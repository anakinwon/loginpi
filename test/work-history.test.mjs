// work-history 회귀 테스트 — node:test (pnpm test). 합성 transcript 로 로거를 spawn 하고, 집계 순수 함수를 직접 검증한다.
// 격리: WORK_HISTORY_DIR / WORK_HISTORY_STATE_DIR 를 임시 폴더로, 세션 ID 는 테스트마다 무작위.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { aggregate, tokensStats, perfStats, loadRows, isoWeek, kpiView } from '../scripts/work-history-stats.mjs'
import { categorize, costUsd, makeRedactor, METRICS, KPI_TREE, evaluateSlo } from '../scripts/work-history-core.mjs'

test('metric registry: every KPI tree key is defined, and SLO evaluation flags breaches', () => {
  for (const keys of Object.values(KPI_TREE)) for (const k of keys) assert.ok(METRICS[k], `registry missing ${k}`)
  const al = evaluateSlo({ cost_per_delivered: 9, ttft_p90_ms: 10000, correction_rate: 0.1, ctx_growth: 8, tools: 10, error_rate: 0.5 })
  const by = Object.fromEntries(al.map(a => [a.metric, a.status]))
  assert.equal(by.cost_per_delivered, 'WARN'); assert.equal(by.ttft_ms, 'ok'); assert.equal(by.correction_rate, 'ok'); assert.equal(by.ctx_growth, 'WARN'); assert.equal(by.error_rate, 'n<50')
  const rows = [{ id: 'a:1.1', date: '2026-09-20', hour: 6, weekday: 'Sun', session: 'a', turn: 1, part: 1, category: 'FEATURE', tags: ['FEATURE'], ts_req: '2026-09-20T06:00:00+09:00', elapsed_ms: 60000, tools_total: 2, tool_errors: 0, files_changed: 1, tokens: { api_calls: 2, input: 100, cache_read: 9000, cache_create: 900, output: 600, thinking: 100, context: 10000, cache_hit: 0.9 }, perf: { tool_ms: 20000, hook_ms: 0 }, steps: [], cost_usd: 1, cost_agents_usd: 3, agents_detail: [{ cost_usd: 3, wall_ms: 5000 }], agent_parallelism: 1, skills: [], mcp: [], agents: [] }]
  const k = kpiView(rows)
  assert.equal(k.values.cost_total_usd, 4); assert.equal(k.values.cost_per_delivered, 4); assert.equal(k.values.agent_cost_share, 0.75); assert.equal(k.tree.L0[0].metric, 'cost_per_delivered')
})

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOGGER = path.join(ROOT, '.claude', 'hooks', 'work-history-logger.mjs')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wh-test-'))
const sid = () => 'test-' + Math.random().toString(36).slice(2, 10)

// ── 합성 transcript 빌더 ─────────────────────────────────────────────────────
const T0 = Date.parse('2026-09-20T01:00:00.000Z')
const iso = ms => new Date(T0 + ms).toISOString()
const user = (text, ms) => ({ type: 'user', message: { role: 'user', content: text }, timestamp: iso(ms), promptId: 'p' })
const asst = (blocks, ms, { requestId = 'req-' + ms, usage = null } = {}) => ({ type: 'assistant', requestId, message: { model: 'claude-fable-5-1', content: blocks, usage: usage || { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100, output_tokens: 50, output_tokens_details: { thinking_tokens: 5 } } }, timestamp: iso(ms) })
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input })
const toolResult = (id, ms, ok = true) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, ...(ok ? {} : { is_error: true }) }] }, timestamp: iso(ms) })
const turnDuration = (ms, dur) => ({ type: 'system', subtype: 'turn_duration', durationMs: dur, timestamp: iso(ms) })
const stopSummary = (ms) => ({ type: 'system', subtype: 'stop_hook_summary', hookInfos: [{ command: 'x', durationMs: 120 }, { command: 'y', durationMs: 80 }], timestamp: iso(ms) })
const jsonl = arr => arr.map(o => JSON.stringify(o)).join('\n') + '\n'

function runLogger(env, input) { return spawnSync(process.execPath, [LOGGER], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' }) }
function setup() { const dir = tmp(); return { dir, env: { WORK_HISTORY_DIR: path.join(dir, 'wh'), WORK_HISTORY_STATE_DIR: path.join(dir, 'state'), WORKSPACE_ROOT: 'C:/ws' }, transcript: path.join(dir, 't.jsonl') } }
const readRecords = env => { const f = path.join(env.WORK_HISTORY_DIR, '2026', '09', '2026-09-20.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [] }

// ── 1. 집계 순수 함수 ────────────────────────────────────────────────────────
test('tokensStats sums cache_read and computes cache_hit across turns; ratios use timed rows only', () => {
  const rows = [
    { id: 'a:1.1', date: '2026-09-20', hour: 6, weekday: 'Sun', session: 'a', turn: 1, part: 1, category: 'FEATURE', tags: ['FEATURE'], ts_req: '2026-09-20T06:00:00+09:00', elapsed_ms: 60000, tools_total: 2, tool_errors: 0, tokens: { api_calls: 2, input: 100, cache_read: 9000, cache_create: 900, output: 600, thinking: 0, context: 10000, cache_hit: 0.9 }, perf: { tool_ms: 20000, hook_ms: 0 }, steps: [], cost_usd: 0.05, skills: [], mcp: [], agents: [] },
    { id: 'a:2.1', date: '2026-09-20', hour: 7, weekday: 'Sun', session: 'a', turn: 2, part: 1, category: 'FEATURE', tags: ['FEATURE'], ts_req: '2026-09-20T07:00:00+09:00', elapsed_ms: null, absorbed: true, tools_total: 3, tool_errors: 1, tokens: { api_calls: 1, input: 0, cache_read: 1000, cache_create: 0, output: 9000, thinking: 0, context: 1000, cache_hit: 1 }, perf: { tool_ms: 5000, hook_ms: 0 }, steps: [], cost_usd: 0.01, skills: [], mcp: [], agents: [] },
  ]
  const tk = tokensStats(rows)
  assert.equal(tk.total.cache_read, 10000); assert.equal(tk.total.output, 9600); assert.equal(tk.total.cost_usd, 0.06)
  assert.equal(tk.total.cache_hit, +(10000 / 11000).toFixed(4))
  const pf = perfStats(rows)
  assert.equal(pf.total.n_timed, 1)
  assert.equal(pf.total.out_tps, 10)                        // 600 tok / 60 s — 흡수 행의 9000 tok 은 비율에 들어가지 않는다
  assert.equal(pf.total.tool_share, +(20000 / 60000).toFixed(3))
  assert.equal(aggregate(rows).total.elapsed_ms, 60000)      // 합계 소요도 timed 만
})

test('isoWeek: year boundary (2027-01-01 belongs to 2026-W53)', () => {
  assert.equal(isoWeek('2026-09-20').key, '2026-W38')
  assert.equal(isoWeek('2027-01-01').key, '2026-W53')
  assert.equal(isoWeek('2026-09-20').from, '2026-09-14')
})

test('categorize: verbs beat nouns, evidence bonus, negation window, forced tag', () => {
  assert.equal(categorize('결제 완료 페이지 만들어줘').category, 'FEATURE')
  assert.equal(categorize('기록 훅 만들어서 등록해줘').category, 'CONFIG')            // 설정 동사(등록) + 훅 명사 > 생성 동사
  assert.equal(categorize('커밋하고 푸시해줘').category, 'GIT')
  assert.equal(categorize('통계 파일을 생성하고 그래프도 그려줘! 저장위치: c:\\Users\\x\\sql\\work-statistics').category, 'FEATURE')
  assert.equal(categorize('설치하지 말고 어떤 옵션이 있는지만 알려줘').category, 'QUERY')
  assert.equal(categorize('이거 좀 봐줘 #cat:docs').category, 'DOCS')
  assert.equal(categorize('뭔가 해줘', { tools: { Read: 3, Grep: 2 }, descriptions: [] }).category, 'QUERY')
  assert.equal(categorize('통계유형을 몇 가지로 분류해서 로그파일 및 통계파일을 재구성해줘', { tools: { Write: 3 }, descriptions: [] }).category, 'REFACTOR')   // 동사가 명사+증거를 이긴다
  assert.equal(categorize('항상 내가 작업을 요청하면 최적의 방법으로 수행해줘', { tools: { Read: 2 }, descriptions: [] }).category, 'CONFIG')
  assert.equal(categorize('MCP 서버는 (m)으로 구분해줘', { tools: { Bash: 2 }, descriptions: ['Test the hook with synthetic events'] }).category, 'CONFIG')   // 설명문의 "test" 는 증거가 아니다
})

test('costUsd uses per-model pricing and does not double count thinking', () => {
  const t = { input: 1_000_000, cache_read: 0, cache_create: 0, output: 1_000_000, thinking: 900_000 }
  assert.equal(costUsd(t, 'claude-fable-5-1', { cache1h: false }), 60)
  assert.equal(costUsd(t, 'unknown-model'), null)
})

test('redactor masks workspace/home/temp paths, UUIDs, and secret-looking values', () => {
  const r = makeRedactor({ workspaceRoot: 'C:/ws' })
  const out = r(`file C:\\ws\\loginpi\\a.ts and ${os.homedir()}\\x and sid cac775a4-735f-4568-8439-9ace1b46e578 KEY=abcdefghijklmnop token: sk-ant-abcdefghijklmnopqrstuvwxyz`)
  assert.match(out, /\$WORKSPACE_ROOT[\\/]loginpi/); assert.match(out, /\$HOME/); assert.match(out, /\$UUID/)
  assert.doesNotMatch(out, /abcdefghijklmnop|sk-ant-abc/)
  assert.match(out, /KEY=\[REDACTED\]/)
})

// ── 2. 로거 spawn 테스트 ─────────────────────────────────────────────────────
test('logger dedupes usage when two streamed chunks share the same requestId', () => {
  const { env, transcript } = setup(); const s = sid()
  fs.writeFileSync(transcript, jsonl([
    user('작업 해줘', 0),
    asst([{ type: 'text', text: '시작합니다' }], 1000, { requestId: 'r1' }),
    asst([toolUse('t1', 'Bash', { description: 'ls' })], 1100, { requestId: 'r1' }),   // 같은 API 호출의 두 블록 — usage 동일
    toolResult('t1', 2000),
    asst([{ type: 'text', text: '끝났습니다' }], 3000, { requestId: 'r2' }),
  ]))
  const res = runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  assert.equal(res.status, 0); assert.equal(res.stdout, '')
  const recs = readRecords(env).filter(r => !r.fix)
  assert.equal(recs.length, 1)
  assert.equal(recs[0].tokens.api_calls, 2)                  // r1 은 1회만, r2 1회
  assert.equal(recs[0].tokens.output, 100)
  assert.equal(recs[0].id, `${s}:1.1`); assert.equal(recs[0].v, 2); assert.equal(recs[0].model, 'claude-fable-5-1')
  assert.equal(recs[0].tools_total, 1); assert.equal(recs[0].steps[0].ms, 900)
})

test('logger is idempotent on replay and records late perf fixes on the next Stop', () => {
  const { env, transcript } = setup(); const s = sid()
  const base = [user('첫 요청', 0), asst([{ type: 'text', text: '답' }], 1000, { requestId: 'r1' })]
  fs.writeFileSync(transcript, jsonl(base))
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })          // 새 줄 없음
  assert.equal(readRecords(env).length, 1)
  fs.appendFileSync(transcript, jsonl([stopSummary(1500), turnDuration(1600, 1234), user('둘째 요청', 5000), asst([{ type: 'text', text: '답2' }], 6000, { requestId: 'r2' })]))
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  const all = readRecords(env)
  const fixes = all.filter(r => r.fix); const turns = all.filter(r => !r.fix)
  assert.equal(turns.length, 2)
  assert.ok(fixes.some(f => f.id === `${s}:1.1` && f.perf.turn_duration_ms === 1234))
  assert.ok(fixes.some(f => f.id === `${s}:1.1` && f.perf.hook_ms === 200))
  const merged = loadRows({ root: env.WORK_HISTORY_DIR })                                             // 집계 로드 시 병합
  assert.equal(merged.find(r => r.turn === 1).perf.turn_duration_ms, 1234)
  assert.equal(merged.find(r => r.turn === 1).perf.hook_ms, 200)
})

test('logger holds back an incomplete trailing line instead of dropping it', () => {
  const { env, transcript } = setup(); const s = sid()
  const full = jsonl([user('요청', 0), asst([{ type: 'text', text: '답' }], 1000, { requestId: 'r1' })])
  fs.writeFileSync(transcript, full.slice(0, -20))                                                  // 마지막 줄이 잘린 채 flush 중
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  assert.equal(readRecords(env).length, 0)
  fs.writeFileSync(transcript, full)                                                                 // 완성
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  assert.equal(readRecords(env).filter(r => !r.fix).length, 1)
})

test('late turn_duration goes to the open part, not the previously emitted one', () => {
  const { env, transcript } = setup(); const s = sid()
  fs.writeFileSync(transcript, jsonl([
    user('요청', 0),
    asst([{ type: 'text', text: '1차 답' }], 1000, { requestId: 'r1' }),
    stopSummary(1500), turnDuration(1600, 63000),                                                   // 파트 1 의 값 — 경계 전에 도착
    user('<command-name>/diff</command-name>', 5000),                                               // 경계 → 파트 1 방출 (td=63000)
    asst([{ type: 'text', text: '2차 답' }], 6000, { requestId: 'r2' }),
    stopSummary(6500), turnDuration(6600, 7000),                                                    // 파트 2 의 값 — 파트 2 는 아직 미방출(open)
  ]))
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  const rows = loadRows({ root: env.WORK_HISTORY_DIR }).sort((a, b) => a.part - b.part)
  assert.deepEqual(rows.map(r => r.perf.turn_duration_ms), [63000, 7000])
  assert.deepEqual(rows.map(r => r.perf.hook_ms), [200, 200])
})

test('subagent transcripts are attributed to the dispatching turn by name and costed', () => {
  const { dir, env, transcript } = setup(); const s = sid()
  fs.writeFileSync(transcript, jsonl([
    user('평가해줘', 0),
    asst([toolUse('t1', 'Agent', { subagent_type: 'scientist', name: 'eval-x', description: 'x', prompt: 'p' })], 500, { requestId: 'r1' }), toolResult('t1', 900),
    asst([{ type: 'text', text: '위임 완료' }], 3000, { requestId: 'r2' }),
  ]))
  const sub = path.join(dir, s, 'subagents'); fs.mkdirSync(sub, { recursive: true })
  fs.writeFileSync(path.join(sub, 'agent-aeval-x-abc123.meta.json'), JSON.stringify({ agentType: 'scientist', name: 'eval-x', model: 'claude-sonnet-5', customAgentType: 'scientist', teamName: 'default' }))
  fs.writeFileSync(path.join(sub, 'agent-aeval-x-abc123.jsonl'), jsonl([
    { type: 'user', agentId: 'aeval-x-abc123', isSidechain: true, message: { role: 'user', content: 'p' }, timestamp: iso(1000) },
    { type: 'assistant', agentId: 'aeval-x-abc123', isSidechain: true, requestId: 'a1', message: { model: 'claude-sonnet-5', content: [toolUse('u1', 'Read', { file_path: 'a' })], usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 2000 } }, timestamp: iso(1500) },
    { type: 'user', agentId: 'aeval-x-abc123', isSidechain: true, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'u1', is_error: true }] }, timestamp: iso(1800) },
    { type: 'assistant', agentId: 'aeval-x-abc123', isSidechain: true, requestId: 'a2', message: { model: 'claude-sonnet-5', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1000 } }, timestamp: iso(11000) },
  ]))
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  const rows = loadRows({ root: env.WORK_HISTORY_DIR })
  assert.equal(rows.length, 1)
  const a = rows[0].agents_detail; assert.ok(a && a.length === 1)
  assert.equal(a[0].name, 'eval-x'); assert.equal(a[0].model, 'claude-sonnet-5'); assert.equal(a[0].tools, 1); assert.equal(a[0].errors, 1); assert.equal(a[0].wall_ms, 10000)
  assert.equal(a[0].tokens.output, 3000)
  assert.equal(a[0].cost_usd, +((1000 * 2 + 3000 * 10) / 1e6).toFixed(4))                 // sonnet 5: $2 in / $10 out per M
  assert.equal(rows[0].cost_agents_usd, a[0].cost_usd)
  assert.equal(aggregate(rows).total.cost_total_usd, +(rows[0].cost_usd + a[0].cost_usd).toFixed(4))
})

test('continuation parts are deltas, not cumulative snapshots', () => {
  const { env, transcript } = setup(); const s = sid()
  fs.writeFileSync(transcript, jsonl([
    user('요청', 0),
    asst([toolUse('t1', 'Bash', { description: 'a' })], 500, { requestId: 'r1' }), toolResult('t1', 900),
    asst([{ type: 'text', text: '1차 답' }], 1000, { requestId: 'r2' }),
    user('<command-name>/diff</command-name>', 2000),                                               // 로컬 명령 = 응답 경계
    asst([toolUse('t2', 'Bash', { description: 'b' })], 3000, { requestId: 'r3' }), toolResult('t2', 3400),
    asst([{ type: 'text', text: '2차 답' }], 4000, { requestId: 'r4' }),
  ]))
  runLogger(env, { session_id: s, hook_event_name: 'Stop', transcript_path: transcript })
  const recs = readRecords(env).filter(r => !r.fix).sort((a, b) => a.part - b.part)
  assert.equal(recs.length, 2)
  assert.deepEqual(recs.map(r => r.part), [1, 2])
  assert.deepEqual(recs.map(r => r.tokens.api_calls), [2, 2])
  assert.deepEqual(recs.map(r => r.tools_total), [1, 1])
  assert.equal(recs[1].elapsed_ms, 2000)                     // 경계(2000) → 2차 답(4000)
})
