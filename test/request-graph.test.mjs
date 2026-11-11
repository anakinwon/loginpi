// request-graph 매핑 순수 함수 회귀 시험 : 턴 + agent 레코드 + Codex 루프 → 노드 상태·시간 쌍·회차, 상태 색 대비, 깜빡임 CSS
// 실행 : pnpm test (node:test)
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { buildRequestGraph, buildPath, pathLog, agentsOf, mergeParts, partBase, codexChips, groupTools, toolEventsOf, cleanPrompt, linkContext, loadSummary, summaryId, promptsOf, PAIRS, notY, layoutTree, termPos, matePos, loopRounds, roundSummary, fmtSpan, designGraph, safeName, renderHtml, writeSlotMd, writeRequestMd, harnessTouched, loadAgentHarness, HARNESS_RE, serial, agentRounds, splitAgentRounds, nodeAlerts, engTxt, codexNo, loadWorkflowAgents, ALERT, SLOTS, SLOT_MAP, isLoopLedger, TURN_ID_RE, loadLoops, ENG_SLOTS, STATUS_STYLE, PAGE_BG, CODEX_STYLE, KIND_STYLE } from '../scripts/request-graph.mjs'

const T0 = '2026-11-08T10:00:00+09:00', T1 = '2026-11-08T10:30:00+09:00', P = Date.parse
const turn = (extra = {}) => ({ ts_req: T0, ts_res: T1, req_head: '요청', ...extra })
const ag = (type, start, extra = {}) => ({ type, model: 'claude-opus-5-5', ts_start: start, ts_end: start, wall_ms: 1000, cost_usd: 0.1, errors: 0, ...extra })
const loop = (id, events, extra = {}) => ({ id, events, ...extra })
const AL = ns => [...ns, ...agentsOf(ns)]   // 칸 + 칸에 묶인 에이전트 실행(2026-11-10 : 에이전트는 독립 노드가 아님)
const node = (ns, id) => AL(ns).find(n => n.id === id)
const NONE = {}   // 빈 매핑 : 설계 슬롯은 모두 미배정

// 서브에이전트 기록 조각 : 전달(teammate-message 문자열) · 시스템 알림 메타 · 도구 결과(오류) · end_turn
const rec = {
  give: (ts, s = '<teammate-message teammate_id="team-lead" summary="재작업">…</teammate-message>') => ({ type: 'user', timestamp: ts, message: { role: 'user', content: s } }),
  meta: ts => ({ type: 'user', isMeta: true, timestamp: ts, message: { role: 'user', content: '<system-reminder> 다른 에이전트 목록 </system-reminder>' } }),
  err: ts => ({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content: 'fail' }] } }),
  ok: ts => ({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'y', content: 'ok' }] } }),
  end: ts => ({ type: 'assistant', timestamp: ts, message: { stop_reason: 'end_turn', content: [] } }),
  hook: ts => ({ type: 'attachment', timestamp: ts, attachment: { type: 'hook_success', hookEvent: 'PostToolUse' } }),
}
const Z = s => `2026-11-08T${s}:00Z`
const spawnSyncGit = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' })
// codex-gate 상태 루트 격리(귀속 기록·기준선) — 이 파일의 시험이 실제 .omc/state 를 쓰지 않게(codex-gate 는 시험 안에서 동적 import)
process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'rg-state-'))

test('결함 ①② agentRounds : 전달마다 1회차(알림·도구 결과 제외), 회차 끝 = end_turn, 회차별 도구 오류, 끝 뒤 훅 기록은 진행으로 안 봄', () => {
  const rs = [rec.give(Z('01:00')), rec.meta(Z('01:00')), rec.err(Z('01:05')), rec.ok(Z('01:06')), rec.end(Z('01:10')), rec.give(Z('01:20')), rec.err(Z('01:21')), rec.err(Z('01:22')), rec.end(Z('01:30')), rec.hook(Z('01:30'))]
  assert.deepEqual(agentRounds(rs), [{ t0: P(Z('01:00')), t1: P(Z('01:10')), run: false, errors: 1 }, { t0: P(Z('01:20')), t1: P(Z('01:30')), run: false, errors: 2 }])
  const open = [...rs, rec.give(Z('01:40'), '지금 진행중인 프로세스가 왜 안 보이지?'), rec.ok(Z('01:41'))]   // 마스터가 팀원 창에 직접 쓴 글도 전달
  assert.deepEqual(agentRounds(open).at(-1), { t0: P(Z('01:40')), t1: null, run: true, errors: 0 })
  assert.equal(agentRounds(open, { alive: false }).at(-1).run, false)   // 오래 안 바뀐 기록 = 진행 아님(종료 기록 없음)
})

test('결함 ① 작업 묶음 : 지속 에이전트 회차를 요청별로 나누고(누적 번호), 묶음 누적 N/5 · 4 이상 상한 근접 · 5 이상 상한 도달', () => {
  const mk = n => {   // 요청 A(01:00) 에 build 회차 1·2, 요청 B(02:00) 에 회차 3..n
    const rounds = [...Array(n)].map((_, i) => ({ t0: P(Z(i < 2 ? `01:${10 + i * 10}` : `02:${10 + i * 5}`)), t1: P(Z(i < 2 ? `01:${15 + i * 10}` : `02:${12 + i * 5}`)), run: false, errors: 1 }))
    const A = { key: 'A', session_id: 's', ts_req: Z('01:00'), ts_res: Z('01:50'), agents_detail: [ag('general-purpose', Z('01:10'), { agent_id: 'abuild', ts_end: Z('02:59'), cost_usd: 3, rounds })] }
    const B = { key: 'B', session_id: 's', ts_req: Z('02:00'), ts_res: Z('02:59'), agents_detail: [] }, C = { key: 'C', session_id: 'other', ts_req: Z('02:05'), ts_res: Z('02:06') }
    splitAgentRounds([B, C, A]); return { A, B, C }
  }
  const { A, B, C } = mk(4)
  assert.deepEqual(A.bundle, { size: 2, n: 4, agents: ['general-purpose'] }); assert.deepEqual(B.bundle, A.bundle); assert.equal(C.bundle, undefined)
  const a = A.agents_detail[0], b = B.agents_detail[0]
  assert.equal(a.rounds.length, 2); assert.equal(a.ts_end, new Date(P(Z('01:25'))).toISOString()); assert.equal(a.errors, 2); assert.equal(a.cost_usd, 3)
  assert.equal(b.cont, true); assert.equal(b.roundBase, 2); assert.equal(b.rounds.length, 2); assert.equal(b.cost_usd, null)
  const nb = buildRequestGraph(B, []), bn = agentsOf(nb)[0]
  assert.deepEqual(bn.rounds[0].rows.map(r => r.label), ['3회차', '4회차']); assert.equal(bn.rounds[0].base, 2)
  assert.deepEqual(node(nb, '1').cum, { n: 4, size: 2, cap: 5, level: '상한 근접' })
  assert.match(node(nb, '1').lines[1], /^묶음 누적 4\/5 — 지속 에이전트\(general-purpose\)로 이어진 요청 2건 · 상한 근접/)
  assert.ok(nb.every(n => n.slot) && bn.parent === '1.1')   // 에이전트 = 칸 안(독립 노드 아님)
  assert.ok(node(nb, '1.1').chips.some(c => c.txt.startsWith('general-purpose ×2 (3~4회차·회송 1)')))   // 이어받은 회차 = 누적 번호
  assert.deepEqual(pathLog(nb).filter(e => e.id === bn.id).map(e => e.lab), ['재작업 3회차 (3/5)', '재작업 4회차 (4/5)'])   // 시각순 실행 기록에 회차 라벨 보존
  assert.equal(node(buildRequestGraph(mk(5).A, []), '1').cum.level, '상한 도달')
  const solo = node(buildRequestGraph(turn({ agents_detail: [ag('general-purpose', '2026-11-08T10:01:00+09:00')] }), []), '1')   // 지속 에이전트 없음 = 요청 단위
  assert.deepEqual(solo.cum, { n: 0, size: 1, cap: 5 }); assert.match(solo.lines[1], /요청 단위/)
  const html = renderHtml({ design: false, outDir: '.', requests: [], meta: '' })
  assert.match(html, /\.badge\.alert\{color:#b42f2f;border:2px solid #d03b3b/); assert.match(html, /"alert":\{"longMs":1800000,"errors":5,"nearCap":4,"cap":5\}/)
  for (const d of [false, true]) assert.ok(!renderHtml({ design: d, outDir: '.', requests: [], meta: '' }).includes('지나감(실선)'))   // 흐름선 범례 문구 삭제(마스터 2026-11-11)
  for (const d of [false, true]) assert.ok(renderHtml({ design: d, outDir: '.', requests: [], meta: '' }).includes('id="dtog" aria-controls="detail" aria-expanded="true"'))   // 노드 상세 접기 토글(두 판)
})

test('판 간 링크 : 설계도판 → 실시간 모니터링판(상대경로·로컬 생성 안내), 실데이터판 → 설계도판', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), html = (design, dir) => renderHtml({ design, outDir: path.join(root, dir), requests: [], meta: '' })
  assert.ok(html(true, '.claude/engineering/50. graph').includes('<a href="../../../work-statistics/mywork/myRequestGraph.html">실시간 모니터링판 열기</a> <span class="muted">(로컬 생성 후 열림)</span>'))
  assert.ok(html(false, 'work-statistics/mywork').includes('<a href="../../.claude/engineering/50.%20graph/myRequestGraph.html">설계도판 열기</a>'))
})

test('시간 쌍 글자 : 완료·진행 중(now 까지 경과)·값 없음', () => {
  const t0 = P('2026-11-08T10:00:00+09:00'), t1 = P('2026-11-08T10:08:39+09:00')
  assert.equal(fmtSpan({ t0, t1, run: false }, 0), '시작 11-08 10:00:00 ~ 종료 10:08:39 (소요 8m 39s)')
  assert.equal(fmtSpan({ t0, t1, run: false }, 0, true), '10:00:00~10:08:39 · 8m39s')
  assert.equal(fmtSpan({ t0, t1: null, run: true }, t0 + 65e3), '시작 11-08 10:00:00 ~ 종료 진행 중 (소요 1m 5s)')
  assert.equal(fmtSpan({ t0: null, t1: null, run: false }, 0), '시작 — ~ 종료 —')
  assert.equal(fmtSpan({ t0, t1: P('2026-11-09T01:00:00+09:00'), run: false }, 0), '시작 11-08 10:00:00 ~ 종료 11-09 01:00:00 (소요 900m 0s)')
})

test('Codex 루프 회차 누적 : iters 3개 → 3행(시작 = startedAt·직전 at), 합계 3회, 잠금 있으면 진행 행 추가', () => {
  const L = loop('L', [{ iter: 1, at: '2026-11-08T01:05:00Z', verdict: 'FAIL', open: 3 }, { iter: 3, at: '2026-11-08T01:25:00Z', verdict: 'PASS', open: 0 }, { iter: 2, at: '2026-11-08T01:15:00Z', verdict: 'FAIL', open: 1 }], { startedAt: '2026-11-08T01:00:00Z' })
  const rows = loopRounds(L, P(T0), P(T1))
  assert.deepEqual(rows.map(r => r.label), ['1회차', '2회차', '3회차'])
  assert.deepEqual(rows.map(r => r.t0), [P('2026-11-08T01:00:00Z'), P('2026-11-08T01:05:00Z'), P('2026-11-08T01:15:00Z')])
  assert.deepEqual(roundSummary(rows, 0), { n: 3, totalMs: 25 * 60e3 })
  const run = loopRounds({ ...L, running: true }, P(T0), P(T1))
  assert.equal(run.length, 4); assert.equal(run[3].label, '4회차'); assert.equal(run[3].run, true)
  assert.equal(roundSummary(run, P('2026-11-08T01:27:00Z')).totalMs, 27 * 60e3)
})

test('워크플로 에이전트(2026-11-09) : subagents/workflows/wf_*/ 를 읽어 Workflow 호출 턴에 귀속, 완료 = journal result, 로거 기록과 중복 귀속 없음', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-wf-')), sid = 'sess-1', wf = path.join(dir, sid, 'subagents', 'workflows', 'wf_abc-123')
  fs.mkdirSync(wf, { recursive: true })
  const put = (id, meta, recs) => { fs.writeFileSync(path.join(wf, `agent-${id}.meta.json`), JSON.stringify(meta)); fs.writeFileSync(path.join(wf, `agent-${id}.jsonl`), recs.map(r => JSON.stringify(r)).join('\n') + '\n') }
  const rec = (type, at, extra = {}) => ({ type, timestamp: at, message: { role: type, content: 'x', ...(type === 'assistant' ? { model: 'claude-opus-5-5' } : {}) }, ...extra })
  // 워크플로는 요청 A(Workflow 호출)에서 시작, 요청 B 가 끼어든 뒤 에이전트 시작 — 시간 기준이면 B, 규칙상 A
  put('aB1', { agentType: 'anakin_phase-build', description: 'build-A', workflowPhase: 'Build A' }, [rec('user', '2026-11-08T01:10:00Z'), rec('assistant', '2026-11-08T01:15:00Z')])
  put('aV1', { agentType: 'anakin_phase-verify', description: 'verify-A' }, [rec('user', '2026-11-08T01:16:00Z'), { type: 'user', timestamp: '2026-11-08T01:17:00Z', message: { role: 'user', content: [{ type: 'tool_result', is_error: true }] } }, rec('assistant', '2026-11-08T01:18:00Z')])
  put('aL1', { agentType: 'teamanakin-admin', description: 'admin-A' }, [rec('user', '2026-11-08T01:19:00Z'), rec('assistant', '2026-11-08T01:20:00Z')])
  fs.writeFileSync(path.join(wf, 'journal.jsonl'), ['{"type":"launched"}', '{"type":"result","agentId":"aB1"}', '{"type":"result","agentId":"aV1"}'].join('\n') + '\n')
  const A = { session_id: sid, turn: 1, ts_req: '2026-11-08T01:00:00Z', ts_res: '2026-11-08T01:01:00Z', wfCall: true, agents_detail: [] }
  // B : 로거가 시작 시각 기준으로 흩어 기록한 워크플로 레코드 aL1(workflow 필드·비용 있음) + 워크플로와 무관한 일반 에이전트 레코드 x1
  const B = { session_id: sid, turn: 2, ts_req: '2026-11-08T01:05:00Z', ts_res: '2026-11-08T01:06:00Z', cost_agents_usd: 0.7, agents_detail: [{ agent_id: 'aL1', workflow: 'wf_abc-123', type: 'teamanakin-admin', name: 'admin-A', ts_start: '2026-11-08T01:19:00Z', ts_end: '2026-11-08T01:20:00Z', cost_usd: 0.5 }, { agent_id: 'x1', type: 'anakin_phase-collect', ts_start: '2026-11-08T01:05:30Z', ts_end: '2026-11-08T01:05:50Z', cost_usd: 0.2 }] }
  const now = P('2026-11-09T00:00:00Z'), cacheFile = path.join(dir, 'cache.json')
  assert.deepEqual(loadWorkflowAgents([A, B], dir, { cacheFile, now }), { added: 2, moved: 1 })
  assert.deepEqual(A.agents_detail.map(x => [x.agent_id, x.type, x.name, x.workflow]), [['aL1', 'teamanakin-admin', 'admin-A', 'wf_abc-123'], ['aB1', 'anakin_phase-build', 'build-A', 'wf_abc-123'], ['aV1', 'anakin_phase-verify', 'verify-A', 'wf_abc-123']])
  assert.deepEqual(B.agents_detail.map(x => x.agent_id), ['x1'])   // 일반 에이전트는 그대로, 워크플로 레코드는 중복 없이 이동
  assert.equal(A.cost_agents_usd, 0.5); assert.equal(+B.cost_agents_usd.toFixed(4), 0.2)   // 비용도 함께 이동
  assert.equal(A.agents_detail[1].ts_end, '2026-11-08T01:15:00.000Z'); assert.equal(A.agents_detail[2].errors, 1)
  const ns = buildRequestGraph(A, [], { now })
  assert.ok(ns.every(n => n.slot)); assert.equal(ns[0].agentN, 2); assert.equal(AL(ns).find(n => n.label === 'anakin_phase-build').parent, '1.1'); assert.ok(!AL(ns).some(n => n.label === 'anakin_phase-verify')); assert.equal(AL(ns).find(n => n.label === 'teamanakin-admin').parent, '1.2')   // verify(폐지) 숨김, build 반복 없음 = 2 접수 칸
  // 재실행(캐시 사용)도 같은 결과, 이미 붙은 에이전트는 다시 붙이지 않음
  assert.deepEqual(loadWorkflowAgents([A, B], dir, { cacheFile, now }), { added: 0, moved: 0 }); assert.equal(A.agents_detail.length, 3)
  const A2 = { ...A, agents_detail: [] }, B2 = { ...B, agents_detail: [] }
  assert.deepEqual(loadWorkflowAgents([A2, B2], dir, { cacheFile, now }), { added: 3, moved: 0 }); assert.equal(A2.agents_detail.length, 3)   // 캐시 경로 : 로거 기록 없으면 aL1 도 기록 폴더에서 A 로
  assert.equal(A2.agents_detail.find(x => x.agent_id === 'aL1').ts_end, null)   // journal result 없음 + 오래된 기록 = 종료 기록 없음
  fs.rmSync(dir, { recursive: true, force: true })
})

test('워크플로 정확 매핑 우선(D-001)·기존 레코드 상태 갱신(D-002)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-wf2-')), sid = 'sess-2', wf = path.join(dir, sid, 'subagents', 'workflows', 'wf_A')
  fs.mkdirSync(wf, { recursive: true })
  const put = (id, at0, at1) => { fs.writeFileSync(path.join(wf, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'anakin_phase-build', description: id })); fs.writeFileSync(path.join(wf, `agent-${id}.jsonl`), [{ type: 'user', timestamp: at0, message: { content: 'x' } }, { type: 'assistant', timestamp: at1, message: { model: 'claude-opus-5-5', content: 'y' } }].map(r => JSON.stringify(r)).join('\n') + '\n') }
  put('aX', '2026-11-08T01:10:00Z', '2026-11-08T01:12:00Z'); put('aY', '2026-11-08T01:13:00Z', '2026-11-08T01:14:00Z')
  const journal = rs => fs.writeFileSync(path.join(wf, 'journal.jsonl'), ['{"type":"launched"}', ...rs.map(id => JSON.stringify({ type: 'result', agentId: id }))].join('\n') + '\n')
  journal([])
  // A 가 wf_A 를 시작(로거 정확 연결), B 도 Workflow 호출(다른 워크플로) 뒤 wf_A 첫 에이전트 시작 — 시간 추정이면 B, 정확 매핑이면 A
  const mk = () => [
    { session_id: sid, turn: 1, ts_req: '2026-11-08T01:00:00Z', wfCall: true, agents_detail: [{ agent_id: 'aX', workflow: 'wf_A', wf_exact: true, ts_start: '2026-11-08T01:10:00Z', ts_end: '2026-11-08T01:12:00Z', cost_usd: 0.3 }] },
    { session_id: sid, turn: 2, ts_req: '2026-11-08T01:05:00Z', wfCall: true, agents_detail: [] },
  ]
  const fresh = Math.max(...['aX', 'aY'].map(id => fs.statSync(path.join(wf, `agent-${id}.jsonl`)).mtimeMs)) + 1000
  let [A, B] = mk()
  assert.deepEqual(loadWorkflowAgents([B, A], dir, { now: fresh }), { added: 1, moved: 0 })
  assert.deepEqual(A.agents_detail.map(x => x.agent_id), ['aX', 'aY']); assert.equal(B.agents_detail.length, 0); assert.equal(A.cost_agents_usd, undefined)   // 이동·비용 이동 없음
  // 진행(최근·result 없음) → 로거 레코드 aX 도 진행으로
  const ag = id => A.agents_detail.find(x => x.agent_id === id)
  assert.deepEqual([ag('aX').live, ag('aX').ts_end, ag('aY').live, ag('aY').ts_end], [true, null, true, null])
  // 진행 → 완료 : journal result 가 생기면 같은 turns 재실행에서 기존 레코드 갱신
  journal(['aX', 'aY'])
  assert.deepEqual(loadWorkflowAgents([B, A], dir, { now: fresh }), { added: 0, moved: 0 })
  assert.deepEqual([ag('aX').live, ag('aX').ts_end, ag('aY').live, ag('aY').ts_end], [false, '2026-11-08T01:12:00.000Z', false, '2026-11-08T01:14:00.000Z'])
  // 진행 → 오래된 미완료 : result 없이 시간이 지나면 진행 해제, 종료 기록 없음
  journal([]); ;[A, B] = mk()
  loadWorkflowAgents([B, A], dir, { now: fresh }); assert.equal(ag('aY').live, true)
  loadWorkflowAgents([B, A], dir, { now: fresh + 864e5 }); assert.deepEqual([ag('aY').live, ag('aY').ts_end, ag('aX').live, ag('aX').ts_end], [false, null, false, null])
  // 진행 중 턴(로거 기록 전)의 정확 매핑 = t.wfIds — 뒤 Workflow 호출 턴보다 우선
  const L = { session_id: sid, turn: '진행', ts_req: '2026-11-08T01:00:00Z', wfCall: true, wfIds: ['wf_A'], agents_detail: [] }, B2 = { session_id: sid, turn: 2, ts_req: '2026-11-08T01:05:00Z', wfCall: true, agents_detail: [] }
  loadWorkflowAgents([B2, L], dir, { now: fresh }); assert.equal(L.agents_detail.length, 2); assert.equal(B2.agents_detail.length, 0)
  // 정확 매핑 없음(과거 기록) = 기존 시간 추정 그대로 : 시작 이전 마지막 Workflow 호출 턴 B
  const A3 = { ...L, wfIds: undefined, agents_detail: [] }, B3 = { ...B2, agents_detail: [] }
  loadWorkflowAgents([B3, A3], dir, { now: fresh }); assert.equal(B3.agents_detail.length, 2); assert.equal(A3.agents_detail.length, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('끝난(중단) 턴은 이후 루프를 끌어오지 않음', () => {
  const loops = [loop('late', [{ iter: 1, at: '2026-11-08T05:00:00Z', verdict: 'PASS', open: 0 }])]
  const ns = buildRequestGraph(turn({ ts_res: null, interrupted: true, incomplete: true }), loops, { now: P('2026-11-08T23:00:00+09:00') })
  assert.equal(node(ns, '1').status, 'error')
  assert.equal(node(ns, '1.1.4.1'), undefined)   // 루프를 끌어왔다면 원장 연결로 남았을 것 — 부모 1.1.4 미수행 + 원장 없음 = 숨김
})

// WCAG 2.x 상대 휘도 대비
const lum = hex => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
test('상태 글자 대비 AA 4.5:1 이상(라이트·다크, 채움 또는 카드 바탕 위)', () => {
  for (const [k, s] of Object.entries(STATUS_STYLE)) for (const mode of ['light', 'dark']) {
    const v = mode === 'dark' && s.dark ? { ...s, ...s.dark } : s, bg = v.fill || PAGE_BG[mode]
    if (mode === 'dark' && !s.fill && !s.dark) continue
    assert.ok(ratio(v.text, bg) >= 4.5, `${k} ${mode} ${v.text} on ${bg} = ${ratio(v.text, bg).toFixed(2)}`)
  }
  assert.ok(ratio('#0b0b0b', STATUS_STYLE.done.fill) >= 4.5 && ratio('#ffffff', STATUS_STYLE.done.dark.fill) >= 4.5)   // 카드 본문 글자
})

test('Codex 칸 분홍 2단계 : 미완료 연분홍·완료(추정 포함) 진분홍 클래스·색, 글자 대비 AA(라이트·다크 공통 값)', () => {
  for (const k of ['pending', 'done']) { const v = CODEX_STYLE[k]; assert.ok(ratio(v.ink, v.fill) >= 4.5, `${k} ${v.ink} on ${v.fill} = ${ratio(v.ink, v.fill).toFixed(2)}`); assert.ok(ratio(v.strip, v.fill) >= 3, `${k} 띠 ${v.strip} on ${v.fill} = ${ratio(v.strip, v.fill).toFixed(2)}`) }
  assert.deepEqual([CODEX_STYLE.pending.fill, CODEX_STYLE.done.fill], ['#ffd9f4', '#ff4fc8'])   // 다크도 같은 분홍(다크 분기 없음)
  assert.ok(ratio(CODEX_STYLE.pending.fill, CODEX_STYLE.done.fill) >= 2)   // 수행 전·후 바탕 구분(2026-11-09 마스터 : 미완료 #ffc2ef·#fff0fa 중간)
  assert.ok(!CODEX_STYLE.pending.dark && !CODEX_STYLE.done.dark)
  const html = renderHtml({ design: true, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes(`.k-codex{--cf:${CODEX_STYLE.pending.fill};--ci:${CODEX_STYLE.pending.ink};--cs:${CODEX_STYLE.pending.strip}}`) && html.includes('.k-codex .strip{fill:var(--cs)}') && html.includes('.k-codex.st-notrun .box,.k-codex.st-missing .box{stroke:var(--cs);stroke-dasharray:5 3') && html.includes('Codex 미수행(점선)') && html.includes(`.k-codex.st-done,.k-codex.st-estimated{--cf:${CODEX_STYLE.done.fill}`))
  assert.ok(html.includes("SL[n.slot]?.kind === 'codex' ? ' k-codex'") && html.includes('Codex 미완료') && html.includes('Codex 완료'))
  assert.deepEqual(SLOTS.filter(s => s.kind === 'codex').map(s => s.id), ['1.1.4.1'])   // 2026-11-10 개정 : CDX-루프 하나
})

test('칸 종류 테마(c4-build-a44005 D-001·D-002) : 경로 표시를 꺼도 kg-asoka 그라데이션 정의, 다크 요청·터미널 바탕 명도 구분, 글자 AA', () => {
  const html = renderHtml({ design: false, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes('"kg-asoka":') && html.includes('"kg-asoka-dark":'))   // 그라데이션 정의 데이터
  assert.ok(html.includes('markers(!!path)') && !html.includes('if (path) markers()'))   // defs 는 경로 표시와 무관하게 늘 생성
  assert.ok(/if \(arrows\) for \(const \[k, c\] of Object\.entries\(D\.flow\)\)/.test(html) && /\n\s*for \(const \[id, stops\] of Object\.entries\(D\.grads\)\)/.test(html))   // 화살촉만 조건, 그라데이션은 무조건
  assert.ok(ratio(KIND_STYLE.request.dark.fill, KIND_STYLE.term.dark.fill) >= 1.5)
  for (const s of Object.values(KIND_STYLE)) for (const v of [s, { ...s, ...s.dark }]) for (const bg of v.grad ? [v.grad[0][1], v.grad.at(-1)[1]] : [v.fill]) assert.ok(ratio(v.ink, bg) >= 4.5, `${v.ink} on ${bg} = ${ratio(v.ink, bg).toFixed(2)}`)
})

test('설계도 경로 : 표준 처리 순서 + Codex FAIL 회송 예시 되돌이(결정적)', () => {
  assert.ok(buildPath(designGraph(), { design: true }).edges.every(e => e.pass === false))   // 실제 진행 없음 = 전부 점선
  const p = buildPath(designGraph(), { design: true })
  assert.deepEqual(route({ edges: p.edges.filter(e => e.state === 'design') }), [...SLOTS.map(s => s.id), 'E'])
  assert.equal(p.edges[0].from, 'S')
  const ex = p.edges.filter(e => e.state === 'example')
  assert.equal(ex.length, 1); assert.equal(ex[0].from, '1.1.4.1'); assert.equal(ex[0].to, '1.1.4'); assert.match(ex[0].label, /상한 5회/)
  assert.deepEqual(buildPath(designGraph(), { design: true }), p)
})

test('설계도 노드·Obsidian 안전 파일명 — 2026-11-10 개정 : 설계도 9칸(CDX = CDX-루프 하나, 1.1.5.2 총괄승인 칸 삭제)', () => {
  const d = designGraph()
  assert.equal(d.length, SLOTS.length); assert.equal(SLOTS.length, 9)
  assert.deepEqual(SLOTS.map(s => s.id), ['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.4.1', '1.1.5', '1.2'])   // SA 5칸 + CDX-루프 + 승인
  assert.ok(d.every(n => n.status === 'unassigned' && !n.lines.length && n.t0 === null))
  for (const id of ['1.1.1.1', '1.1.2.1', '1.1.3.1', '1.1.5.1', '1.1.5.2', '1.1.5.2.1']) assert.ok(!SLOTS.some(s => s.id === id), id)   // 폐지 칸(1.1.5.2 총괄승인 = 2026-11-10 마스터 '총괄승인 칸 삭제')
  assert.equal(SLOT_MAP['1.1.5.2'], undefined); assert.ok(!SLOTS.some(s => s.label === '총괄승인'))
  assert.equal(safeName('1.1.1 SA : 프롬프트'), '1.1.1 SA 프롬프트')
  assert.equal(safeName('1.1.4.1 CDX-루프 검수'), '1.1.4.1 CDX-루프 검수')
  assert.equal(safeName('a[b]#c|d?'), 'a b c d')
})

// ── 세로 계층 트리 좌표(2026-11-09 마스터 "위→아래로 펼쳐줘") · 회차 시간순 · 최종 승인 ──
test('일련번호 표시 : 화면 제목·풍선·상세 = n.no + ". " + 이름, 계층 id 는 data-id 에만 · 슬롯 md 제목·링크 별칭 = 일련번호, 파일명 = id 그대로', () => {
  const html = renderHtml({ design: true, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes("const ttl = n => (n.no ? n.no + '. ' : '') + n.label"))
  assert.ok(!html.includes("n.id + ' '") && !html.includes('1.1.5.3.1'))
  assert.ok(html.includes("'data-id': n.id"))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-md-'))
  try {
    assert.equal(writeSlotMd(dir), 9)
    const md = f => fs.readFileSync(path.join(dir, f), 'utf8')
    assert.match(md('1.1.1 SA-프롬프트.md'), /^# 3\. SA-프롬프트\n/)
    assert.ok(!fs.readdirSync(dir).some(x => x.startsWith('1.1.5.2')))   // 2026-11-10 마스터 '총괄승인 칸 삭제'
    assert.match(md('1.1.4.1 CDX-루프 검수.md'), /^# 6-1\. CDX-루프 검수\n/)
    assert.ok(md('1.1.4 SA-루프.md').includes('[[1.1.4.1 CDX-루프 검수|6-1. CDX-루프 검수]]'))
    assert.match(md('1.2 파다완 아소카 승인.md'), /^# 8\. 파다완 아소카 승인\n/)
    assert.ok(!md('1.1.5 SA-그래프.md').includes('1.1.5.2'))   // SA-그래프 카드의 하위 링크 정리
    assert.deepEqual(fs.readdirSync(dir).filter(f => /CDX-(프롬프트|컨텍스트|하네스|그래프|총괄)/.test(f)), [])   // 폐지 칸 md 없음
    for (const f of fs.readdirSync(dir)) assert.doesNotMatch(md(f).split('\n')[0], /^# 1(\.\d)+ /, f)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

// ── 산출 에이전트 대체(2026-11-09 마스터 "anakin_phase-build 를 CDX-루프 검수로 대체") ──
test('(g2) 정본 문서 anakins_graph.md 의 완료(추정) 정의도 실선 — 코드·문서 불일치 회귀 방지(c4-graph-gated-path D-001)', () => {
  const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude/engineering/50. graph/anakins_graph.md'), 'utf8')
  const lines = doc.split('\n').filter(l => l.includes('완료(추정)'))
  assert.ok(lines.length > 0)
  for (const l of lines) assert.doesNotMatch(l, /점선 테두리/, l)
  assert.ok(lines.some(l => /실선 테두리/.test(l) && l.includes('훅 실행(시각 미기록)') && l.includes('추정')))
})

test('(h) 설계도판 경로 불변 : 표준 순서 점선 + FAIL 회송 예시 1개, 정지·Y 간선 없음', () => {
  const p = buildPath(designGraph(), { design: true }), ids = ['S', ...SLOTS.map(s => s.id), 'E']
  assert.deepEqual(p.edges.map(e => [e.from, e.to, e.seq, e.state, e.pass]), [...ids.slice(1).map((to, i) => [ids[i], to, i + 1, 'design', false]), ['1.1.4.1', '1.1.4', '↺', 'example', false]])
  assert.equal(p.stop, undefined); assert.equal(p.verdicts, undefined); assert.ok(!p.edges.some(e => e.label === 'Y'))
})


// ── 2026-11-10 마스터 결정 : 순차 경로(C-3) · SA·CDX 쌍 배치(C-4) · 에이전트 = 칸 안 줄(C-5) · CDX 칸 안 회차(C-6) · 쌍 표시 조건(C-7·C-8) · 하네스 사용 목록(C-9) · 프롬프트·전후좌우(C-10) ──
const KL = (id, at, verdict) => loop(id, [{ iter: 1, at, verdict, open: 0 }], { startedAt: new Date(P(at) - 30e3).toISOString() })   // 판정 1회 원장(at = Z 표기, 시작 = 30초 전)
const ev2 = (iter, v, m, extra = {}) => ({ iter, at: `2026-11-08T01:${m}:00Z`, verdict: v, open: v === 'FAIL' ? 2 : 0, ...extra })
const ids = ns => ns.map(n => n.id)
const route = p => p.edges.map(e => e.to)
const codexIds = SLOTS.filter(s => s.kind === 'codex').map(s => s.id)
const pairOK = ns => ns.filter(n => codexIds.includes(n.id)).every(c => ns.some(n => n.id === c.parent))   // CDX 칸은 짝 SA 가 있을 때만

test('빈 매핑 : 4쌍(프롬프트·컨텍스트·하네스·루프) 증거 없음 = 숨김, 1·1.1 완료, 1.2 미실행', () => {
  const ns = buildRequestGraph(turn(), [], { slotMap: NONE })
  assert.deepEqual(ids(ns), ['1', '1.1', '1.1.5', '1.2'])
  assert.equal(node(ns, '1').status, 'done'); assert.equal(node(ns, '1.2').status, 'notrun'); assert.equal(node(ns, '1').eng, 0)
})

test('C-8 (b) 프롬프트·컨텍스트·그래프 SA 는 모든 요청에 표시(짝 CDX 칸은 2026-11-10 개정으로 폐지) — 에이전트·도구 0건 턴도, graph 미실행 = 생성기 자동 갱신(Stop 훅)', () => {
  const ns = buildRequestGraph(turn(), [])
  for (const id of ['1.1.1', '1.1.2', '1.1.5']) assert.ok(node(ns, id), id)
  for (const id of ['1.1.1.1', '1.1.2.1', '1.1.5.1']) assert.equal(node(ns, id), undefined, id)
  assert.equal(node(ns, '1.1.5').statusLabel, '생성기 자동 갱신(Stop 훅)'); assert.equal(fmtSpan(node(ns, '1.1.5'), 0), '생성기 자동 갱신(Stop 훅)')
  assert.equal(ns[0].check.viol, 0); assert.equal(ns[0].alertN, 0)
  assert.equal(node(ns, '1').eng, 3); assert.equal(node(ns, '1').engEst, 1)
  assert.deepEqual(SLOT_MAP['1.1.2'].agents, ['anakin_phase-collect']); assert.deepEqual(SLOT_MAP['1.1.5'].agents, ['anakin_phase-graph'])
  const g = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-graph', '2026-11-08T10:20:00+09:00')] }), [])
  assert.equal(node(g, '1.1.5').status, 'done'); assert.equal(AL(g).find(n => n.label === 'anakin_phase-graph').parent, '1.1.5')
})

test('C-8 (a)·C-9 (a) 하네스 SA = tool_use·훅 주입 1건 이상일 때만 — 0건 요청에서만 숨김, CDX-하네스 칸 없음(루프에 흡수)', () => {
  assert.equal(node(buildRequestGraph(turn(), []), '1.1.3'), undefined)
  for (const extra of [{ tools: { Read: 1 } }, { resources: { hooks: [{ name: 'UserPromptSubmit', event: 'UserPromptSubmit', n: 1 }] } }, { agents_detail: [ag('general-purpose', '2026-11-08T10:01:00+09:00')] }, { toolEvents: [{ t: P('2026-11-08T10:00:05+09:00'), name: 'Bash', who: 'main' }] }]) {
    const ns = buildRequestGraph(turn(extra), [])
    assert.equal(node(ns, '1.1.3').status, 'done', JSON.stringify(extra)); assert.equal(node(ns, '1.1.3.1'), undefined)
  }
})

test('C-9 (b)(c) 하네스 칸 = 종류별 합계 머리 + 시각순 사용 목록(같은 주체·도구 연속 = 한 줄 묶음), 입력값 비노출', () => {
  const T = h => P(`2026-11-08T10:${h}+09:00`)
  const recs = [
    { type: 'attachment', timestamp: '2026-11-08T01:00:01Z', attachment: { hookEvent: 'UserPromptSubmit' } },
    { type: 'assistant', timestamp: '2026-11-08T01:00:02Z', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo SECRET-TOKEN-123' } }, { type: 'tool_use', name: 'mcp__context7__query-docs', input: { q: 'SECRET-Q' } }] } },
    { type: 'assistant', timestamp: '2026-11-08T01:00:03Z', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'task-observer', args: 'SECRET-ARG' } }, { type: 'tool_use', name: 'Agent', input: { subagent_type: 'anakin_phase-collect', prompt: 'SECRET-BRIEF' } }] } },
  ]
  const ev = toolEventsOf(recs)
  assert.deepEqual(ev.map(e => e.name), ['hook UserPromptSubmit', 'Bash', 'MCP context7/query-docs', 'Skill task-observer', 'Agent anakin_phase-collect'])
  assert.ok(!JSON.stringify(ev).includes('SECRET'))   // 입력값 안 읽음
  const evs = [['00:30', 'Read', 'collect'], ['00:10', 'Read', 'collect'], ['00:20', 'Read', 'collect'], ['00:40', 'Bash', 'main'], ['00:50', 'Read', 'collect'], ['00:05', 'hook UserPromptSubmit', 'main']].map(([h, name, who]) => ({ t: T(h), name, who }))
  const g = groupTools(evs)
  assert.deepEqual(g.map(x => x.txt), ['10:00:05 hook UserPromptSubmit [main]', '10:00:10~10:00:30 Read ×3 [collect]', '10:00:40 Bash [main]', '10:00:50 Read [collect]'])
  assert.deepEqual(g.map(x => x.t0), [...g.map(x => x.t0)].sort((a, b) => a - b))   // 시각 오름차순
  const ns = buildRequestGraph(turn({ toolEvents: evs }), []), h = node(ns, '1.1.3')
  assert.equal(h.chips[0].txt, 'Read 4 · hook 1 · Bash 1'); assert.deepEqual(h.toolLog.map(x => x.txt), g.map(x => x.txt))
  assert.equal(h.t0, T('00:05')); assert.equal(h.t1, T('00:50'))
  // 하네스 파일 변경 표식 유지
  const hz = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { harness: true })] }), [])
  assert.ok(node(hz, '1.1.3').chips.some(c => c.txt === '⚙ 하네스 파일 변경 1건 → CDX-루프 판정'))
  // html·md 에 입력값 없음
  const html = renderHtml({ design: false, outDir: '.', requests: [{ key: 'k', when: 'w', head: 'h', nodes: ns, path: buildPath(ns) }], meta: '' })
  assert.ok(!html.includes('SECRET') && html.includes('hlist') && html.includes('10:00:10~10:00:30 Read ×3 [collect]'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-tl-'))
  try {
    writeRequestMd(dir, [{ when: '2026-11-08 10:00', sid: 's-1', head: '요청', catLabel: '', statusLabel: '완료', nodes: ns, path: buildPath(ns) }], P(T1))
    const md = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8')
    assert.ok(md.includes('## 하네스 사용 기록(시각순)\n\n- 10:00:05 hook UserPromptSubmit [main]\n- 10:00:10~10:00:30 Read ×3 [collect]'))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('C-8 (c)(d) 루프 쌍(2026-11-10 개정) = c4 판정 1회 이상 · 파일 변경 실행 · 반복 · 되돌림 중 하나 — 과거 c2 원장은 무시', () => {
  // c4 판정 1회 PASS 만으로도 루프 쌍 표시(유일한 CDX 칸), build = SA-루프 칸
  let ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')] }), [KL('c4-x', '2026-11-08T01:05:00Z', 'PASS')])
  assert.equal(node(ns, '1.1.4').status, 'done'); assert.equal(node(ns, '1.1.4.1').statusLabel, '검증 Y · 1회 만에 완료'); assert.equal(AL(ns).find(n => n.label === 'anakin_phase-build').parent, '1.1.4')
  assert.deepEqual(node(ns, '1.1.4').chips[0], { txt: 'Codex 판정 1건 — 되돌림 0', tone: '' })
  // 판정·파일 변경·반복·되돌림 0건 = 루프 쌍 없음 → build 는 2 접수 칸
  ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')] }), [])
  assert.equal(node(ns, '1.1.4'), undefined); assert.equal(node(ns, '1.1.4.1'), undefined); assert.equal(AL(ns).find(n => n.label === 'anakin_phase-build').parent, '1.1')
  // 파일 변경 실행(wrote) + 판정 전 → SA-루프 '판정 전' 줄
  ns = buildRequestGraph(turn({ agents_detail: [ag('general-purpose', '2026-11-08T10:01:00+09:00', { wrote: true })] }), [])
  assert.deepEqual(node(ns, '1.1.4').chips, [{ txt: '파일 변경 실행 — 판정 전', tone: '' }])
  // admin ×2 → 루프 쌍(반복), 판정 대상 없음 = CDX-루프 숨김
  ns = buildRequestGraph(turn({ agents_detail: [ag('teamanakin-admin', '2026-11-08T10:10:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')] }), [])
  assert.equal(node(ns, '1.1.4').status, 'done'); assert.deepEqual(node(ns, '1.1.4').chips, [{ txt: 'admin ×2', tone: '' }]); assert.equal(node(ns, '1.1.4.1'), undefined)
  // 과거 c2 원장(N → Y) = 집계 제외 → 루프 쌍 없음
  ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00')] }), [loop('c2-a', [ev2(1, 'FAIL', '05'), ev2(2, 'PASS', '15')], { startedAt: '2026-11-08T01:02:00Z' })])
  assert.equal(node(ns, '1.1.4'), undefined); assert.equal(node(ns, '1.1.4.1'), undefined)
  // build ×2(회송) → SA-루프 칸 안 'build ×2 (회송 1)', 반복 목록에 build
  ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:03:00+09:00' }), ag('anakin_phase-build', '2026-11-08T10:08:00+09:00', { ts_end: '2026-11-08T10:09:00+09:00' })] }), [])
  assert.deepEqual(node(ns, '1.1.4').chips.map(c => c.txt), ['build ×2', 'build ×2 (회송 1) · 3m'])   // 칸 요약(반복 목록) 먼저, 실행 줄 뒤
  assert.ok(AL(ns).filter(n => n.label === 'anakin_phase-build').every(n => n.parent === '1.1.4'))
})

test('C-13 루프 = 되돌림 기준(2026-11-10 개정 — CDX-루프 하나) : N 1회 이상 = 루프 쌍, SA-루프 = 칸·회차·결함 수, CDX-루프 = 원장 판정(파일 변경이 있는데 끝난 요청에 판정 없음 = 검증 누락)', () => {
  const tools = { tools: { Read: 1, Edit: 2 } }
  let ns = buildRequestGraph(turn(tools), [loop('c4-h', [{ ...ev2(1, 'FAIL', '10'), open: 5 }], { startedAt: '2026-11-08T01:05:00Z' })])
  assert.ok(node(ns, '1.1.4') && node(ns, '1.1.4.1'), 'N 1회 = 루프 쌍')
  assert.deepEqual(node(ns, '1.1.4').chips, [{ txt: 'CDX-루프 N 1회(1회차 결함 5) → 재작업 대기', tone: 'bad' }])
  let cx = node(ns, '1.1.4.1'); assert.equal(cx.statusLabel, '검증 N · 1회차 진행 (1/5)'); assert.equal(cx.verdict.yn, 'N')
  assert.deepEqual(buildPath(ns).verdicts.map(e => [e.from, e.to, e.label]), [['1.1.4.1', '1.1.4', '되돌림 1회']])
  // 진행 중 요청 : 재판정 진행 중 = CDX-루프 진행
  const now = P('2026-11-08T10:20:00+09:00')
  ns = buildRequestGraph(turn({ ...tools, ts_res: null }), [loop('c4-h', [ev2(1, 'FAIL', '10')], { startedAt: '2026-11-08T01:05:00Z', running: true })], { now })
  assert.match(node(ns, '1.1.4').chips[0].txt, /^CDX-루프 N 1회\(1회차 결함 2\) → 재판정 진행$/); cx = node(ns, '1.1.4.1'); assert.match(cx.statusLabel, /^검증 진행 · 2회차/)
  // 파일 변경 실행 + 원장 없음 : 끝난 요청 = ⚠ 검증 누락(경보 1건, CDX-루프에만) / 진행 중 요청 = 검증 대기
  const w = [ag('anakin_phase-build', '2026-11-08T10:10:00+09:00', { wrote: true })]
  ns = buildRequestGraph(turn({ agents_detail: w }), []); cx = node(ns, '1.1.4.1')
  assert.equal(cx.statusLabel, '검증 누락'); assert.deepEqual(cx.alerts, ['검증 누락']); assert.equal(ns[0].alertN, 1); assert.ok(!agentsOf(ns).some(n => (n.alerts || []).includes('검증 누락')))
  cx = node(buildRequestGraph(turn({ ts_res: null, agents_detail: [{ ...w[0], ts_end: null, live: true }] }), [], { now: P('2026-11-08T10:25:00+09:00') }), '1.1.4.1'); assert.equal(cx.statusLabel, '검증 대기 — 판정 전')
  // wrote 없음 + 원장 없음 = CDX-루프 숨김·위반 0
  ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:10:00+09:00'), ag('anakin_phase-build', '2026-11-08T10:15:00+09:00')] }), [])
  assert.ok(node(ns, '1.1.4')); assert.equal(node(ns, '1.1.4.1'), undefined); assert.equal(ns[0].check.viol, 0)
  // 원장 2개 중 1개 FAIL = N(원장별 마지막 판정 AND), 전부 PASS = '원장 n개 전부 Y'
  ns = buildRequestGraph(turn(tools), [KL('c4-a-a11111', '2026-11-08T01:05:00Z', 'PASS'), KL('c4-b-a22222', '2026-11-08T01:04:00Z', 'FAIL')])
  assert.equal(node(ns, '1.1.4.1').statusLabel, '검증 N · 원장 1/2 N'); assert.equal(node(ns, '1.1.4.1').verdict.yn, 'N')
  ns = buildRequestGraph(turn(tools), [KL('c4-a-a11111', '2026-11-08T01:05:00Z', 'PASS'), KL('c4-b-a22222', '2026-11-08T01:04:00Z', 'PASS')])
  assert.equal(node(ns, '1.1.4.1').statusLabel, '검증 Y · 원장 2개 전부 Y')
  // 과거 c3 원장 PASS = 무시 → 루프 쌍 없음
  ns = buildRequestGraph(turn(tools), [KL('c3-h', '2026-11-08T01:10:00Z', 'PASS')])
  assert.equal(node(ns, '1.1.4'), undefined); assert.equal(node(ns, '1.1.4.1'), undefined)
})

test('C-7 ①·C-8 (e) SA 가 없으면 CDX 도 없다 — 과거 c1·c3·c6 원장은 무시, c4 원장은 SA-루프와 쌍(여러 사례 불변식)', () => {
  const c3 = buildRequestGraph(turn(), [KL('c3-x', '2026-11-08T01:05:00Z', 'PASS')])   // 과거 c3 원장 = 무시
  assert.equal(node(c3, '1.1.3'), undefined); assert.equal(node(c3, '1.1.3.1'), undefined); assert.equal(node(c3, '1.1.4.1'), undefined)
  const c4 = buildRequestGraph(turn(), [KL('c4-x', '2026-11-08T01:05:00Z', 'PASS')])   // c4 판정 1회 = 루프 쌍
  assert.ok(node(c4, '1.1.4') && node(c4, '1.1.4.1'))
  const cases = [turn(), turn({ tools: { Read: 1 } }), turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:02:00+09:00'), ag('anakin_phase-build', '2026-11-08T10:05:00+09:00')] })]
  for (const t of cases) for (const loops of [[], [KL('c1-a', '2026-11-08T01:01:00Z', 'PASS')], [KL('c3-a', '2026-11-08T01:03:00Z', 'FAIL'), KL('c6-a', '2026-11-08T01:06:00Z', 'PASS')]]) {
    const ns = buildRequestGraph(structuredClone(t), loops); assert.ok(pairOK(ns), loops.map(l => l.id).join(',')); assert.ok(!ns.some(n => codexIds.includes(n.id)), '과거 원장만 = CDX 칸 없음')
  }
  assert.deepEqual(PAIRS, ['1.1.1', '1.1.2', '1.1.3', '1.1.4'])
})

test('C-5 에이전트 = 칸 안 줄(독립 노드 0) : collect·build·graph·admin·commit·일반 → 대응 칸, 반복 회차·실패·장시간 표식, verify(폐지) 숨김', () => {
  const t0 = P('2026-11-08T10:01:00+09:00'), rounds = [0, 1, 2, 3].map(i => ({ t0: t0 + i * 5 * 60e3, t1: t0 + (i * 5 + 3) * 60e3, run: false, errors: 0 }))
  const ns = buildRequestGraph(turn({ agents_detail: [
    ag('anakin_phase-collect', '2026-11-08T10:00:30+09:00', { ts_end: '2026-11-08T10:33:00+09:00' }), ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:19:00+09:00', rounds, errors: 2 }),
    ag('anakin_phase-verify', '2026-11-08T10:20:00+09:00'), ag('anakin_phase-commit', '2026-11-08T10:22:00+09:00', { ts_end: null }), ag('teamanakin-admin', '2026-11-08T10:24:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:26:00+09:00'), ag('anakin_phase-graph', '2026-11-08T10:25:00+09:00'),
  ] }), [])
  assert.ok(ns.every(n => n.slot), '에이전트 독립 노드 0')
  const at = l => AL(ns).filter(n => n.label === l).map(n => n.parent)
  assert.deepEqual([at('anakin_phase-collect'), at('anakin_phase-build'), at('anakin_phase-graph'), at('teamanakin-admin'), at('anakin_phase-commit'), at('anakin_phase-verify')], [['1.1.2'], ['1.1.4'], ['1.1.5'], ['1.2', '1.2'], ['1.1'], []])
  assert.equal(ns[0].agentN, 6)
  const txt = id => node(ns, id).chips.map(c => `${c.tone}|${c.txt}`)
  assert.ok(txt('1.1.2').includes('|collect ×1 · 33m') && txt('1.1.2').includes('warn|⚠ 장시간'))
  assert.ok(txt('1.1.4').includes('|build ×4 (회송 3) · 12m') && txt('1.1.4').includes('bad|✖ 도구 오류 2'))   // 반복 회차 = ×n·회송, 실패 = 빨강
  assert.ok(txt('1.1').includes('bad|✖ 종료 기록 없음'))   // commit 종료 기록 없음
  assert.ok(txt('1.2').includes('|admin ×2 [중간 1·최종] · 0s'))
  assert.equal(node(ns, '1.2').agents.at(-1).approval, '최종')
  const html = renderHtml({ design: false, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes("class: 'chip ' + c.tone") && !html.includes('if (!n.slot) {') && html.includes('실행 에이전트 '))
})

test('C-6 CDX 칸 안 판정 회차 : 회차마다 줄(N 빨강·BLOCKED 주황·사유·시각) + 끝 줄(k회 만에 완료 · 되돌림 n회), 원장 2개 이상 = 원장별 머리', () => {
  const L = loop('c4-a', [ev2(1, 'FAIL', '10'), { ...ev2(2, 'BLOCKED', '20'), reason: 'device' }, ev2(2, 'PASS', '30')], { startedAt: '2026-11-08T01:05:00Z' })
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00')] }), [L]), c = node(ns, '1.1.4.1')
  assert.deepEqual(c.chips, [{ txt: '✖ 1회 N 10:10 · 결함 2', tone: 'bad' }, { txt: '⚠ 2회 BLOCKED 10:20 · device', tone: 'warn' }, { txt: '2회 Y 10:30', tone: 'ok' }, { txt: '→ 2회 만에 완료 · 되돌림 1회', tone: '' }])
  assert.equal(c.statusLabel, '검증 Y · 2회 만에 완료')
  const two = codexChips([{ id: 'c4-a', rows: [{ iter: 1, verdict: 'PASS', t1: P(Z('01:00')) }] }, { id: 'c4-b', rows: [{ iter: 1, verdict: 'FAIL', open: 1, t1: P(Z('01:10')) }] }])
  assert.deepEqual(two.map(x => x.txt), ['원장 c4-a', '1회 Y 10:00', '→ 1회 만에 완료', '원장 c4-b', '✖ 1회 N 10:10 · 결함 1', '되돌림 1회'])
})

test('C-3 순차 경로 : 실행된 칸을 표준 순서로 끝까지 — CDX 가 Y 아니어도 선은 이어 감(⚠ 표시만), 정지·차단 배지 없음, 위반 = Y 아닌 CDX 칸 수', () => {
  const agents = [ag('anakin_phase-collect', '2026-11-08T10:02:00+09:00'), ag('general-purpose', '2026-11-08T10:06:00+09:00', { wrote: true })]
  const ns = buildRequestGraph(turn({ agents_detail: agents }), [KL('c4-a', '2026-11-08T01:08:00Z', 'PASS')])
  const p = buildPath(ns)
  assert.deepEqual(route(p), ['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.4.1', '1.1.5', '1.2', 'E'])   // 승인 칸은 미실행이어도 경로에(D-002)
  assert.equal(p.edges[0].from, 'S'); assert.deepEqual(p.edges.map(e => e.seq), p.edges.map((_, i) => i + 1))
  assert.ok(p.edges.filter(e => e.to !== '1.2').every(e => e.pass && !e.loop)); assert.equal(p.stop, undefined)
  assert.deepEqual(p.edges.filter(e => e.to === '1.2').map(e => [e.from, e.label, e.state, e.pass]), [['1.1.5', '⚠ 승인 미실행', 'planned', false]])
  assert.equal(ns[0].check.miss, 0); assert.equal(ns[0].check.y, 1); assert.equal(ns[0].check.viol, 0)
  assert.deepEqual(p.edges.filter(e => e.label === 'Y').map(e => [e.from, e.to, e.state]), [['1.1.4.1', '1.1.5', 'yes']])
  // Y 아님(FAIL) : 선은 그대로 이어 가고 위반 1
  const nf = buildRequestGraph(turn({ agents_detail: agents }), [KL('c4-a', '2026-11-08T01:08:00Z', 'FAIL')]), pf = buildPath(nf)
  assert.deepEqual(route(pf), route(p)); assert.equal(nf[0].check.viol, 1); assert.equal(nf[0].check.viol, nf.filter(notY).length)
  const html = renderHtml({ design: false, outDir: '.', requests: [{ key: 'k', when: 'w', head: 'h', nodes: nf, path: pf }], meta: '' })
  assert.ok(!html.includes('게이트 위반') && !html.includes('진행 불가') && !html.includes('gateViol') && !html.includes('path.stop'))
  // md : 실행 경로 = 화면과 같은 순서, Y 아닌 CDX 목록
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-req-'))
  try {
    writeRequestMd(dir, [{ when: '2026-11-08 10:00', sid: 's-1', head: '요청', catLabel: '', statusLabel: '완료', nodes: ns, path: p }], P(T1))
    const md = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8'), r = md.split('## 실행 경로\n\n')[1].split('\n')[0]
    assert.equal(r, '(1) 1. 마스터 아나킨 요청 → (2) 2. 파다완 아소카 접수 → (3) 3. SA-프롬프트 → (4) 4. SA-컨텍스트 → (5) 5. SA-하네스 → (6) 6. SA-루프 → (7) 6-1. CDX-루프 검수 → (8) 7. SA-그래프 [Y] → (9) 8. 파다완 아소카 승인 [⚠ 승인 미실행] (예정) → (10) 종료')
    fs.rmSync(path.join(dir, fs.readdirSync(dir)[0]))
    writeRequestMd(dir, [{ when: '2026-11-08 10:00', sid: 's-1', head: '요청', catLabel: '', statusLabel: '완료', nodes: nf, path: pf }], P(T1))
    const mf = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8'); assert.ok(mf.includes('- ⚠ Y 아닌 CDX 칸 1 : ') && !mf.includes('⛔'))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('C-3 진행 중·중단 : 마지막 실제 실행 칸까지 실선, 판정 대기 CDX 부터 예정 점선, 진행 중 판정 = 진입 노랑, 중단 = 첫 예정 중단', () => {
  const now = P('2026-11-08T10:05:00+09:00')
  let ns = buildRequestGraph(turn({ ts_res: null, agents_detail: [ag('anakin_phase-build', '2026-11-08T10:02:00+09:00', { ts_end: null, live: true, wrote: true })] }), [], { now }), p = buildPath(ns)
  assert.equal(node(ns, '1.1.4.1').statusLabel, '검증 대기 — 판정 전'); assert.equal(ns[0].check.viol, 0)
  assert.deepEqual(route(p).slice(0, 6), ['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.1.4']); assert.deepEqual(p.edges.map(e => e.seq), p.edges.map((_, i) => i + 1))   // 순차 연결 유지
  assert.ok(p.edges.filter(e => codexIds.includes(e.to) && !node(ns, e.to).rounds).every(e => e.state === 'planned' && !e.pass))   // 판정 대기 CDX 로 들어가는 선 = 예정
  assert.equal(p.edges.find(e => e.to === '1.1.4').state, 'running'); assert.equal(p.edges.at(-1).to, 'E'); assert.equal(p.edges.at(-1).state, 'planned'); assert.equal(new Set(route(p)).size, route(p).length)
  const L = loop('c4-L', [ev2(1, 'FAIL', '01')], { startedAt: '2026-11-08T01:00:30Z', running: true })
  ns = buildRequestGraph(turn({ ts_res: null, agents_detail: [ag('anakin_phase-build', '2026-11-08T10:00:10+09:00', { ts_end: '2026-11-08T10:00:50+09:00' })] }), [L], { now }); p = buildPath(ns)
  assert.deepEqual(p.edges.find(e => e.to === '1.1.4.1').state, 'running'); assert.equal(p.edges.at(-1).state, 'planned')   // 진행 중 판정 칸 진입 = 노랑, 종료 = 예정
  const cut = buildPath(buildRequestGraph(turn({ ts_res: null, interrupted: true, incomplete: true }), [], { now: P('2026-11-08T23:00:00+09:00') }))
  assert.equal(cut.edges.find(e => !e.pass).label, '중단'); assert.equal(cut.term.E.stopped, true); assert.equal(cut.edges.at(-1).to, 'E')
})

test('N 되돌림 화살표 유지 : FAIL 2회 → CDX→SA 되돌림 2회(경로는 이어 감), FAIL 후 PASS → 흐림 noold, BLOCKED → 없음', () => {
  const run = events => { const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00')] }), [loop('c4-a', events, { startedAt: '2026-11-08T01:02:00Z' })]); return { ns, p: buildPath(ns) } }
  let { ns, p } = run([ev2(1, 'FAIL', '10'), ev2(2, 'FAIL', '20')])
  assert.deepEqual(p.verdicts.map(e => [e.from, e.to, e.seq, e.state, e.label, e.loop]), [['1.1.4.1', '1.1.4', 'N', 'no', '되돌림 2회', true]])
  assert.equal(node(ns, '1.1.4.1').statusLabel, '검증 N · 2회차 진행 (2/5)'); assert.ok(route(p).includes('1.1.5') && route(p).at(-1) === 'E')
  ;({ p } = run([ev2(1, 'FAIL', '10'), ev2(2, 'PASS', '20')])); assert.deepEqual(p.verdicts.map(e => e.state), ['noold']); assert.equal(p.edges.find(e => e.from === '1.1.4.1').label, 'Y')
  ;({ p } = run([ev2(1, 'FAIL', '10'), { ...ev2(2, 'BLOCKED', '20'), reason: 'device' }])); assert.equal(p.verdicts.length, 0)
})

test('C-11 쌍 배치 : CDX = SA 자식(depth + 1, parent = SA) — 세로 흐름 = SA 바로 아래 + 들여쓰기 상수, 가로 흐름 = 바로 오른쪽 다음 열, 사이에 다른 노드 없음·겹침 없음', () => {
  const LZ2 = { boxW: 158, colGap: 26, pairGap: 28, pairIndent: 18, wrapW: 1800, rowGap: 34, gapY: 8 }
  const ns = buildRequestGraph(turn({ tools: { Read: 1 }, agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { wrote: true }), ag('anakin_phase-build', '2026-11-08T10:05:00+09:00', { wrote: true })] }), [])
  const isP = n => codexIds.includes(n.id), sz = n => ({ w: isP(n) ? LZ2.boxW - LZ2.pairIndent : LZ2.boxW, h: 60 + (n.chips || []).length * 13 + (n.id === '1.1.3' ? 120 : 0) })
  const hit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
  assert.equal(ns.filter(isP).length, 1)   // 2026-11-10 개정 : CDX = CDX-루프 하나
  for (const dir of ['v', 'h']) {
    const { pos } = layoutTree(ns, dir, LZ2, sz, isP)
    for (const c of ns.filter(isP)) {
      const a = pos[c.parent], b = pos[c.id]
      assert.equal(c.parent, SLOTS.find(s => s.id === c.id).parent); assert.equal(b.d, a.d + 1, c.id)
      const gapBox = dir === 'v' ? { x: a.x, y: a.y + a.h, w: Math.max(a.w, b.x + b.w - a.x), h: b.y - a.y - a.h } : { x: a.x + a.w, y: a.y, w: b.x - a.x - a.w, h: Math.max(a.h, b.h) }
      if (dir === 'v') { assert.equal(b.y, a.y + a.h + LZ2.pairGap, c.id); assert.equal(b.x, a.x + LZ2.pairIndent, c.id) } else { assert.equal(b.x, a.x + a.w + LZ2.colGap, c.id); assert.equal(b.y, a.y, c.id) }
      for (const [id, p] of Object.entries(pos)) if (id !== c.id && id !== c.parent) assert.ok(!hit(p, gapBox), dir + ' ' + c.id + ' 사이에 ' + id)
    }
    const all = Object.values(pos)
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!hit(all[i], all[j]), dir + ' 겹침')
    assert.deepEqual(layoutTree(ns, dir, LZ2, sz, isP), layoutTree(ns, dir, LZ2, sz, isP))
  }
  const html = renderHtml({ design: true, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes("layoutTree(nodes, view === 'tree' ? dir : 'h', Z, sizeOf, isPair)") && html.includes('"pairGap":28,"pairIndent":18'))
})

test('C-15 세로 모드 : 시작 = 1번 칸 왼쪽 · 승인 = 맨 아래 정중앙 · 종료 = 승인 칸 왼쪽(같은 간격) / 가로 모드 = 종전 좌표 그대로', () => {
  const LZ3 = { termW: 96, termH: 32, termGapS: 40, termGapE: 40, foot: '1.2', boxW: 158, colGap: 26, pairGap: 28, pairIndent: 18, wrapW: 1800, rowGap: 34, gapY: 8 }
  const ns = buildRequestGraph(turn({ tools: { Read: 1 }, agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')] }), [])
  const isP = n => codexIds.includes(n.id), sz = n => ({ w: isP(n) ? LZ3.boxW - LZ3.pairIndent : LZ3.boxW, h: 60 + (n.chips || []).length * 13 })
  const { pos } = layoutTree(ns, 'v', LZ3, sz, isP), t = termPos(pos, 'v', LZ3), r1 = pos['1'], ap = pos['1.2'], cy = (p, h) => p.y + h / 2, near = (x, y) => Math.abs(x - y) <= 1
  assert.ok(near(cy(t.S, LZ3.termH), r1.y + r1.h / 2) && near(t.S.x + LZ3.termW + LZ3.termGapS, r1.x), '시작 = 1번 칸 왼쪽')
  const ps = Object.values(pos), W = Math.max(...ps.map(p => p.x + p.w)); assert.equal(Math.min(...ps.map(p => p.x)), 0)
  assert.ok(near(ap.x + ap.w / 2, W / 2), '승인 = 정중앙'); assert.ok(ps.every(p => p === ap || p.y + p.h <= ap.y), '승인 = 맨 아래(아래 칸 없음)')
  assert.ok(near(cy(t.E, LZ3.termH), ap.y + ap.h / 2) && near(t.E.x + LZ3.termW + LZ3.termGapE, ap.x), '종료 = 승인 칸 왼쪽')
  assert.equal(LZ3.termGapS, LZ3.termGapE)
  const hit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
  for (const k of ['S', 'E']) assert.ok(!ps.some(p => hit(p, { ...t[k], w: LZ3.termW, h: LZ3.termH })), k + ' 겹침 없음')
  // 가로 모드 회귀 : 승인 칸 위치·터미널 좌표 = 바닥 칸 규칙 없을 때(종전)와 같음
  const h1 = layoutTree(ns, 'h', LZ3, sz, isP), h0 = layoutTree(ns, 'h', { ...LZ3, foot: undefined }, sz, isP)
  assert.deepEqual(h1, h0); const th = termPos(h1.pos, 'h', LZ3), r = h1.pos['1'], bottom = Math.max(...Object.values(h1.pos).map(p => p.y + p.h))
  assert.deepEqual(th, { S: { x: -(LZ3.termW + LZ3.colGap), y: r.y + r.h / 2 - LZ3.termH / 2 }, E: { x: -(LZ3.termW + LZ3.colGap), y: bottom - LZ3.termH } })
  const html = renderHtml({ design: true, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes('termPos = function termPos') && html.includes('"termGapS":40,"termGapE":40,"foot":"1.2"'))
})

test('A7 자유 배치 : CDX 위성 = 짝 SA 원 바로 아래(SA 를 따라 움직임) — matePos·glue 인라인', () => {
  assert.deepEqual(matePos({ x: 10, y: 20, r: 12 }, 8, 28), { x: 10, y: 68 })
  assert.deepEqual(matePos({ x: 110, y: -5, r: 12 }, 8, 28), { x: 110, y: 43 })   // SA 이동 → 같은 상대 위치
  const html = renderHtml({ design: true, outDir: '.', requests: [], meta: '' })
  assert.ok(html.includes('matePos = (m, r, gap)') && html.includes('const q = matePos(p.mate, p.r, Z.pairGap)') && html.includes('glue()'))
})

test('세로 트리(짝 없이) : 깊이 증가 → y 증가, 형제 폭이 wrapW 를 넘으면 줄 접기 · 설계도 가로 = 깊이 → x', () => {
  const LZ = { boxW: 158, colGap: 26, wrapW: 1400, rowGap: 34, gapY: 8 }, sz = () => ({ w: 158, h: 60 })
  const nodes = [{ id: 'r', parent: null }, ...Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, parent: 'r' }))]
  const { pos } = layoutTree(nodes, 'v', LZ, sz)
  const rows = [...new Set(nodes.slice(1).map(n => pos[n.id].y))]; assert.ok(rows.length >= 2)
  for (const n of nodes.slice(1)) assert.ok(pos[n.id].y > pos.r.y)
  const d = designGraph(), dh = layoutTree(d, 'h', LZ, sz).pos
  for (const n of d) assert.equal(dh[n.id].x, (n.id.split('.').length - 1) * (LZ.boxW + LZ.colGap))
})

test('일련번호 : 보이는 칸 중 CDX 아닌 칸만 1부터 연속(숨긴 쌍 건너뜀), CDX = SA 번호-1, id 불변', () => {
  const ns = buildRequestGraph(turn(), [])
  assert.deepEqual(ns.map(n => n.no), [1, 2, 3, 4, 5, 6])   // 하네스·루프 쌍 숨김, CDX 칸 없음(1.1.5.2 삭제)
  assert.deepEqual(designGraph().map(n => n.no), [1, 2, 3, 4, 5, 6, '6-1', 7, 8])   // C-11 : CDX = 짝 SA 번호 + '-1'(CDX-루프 하나)
  assert.deepEqual(serial([{ slot: 'a' }, { slot: null }, { slot: 'b' }]).map(n => n.no), [1, undefined, 2])
})

test('회차 번호 = 시작 시각순(+09:00·Z 혼용), 1.2 승인 2회 이상 = 마지막 실행 최종', () => {
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:56:00+09:00'), ag('anakin_phase-collect', '2026-11-08T02:10:00Z'), ag('anakin_phase-collect', '2026-11-08T10:40:00+09:00'), ag('teamanakin-admin', '2026-11-08T02:20:00Z'), ag('teamanakin-admin', '2026-11-08T10:58:00+09:00')] }), [])
  const g = node(ns, '1.1.2').rounds.find(x => x.name.endsWith('반복 실행')), t0s = g.rows.map(r => r.t0)
  assert.deepEqual(t0s, [...t0s].sort((a, b) => a - b)); assert.equal(g.rows[2].t0, P('2026-11-08T02:10:00Z'))
  const admin = AL(ns).filter(n => n.parent === '1.2' && !n.slot)
  assert.deepEqual(admin.map(n => n.approval), ['중간', '최종']); assert.equal(admin.find(n => n.approval === '최종').t0, P('2026-11-08T02:20:00Z'))
  assert.match(node(ns, '1.2').lines.join(' '), /팀장\(teamanakin-admin\) 실행 2회 — 중간 1/)   // 2026-11-10 : 1.2 완료 근거 = 종료 승인 줄, 팀장 실행은 칸 안 줄
})

test('verify(2026-11-10 폐지) 과거 기록 : 칸·집계에서 숨김, 그 원장 판정은 CDX 칸에 계속 매칭, 재전달 상한 제외(묶음)', () => {
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00'), ag('anakin_phase-verify', '2026-11-08T10:03:00+09:00', { ts_end: null })] }), [KL('c2-x', '2026-11-08T01:04:00Z', 'PASS'), loop('loop-docs', [ev2(1, 'FAIL', '05'), ev2(2, 'PASS', '06')], { startedAt: '2026-11-08T01:04:30Z' })])
  assert.ok(!AL(ns).some(n => n.label === 'anakin_phase-verify')); assert.equal(ns[0].agentN, 1); assert.equal(node(ns, '1').status, 'done')
  assert.equal(node(ns, '1.1.2.1'), undefined)   // 과거 c2 원장 = 집계 제외(CDX-컨텍스트 칸 폐지)
  const c4 = node(ns, '1.1.4.1'); assert.equal(c4.badge, '시간 기준 연결(추정)'); assert.equal(c4.statusLabel, '검증 Y · 2회 만에 완료')   // 접두 없는 과거 원장 = CDX-루프(추정)
  assert.ok(!fs.readFileSync(new URL('../scripts/request-graph.mjs', import.meta.url), 'utf8').match(/GATE_FREE|VERIFY_TYPE|STAND\b/))
  const Z2 = h => `2026-11-08T${h}:00Z`, A = { key: 'A', session_id: 's', ts_req: Z2('01:00'), ts_res: Z2('01:50'), agents_detail: [ag('anakin_phase-verify', Z2('01:10'), { agent_id: 'v1', ts_end: Z2('02:30'), rounds: [{ t0: P(Z2('01:10')), t1: P(Z2('01:20')), run: false, errors: 0 }, { t0: P(Z2('02:10')), t1: P(Z2('02:20')), run: false, errors: 0 }] })] }
  const B = { key: 'B', session_id: 's', ts_req: Z2('02:00'), ts_res: Z2('02:59'), agents_detail: [] }
  splitAgentRounds([A, B]); assert.equal(A.bundle.n, 0)
})

test('서브에이전트 실행별 Codex 판정(상세 글자, 2026-11-10 개정) : 파일 변경 실행만 c4 판정 대상(그 밖 = 판정 대상 아님) · 판정 창 [종료, 다음 시작) · 병렬 대상 접미 — 경로는 막지 않음', () => {
  const collect = ag('anakin_phase-collect', '2026-11-08T10:05:00+09:00', { ts_end: '2026-11-08T10:06:00+09:00' }), gp = ag('general-purpose', '2026-11-08T10:10:00+09:00')
  const C = loops => AL(buildRequestGraph(turn({ agents_detail: [collect, gp] }), loops)).find(x => x.label === 'anakin_phase-collect').cdx
  for (const ls of [[], [KL('c4-a', '2026-11-08T01:07:00Z', 'PASS')], [KL('c2-a', '2026-11-08T01:07:00Z', 'PASS')]]) assert.equal(C(ls), '판정 대상 아님')   // 조회 에이전트 = 판정 없음
  // 파일 변경 build : 창 안 c4 판정
  const b = (extra = {}) => ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:03:00+09:00', wrote: true, ...extra }), adm = ag('teamanakin-admin', '2026-11-08T10:20:00+09:00', { ts_end: '2026-11-08T10:21:00+09:00' })
  const Bd = (loops, extra) => AL(buildRequestGraph(turn({ agents_detail: [b(extra), adm] }), loops)).find(x => x.label === 'anakin_phase-build')
  assert.equal(Bd([KL('c4-x', '2026-11-08T01:05:00Z', 'PASS')]).cdx, '검증 Y')
  assert.equal(Bd([KL('c4-x', '2026-11-08T01:02:00Z', 'PASS')]).cdx, '검증 누락')   // 실행 종료 전
  assert.match(Bd([KL('c4-x', '2026-11-08T01:05:00Z', 'FAIL')]).lines.join(' '), /Codex 판정 : 검증 N/)
  assert.equal(Bd([KL('c3-x', '2026-11-08T01:06:00Z', 'PASS')], { harness: true }).cdx, '검증 누락')   // 과거 c3 원장 = 무시(하네스도 c4 하나)
  assert.ok(!(Bd([]).alerts || []).includes('검증 누락'))   // 실행 단위 누락 경보 없음(CDX-루프에만)
  // 병렬 = 대상 접미만 인정
  const at = '2026-11-08T10:02:00+09:00', A = ag('general-purpose', at, { agent_id: 'a11111f00d', wrote: true }), B2 = ag('general-purpose', at, { agent_id: 'a22222f00d', wrote: true })
  const par = loops => AL(buildRequestGraph(turn({ agents_detail: [A, B2, ag('anakin_phase-build', '2026-11-08T10:10:00+09:00')] }), loops)).filter(x => x.label === 'general-purpose').map(x => x.cdx)
  assert.deepEqual(par([KL('c4-a', '2026-11-08T01:04:00Z', 'PASS')]), ['검증 보류(대상 불명)', '검증 보류(대상 불명)'])
  assert.deepEqual(par([KL('c4-x-a11111', '2026-11-08T01:04:00Z', 'PASS'), KL('c4-x-a22222', '2026-11-08T01:05:00Z', 'FAIL')]), ['검증 Y', '검증 N'])
  // wrote 미기록이어도 자기 접미 c4 원장이 창 안에 있으면 판정 대상
  const g3 = ag('general-purpose', '2026-11-08T10:01:00+09:00', { agent_id: 'a33333f00d', ts_end: '2026-11-08T10:03:00+09:00' })
  assert.equal(AL(buildRequestGraph(turn({ agents_detail: [g3] }), [KL('c4-x-a33333', '2026-11-08T01:04:00Z', 'PASS')])).find(n => n.aid === 'a33333f00d').cdx, '검증 Y')
  assert.equal(AL(buildRequestGraph(turn({ agents_detail: [adm] }), [KL('c6-x-admin', '2026-11-08T01:22:00Z', 'PASS')])).find(x => x.label === 'teamanakin-admin').cdx, '판정 대상 아님')
  // 불변식 : 모든 실행 = 판정 상태 하나
  const states = new Set(['검증 Y', '검증 N', '검증 보류', '검증 보류(대상 불명)', '검증 진행', '검증 대기', '검증 누락', '판정 대상 아님'])
  assert.ok(AL(buildRequestGraph(turn({ agents_detail: [A, B2, ag('anakin_phase-collect', null, { ts_end: null }), adm] }), [])).filter(x => !x.slot).every(x => states.has(x.cdx)))
})

test('경보 : 장시간·오류 다발은 에이전트 상세와 요청 경보에, 검증 누락은 CDX-루프 칸에만(2026-11-10 개정)', () => {
  const long = ag('general-purpose', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T11:19:00+09:00', errors: 5 })
  const ns = buildRequestGraph(turn({ agents_detail: [long] }), []), a = AL(ns).find(n => !n.slot)
  assert.deepEqual(a.alerts, ['장시간', '오류 다발']); assert.match(node(ns, '1').lines.at(-1), /general-purpose 장시간 · general-purpose 오류 다발$/)
  assert.ok(node(ns, '1.1').chips.some(c => c.txt === '✖ 도구 오류 5 · ⚠ 장시간' && c.tone === 'bad'))
  const nw = buildRequestGraph(turn({ agents_detail: [{ ...long, wrote: true }] }), [])
  assert.deepEqual(AL(nw).find(n => !n.slot).alerts, ['장시간', '오류 다발']); assert.match(node(nw, '1').lines.at(-1), /CDX-루프 검수 검증 누락/)
  assert.deepEqual(nodeAlerts({ t0: P('2026-11-08T10:20:00+09:00'), t1: null, run: true }, 0, P('2026-11-08T11:00:00+09:00')), ['장시간'])
  assert.deepEqual(ALERT, { longMs: 30 * 60e3, errors: 5, nearCap: 4, cap: 5 })
  // 회차 단위 판정(복원 — c4-verify-codex-ac0222-p1 D-001) : 같은 78분을 25분 회차 3개로 나누면 장시간 아님(전체 소요 집계 회귀 검출), 진행 20분·오류 4회 = 경보 없음
  const split = { ...long, errors: 1, rounds: [0, 26, 52].map(m => ({ t0: P('2026-11-08T10:01:00+09:00') + m * 60e3, t1: P('2026-11-08T10:01:00+09:00') + (m + 25) * 60e3, run: false, errors: 0 })) }
  const s = AL(buildRequestGraph(turn({ agents_detail: [split] }), [])).find(n => !n.slot)
  assert.equal(s.alerts, undefined); assert.equal(s.rounds[0].rows.length, 3)
  assert.deepEqual(nodeAlerts({ t0: P('2026-11-08T10:40:00+09:00'), t1: null, run: true }, 4, P('2026-11-08T11:00:00+09:00')), [])
})

test('Codex 칸 매핑(2026-11-10 개정) : 원장 id 접두 c4- → CDX-루프, 검수 대상·호출 규칙 정의, 과거 접두(c1·c2·c3·c5·c6) = 집계 제외', () => {
  assert.equal(codexNo('c4-codex-wiring'), 4); assert.equal(codexNo('first-call'), null); assert.equal(codexNo('c7-x'), null)
  const ns = buildRequestGraph(turn({ tools: { Read: 1 } }), [loop('c4-hooks', [ev2(1, 'FAIL', '10')])])
  const c = node(ns, '1.1.4.1'); assert.equal(c.statusLabel, '검증 N · 1회차 진행 (1/5)'); assert.equal(c.badge, '매핑 연결')
  assert.deepEqual(SLOTS.filter(s => s.kind === 'codex').map(s => s.id), ['1.1.4.1'])
  const s = SLOTS.find(x => x.id === '1.1.4.1'); assert.match(s.role, /^Codex4 검수 대상 : 파일을 바꾼 에이전트의 산출물\(하네스 파일 포함\)/); assert.match(s.criteria, /원장 id 접두 c4-/)
  assert.match(s.criteria, /SubagentStop 훅 자동/); assert.ok(!SLOTS.some(s => /verify/.test(s.role + s.criteria)))
  assert.match(SLOTS.find(x => x.id === '1.1.3').role, /하네스 파일 변경의 Codex 판정 = CDX-루프\(c4\)에 귀속/)
  for (const id of ['c1-x', 'c2-x', 'c3-x', 'c5-x', 'c6-x-admin', 'c4-turn-f7dc16-1108100000']) assert.equal(isLoopLedger({ id }), false, id)
  for (const l of [{ id: 'c4-x-a1b2c3' }, { id: 'c4-x-a1b2c3-p2' }, { id: 'loop-docs' }]) assert.equal(isLoopLedger(l), true, l.id)
  assert.equal(isLoopLedger({ id: 'c4-x-decide-a1b2c3', agentType: 'anakin_phase-decide' }), false)
})

test('백그라운드 워크플로 재개 턴 : 요청 시각보다 앞서 시작한 귀속 에이전트 구간의 Codex 판정도 연결', () => {
  const t = turn({ ts_req: '2026-11-09T13:49:00+09:00', ts_res: '2026-11-09T13:55:00+09:00', agents_detail: [ag('anakin_phase-build', '2026-11-09T08:17:00+09:00', { ts_end: '2026-11-09T08:20:00+09:00', wrote: true })] })
  const c = node(buildRequestGraph(t, [loop('c4-wf', [{ iter: 1, at: '2026-11-09T08:31:00+09:00', verdict: 'PASS', open: 0 }], { startedAt: '2026-11-09T08:21:00+09:00' })]), '1.1.4.1')
  assert.equal(c.rounds[0].rows.length, 1); assert.equal(c.status, 'done')
})

test('C-10 프롬프트 칸 = 원문 그대로 축약(주입문·system-reminder·이미지 제거, 공백 정리, 글자 수 초과 …) — 줄은 원문 부분 문자열, 추가 지시 = 시각순 번호', () => {
  const raw = '모든 프로세스는   순차적으로\n연결되어 있어야 해 [Image #3] <system-reminder>주입 SECRET 내용</system-reminder> 그리고 <teammate-message teammate_id="x">훅 주입문</teammate-message> 내가 요청하지 않은 프로세스는 왜 생겼는지 설명해 줘 그리고 그래프를 다시 그려 줘 끝까지 길게 이어지는 문장'
  const clean = cleanPrompt(raw)
  assert.ok(!/system-reminder|SECRET|훅 주입문|Image/.test(clean)); assert.ok(!/\s{2}|\n/.test(clean))
  const ns = buildRequestGraph(turn({ req_head: raw }), []), chips = node(ns, '1.1.1').chips.slice(1).map(c => c.txt)
  assert.equal(chips.length, 3); assert.ok(chips.at(-1).endsWith('…'))
  for (const c of chips) assert.ok(clean.includes(c.replace(/…$/, '')), c)   // (a) 원문 부분 문자열만
  assert.ok(node(ns, '1.1.1').lines.includes(`요청 원문 : ${clean}`))   // 원문 전체 = 상세·md
  const two = buildRequestGraph(turn({ prompts: [{ t: P(T0), text: '첫 지시 원문' }, { t: P(T0) + 60e3, text: '추가 지시 <system-reminder>x</system-reminder> 원문' }] }), [])
  assert.deepEqual(node(two, '1.1.1').chips.map(c => c.txt), ['요청 2 · 브리프 0건', '1) 첫 지시 원문', '2) 추가 지시 원문'])
  // 메인 기록 → 요청 원문(사람 요청 + 큐 추가 지시, 메타·system-reminder 시작 글 제외)
  const recs = [{ type: 'user', timestamp: Z('01:00'), message: { content: '요청 A' } }, { type: 'user', isMeta: true, timestamp: Z('01:01'), message: { content: '메타' } }, { type: 'user', timestamp: Z('01:02'), message: { content: '<system-reminder>x</system-reminder>' } }, { type: 'attachment', timestamp: Z('01:03'), attachment: { type: 'queued_command', prompt: '추가 B' } }]
  assert.deepEqual(promptsOf(recs).map(p => p.text), ['요청 A', '추가 B'])
})

test('C-10 컨텍스트 칸 = 출처 머리 + 전·후(같은 세션 앞뒤 요청 원문 축약) + 좌우 + 요점, 캐시 없으면 자동 추출 / 캐시 있으면 캐시 문구', () => {
  const mk = () => [
    { key: 'a', session_id: 's1', turn: 1, ts_req: Z('00:50'), ts_res: Z('00:55'), req_head: '앞 요청 원문입니다', agents_detail: [] },
    { key: 'b', session_id: 's1', turn: 2, ts_req: Z('01:00'), ts_res: Z('01:30'), req_head: '이번 요청', agents_detail: [ag('anakin_phase-collect', Z('01:01'), { ts_end: Z('01:05'), report: ['핵심 사실 하나', '핵심 사실 둘'] })], resources: { hooks: [{ name: 'UserPromptSubmit', event: 'UserPromptSubmit', n: 2 }] } },
    { key: 'c', session_id: 's1', turn: 3, ts_req: Z('01:40'), ts_res: Z('01:45'), req_head: '뒤 요청 원문입니다', agents_detail: [] },
    { key: 'd', session_id: 's2', turn: 1, ts_req: Z('01:10'), ts_res: Z('01:20'), req_head: '다른 세션', agents_detail: [ag('anakin_phase-build', Z('01:11'), { ts_end: Z('01:19'), workflow: 'wf_x' })] },
  ]
  const ts = linkContext(mk(), P(Z('02:00'))), b = ts[1]
  assert.deepEqual(b.ctx, { prev: '앞 요청 원문입니다', next: '뒤 요청 원문입니다', overlap: ['workflow wf_x (s2)'] })
  const tx = ns => node(ns, '1.1.2').chips.map(c => c.txt)
  const auto = tx(buildRequestGraph(b, []))
  assert.deepEqual(auto, ['출처 : 주입 훅 2 · 읽기 0 · collect 1', '앞 요청 원문입니다', '뒤 요청 원문입니다', '주입 UserPromptSubmit', '동시 workflow wf_x (s2)', '핵심 사실 하나', '핵심 사실 둘', '자동 추출(요약 캐시 없음)', 'collect ×1 · 4m'])   // C-12 : 전·후·좌우·요점 제목 줄 없음
  for (const l of ['전', '후', '좌우', '요점']) assert.ok(!auto.includes(l), l)
  assert.deepEqual(node(buildRequestGraph(b, []), '1.1.2').chips.filter(c => c.sep).map(c => [c.sep, c.txt]), [['before', '앞 요청 원문입니다'], ['after', '뒤 요청 원문입니다'], ['related', '주입 UserPromptSubmit'], ['points', '핵심 사실 하나']])   // 구획 = 얇은 구분선 표식
  assert.ok(renderHtml({ design: false, outDir: '.', requests: [], meta: '' }).includes("class: 'chipsep'"))
  // 요약 캐시(graph 에이전트 작성) : 좌우·요점 = 캐시, 전·후 = 결정적 원문 + 캐시 보탬, 자동 추출 표식 없음
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-sum-'))
  try {
    assert.equal(summaryId(b), 's1_2')
    fs.writeFileSync(path.join(dir, 's1_2.json'), JSON.stringify({ before: ['11-09 게이트 경로 결정'], after: [], related: ['CLAUDE.md teamAnakin 절'], points: ['요점 A', 'PI_API_KEY=abc'], by: 'anakin_phase-graph', at: '2026-11-10T08:00' }))
    b.summary = loadSummary(dir, b, s => s.replace(/PI_API_KEY=\w+/, 'PI_API_KEY=***'))
    const c = tx(buildRequestGraph(b, []))
    assert.deepEqual(c, ['출처 : 주입 훅 2 · 읽기 0 · collect 1', '앞 요청 원문입니다', '11-09 게이트 경로 결정', '뒤 요청 원문입니다', 'CLAUDE.md teamAnakin 절', '요점 A', 'PI_API_KEY=***', 'collect ×1 · 4m'])
    assert.equal(loadSummary(dir, { session_id: 'none', turn: 1 }), null)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('하네스 변경 감지 : Write·Edit 대상이 하네스 경로면 harness true(읽기·비하네스 false), 로더 = 최상위·워크플로 기록, collect·기록 없음 = 미설정', () => {
  for (const p of ['.claude/hooks/x.mjs', 'C:/w/loginpi/.claude/settings.local.json', 'sitemap/schema.pi/.claude/agents/a.md', '.claude/engineering/40. loop/codex_procedure.md']) assert.ok(HARNESS_RE.test(p), p)
  for (const p of ['scripts/request-graph.mjs', '.claude/engineering/50. graph/x.md', 'CLAUDE.md']) assert.ok(!HARNESS_RE.test(p), p)
  const use = (name, file_path) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { file_path } }] } })
  assert.equal(harnessTouched([use('Edit', 'C:\\w\\loginpi\\.claude\\hooks\\a.mjs')]), true); assert.equal(harnessTouched([use('Read', '.claude/hooks/a.mjs'), use('Write', 'scripts/a.mjs')]), false)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-h-')), sub = path.join(dir, 's1', 'subagents'), wf = path.join(sub, 'workflows', 'wf_1')
  try {
    fs.mkdirSync(wf, { recursive: true })
    fs.writeFileSync(path.join(sub, 'agent-a1.jsonl'), JSON.stringify(use('Edit', '.claude/hooks/x.mjs')) + '\n'); fs.writeFileSync(path.join(wf, 'agent-a2.jsonl'), JSON.stringify(use('Write', 'scripts/y.mjs')) + '\n')
    const T = { session_id: 's1', agents_detail: [{ agent_id: 'a1', type: 'anakin_phase-build' }, { agent_id: 'a2', type: 'general-purpose', workflow: 'wf_1' }, { agent_id: 'a3', type: 'anakin_phase-build' }, { agent_id: 'a4', type: 'anakin_phase-collect' }] }
    loadAgentHarness([T], dir, path.join(dir, 'cache.json')); assert.deepEqual(T.agents_detail.map(x => [x.harness, x.wrote]), [[true, true], [false, true], [undefined, undefined], [undefined, undefined]])   // wrote = 파일 변경 실행(CDX-루프 판정 대상)
    const C2 = path.join(dir, 'cache.json'), cache = JSON.parse(fs.readFileSync(C2, 'utf8')); delete cache.a1.wrote; fs.writeFileSync(C2, JSON.stringify(cache))
    const T2 = { session_id: 's1', agents_detail: [{ agent_id: 'a1', type: 'anakin_phase-build' }] }; loadAgentHarness([T2], dir, C2); assert.equal(T2.agents_detail[0].wrote, true)   // wrote 없는 옛 캐시 = 다시 읽음
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('원장 묶음 AND(codex-gate 파일 묶음 -p<N>) : 전부 PASS 일 때만 Y, 하나라도 FAIL = N, 일부 판정 없음 = 보류, 나뉘기 전 기준 원장은 대체 — 칸 안 회차·상세에 묶음 표시', () => {
  assert.equal(partBase('c4-x-a1b2c3-p2'), 'c4-x-a1b2c3'); assert.equal(partBase('c4-x-a1b2c3'), 'c4-x-a1b2c3')
  const at = m => `2026-11-08T01:${m}:00Z`, L = (id, evs) => loop(id, evs.map(([iter, v, m]) => ({ iter, at: at(m), verdict: v, open: v === 'FAIL' ? 1 : 0 })), { startedAt: at('02') })
  const bd = ag('anakin_phase-build', '2026-11-08T10:01:00+09:00')
  const run = loops => node(buildRequestGraph(turn({ agents_detail: [bd] }), loops), '1.1.4.1')
  const broad = loop('c4-x-a1b2c3', [{ iter: 1, at: at('04'), verdict: 'BLOCKED', open: null, reason: 'scope-too-broad' }], { startedAt: at('02') })
  let c = run([broad, L('c4-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c4-x-a1b2c3-p2', [[1, 'FAIL', '11']])])
  assert.equal(c.statusLabel, '검증 N · 1회차 진행 (1/5)'); assert.deepEqual(c.rounds.map(g => g.name), ['Codex 판정 c4-x-a1b2c3'])   // 기준 원장 BLOCKED 는 대체 — 묶음 1개 단위
  assert.equal(c.chips[0].txt, '원장 c4-x-a1b2c3 (묶음 2개 AND)'); assert.match(c.lines[0], /묶음 c4-x-a1b2c3-p1 · c4-x-a1b2c3-p2 AND\(전부 PASS 일 때만 Y\)/)
  c = run([L('c4-x-a1b2c3-p1', [[1, 'PASS', '10'], [2, 'PASS', '20']]), L('c4-x-a1b2c3-p2', [[1, 'FAIL', '11'], [2, 'PASS', '21']])])
  assert.equal(c.statusLabel, '검증 Y · 2회 만에 완료'); assert.equal(c.verdict.fails, 1)
  c = run([L('c4-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c4-x-a1b2c3-p2', [])])
  assert.equal(c.status, 'blocked')   // 일부 묶음 판정 없음 = Y 아님
  // 실행별 판정(상세)도 묶음 AND : 대상 접미(-a1b2c3)가 기준 id 에 남는다
  const ns = buildRequestGraph(turn({ agents_detail: [{ ...bd, agent_id: 'a1b2c3ffff', ts_end: '2026-11-08T10:02:00+09:00' }] }), [L('c4-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c4-x-a1b2c3-p2', [[1, 'FAIL', '11']])])
  assert.equal(agentsOf(ns)[0].cdx, '검증 N')
  assert.deepEqual(mergeParts([{ id: 'c4-a', rows: [] }]), [{ id: 'c4-a', rows: [] }])   // 묶음 없음 = 그대로
})

test('원장 묶음 이월(후속 과제 1 · c4-1-3-a6a80f D-001·D-002) : 묶음 합성 행 = 판정 실행(시각 묶음)마다 1행, 묶음마다 기준 시각 T(+허용오차) 시점 최신 확정 행 — 회차 번호·창 안팎 무관, 미래 행 금지, 이월 FAIL 은 N 유지, 확정 행 없으면 보류', () => {
  const at = m => `2026-11-08T01:${m}:00Z`, L = (id, evs) => loop(id, evs.map(([iter, v, m]) => ({ iter, at: at(m), verdict: v, open: v === 'FAIL' ? 1 : 0 })), { startedAt: at('02') })
  const Ls = (id, evs) => loop(id, evs.map(([iter, v, s]) => ({ iter, at: `2026-11-08T${s}Z`, verdict: v, open: v === 'FAIL' ? 1 : v === 'BLOCKED' ? null : 0, ...(v === 'BLOCKED' ? { reason: 'scope-missing' } : {}) })), { startedAt: '2026-11-08T01:02:00Z' })
  const bd = ag('anakin_phase-build', '2026-11-08T10:01:00+09:00')
  const run = loops => node(buildRequestGraph(turn({ agents_detail: [bd] }), loops), '1.1.4.1')
  // (a) 실데이터 c4-d-002-a5870f 형태(시각 = 실측 간격) : p1 [1 BLOCKED, 1 PASS, 2 PASS] · p2 [1 FAIL, 2 PASS, 3 PASS] — 같은 판정 실행의 묶음끼리 1~3초 차
  //     고치기 전 : 3회차 p1 '판정 없음' → BLOCKED 가 최종(검증 보류)
  const c = run([Ls('c4-d-002-a5870f-p1', [[1, 'BLOCKED', '01:05:11'], [1, 'PASS', '01:15:21'], [2, 'PASS', '01:24:25']]), Ls('c4-d-002-a5870f-p2', [[1, 'FAIL', '01:05:14'], [2, 'PASS', '01:15:22'], [3, 'PASS', '01:24:27']])])
  assert.deepEqual(c.rounds[0].rows.map(r => [r.iter, r.verdict]), [[1, 'FAIL'], [2, 'PASS'], [3, 'PASS']]); assert.equal(c.statusLabel, '검증 Y · 3회 만에 완료'); assert.equal(c.verdict.yn, 'Y'); assert.equal(c.verdict.fails, 1)
  assert.ok(!JSON.stringify(c).includes('판정 없음')); assert.match(c.rounds[0].rows[0].state, /p1 BLOCKED · p2 FAIL/)
  assert.equal(c.rounds[0].rows[2].t1, Date.parse('2026-11-08T01:24:27Z')); assert.equal(c.rounds[0].rows[2].t0, Date.parse('2026-11-08T01:15:21Z'))   // 시각 = 그 실행의 실제 판정 행 기준
  // (b) 반대 : p1 [1 FAIL] · p2 [1 FAIL, 2 PASS] → 2회차 = p1 이월 FAIL(완화 아님) — 고치기 전 : BLOCKED
  const n = run([L('c4-x-a1b2c3-p1', [[1, 'FAIL', '10']]), L('c4-x-a1b2c3-p2', [[1, 'FAIL', '11'], [2, 'PASS', '21']])])
  assert.deepEqual(n.rounds[0].rows.map(r => r.verdict), ['FAIL', 'FAIL']); assert.equal(n.verdict.yn, 'N'); assert.match(n.rounds[0].rows[1].state, /p1 FAIL\(이월\) · p2 PASS/)
  // (d) 창 밖 이월 : 요청 A 창(10:00~10:30) = p1 1 PASS · p2 1 FAIL, 요청 B 창(10:40~10:59) = p2 2 PASS 만 → B = 2회차 Y(회차 집계는 B 창 2회차만), A = 1회차 N 그대로 — 고치기 전 : B 보류
  const ps = [L('c4-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c4-x-a1b2c3-p2', [[1, 'FAIL', '11'], [2, 'PASS', '45']])]
  const B = node(buildRequestGraph(turn({ ts_req: '2026-11-08T10:40:00+09:00', ts_res: '2026-11-08T10:59:00+09:00', agents_detail: [ag('anakin_phase-build', '2026-11-08T10:41:00+09:00', { wrote: true })] }), ps), '1.1.4.1')
  assert.equal(B.verdict.yn, 'Y', B.statusLabel); assert.deepEqual(B.rounds[0].rows.map(r => [r.iter, r.verdict]), [[2, 'PASS']]); assert.equal(B.verdict.fails, 0)
  const A = run(ps); assert.deepEqual(A.rounds[0].rows.map(r => [r.iter, r.verdict]), [[1, 'FAIL']]); assert.equal(A.verdict.yn, 'N')
  // (e) D-001 미래 반영 금지 : p1 은 이 요청 창 안에서 FAIL 뒤 BLOCKED 만, PASS 는 창 뒤(01:45) — 01:20 실행 시점 p1 최신 확정 = FAIL → N
  //     고치기 전 : 회차 번호 이월(iter < 3)이 미래 PASS(01:45)를 집어 Y
  const e = run([Ls('c4-x-a1b2c3-p1', [[1, 'FAIL', '01:05:00'], [2, 'BLOCKED', '01:15:00'], [2, 'BLOCKED', '01:20:00'], [2, 'PASS', '01:45:00']]), Ls('c4-x-a1b2c3-p2', [[1, 'FAIL', '01:05:01'], [2, 'PASS', '01:15:01'], [3, 'PASS', '01:20:01']])])
  assert.equal(e.verdict.yn, 'N', e.statusLabel); assert.equal(e.rounds[0].rows.at(-1).verdict, 'FAIL'); assert.match(e.rounds[0].rows.at(-1).state, /p1 FAIL\(이월\) · p2 PASS/)
  assert.ok(e.rounds[0].rows.every(r => r.t1 <= Date.parse('2026-11-08T01:30:00Z')))
  // (f) D-002 같은 실행의 창 밖 확정 행 = 시각 대조 : p1 2 PASS(01:29:59 창 안) · p2 2 PASS(01:30:30 창 밖, 허용오차 안) → 2회차 PASS
  //     고치기 전 : p2 2회차 행이 창 밖이라 앞 FAIL 이월 → N. 허용오차 밖(01:33:00) 행은 쓰지 않음 → N 유지
  const f = t2 => run([Ls('c4-x-a1b2c3-p1', [[1, 'FAIL', '01:05:00'], [2, 'PASS', '01:29:59']]), Ls('c4-x-a1b2c3-p2', [[1, 'FAIL', '01:05:01'], [2, 'PASS', t2]])])
  const f1 = f('01:30:30'); assert.equal(f1.verdict.yn, 'Y', f1.statusLabel); assert.deepEqual(f1.rounds[0].rows.map(r => [r.iter, r.verdict]), [[1, 'FAIL'], [2, 'PASS']])
  const f2 = f('01:33:00'); assert.equal(f2.verdict.yn, 'N', f2.statusLabel); assert.match(f2.rounds[0].rows.at(-1).state, /p1 PASS · p2 FAIL\(이월\)/)
})

test('승인 4 출처(후속 과제 3) : 창 뒤 판정이 요청 B(FAIL)·C(PASS)에 걸치면 최종 판정 출처 = 최종 행이 있는 요청 C', () => {
  const X = 'a9b49e0001', bx = (s, e, extra = {}) => ag('anakin_phase-build', Z(s), { agent_id: X, ts_end: Z(e), wrote: true, ...extra })
  const A = { session_id: 's', turn: 96, ts_req: Z('01:00'), ts_res: Z('01:20'), req_head: 'A', agents_detail: [bx('01:01', '01:10')] }
  const B = { session_id: 's', turn: 97, ts_req: Z('01:30'), ts_res: Z('02:00'), req_head: 'B', agents_detail: [bx('01:31', '01:50', { cont: true })] }
  const C = { session_id: 's', turn: 98, ts_req: Z('02:10'), ts_res: Z('02:30'), req_head: 'C', agents_detail: [bx('02:11', '02:20', { cont: true })] }
  const ev = (i, m, v) => ({ iter: i, at: Z(m), verdict: v, open: v === 'FAIL' ? 1 : 0 }), peers = [A, B, C], cx = ns => node(ns, '1.1.4.1')
  // 창 안 판정 있음(최종 판정 이어받음) — 고치기 전 : '(요청 97)'
  const L = loop('c4-build-a9b49e', [ev(1, '01:09', 'FAIL'), ev(2, '01:45', 'FAIL'), ev(3, '02:15', 'PASS')], { startedAt: Z('01:08') })
  const a = cx(buildRequestGraph(A, [L], { peers }))
  assert.equal(a.verdict.yn, 'Y'); assert.match(a.statusLabel, /최종 판정 이어받음\(요청 98\)/); assert.ok(a.chips.some(c => c.txt === '최종 판정 c4-build-a9b49e(요청 98) 3회 Y'))
  // 창 안 판정 없음(이어받은 원장) — 같은 규칙
  const L2 = loop('c4-build-a9b49e', [ev(1, '01:45', 'FAIL'), ev(2, '02:15', 'PASS')], { startedAt: Z('01:40') })
  assert.match(cx(buildRequestGraph(A, [L2], { peers })).statusLabel, /^검증 Y · 이어받은 원장\(요청 98\)/)
})

// ── 2026-11-10 개정 : 턴 묶음 판정 폐지(과거 원장 무시) · 종료 승인 줄 = 기록용(Stop 훅 turn-gate.mjs 기록기) ──
test('과거 원장 무시(2026-11-10 개정) : c1·c2·c3·c5·c6·c*-turn-*·비대상 에이전트 원장을 넣어도 노드·집계 불변, loadLoops = bundle- 제외 + gate.json agentType', () => {
  const key = 'f7dc16-1108100000'
  assert.ok(TURN_ID_RE.test(`c1-turn-${key}`)); assert.ok(!TURN_ID_RE.test('c4-turn-gate-a1b2c3'))   // 에이전트 설명 슬러그 'turn-…' 과 구분
  const at = '2026-11-08T01:20:00Z', old = [...[1, 2, 3, 4, 5, 6].map(no => KL(`c${no}-turn-${key}`, at, no === 3 ? 'FAIL' : 'PASS')), KL('c2-collect-a0b1c2', at, 'FAIL'), KL('c5-graph-a0b1c2', at, 'FAIL'), { ...KL('c4-x-decide-a0b1c2', at, 'FAIL'), agentType: 'anakin_phase-decide' }]
  const t = () => turn({ tools: { Read: 2 }, agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:05:00+09:00', agent_id: 'a0b1c2d3e4' })] })
  assert.equal(JSON.stringify(buildRequestGraph(t(), old)), JSON.stringify(buildRequestGraph(t(), [])))
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-loops-'))
  try {
    for (const id of [`bundle-turn-${key}`, `c1-turn-${key}`, 'c4-x-a0b1c2']) { fs.mkdirSync(path.join(d, id)); fs.writeFileSync(path.join(d, id, 'ledger.json'), JSON.stringify({ id, startedAt: at, iters: [{ iter: 1, at, verdict: 'PASS', openDefects: [] }] })) }
    fs.writeFileSync(path.join(d, 'c4-x-a0b1c2', 'gate.json'), JSON.stringify({ agentType: 'anakin_phase-build' }))
    assert.deepEqual(loadLoops(d).map(l => [l.id, l.agentType]), [[`c1-turn-${key}`, undefined], ['c4-x-a0b1c2', 'anakin_phase-build']])
    assert.deepEqual(loadLoops(d).filter(isLoopLedger).map(l => l.id), ['c4-x-a0b1c2'])
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
})

test('면제 해소(2026-11-10 팀장 지적 · c4-loadloops-a1b42f D-001) : 열린 결함 전부 waived + met 아닌 기준마다 근거(기준 id 면제·evidence 의 면제 결함 id) = Y(면제) · 일부 면제·면제 없음·독립 미충족 기준·래퍼 보충 기준 = N — 훅 liveDefects 와 같은 결함 판단', async () => {
  const { liveDefects } = await import('../.claude/hooks/codex-gate.mjs')
  const at = '2026-11-08T01:10:00Z', d = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-waive-'))
  const by = 'teamanakin-admin CONDITIONAL 2026-11-10', W = { reason: '근거', at, iter: 1, by }
  const defects = [{ id: 'D-001', status: 'open', file: 'a.mjs' }, { id: 'D-002', status: 'regressed', file: 'b.mjs' }, { id: 'D-003', status: 'fixed', file: 'c.mjs' }]
  // 기준 : AC-1 met · AC-2 unmet(근거 D-001) · AC-3 unverifiable(근거 D-002) — 결함 면제로만 생긴 미충족
  const crit = [{ id: 'AC-1', status: 'met', evidence: '확인' }, { id: 'AC-2', status: 'unmet', evidence: 'D-001 때문에 미충족' }, { id: 'AC-3', status: 'unverifiable', evidence: '(D-002) 로 확인 불가' }]
  const mk = (id, waived, criteria = crit, extra = {}) => {   // criteria null = 결과에 criteria 키 없음, extra = 원장 추가 필드(criteriaIds)
    fs.mkdirSync(path.join(d, id))
    fs.writeFileSync(path.join(d, id, 'iter-1.codex.json'), JSON.stringify({ verdict: 'FAIL', ...(criteria === null ? {} : { criteria }), defects }))
    fs.writeFileSync(path.join(d, id, 'ledger.json'), JSON.stringify({ id, startedAt: '2026-11-08T01:02:00Z', iters: [{ iter: 1, at, verdict: 'FAIL', openDefects: ['D-001', 'D-002'] }], waived, ...extra }))
  }
  const bd = ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { agent_id: 'a1b2c3d4e5', ts_end: '2026-11-08T10:05:00+09:00', wrote: true })
  const cx = id => node(buildRequestGraph(turn({ agents_detail: [bd] }), loadLoops(d).filter(l => l.id === id)), '1.1.4.1')
  try {
    const all = { 'D-001': W, 'D-002': W }, filled = { id: 'AC-4', status: 'unverifiable', evidence: '판정자 출력에 없음 — 래퍼가 채움 D-001' }
    mk('c4-all-a1b2c3', all, crit, { criteriaIds: ['AC-1', 'AC-2', 'AC-3'] }); mk('c4-part-a1b2c3', { 'D-001': W }); mk('c4-none-a1b2c3', {})
    mk('c4-indep-a1b2c3', all, [...crit, { id: 'AC-5', status: 'unmet', evidence: '문서 갱신 누락' }])   // 결함과 무관한 미충족 기준
    mk('c4-filled-a1b2c3', all, [...crit, filled])                                                          // 래퍼 보충 = (b) 불인정
    mk('c4-acw-a1b2c3', { ...all, 'AC-4': W, 'AC-5': W }, [...crit, filled, { id: 'AC-5', status: 'unmet', evidence: '문서 갱신 누락' }])   // (a) 기준 id 면제 = 해소
    // 근거 확인 불가(2회차 D-001) : criteria 누락 · 빈 배열 · 원장 계약 기준(criteriaIds) id 가 결과에 없음
    mk('c4-nocrit-a1b2c3', all, null); mk('c4-emptycrit-a1b2c3', all, []); mk('c4-missid-a1b2c3', all, crit, { criteriaIds: ['AC-1', 'AC-2', 'AC-3', 'AC-9'] })
    // 전부 면제 → 면제 해소 : Y 취급(N·검증 누락 아님), 화면은 PASS 와 구별
    let c = cx('c4-all-a1b2c3')
    assert.equal(c.verdict.yn, 'Y'); assert.equal(c.status, 'done'); assert.ok(!c.alerts)
    assert.equal(c.statusLabel, `검증 Y · 1회 만에 완료 · Y(면제) — 면제 2건 · ${by}`)
    assert.match(c.chips[0].txt, /^1회 Y\(면제\) \d\d:\d\d · 면제 2건 · teamanakin-admin/)
    assert.equal(agentsOf(buildRequestGraph(turn({ agents_detail: [bd] }), loadLoops(d).filter(l => l.id === 'c4-all-a1b2c3')))[0].cdx, '검증 Y')
    assert.deepEqual(liveDefects(path.join(d, 'c4-all-a1b2c3')), [])   // 훅 판단도 열린 결함 0
    assert.equal(cx('c4-acw-a1b2c3').verdict.yn, 'Y'); assert.match(cx('c4-acw-a1b2c3').statusLabel, /Y\(면제\) — 면제 2건/)
    // 일부만 면제 · waived 없음 → FAIL 유지(훅도 열린 결함 있음)
    for (const id of ['c4-part-a1b2c3', 'c4-none-a1b2c3']) assert.ok(liveDefects(path.join(d, id)).length > 0, id)
    // 결함은 전부 면제됐지만 독립 미충족 기준 · 래퍼 보충 기준만 남음 → FAIL 유지
    for (const id of ['c4-part-a1b2c3', 'c4-none-a1b2c3', 'c4-indep-a1b2c3', 'c4-filled-a1b2c3', 'c4-nocrit-a1b2c3', 'c4-emptycrit-a1b2c3', 'c4-missid-a1b2c3']) {
      c = cx(id); assert.equal(c.verdict.yn, 'N', id); assert.match(c.statusLabel, /^검증 N/, id); assert.ok(!/면제/.test(c.statusLabel), id)
    }
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
})

test('원장↔요청 창 (c4-codex-ac436f-p1 D-001·D-002) : 요청 전 원장 = 귀속 에이전트 접미·접미 없음만(재개 A6 유지), 요청 창 안 = 시간창 매칭', () => {
  const cx = ns => node(ns, '1.1.4.1')
  // 요청 시작(10:00) 전 다른 실행(접미 a9f8e7 — 이 요청 귀속 아님) 원장 = 귀속 에이전트가 창을 앞(09:00)으로 넓혀도 연결 안 함, 귀속 에이전트 접미 원장 = 연결(재개)
  const bd = ag('anakin_phase-build', '2026-11-08T09:00:00+09:00', { agent_id: 'a1b2c3d4e5', ts_end: '2026-11-08T10:20:00+09:00', wrote: true })
  let ns = buildRequestGraph(turn({ agents_detail: [bd] }), [KL('c4-codex-a9f8e7', '2026-11-08T00:43:00Z', 'FAIL'), KL('c4-build-a1b2c3', '2026-11-08T00:30:00Z', 'PASS')])
  assert.deepEqual(cx(ns).rounds.map(g => g.name), ['Codex 판정 c4-build-a1b2c3']); assert.equal(cx(ns).verdict.yn, 'Y')   // 요청 전 다른 대상 원장이 N 으로 만들지 않는다
  // 요청 창 안 다른 대상 원장 = 종전처럼 시간창 매칭
  ns = buildRequestGraph(turn(), [KL('c4-codex-a9f8e7', '2026-11-08T01:10:00Z', 'PASS')])
  assert.equal(cx(ns).rounds?.[0]?.name, 'Codex 판정 c4-codex-a9f8e7')
})

test('종료 승인 유예(c4-codex-ac436f-p1 D-003) : 응답 뒤 60초 유예는 같은 세션 다음 요청 시작 전까지만', async () => {
  const { loadToolEvents } = await import('../scripts/request-graph.mjs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ap-'))
  try {
    const A = (t, text) => ({ type: 'assistant', timestamp: t, message: { content: [{ type: 'text', text }] } })
    fs.writeFileSync(path.join(dir, 's9.jsonl'), [A('2026-11-08T01:00:30Z', '종료 승인 : 승인 — 앞 요청'), A('2026-11-08T01:00:50Z', '종료 승인 : 보류 — 다음 요청')].map(j => JSON.stringify(j)).join('\n') + '\n')
    const ts = [{ session_id: 's9', ts_req: '2026-11-08T01:00:00Z', ts_res: '2026-11-08T01:00:20Z' }, { session_id: 's9', ts_req: '2026-11-08T01:00:40Z', ts_res: '2026-11-08T01:01:00Z' }]
    loadToolEvents(ts, dir, null)
    assert.deepEqual(ts[0].approvals.map(x => x.why), ['앞 요청']); assert.deepEqual(ts[1].approvals.map(x => x.why), ['다음 요청'])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('승인 칸 1.2 : 종료 승인 줄 있으면 완료(시각·승인/보류·근거 칸 안 줄), 없으면 미실행, 상한 기록 = 승인 강제 실패, 팀장 실행은 칸 안 줄', async () => {
  const { approvalOf, approvalsOf } = await import('../scripts/request-graph.mjs')
  assert.deepEqual(approvalOf('보고 본문\n\n종료 승인 : 승인 — 칸 전부 Y'), { kind: '승인', why: '칸 전부 Y' })
  assert.deepEqual(approvalOf('**종료 승인 : 보류 — Codex 인증 만료(judge-unavailable)**'), { kind: '보류', why: 'Codex 인증 만료(judge-unavailable)' })
  assert.equal(approvalOf('종료 승인 줄을 쓰라'), null)
  const recs = [{ type: 'assistant', timestamp: '2026-11-08T01:29:00Z', message: { content: [{ type: 'text', text: '결과\n종료 승인 : 승인 — 전부 Y' }] } }, { type: 'assistant', isSidechain: true, timestamp: '2026-11-08T01:29:30Z', message: { content: [{ type: 'text', text: '종료 승인 : 승인 — 서브에이전트 글' }] } }]
  assert.deepEqual(approvalsOf(recs), [{ t: P('2026-11-08T01:29:00Z'), kind: '승인', why: '전부 Y' }])   // 메인 글만
  const adm = ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')
  let ns = buildRequestGraph(turn({ agents_detail: [adm], approvals: approvalsOf(recs) }), [])
  let n = node(ns, '1.2'); assert.equal(n.status, 'done'); assert.equal(n.statusLabel, '종료 승인 승인'); assert.equal(n.chips[0].txt, '종료 승인 10:29 승인 — 전부 Y')
  assert.ok(n.chips.some(c => c.txt.startsWith('admin ×1')), '팀장 실행 = 칸 안 줄'); assert.ok(route(buildPath(ns)).includes('1.2'))
  ns = buildRequestGraph(turn({ agents_detail: [adm] }), []); n = node(ns, '1.2')
  assert.equal(n.status, 'notrun'); assert.match(n.lines[0], /종료 승인 : <승인\|보류> — <근거>' 줄 없음/)   // 팀장 실행만으로는 완료 아님
  { const pp = buildPath(ns), e = pp.edges.find(x => x.to === '1.2'); assert.deepEqual(route(pp).slice(-2), ['1.2', 'E']); assert.equal(route(pp).at(-3), '1.1.5', route(pp).join(',')); assert.equal(e.label, '⚠ 승인 미실행') }   // D-002 : … → SA-그래프 → 승인(미실행 경고) → 종료(CDX-총괄 폐지)
  ns = buildRequestGraph(turn({ forced: [{ at: '2026-11-08T01:30:00Z', why: '연속 차단 3회' }] }), []); n = node(ns, '1.2')
  assert.equal(n.statusLabel, '승인 강제 실패'); assert.deepEqual(n.alerts, ['승인 강제 실패']); assert.match(node(ns, '1').lines.join(' '), /승인 강제 실패/)
})

test('c4-build-loop-only-aef4b3-p3 D-001 : 파일 변경 에이전트 A·B 중 A 원장만 PASS = CDX-루프 검증 누락 경보(Y 로 덮지 않음), 둘 다 원장 = Y, 진행 중 = 대기', () => {
  const at = '2026-11-08T10:02:00+09:00', A = ag('general-purpose', at, { agent_id: 'a11111f00d', wrote: true }), B = ag('anakin_phase-build', '2026-11-08T10:06:00+09:00', { agent_id: 'a22222f00d', wrote: true })
  let ns = buildRequestGraph(turn({ agents_detail: [A, B] }), [KL('c4-x-a11111', '2026-11-08T01:04:00Z', 'PASS')]), cx = node(ns, '1.1.4.1')
  assert.equal(cx.statusLabel, '검증 누락'); assert.deepEqual(cx.alerts, ['검증 누락']); assert.notEqual(cx.verdict.yn, 'Y')
  assert.match(cx.lines.join(' '), /원장 없는 파일 변경 실행 1건 — anakin_phase-build\(a22222\)/); assert.equal(ns[0].check.miss, 1); assert.equal(ns[0].alertN, 1)
  // 원장 FAIL + 다른 실행 원장 없음 = N 유지 + 누락 경보
  cx = node(buildRequestGraph(turn({ agents_detail: [A, B] }), [KL('c4-x-a11111', '2026-11-08T01:04:00Z', 'FAIL')]), '1.1.4.1')
  assert.equal(cx.verdict.yn, 'N'); assert.deepEqual(cx.alerts, ['검증 누락'])
  // 둘 다 원장(묶음 -pN 포함) = Y
  cx = node(buildRequestGraph(turn({ agents_detail: [A, B] }), [KL('c4-x-a11111', '2026-11-08T01:04:00Z', 'PASS'), KL('c4-y-a22222-p1', '2026-11-08T01:08:00Z', 'PASS'), KL('c4-y-a22222-p2', '2026-11-08T01:08:00Z', 'PASS')]), '1.1.4.1')
  assert.match(cx.statusLabel, /^검증 Y/); assert.equal(cx.alerts, undefined)
  // 진행 중 요청 : 원장 없는 실행 = 대기(경보 아님)
  cx = node(buildRequestGraph(turn({ ts_res: null, agents_detail: [A, { ...B, ts_end: null, live: true }] }), [KL('c4-x-a11111', '2026-11-08T01:04:00Z', 'PASS')], { now: P('2026-11-08T10:25:00+09:00') }), '1.1.4.1')
  assert.equal(cx.statusLabel, '검증 대기 — 판정 전'); assert.equal(cx.alerts, undefined)
})

test('c4-build-loop-only-aef4b3-p3 D-002 : 셸로만 파일을 바꾼 실행도 wrote(codex-gate 귀속 함수 공유 — Bash·PowerShell + 기준선 diff ∩ 시간창), 셸 없음·창 밖·생성물만 = false', async () => {
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-sh-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ses-')), g = (...a) => spawnSyncGit(r, a)
  try {
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); g('add', '-A'); g('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString()
    const use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })   // 세션 기록 = 저장소 밖(실제 ~/.claude 와 같음 — 기록 파일이 git 미추적 변경으로 섞이지 않게)
    const put = (id, recs) => fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    fs.writeFileSync(path.join(r, 'bash-made.mjs'), 'x')   // 셸 산출(수정 시각 = 지금)
    put('a1', [use(now - 60e3, 'Bash', { command: 'node gen.mjs > bash-made.mjs' }), use(now + 60e3, 'Read', { file_path: 'x' })])      // 셸 + 창 안 = true
    put('a2', [use(now - 60e3, 'Read', { file_path: 'x' }), use(now + 60e3, 'Read', { file_path: 'y' })])               // 셸 없음 = false
    put('a3', [use(now - 600e3, 'Bash', { command: 'ls bash-made.mjs' }), use(now - 300e3, 'Read', { file_path: 'y' })])              // 셸 + 끝난 창 밖 변경 = false
    const T = { session_id: 's1', agents_detail: ['a1', 'a2', 'a3'].map(id => ({ agent_id: id, type: 'general-purpose', ts_end: iso(now + 60e3) })) }
    const attr = o => cg.attributeOf?.({ ...o, root: r })
    loadAgentHarness([T], ses, path.join(r, 'cache.json'), { attribute: cg.attributeOf ? attr : undefined })
    assert.deepEqual(T.agents_detail.map(x => x.wrote), [true, false, false])
    // 생성물(설계도판)만 Write = 판정 대상 아님(codex-gate 와 같은 splitScope) — 옛 규칙(wroteFiles)은 true 였음
    put('a4', [use(now, 'Write', { file_path: path.join(r, '.claude', 'engineering', '50. graph', 'myRequestGraph.html') })])
    const T2 = { session_id: 's1', agents_detail: [{ agent_id: 'a4', type: 'anakin_phase-build', ts_end: iso(now) }] }
    loadAgentHarness([T2], ses, path.join(r, 'cache2.json'), { attribute: cg.attributeOf ? attr : undefined }); assert.equal(T2.agents_detail[0].wrote, false)
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('c4-fail-5-aeb16d-p2 D-001 : 셸 변경 실행 B 종료 뒤 다른 실행이 같은 파일을 다시 고쳐도 B.wrote·CDX-루프 누락 경보 유지 — 종료 시점 귀속 기록 우선, 기록 없는 과거 실행 = 추정 + 캐시 단조', async () => {
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-re-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ses-')), g = (...a) => spawnSyncGit(r, a)
  try {
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); g('add', '-A'); g('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString(), f = path.join(r, 'shared.mjs')
    const use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })   // 세션 기록 = 저장소 밖(실제 ~/.claude 와 같음 — 기록 파일이 git 미추적 변경으로 섞이지 않게)
    const put = (id, recs) => fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    const recsB = [use(now - 60e3, 'Bash', { command: 'node gen.mjs > shared.mjs' }), use(now + 60e3, 'Read', { file_path: 'x' })]
    fs.writeFileSync(f, 'B 셸 산출'); put('abbbbb01', recsB)
    const attr = o => (cg.attributionFor || cg.attributeOf)({ ...o, root: r })
    // ① 종료 시점(SubagentStop) 귀속 기록 — 훅이 남긴다
    cg.saveAttrib?.('abbbbb01', cg.attributeOf({ recs: recsB, tp: path.join(sub, 'agent-abbbbb01.jsonl'), mainTp: null, agentId: 'abbbbb01', root: r }))
    // ② 다른 실행이 B 종료(+60초) 뒤 같은 파일을 다시 수정
    fs.writeFileSync(f, '다른 실행 재수정'); const later = new Date(now + 600e3); fs.utimesSync(f, later, later)
    const B = { agent_id: 'abbbbb01', type: 'anakin_phase-build', ts_start: iso(now - 60e3), ts_end: iso(now + 60e3) }, A = { agent_id: 'aaaaaa01', type: 'general-purpose', ts_start: iso(now - 120e3), ts_end: iso(now - 90e3), wrote: true }
    const T = { session_id: 's1', ts_req: iso(now - 200e3), ts_res: iso(now + 700e3), req_head: '요청', agents_detail: [A, B] }
    loadAgentHarness([T], ses, path.join(r, 'cache.json'), { attribute: attr })   // 그래프 첫 집계 = 재수정 뒤
    assert.equal(B.wrote, true, '종료 시점 기록 우선'); assert.ok(!B.wroteEst)
    const cx = node(buildRequestGraph(T, [KL('c4-x-aaaaaa', iso(now - 80e3), 'PASS')]), '1.1.4.1')
    assert.equal(cx.statusLabel, '검증 누락'); assert.deepEqual(cx.alerts, ['검증 누락'])
    // ③ 기록 없는 과거 실행 = 추정 판단, 한 번 true 면 이후 재계산(기록 길이 변화)에서 파일 시각이 바뀌어도 false 로 내리지 않음(단조)
    const recsC = [use(now - 60e3, 'Bash', { command: 'node gen2.mjs > c.mjs' }), use(now + 60e3, 'Read', { file_path: 'x' })]
    const f2 = path.join(r, 'c.mjs'); fs.writeFileSync(f2, 'C 셸 산출'); fs.utimesSync(f2, new Date(now), new Date(now)); put('accccc01', recsC)
    const C = { agent_id: 'accccc01', type: 'general-purpose', ts_end: iso(now + 60e3) }, T2 = { session_id: 's1', agents_detail: [C] }, cache = path.join(r, 'cache2.json')
    loadAgentHarness([T2], ses, cache, { attribute: attr }); assert.equal(C.wrote, true); assert.equal(C.wroteEst, true)
    fs.utimesSync(f2, later, later); put('accccc01', [...recsC, use(now + 61e3, 'Read', { file_path: 'z' })])
    delete C.wrote; loadAgentHarness([T2], ses, cache, { attribute: attr }); assert.equal(C.wrote, true, '단조 — true 유지')
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('c4-build-a9fcfc AC-2 그래프 형제 : 병렬 A(Edit x + node --test test/*.test.mjs)·A2(node --test 만)·B(Bash cat >> test/y.test.mjs) — 그래프 귀속(loadAgentHarness → attributionFor) A·A2 에 y 0건·B 에 y, A2 wrote=false·B 원장 없음 = 검증 누락', async () => {
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-par-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ses-')), g = (...a) => spawnSyncGit(r, a)
  try {
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); fs.mkdirSync(path.join(r, 'test')); fs.writeFileSync(path.join(r, 'test', 'x.test.mjs'), '1'); fs.writeFileSync(path.join(r, 'test', 'y.test.mjs'), '1'); g('add', '-A'); g('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString(), use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })   // 세션 기록 = 저장소 밖
    const put = (id, recs) => fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    const mt = (f, t) => fs.utimesSync(path.join(r, f), new Date(t), new Date(t))   // 수정 시각 = 기록의 쓰기 시각(시간창 겹침)
    fs.writeFileSync(path.join(r, 'test', 'x.test.mjs'), 'A'); mt('test/x.test.mjs', now - 40e3); fs.appendFileSync(path.join(r, 'test', 'y.test.mjs'), '\nB'); mt('test/y.test.mjs', now - 50e3)
    put('aaaaaa91', [use(now - 70e3, 'Read', { file_path: 'x' }), use(now - 40e3, 'Edit', { file_path: path.join(r, 'test', 'x.test.mjs') }), use(now - 10e3, 'Bash', { command: 'node --test test/*.test.mjs' })])
    put('accccc91', [use(now - 70e3, 'Read', { file_path: 'x' }), use(now - 10e3, 'Bash', { command: 'node --test test/*.test.mjs' })])
    put('abbbbb91', [use(now - 65e3, 'Read', { file_path: 'y' }), use(now - 50e3, 'Bash', { command: "cat >> test/y.test.mjs <<'EOF'\ntest('t', () => { assert.ok(a > b) })\nEOF" })])
    const seen = {}, attr = o => { const res = cg.attributionFor({ ...o, root: r }); seen[o.agentId] = res.files; return res }   // 그래프가 넘기는 인자(tp·mainTp·closed) 그대로 + 시험 저장소 root
    const A = { agent_id: 'aaaaaa91', type: 'anakin_phase-build', ts_start: iso(now - 70e3), ts_end: iso(now - 10e3) }, A2 = { agent_id: 'accccc91', type: 'general-purpose', ts_start: iso(now - 70e3), ts_end: iso(now - 10e3) }, B = { agent_id: 'abbbbb91', type: 'general-purpose', ts_start: iso(now - 65e3), ts_end: iso(now - 50e3) }
    const T = { session_id: 's1', ts_req: iso(now - 200e3), ts_res: iso(now + 700e3), req_head: '요청', agents_detail: [A, A2, B] }
    loadAgentHarness([T], ses, path.join(r, 'cache.json'), { attribute: attr, recordAt: cg.attribAt })
    assert.deepEqual(seen, { aaaaaa91: ['test/x.test.mjs'], accccc91: [], abbbbb91: ['test/y.test.mjs'] })   // 고치기 전 : A·A2 에 test/y.test.mjs(디렉터리 일치 2차 귀속)
    assert.deepEqual([A.wrote, A2.wrote, B.wrote], [true, false, true])
    let cx = node(buildRequestGraph(T, [KL('c4-x-aaaaaa', iso(now - 5e3), 'PASS'), KL('c4-y-abbbbb', iso(now - 5e3), 'PASS')]), '1.1.4.1')
    assert.match(cx.statusLabel, /^검증 Y/); assert.equal(cx.alerts, undefined)   // A2 = 판정 대상 아님(고치기 전 : A2 원장 없음 = 검증 누락)
    cx = node(buildRequestGraph(T, [KL('c4-x-aaaaaa', iso(now - 5e3), 'PASS')]), '1.1.4.1')
    assert.deepEqual(cx.alerts, ['검증 누락']); assert.match(cx.lines.join(' '), /원장 없는 파일 변경 실행 1건 — general-purpose\(abbbbb · 추정\)/)   // B = y 귀속 → 원장 없음 경보(훅 귀속 기록 없음 = 추정)
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('c4-fail-5-aeb16d-p2 iter-2 D-001 : 하네스 캐시(추정 false)가 먼저 생긴 뒤 종료 시점 귀속 기록(wrote=true)이 생기면 다시 집계 때 기록이 캐시보다 우선 — B.wrote true·누락 경보 유지, 기록 갱신(mtime)도 반영', async () => {
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-rc-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ses-')), g = (...a) => spawnSyncGit(r, a)
  try {
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); g('add', '-A'); g('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString(), id = 'abbbbb77'
    const use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })
    const recsB = [use(now - 60e3, 'Bash', { command: 'node gen.mjs > late.mjs' }), use(now + 60e3, 'Read', { file_path: 'x' })]
    fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), recsB.map(x => JSON.stringify(x)).join('\n') + '\n')
    const later = new Date(now + 600e3); fs.writeFileSync(path.join(r, 'late.mjs'), '재수정됨'); fs.utimesSync(path.join(r, 'late.mjs'), later, later)   // 창 밖 = 추정 false
    const attr = o => cg.attributionFor({ ...o, root: r }), opts = { attribute: attr, recordAt: cg.attribAt }, cache = path.join(r, 'cache.json')
    const B = () => ({ agent_id: id, type: 'anakin_phase-build', ts_start: iso(now - 60e3), ts_end: iso(now + 60e3) }), A = { agent_id: 'aaaaaa77', type: 'general-purpose', ts_start: iso(now - 120e3), ts_end: iso(now - 90e3), wrote: true }
    let b = B(); loadAgentHarness([{ session_id: 's1', agents_detail: [b] }], ses, cache, opts)
    assert.equal(b.wrote, false); assert.equal(JSON.parse(fs.readFileSync(cache, 'utf8'))[id].wrote, false)   // ① 캐시 = 추정 false
    cg.saveAttrib(id, { files: ['late.mjs'] })                                                                // ② 종료 시점 기록 wrote=true 가 나중에 생김(기록 파일·캐시 sig 그대로)
    b = B(); const T = { session_id: 's1', ts_req: iso(now - 200e3), ts_res: iso(now + 700e3), req_head: '요청', agents_detail: [A, b] }
    loadAgentHarness([T], ses, cache, opts)
    assert.equal(b.wrote, true, '기록이 캐시보다 우선'); assert.ok(!b.wroteEst)
    const cx = node(buildRequestGraph(T, [KL('c4-x-aaaaaa', iso(now - 80e3), 'PASS')]), '1.1.4.1'); assert.equal(cx.statusLabel, '검증 누락'); assert.deepEqual(cx.alerts, ['검증 누락'])
    // ③ 기록 갱신(재전달 뒤 훅이 wrote=false 로 다시 씀) — 기록 mtime 이 바뀌면 캐시(true) 대신 새 기록
    cg.saveAttrib(id, { files: [] }, now + 5e3); const fA = path.join(process.env.CODEX_GATE_STATE, 'codex-gate', 'attrib', `${id}.json`), t2 = new Date(Date.now() + 5e3); fs.utimesSync(fA, t2, t2)
    b = B(); loadAgentHarness([{ session_id: 's1', agents_detail: [b] }], ses, cache, opts); assert.equal(b.wrote, false, '갱신된 기록 반영')
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('c4-fail-5-aeb16d-p2 D-001 캐시·귀속 : 수정 전 판이 만든 {v:2, sig, wrote:false}(ra 없음) 캐시 + 귀속 기록 = 기록 반영, 다른 에이전트 기록 변경 = 재사용, 기록 삭제 = 재계산하되 true 유지(누락 경보 생존)', async () => {
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-rd-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ses-')), g = (...a) => spawnSyncGit(r, a)
  const id = 'abbbbb88', other = 'aooooo88', fA = path.join(process.env.CODEX_GATE_STATE, 'codex-gate', 'attrib', `${id}.json`)
  try {
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); g('add', '-A'); g('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString()
    const use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })
    const tp = path.join(sub, `agent-${id}.jsonl`); fs.writeFileSync(tp, [use(now - 60e3, 'Bash', { command: 'node gen.mjs > old.mjs' }), use(now + 60e3, 'Read', { file_path: 'x' })].map(x => JSON.stringify(x)).join('\n') + '\n')
    const later = new Date(now + 600e3); fs.writeFileSync(path.join(r, 'old.mjs'), '재수정됨'); fs.utimesSync(path.join(r, 'old.mjs'), later, later)   // 창 밖 = 추정 false
    let calls = 0; const attr = o => { calls++; return cg.attributionFor({ ...o, root: r }) }, opts = { attribute: attr, recordAt: cg.attribAt }, cache = path.join(r, 'cache.json')
    const st = fs.statSync(tp); fs.writeFileSync(cache, JSON.stringify({ [id]: { v: 2, sig: `${st.size}:${Math.round(st.mtimeMs)}`, harness: false, wrote: false } }))   // ① 수정 전 판 캐시(ra 칸 없음)
    cg.saveAttrib(id, { files: ['old.mjs'] })                                                                                              // 종료 시점 기록 = 파일 변경 있음
    const B = () => ({ agent_id: id, type: 'anakin_phase-build', ts_start: iso(now - 60e3), ts_end: iso(now + 60e3) }), A = { agent_id: 'aaaaaa88', type: 'general-purpose', ts_start: iso(now - 120e3), ts_end: iso(now - 90e3), wrote: true }
    const alarm = b => node(buildRequestGraph({ session_id: 's1', ts_req: iso(now - 200e3), ts_res: iso(now + 700e3), req_head: '요청', agents_detail: [A, b] }, [KL('c4-x-aaaaaa', iso(now - 80e3), 'PASS')]), '1.1.4.1').alerts
    let b = B(); loadAgentHarness([{ session_id: 's1', agents_detail: [b] }], ses, cache, opts)
    assert.equal(b.wrote, true, '옛 캐시 false 대신 귀속 기록'); assert.ok(!b.wroteEst); assert.deepEqual(alarm(b), ['검증 누락'])
    calls = 0; cg.saveAttrib(other, { files: ['x.mjs'] })                                                                                  // ② 다른 에이전트 기록 변경 = 이 에이전트 캐시 재사용
    b = B(); loadAgentHarness([{ session_id: 's1', agents_detail: [b] }], ses, cache, opts); assert.equal(calls, 0, '다른 기록 변경에 재판단 없음'); assert.equal(b.wrote, true)
    fs.rmSync(fA)                                                                                                                         // ③ 기록 삭제 = 재계산(추정 false)이지만 단조로 true 유지
    b = B(); loadAgentHarness([{ session_id: 's1', agents_detail: [b] }], ses, cache, opts); assert.equal(calls, 1, '기록 삭제 = 재판단'); assert.equal(b.wrote, true, '삭제 뒤에도 true'); assert.equal(b.wroteEst, true); assert.deepEqual(alarm(b), ['검증 누락'])
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }); fs.rmSync(fA, { force: true }); fs.rmSync(path.join(path.dirname(fA), `${other}.json`), { force: true }) }
})

test('c4-d-002-a5870f-p2 D-001 그래프 캐시 : 옛 귀속 규칙 판 기록으로 만든 캐시(ra = 기록 mtime)는 규칙 판이 바뀌면 다시 계산 — 오귀속 파일 대신 실제 귀속', async () => {
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ver-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ses-')), g = (...a) => spawnSyncGit(r, a)
  const id = 'averg001', fA = path.join(process.env.CODEX_GATE_STATE, 'codex-gate', 'attrib', `${id}.json`)
  try {
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); g('add', '-A'); g('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString()
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })
    const tp = path.join(sub, `agent-${id}.jsonl`); fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', timestamp: iso(now - 60e3), message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'x' } }] } }) + '\n')   // 파일 변경 없음
    fs.mkdirSync(path.dirname(fA), { recursive: true }); fs.writeFileSync(fA, JSON.stringify({ wrote: true, files: ['test/codex-verify.test.mjs'], at: iso(now) }))   // 옛 판 기록 = 오귀속
    const st = fs.statSync(tp), ra = Math.round(fs.statSync(fA).mtimeMs), cache = path.join(r, 'cache.json')
    fs.writeFileSync(cache, JSON.stringify({ [id]: { v: 2, sig: `${st.size}:${Math.round(st.mtimeMs)}`, ra, harness: false, wrote: true } }))   // 수정 전 판이 옛 기록으로 만든 캐시
    let calls = 0; const opts = { attribute: o => { calls++; return cg.attributionFor({ ...o, root: r }) }, recordAt: cg.attribAt, ver: cg.RULES_VER }
    const b = { agent_id: id, type: 'anakin_phase-build', ts_start: iso(now - 60e3), ts_end: iso(now - 50e3) }
    loadAgentHarness([{ session_id: 's1', agents_detail: [b] }], ses, cache, opts)
    assert.equal(calls, 1, '규칙 판 변경 = 캐시 버리고 다시 계산'); assert.equal(b.wrote, false, '오귀속 기록 대신 실제(변경 없음)')   // 고치기 전 : calls 0 · wrote true(캐시 재사용)
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }); fs.rmSync(fA, { force: true }) }
})

test('승인 4 이어받은 원장 : 요청 A 에서 시작한 build X 가 요청 B 에서 끝나고 원장 c4-…-X6 이 B 창에 생기면 A·B 모두 검증 Y(A = 결과만·출처 표기, 회차·되돌림 집계는 B 만), 원장 없는 다른 실행·앞 요청 원장 = 검증 누락 유지', () => {
  const X = 'a9b49e0001', bx = (s, e, extra = {}) => ag('anakin_phase-build', Z(s), { agent_id: X, ts_end: Z(e), wrote: true, ...extra })
  const A = { session_id: 's', turn: 96, ts_req: Z('01:00'), ts_res: Z('01:20'), req_head: 'A', agents_detail: [bx('01:01', '01:10')] }
  const B = { session_id: 's', turn: 97, ts_req: Z('01:30'), ts_res: Z('02:00'), req_head: 'B', agents_detail: [bx('01:31', '01:50', { cont: true })] }
  const L = loop('c4-build-a9b49e', [{ iter: 1, at: Z('01:45'), verdict: 'FAIL', open: 1 }, { iter: 2, at: Z('01:52'), verdict: 'PASS', open: 0 }], { startedAt: Z('01:40') })
  const peers = [A, B], cx = ns => node(ns, '1.1.4.1')
  // A : 판정 결과만(Y) + 출처 '이어받은 원장(요청 97)' · 회차표·되돌림·N 화살표 없음 · 실행 상세도 Y
  const nA = buildRequestGraph(A, [L], { peers }), a = cx(nA)
  assert.equal(a.verdict.yn, 'Y'); assert.equal(a.alerts, undefined); assert.equal(a.verdict.fails, 0); assert.match(a.statusLabel, /^검증 Y · 이어받은 원장\(요청 97\)/)
  assert.deepEqual(a.rounds, []); assert.ok(!a.chips.some(c => /회 [YN]/.test(c.txt)), '회차 줄은 원장이 생긴 요청에만'); assert.ok(a.chips.some(c => c.txt === '이어받은 원장 c4-build-a9b49e(요청 97) Y'))
  assert.ok(!node(nA, '1.1.4').chips.some(c => c.tone === 'bad'), '되돌림 집계 없음'); assert.ok(!buildPath(nA).edges.some(e => e.seq === 'N'))
  assert.deepEqual([nA[0].check.y, nA[0].check.miss], [1, 0]); assert.ok(agentsOf(nA)[0].lines.includes('Codex 판정 : 검증 Y'))
  // B : 원장이 생긴 요청 = 회차 2·되돌림 1 그대로
  const b = cx(buildRequestGraph(B, [L], { peers }))
  assert.equal(b.verdict.yn, 'Y'); assert.equal(b.verdict.fails, 1); assert.deepEqual(b.rounds.map(g => g.rows.length), [2]); assert.match(b.statusLabel, /^검증 Y · 2회 만에 완료$/)
  // 원장 없는 다른 실행(Y) = 검증 누락 유지(N 아님 · 경보)
  const A2 = { ...A, agents_detail: [...A.agents_detail, ag('general-purpose', Z('01:05'), { agent_id: 'a77777f00d', ts_end: Z('01:08'), wrote: true })] }
  const m = cx(buildRequestGraph(A2, [L], { peers }))
  assert.equal(m.statusLabel, '검증 누락'); assert.deepEqual(m.alerts, ['검증 누락']); assert.match(m.lines.join(' '), /원장 없는 파일 변경 실행 1건 — general-purpose\(a77777\)/)
  // 다른 에이전트 접미 원장 = 이어받지 않음 · 앞 요청에만 판정이 있는 원장 = 뒤 요청에 이어받지 않음(완화 금지)
  assert.equal(cx(buildRequestGraph(A, [loop('c4-build-a12345', L.events, { startedAt: L.startedAt })], { peers })).statusLabel, '검증 누락')
  const C = { session_id: 's', turn: 98, ts_req: Z('02:10'), ts_res: Z('02:30'), req_head: 'C', agents_detail: [bx('02:11', '02:20', { cont: true })] }
  assert.equal(cx(buildRequestGraph(C, [L], { peers: [A, B, C] })).statusLabel, '검증 누락')
  // 파일 변경 없는 실행 = 이어받기 대상 아님(판정 대상 없음 → 숨김)
  assert.equal(cx(buildRequestGraph({ ...A, agents_detail: [bx('01:01', '01:10', { wrote: false })] }, [L], { peers })), undefined)
})

test('승인 4 D-002(c4-build-4-a609bd) : 앞 요청 창에 같은 원장 판정(FAIL)이 있어도 뒤 요청 최종 판정(PASS)을 앞 칸·실행 상세에 반영, 회차·되돌림 집계는 각 귀속 요청에만', () => {
  const X = 'a9b49e0001', bx = (s, e, extra = {}) => ag('anakin_phase-build', Z(s), { agent_id: X, ts_end: Z(e), wrote: true, ...extra })
  const A = { session_id: 's', turn: 96, ts_req: Z('01:00'), ts_res: Z('01:20'), req_head: 'A', agents_detail: [bx('01:01', '01:10')] }
  const B = { session_id: 's', turn: 97, ts_req: Z('01:30'), ts_res: Z('02:00'), req_head: 'B', agents_detail: [bx('01:31', '01:50', { cont: true })] }
  const L = loop('c4-build-a9b49e', [{ iter: 1, at: Z('01:09'), verdict: 'FAIL', open: 1 }, { iter: 2, at: Z('01:45'), verdict: 'PASS', open: 0 }], { startedAt: Z('01:08') })
  const peers = [A, B], cx = ns => node(ns, '1.1.4.1')
  const nA = buildRequestGraph(A, [L], { peers }), a = cx(nA)
  assert.equal(a.verdict.yn, 'Y', a.statusLabel)   // 고치기 전 : N(앞 창 FAIL 이 최종으로 남음)
  assert.match(a.statusLabel, /^검증 Y · 2회 만에 완료 · 최종 판정 이어받음\(요청 97\)/)
  assert.equal(a.verdict.fails, 1); assert.deepEqual(a.rounds.map(g => g.rows.map(r => r.iter)), [[1]])   // A 회차·되돌림 = 자기 창 1회차 FAIL 만
  assert.ok(a.chips.some(c => c.txt === '최종 판정 c4-build-a9b49e(요청 97) 2회 Y' && c.tone === 'ok'))
  assert.match(node(nA, '1.1.4').chips.map(c => c.txt).join('\n'), /N 1회\(1회차 결함 1\) → 2회차 Y\(요청 97\)/)   // 되돌림 줄 = 재작업 대기 아님
  assert.ok(agentsOf(nA)[0].lines.includes('Codex 판정 : 검증 Y'))   // 실행 상세(형제)
  const b = cx(buildRequestGraph(B, [L], { peers }))
  assert.equal(b.verdict.yn, 'Y'); assert.equal(b.verdict.fails, 0); assert.deepEqual(b.rounds.map(g => g.rows.map(r => r.iter)), [[2]])   // B = 2회차만
  // 뒤 판정도 FAIL = 앞 칸 N 유지(완화 아님) · 다른 접미 원장 = 반영 안 함
  const LN = loop('c4-build-a9b49e', [{ iter: 1, at: Z('01:09'), verdict: 'FAIL', open: 1 }, { iter: 2, at: Z('01:45'), verdict: 'FAIL', open: 1 }], { startedAt: Z('01:08') })
  assert.equal(cx(buildRequestGraph(A, [LN], { peers })).verdict.yn, 'N')
  const LO = loop('c4-build-a12345', L.events, { startedAt: L.startedAt })
  assert.notEqual(cx(buildRequestGraph(A, [LO], { peers })).verdict?.yn, 'Y')
})

test('승인 4 형제(R-P0) : 실행 상세 Codex 판정 — 자기 접미 원장 판정이 기록된 종료 시각보다 앞서도(SubagentStop 훅 안에서 판정 → 종료 기록이 훅 뒤) 그 실행 판정, 실행 전·다른 접미 판정 = 검증 누락 유지', () => {
  const X = 'a9b49e2bf3', bx = ag('anakin_phase-build', Z('01:01'), { agent_id: X, ts_end: Z('01:10'), wrote: true }), t = turn({ ts_req: Z('01:00'), ts_res: Z('01:20'), agents_detail: [bx] })
  const line = lp => agentsOf(buildRequestGraph(t, lp)).find(n => n.aid === X).lines.at(-1)
  assert.equal(line([KL('c4-build-a9b49e', '2026-11-08T01:09:59Z', 'PASS')]), 'Codex 판정 : 검증 Y')   // 실사례 요청 96 : PASS 10:32:47.629 < 종료 기록 .673
  assert.equal(line([KL('c4-build-a9b49e', '2026-11-08T01:00:30Z', 'PASS')]), 'Codex 판정 : 검증 누락')   // 실행 시작 전 판정 = 불인정(c4 iter1 D-001)
  assert.equal(line([KL('c4-build-a12345', '2026-11-08T01:09:59Z', 'PASS')]), 'Codex 판정 : 검증 누락')   // 다른 실행 접미 = 불인정
  // 병렬 : 다른 실행 Y(01:03 시작)가 X 종료 전에 시작해도 X 자기 판정(FAIL 01:05 → PASS 01:09:59) = Y, Y 는 자기 원장 Y(실사례 요청 91 ae440b)
  const Y = ag('general-purpose', Z('01:03'), { agent_id: 'a77777f00d', ts_end: Z('01:08'), wrote: true }), tp = turn({ ts_req: Z('01:00'), ts_res: Z('01:20'), agents_detail: [bx, Y] })
  const LX = loop('c4-build-a9b49e', [{ iter: 1, at: '2026-11-08T01:05:00Z', verdict: 'FAIL', open: 1 }, { iter: 2, at: '2026-11-08T01:09:59Z', verdict: 'PASS', open: 0 }], { startedAt: '2026-11-08T01:04:30Z' })
  const ps = agentsOf(buildRequestGraph(tp, [LX, KL('c4-gp-a77777', '2026-11-08T01:08:30Z', 'PASS')]))
  assert.deepEqual(ps.map(n => n.lines.at(-1)), ['Codex 판정 : 검증 Y', 'Codex 판정 : 검증 Y'])
})

// ── 지연 분석 P3 : 생성기 단일 실행 잠금(runOnce) · 하네스 캐시 중간 저장 ─────────────────────────
// RG = 네임스페이스 import(고치기 전 = 내보내기 없음 → 해당 시험만 실패), 실행 시험 = 격리 루트(WORKSPACE_ROOT·WORK_HISTORY_DIR·TOOLDASH_HOME)에서 생성기를 실제로 띄움
import * as RG from '../scripts/request-graph.mjs'
const RG_JS = fileURLToPath(new URL('../scripts/request-graph.mjs', import.meta.url))
const rgWs = () => { const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-lock-')), lockDir = path.join(ws, 'loginpi', '.omc', 'state', 'request-graph'); fs.mkdirSync(lockDir, { recursive: true }); return { ws, lockDir, lock: path.join(lockDir, 'run.lock'), dirty: path.join(lockDir, 'run.dirty'), out: path.join(ws, 'o.html') } }
const rgRun = (w, args = [], extra = {}) => { const env = { ...process.env, WORKSPACE_ROOT: w.ws, WORK_HISTORY_DIR: path.join(w.ws, 'wh'), TOOLDASH_HOME: path.join(w.ws, 'home'), ...extra }; if (!extra.CODEX_GATE_ACTIVE) delete env.CODEX_GATE_ACTIVE; return spawnSync(process.execPath, [RG_JS, '--out', w.out, ...args], { encoding: 'utf8', env, windowsHide: true }) }
const holdLock = (w, pid = process.pid, ageMs = 0) => { fs.writeFileSync(w.lock, JSON.stringify({ pid, at: new Date().toISOString() })); if (ageMs) { const t = new Date(Date.now() - ageMs); fs.utimesSync(w.lock, t, t) } return fs.readFileSync(w.lock, 'utf8') }

test('P3 잠금 : 살아 있는 잠금이면 두 번째 실행은 run.dirty 만 남기고 즉시 종료 0(산출물 안 씀·잠금 그대로)', () => {
  const w = rgWs()
  try {
    const body = holdLock(w), r = rgRun(w)
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /다른 생성기 실행 중/)
    assert.ok(fs.existsSync(w.dirty), 'dirty 예약'); assert.ok(!fs.existsSync(w.out), '계산·쓰기 안 함'); assert.equal(fs.readFileSync(w.lock, 'utf8'), body, '남의 잠금 유지')
  } finally { fs.rmSync(w.ws, { recursive: true, force: true }) }
})

test('P3 잠금 : 5분 넘은 잠금·죽은 pid 잠금은 무시하고 실행, 끝나면 잠금 삭제', () => {
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout
  for (const [pid, age, why] of [[process.pid, RG.LOCK_STALE_MS + 60e3, '5분 초과'], [+dead, 0, '죽은 pid']]) {
    const w = rgWs()
    try {
      holdLock(w, pid, age); const r = rgRun(w)
      assert.equal(r.status, 0, r.stderr); assert.ok(fs.existsSync(w.out), `${why} = 실행`); assert.ok(!fs.existsSync(w.lock), `${why} = 끝나면 잠금 삭제`); assert.ok(!fs.existsSync(w.dirty))
    } finally { fs.rmSync(w.ws, { recursive: true, force: true }) }
  }
})

test('P3 잠금 : --design-only·CODEX_GATE_ACTIVE(판정 증거) 는 잠금이 있어도 실행하고 잠금·dirty 를 건드리지 않는다', () => {
  for (const [args, extra] of [[['--design-only'], {}], [[], { CODEX_GATE_ACTIVE: '1' }]]) {
    const w = rgWs()
    try {
      const body = holdLock(w), r = rgRun(w, args, extra)
      assert.equal(r.status, 0, r.stderr); assert.ok(fs.existsSync(w.out), `${args.join(' ') || 'CODEX_GATE_ACTIVE'} = 실행`)
      assert.equal(fs.readFileSync(w.lock, 'utf8'), body); assert.ok(!fs.existsSync(w.dirty))
    } finally { fs.rmSync(w.ws, { recursive: true, force: true }) }
  }
})

test('P3 runOnce : 실행 중 dirty 가 생기면 1회만 다시 실행(두 번째 실행 중 또 생겨도 1회), 잠금은 끝나면 삭제', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-once-')), dirty = path.join(dir, 'run.dirty')
  try {
    assert.equal(typeof RG.runOnce, 'function', 'runOnce 내보내기')
    let n = 0; assert.equal(RG.runOnce(() => { if (++n === 1) fs.writeFileSync(dirty, '') }, dir), 2); assert.equal(n, 2)
    assert.ok(!fs.existsSync(path.join(dir, 'run.lock'))); assert.ok(!fs.existsSync(dirty))
    n = 0; assert.equal(RG.runOnce(() => { n++; fs.writeFileSync(dirty, '') }, dir), 2); assert.equal(n, 2, '1회만')
    n = 0; assert.equal(RG.runOnce(() => n++, dir), 1); assert.equal(n, 1, '앞 실행이 남긴 dirty = 이번 실행이 반영(연쇄 재실행 없음)')
    fs.writeFileSync(path.join(dir, 'run.lock'), JSON.stringify({ pid: process.pid })); n = 0
    assert.equal(RG.runOnce(() => n++, dir), 0); assert.equal(n, 0); assert.ok(fs.existsSync(dirty))
    assert.equal(RG.runOnce(() => n++, dir, { skip: true }), 1); assert.equal(n, 1, 'skip = 잠금 무관')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('P3 하네스 캐시 중간 저장 : 새로 계산 10개마다 저장 — 23번째에서 끊겨도 저장분 20개는 다음 실행이 재사용(5개만 계산)', () => {
  const ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-mid-')), sub = path.join(ses, 's1', 'subagents'), cache = path.join(ses, 'cache.json')
  try {
    fs.mkdirSync(sub, { recursive: true })
    const ids = Array.from({ length: 25 }, (_, i) => `a${String(i).padStart(3, '0')}`)
    for (const id of ids) fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), JSON.stringify({ type: 'assistant', message: { content: [] } }) + '\n')
    const T = () => [{ session_id: 's1', agents_detail: ids.map(agent_id => ({ agent_id, type: 'anakin_phase-build' })) }]
    let calls = 0
    assert.throws(() => loadAgentHarness(T(), ses, cache, { attribute: () => { if (++calls === 23) throw new Error('끊김(Stop 60초 모사)'); return { files: [] } } }))
    calls = 0; loadAgentHarness(T(), ses, cache, { attribute: () => { calls++; return { files: [] } } })
    assert.equal(calls, 25 - 2 * (RG.HARNESS_SAVE_EVERY ?? Infinity), '저장분 재사용')
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(cache, 'utf8'))).length, 25, '마지막 = 전체 저장')
  } finally { fs.rmSync(ses, { recursive: true, force: true }) }
})

// c4-build-aec463 회송 : D-001 낡은 잠금 동시 회수 · D-002 잠금 생성 오류 = 계산 안 함
// D-001 기대(메인 지시 변경 — 잠금 = 성능용 최선 노력) : 낡은 잠금 동시 회수 경합에서는 계산 2회까지 허용(결과 = 같은 파일 같은 내용 덮어쓰기, 캐시 원자 쓰기,
//   판정 증거 실행 CODEX_GATE_ACTIVE 는 잠금 무관 → 정확성 무관). 지키는 것 = 계산 ≤ 2회 · 끝난 뒤 잠금·stale 잔존 없음
// 순서 강제 = 공유 fs 객체의 unlinkSync·rmSync·renameSync 를 감싸 '낡음 판단 뒤 첫 회수 동작' 직전에 끼어든 실행을 돌린다
const deadPid = () => +spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout
const cutIn = (lock, fire) => {
  const ks = ['unlinkSync', 'rmSync', 'renameSync'], o = Object.fromEntries(ks.map(k => [k, fs[k]])); let done = false
  const hit = p => { if (!done && path.resolve(String(p)) === path.resolve(lock)) { done = true; fire() } }
  for (const k of ks) fs[k] = (p, ...a) => { hit(p); return o[k](p, ...a) }
  return () => { for (const k of ks) fs[k] = o[k] }
}

test('D-001 낡은 잠금 동시 회수(최선 노력) : 회수 직전에 다른 실행이 끼어들어도(끝까지 실행 / 새 잠금을 잡고 실행 중) 계산 ≤ 2회, 끝난 뒤 잠금·stale 잔존 없음', () => {
  for (const mode of ['끝까지 실행', '잡고 실행 중']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-race-')), lock = path.join(dir, 'run.lock')
    let calls = 0
    fs.writeFileSync(lock, JSON.stringify({ pid: deadPid(), at: '2026-11-11T00:00:00Z' }))   // 죽은 pid = 낡은 잠금
    const undo = cutIn(lock, () => {
      if (mode === '끝까지 실행') RG.runOnce(() => calls++, dir)
      else { fs.rmSync(lock, { force: true }); fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); calls++ }   // 다른 실행이 회수해 잡고 계산 중
    })
    try {
      const n = RG.runOnce(() => calls++, dir)
      assert.ok(n >= 0 && calls >= 1 && calls <= 2, `${mode} : 계산 ${calls}회(≤ 2)`)
      assert.deepEqual(fs.readdirSync(dir).filter(f => f === 'run.lock' || f.includes('.stale-')), [], `${mode} : 잠금·stale 잔존 없음`)
    } finally { undo(); fs.rmSync(dir, { recursive: true, force: true }) }
  }
})

test('D-002 잠금 생성 오류(EEXIST 밖) : 계산 0회 — runOnce -1·stderr 한 줄, 생성기 실행은 종료 0(산출물 안 씀)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-err-')), blocker = path.join(dir, 'blocker')
  try {
    fs.writeFileSync(blocker, '')   // 상태 폴더 자리를 파일로 막음 → mkdir·openSync ENOTDIR
    let calls = 0; assert.equal(RG.runOnce(() => calls++, path.join(blocker, 'rg')), -1); assert.equal(calls, 0)
    assert.equal(typeof RG.takeLock, 'function'); assert.equal(RG.takeLock(path.join(blocker, 'run.lock')), 'error')   // openSync ENOTDIR
    const w = rgWs(); try {
      fs.rmSync(path.join(w.ws, 'loginpi', '.omc', 'state'), { recursive: true, force: true }); fs.writeFileSync(path.join(w.ws, 'loginpi', '.omc', 'state'), '')
      const r = rgRun(w)
      assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /잠금 획득 실패/); assert.ok(!fs.existsSync(w.out), '계산 안 함')
    } finally { fs.rmSync(w.ws, { recursive: true, force: true }) }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('c4-build-aec463-p1 D-001 캐시 원자 저장 : 저장 도중 중단(rename 직전 throw · 쓰기 도중 절반만 쓰고 throw)돼도 직전 확정 캐시가 그대로 남아 다음 실행이 재사용, 임시 파일 잔존 없음', () => {
  const ses = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-atom-')), sub = path.join(ses, 's1', 'subagents'), cache = path.join(ses, 'cache.json')
  try {
    fs.mkdirSync(sub, { recursive: true })
    const mk = n => Array.from({ length: n }, (_, i) => `a${String(i).padStart(3, '0')}`), body = JSON.stringify({ type: 'assistant', message: { content: [] } }) + '\n'
    for (const id of mk(35)) fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), body)
    const T = ids => [{ session_id: 's1', agents_detail: ids.map(agent_id => ({ agent_id, type: 'anakin_phase-build' })) }]
    let calls = 0; const attribute = () => { calls++; return { files: [] } }
    loadAgentHarness(T(mk(25)), ses, cache, { attribute }); const done = fs.readFileSync(cache, 'utf8')   // 직전 확정 캐시(25개)
    const o = { mv: fs.renameSync, wr: fs.writeFileSync }, isTmp = p => String(p).startsWith(cache)
    for (const [why, patch] of [
      ['rename 직전 throw', () => { fs.renameSync = (p, ...a) => { if (isTmp(p)) throw new Error('중단(rename 직전)'); return o.mv(p, ...a) } }],
      ['쓰기 도중 중단', () => { fs.writeFileSync = (p, d, ...a) => { if (isTmp(p)) { o.wr(p, String(d).slice(0, 20)); throw new Error('중단(쓰기 도중)') } return o.wr(p, d, ...a) } }],
    ]) {
      patch()
      try { loadAgentHarness(T(mk(35)), ses, cache, { attribute }) } finally { fs.renameSync = o.mv; fs.writeFileSync = o.wr }   // 새 10개 = 중간 저장 + 최종 저장 모두 중단
      assert.equal(fs.readFileSync(cache, 'utf8'), done, `${why} : 직전 확정 캐시 그대로`)
      calls = 0; loadAgentHarness(T(mk(25)), ses, cache, { attribute }); assert.equal(calls, 0, `${why} : 확정분 재사용`)
      assert.deepEqual(fs.readdirSync(ses).filter(f => f.endsWith('.tmp')), [], `${why} : 임시 파일 잔존 없음`)
    }
  } finally { fs.rmSync(ses, { recursive: true, force: true }) }
})
