// request-graph 매핑 순수 함수 회귀 시험 : 턴 + agent 레코드 + Codex 루프 → 노드 상태·시간 쌍·회차, 상태 색 대비, 깜빡임 CSS
// 실행 : pnpm test (node:test)
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { buildRequestGraph, buildPath, pathLog, agentsOf, mergeParts, partBase, codexChips, groupTools, toolEventsOf, cleanPrompt, linkContext, loadSummary, summaryId, promptsOf, PAIRS, notY, layoutTree, termPos, matePos, loopRounds, roundSummary, fmtSpan, designGraph, safeName, renderHtml, writeSlotMd, writeRequestMd, harnessTouched, loadAgentHarness, HARNESS_RE, serial, agentRounds, splitAgentRounds, nodeAlerts, engTxt, codexNo, loadWorkflowAgents, ALERT, SLOTS, SLOT_MAP, ENG_SLOTS, STATUS_STYLE, PAGE_BG, CODEX_STYLE } from '../scripts/request-graph.mjs'

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
  assert.deepEqual(SLOTS.filter(s => s.kind === 'codex').map(s => s.id), ['1.1.1.1', '1.1.2.1', '1.1.3.1', '1.1.4.1', '1.1.5.1', '1.1.5.2.1'])
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

test('설계도 노드·Obsidian 안전 파일명', () => {
  const d = designGraph()
  assert.equal(d.length, SLOTS.length)
  assert.ok(d.every(n => n.status === 'unassigned' && !n.lines.length && n.t0 === null))
  assert.ok(SLOTS.some(s => s.id === '1.1.5.2.1'))
  assert.equal(safeName('1.1.1 SA : 프롬프트'), '1.1.1 SA 프롬프트')
  assert.equal(safeName('1.1.1.1 CDX-프롬프트 검수'), '1.1.1.1 CDX-프롬프트 검수')
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
    assert.equal(writeSlotMd(dir), 15)
    const md = f => fs.readFileSync(path.join(dir, f), 'utf8')
    assert.match(md('1.1.1 SA-프롬프트.md'), /^# 3\. SA-프롬프트\n/)
    assert.match(md('1.1.5.2.1 CDX-총괄 검수.md'), /^# 8-1\. CDX-총괄 검수\n/)
    assert.match(md('1.2 파다완 아소카 승인.md'), /^# 9\. 파다완 아소카 승인\n/)
    assert.ok(md('1.1.1 SA-프롬프트.md').includes('[[1.1.1.1 CDX-프롬프트 검수|3-1. CDX-프롬프트 검수]]'))
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
  assert.deepEqual(ids(ns), ['1', '1.1', '1.1.5', '1.1.5.2', '1.2'])
  assert.equal(node(ns, '1').status, 'done'); assert.equal(node(ns, '1.2').status, 'notrun'); assert.equal(node(ns, '1').eng, 0)
})

test('C-8 (b) 프롬프트·컨텍스트·그래프 쌍은 모든 요청에 표시 — 에이전트·도구 0건 턴도, graph 미실행 = 생성기 자동 갱신(Stop 훅), 판정 없음 = ⚠ 검증 누락', () => {
  const ns = buildRequestGraph(turn(), [])
  for (const id of ['1.1.1', '1.1.1.1', '1.1.2', '1.1.2.1', '1.1.5', '1.1.5.1']) assert.ok(node(ns, id), id)
  assert.equal(node(ns, '1.1.5').statusLabel, '생성기 자동 갱신(Stop 훅)'); assert.equal(fmtSpan(node(ns, '1.1.5'), 0), '생성기 자동 갱신(Stop 훅)')
  for (const id of ['1.1.1.1', '1.1.2.1', '1.1.5.1']) { assert.equal(node(ns, id).statusLabel, '검증 누락'); assert.deepEqual(node(ns, id).alerts, ['검증 누락']) }
  assert.equal(node(ns, '1').eng, 3); assert.equal(node(ns, '1').engEst, 1)
  assert.deepEqual(SLOT_MAP['1.1.2'].agents, ['anakin_phase-collect']); assert.deepEqual(SLOT_MAP['1.1.5'].agents, ['anakin_phase-graph'])
  const g = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-graph', '2026-11-08T10:20:00+09:00')] }), [])
  assert.equal(node(g, '1.1.5').status, 'done'); assert.equal(AL(g).find(n => n.label === 'anakin_phase-graph').parent, '1.1.5')
})

test('C-8 (a)·C-9 (a) 하네스 쌍 = tool_use·훅 주입 1건 이상일 때만 — 0건 요청에서만 숨김', () => {
  assert.equal(node(buildRequestGraph(turn(), []), '1.1.3'), undefined)
  assert.equal(node(buildRequestGraph(turn(), []), '1.1.3.1'), undefined)
  for (const extra of [{ tools: { Read: 1 } }, { resources: { hooks: [{ name: 'UserPromptSubmit', event: 'UserPromptSubmit', n: 1 }] } }, { agents_detail: [ag('general-purpose', '2026-11-08T10:01:00+09:00')] }, { toolEvents: [{ t: P('2026-11-08T10:00:05+09:00'), name: 'Bash', who: 'main' }] }]) {
    const ns = buildRequestGraph(turn(extra), [])
    assert.equal(node(ns, '1.1.3').status, 'done', JSON.stringify(extra)); assert.ok(node(ns, '1.1.3.1'))
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
  assert.ok(node(hz, '1.1.3').chips.some(c => c.txt === '⚙ 하네스 파일 변경 1건'))
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

test('C-8 (c)(d) 루프 쌍 = 반복(같은 에이전트 종류 2회+ · 같은 원장 판정 2회+) 또는 되돌림(N 1회+, C-13)일 때만, build 없이도', () => {
  // (d) 반복 0건·되돌림 0건 = 루프 쌍 없음(build 1회·c4 판정 1회 PASS 도) → build 는 2 접수 칸
  let ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')] }), [KL('c4-x', '2026-11-08T01:05:00Z', 'PASS')])
  assert.equal(node(ns, '1.1.4'), undefined); assert.equal(node(ns, '1.1.4.1'), undefined); assert.equal(AL(ns).find(n => n.label === 'anakin_phase-build').parent, '1.1')
  // (c) admin ×2 → 루프 쌍, 반복 목록
  ns = buildRequestGraph(turn({ agents_detail: [ag('teamanakin-admin', '2026-11-08T10:10:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')] }), [])
  assert.equal(node(ns, '1.1.4').status, 'done'); assert.deepEqual(node(ns, '1.1.4').chips, [{ txt: 'admin ×2', tone: '' }]); assert.ok(node(ns, '1.1.4.1'))
  // (c) CDX 2회 판정(c2 N → Y) · build 없음 → 루프 쌍 + CDX-루프 = 루프 최종 판정
  ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00')] }), [loop('c2-a', [ev2(1, 'FAIL', '05'), ev2(2, 'PASS', '15')], { startedAt: '2026-11-08T01:02:00Z' })])
  assert.deepEqual(node(ns, '1.1.4').chips, [{ txt: 'CDX-컨텍스트 N 1회(1회차 결함 2) → 2회차 Y', tone: 'bad' }, { txt: 'CDX-컨텍스트 2회', tone: '' }])   // C-13 : 되돌림 줄 먼저
  const cx = node(ns, '1.1.4.1'); assert.equal(cx.statusLabel, '루프 최종 판정 Y'); assert.equal(cx.status, 'done'); assert.deepEqual(cx.chips, [{ txt: 'CDX-컨텍스트 2회 → Y', tone: 'ok' }])
  // build ×2(회송) → SA-루프 칸 안 'build ×2 (회송 1)', 반복 목록에 build
  ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:03:00+09:00' }), ag('anakin_phase-build', '2026-11-08T10:08:00+09:00', { ts_end: '2026-11-08T10:09:00+09:00' })] }), [])
  assert.deepEqual(node(ns, '1.1.4').chips.map(c => c.txt), ['build ×2', 'build ×2 (회송 1) · 3m'])   // 칸 요약(반복 목록) 먼저, 실행 줄 뒤
  assert.ok(AL(ns).filter(n => n.label === 'anakin_phase-build').every(n => n.parent === '1.1.4'))
})

test('C-13 루프 = 되돌림 기준 : N 1회 이상 OR 반복 2회 이상이면 루프 쌍, SA-루프 = 칸·회차·결함 수, CDX-루프 = 최종 판정(진행 = 진행 중 요청·마지막 기록 진행만, 끝난 요청 판정 없음 = 검증 누락)', () => {
  const tools = { tools: { Read: 1, Edit: 2 } }
  // CDX-하네스 1회 N · 반복 없음 → 루프 쌍 있음(마스터 지적 5-1 사례), 끝난 요청
  let ns = buildRequestGraph(turn(tools), [loop('c3-h', [{ ...ev2(1, 'FAIL', '10'), open: 5 }], { startedAt: '2026-11-08T01:05:00Z' })])
  assert.ok(node(ns, '1.1.4') && node(ns, '1.1.4.1'), 'N 1회 = 루프 쌍')
  assert.deepEqual(node(ns, '1.1.4').chips, [{ txt: 'CDX-하네스 N 1회(1회차 결함 5) → 재작업 대기', tone: 'bad' }])
  let cx = node(ns, '1.1.4.1'); assert.equal(cx.statusLabel, '루프 최종 판정 N'); assert.deepEqual(cx.chips, [{ txt: 'CDX-하네스 → N', tone: 'bad' }])
  // 되돌림 화살표 = CDX-하네스 → 짝 SA-하네스(직접, 루프 노드 경유 아님)
  assert.deepEqual(buildPath(ns).verdicts.map(e => [e.from, e.to, e.label]), [['1.1.3.1', '1.1.3', '되돌림 1회']])
  // 진행 중 요청 : N 즉시 루프 쌍, 재판정 진행 중 = CDX-루프 '진행'
  const now = P('2026-11-08T10:20:00+09:00')
  ns = buildRequestGraph(turn({ ...tools, ts_res: null }), [loop('c3-h', [ev2(1, 'FAIL', '10')], { startedAt: '2026-11-08T01:05:00Z', running: true })], { now })
  assert.match(node(ns, '1.1.4').chips[0].txt, /^CDX-하네스 N 1회\(1회차 결함 2\) → 재판정 진행$/); cx = node(ns, '1.1.4.1'); assert.equal(cx.statusLabel, '루프 최종 판정 진행'); assert.equal(cx.chips[0].txt, 'CDX-하네스 → 진행')
  // 끝난 요청 · 반복만(admin ×2) · 루프 원장 없음 → CDX-루프 = ⚠ 검증 누락('진행' 아님, 메인 확정 c4-build-ab3cb5 D-001) / 같은 입력이 진행 중 요청이면 '진행'
  const adm2 = [ag('teamanakin-admin', '2026-11-08T10:10:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00')]
  cx = node(buildRequestGraph(turn({ agents_detail: adm2 }), []), '1.1.4.1'); assert.equal(cx.statusLabel, '검증 누락'); assert.deepEqual(cx.alerts, ['검증 누락'])
  cx = node(buildRequestGraph(turn({ ts_res: null, agents_detail: adm2 }), [], { now: P('2026-11-08T10:25:00+09:00') }), '1.1.4.1'); assert.equal(cx.statusLabel, '루프 최종 판정 진행'); assert.deepEqual(cx.chips, [{ txt: '진행', tone: 'run' }])
  // N 0회 · 반복 0회 → 루프 쌍 없음
  ns = buildRequestGraph(turn(tools), [KL('c3-h', '2026-11-08T01:10:00Z', 'PASS')])
  assert.equal(node(ns, '1.1.4'), undefined); assert.equal(node(ns, '1.1.4.1'), undefined)
})

test('C-7 ①·C-8 (e) SA 가 없으면 CDX 도 없다 — 원장이 있어도 짝 SA 증거가 없으면 숨김(여러 사례 불변식)', () => {
  const c3 = buildRequestGraph(turn(), [KL('c3-x', '2026-11-08T01:05:00Z', 'PASS')])   // 하네스 사용 0건 + c3 원장
  assert.equal(node(c3, '1.1.3'), undefined); assert.equal(node(c3, '1.1.3.1'), undefined)
  const c4 = buildRequestGraph(turn(), [KL('c4-x', '2026-11-08T01:05:00Z', 'PASS')])   // 반복 없음 + c4 판정 1회
  assert.equal(node(c4, '1.1.4.1'), undefined)
  const cases = [turn(), turn({ tools: { Read: 1 } }), turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:02:00+09:00'), ag('anakin_phase-build', '2026-11-08T10:05:00+09:00')] })]
  for (const t of cases) for (const loops of [[], [KL('c1-a', '2026-11-08T01:01:00Z', 'PASS')], [KL('c3-a', '2026-11-08T01:03:00Z', 'FAIL'), KL('c6-a', '2026-11-08T01:06:00Z', 'PASS')]]) {
    const ns = buildRequestGraph(structuredClone(t), loops); assert.ok(pairOK(ns), loops.map(l => l.id).join(','))
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
  const L = loop('c2-a', [ev2(1, 'FAIL', '10'), { ...ev2(2, 'BLOCKED', '20'), reason: 'device' }, ev2(2, 'PASS', '30')], { startedAt: '2026-11-08T01:05:00Z' })
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00')] }), [L]), c = node(ns, '1.1.2.1')
  assert.deepEqual(c.chips, [{ txt: '✖ 1회 N 10:10 · 결함 2', tone: 'bad' }, { txt: '⚠ 2회 BLOCKED 10:20 · device', tone: 'warn' }, { txt: '2회 Y 10:30', tone: 'ok' }, { txt: '→ 2회 만에 완료 · 되돌림 1회', tone: '' }])
  assert.equal(c.statusLabel, '검증 Y · 2회 만에 완료')
  const two = codexChips([{ id: 'c4-a', rows: [{ iter: 1, verdict: 'PASS', t1: P(Z('01:00')) }] }, { id: 'c4-b', rows: [{ iter: 1, verdict: 'FAIL', open: 1, t1: P(Z('01:10')) }] }])
  assert.deepEqual(two.map(x => x.txt), ['원장 c4-a', '1회 Y 10:00', '→ 1회 만에 완료', '원장 c4-b', '✖ 1회 N 10:10 · 결함 1', '되돌림 1회'])
})

test('C-3 순차 경로 : 실행된 칸을 표준 순서로 끝까지 — CDX 가 Y 아니어도 선은 이어 감(⚠ 표시만), 정지·차단 배지 없음, 위반 = Y 아닌 CDX 칸 수', () => {
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:02:00+09:00'), ag('general-purpose', '2026-11-08T10:06:00+09:00')] }), [KL('c2-a', '2026-11-08T01:04:00Z', 'PASS')])
  const p = buildPath(ns)
  assert.deepEqual(route(p), ['1', '1.1', '1.1.1', '1.1.1.1', '1.1.2', '1.1.2.1', '1.1.3', '1.1.3.1', '1.1.5', '1.1.5.1', '1.2', 'E'])   // 승인 칸은 미실행이어도 경로에(D-002)
  assert.equal(p.edges[0].from, 'S'); assert.deepEqual(p.edges.map(e => e.seq), p.edges.map((_, i) => i + 1))
  assert.ok(p.edges.filter(e => e.to !== '1.2').every(e => e.pass && !e.loop)); assert.equal(p.stop, undefined)
  assert.deepEqual(p.edges.filter(e => e.to === '1.2').map(e => [e.from, e.label, e.state, e.pass]), [['1.1.5.1', '⚠ 승인 미실행', 'planned', false]])
  // c5-turn-f7dc16-1110112110 D-001 : 요약 집계 = 보이는 CDX 칸 상태(cdxCheck) — 머리 '누락' = 상세 '검증 누락' 칸 수
  assert.equal(ns[0].check.miss, ns.filter(n => n.statusLabel === '검증 누락').length); assert.equal(ns[0].check.miss, 3); assert.equal(ns[0].check.y, 1)
  assert.deepEqual(p.edges.filter(e => e.label === 'Y').map(e => [e.from, e.to, e.state]), [['1.1.2.1', '1.1.3', 'yes']])
  assert.equal(node(ns, '1.1.1.1').statusLabel, '검증 누락')   // Y 아님 = 칸에 ⚠ 표시(경보)
  assert.equal(ns[0].check.viol, 3); assert.equal(ns[0].check.viol, ns.filter(notY).length)   // 프롬프트·하네스·그래프 CDX
  const html = renderHtml({ design: false, outDir: '.', requests: [{ key: 'k', when: 'w', head: 'h', nodes: ns, path: p }], meta: '' })
  assert.ok(!html.includes('게이트 위반') && !html.includes('진행 불가') && !html.includes('gateViol') && !html.includes('path.stop'))
  // md : 실행 경로 = 화면과 같은 순서, Y 아닌 CDX 목록
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-req-'))
  try {
    writeRequestMd(dir, [{ when: '2026-11-08 10:00', sid: 's-1', head: '요청', catLabel: '', statusLabel: '완료', nodes: ns, path: p }], P(T1))
    const md = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8'), r = md.split('## 실행 경로\n\n')[1].split('\n')[0]
    assert.equal(r, '(1) 1. 마스터 아나킨 요청 → (2) 2. 파다완 아소카 접수 → (3) 3. SA-프롬프트 → (4) 3-1. CDX-프롬프트 검수 → (5) 4. SA-컨텍스트 → (6) 4-1. CDX-컨텍스트 검수 → (7) 5. SA-하네스 [Y] → (8) 5-1. CDX-하네스 검수 → (9) 6. SA-그래프 → (10) 6-1. CDX-그래프 검수 → (11) 8. 파다완 아소카 승인 [⚠ 승인 미실행] (예정) → (12) 종료')
    assert.ok(md.includes('- ⚠ Y 아닌 CDX 칸 3 : ') && !md.includes('⛔'))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('C-3 진행 중·중단 : 마지막 실제 실행 칸까지 실선, 판정 대기 CDX 부터 예정 점선, 진행 중 판정 = 진입 노랑, 중단 = 첫 예정 중단', () => {
  const now = P('2026-11-08T10:05:00+09:00')
  let ns = buildRequestGraph(turn({ ts_res: null, agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:02:00+09:00', { ts_end: null, live: true })] }), [], { now }), p = buildPath(ns)
  assert.equal(node(ns, '1.1.2.1').statusLabel, '검증 대기 — 판정 전'); assert.equal(ns[0].check.viol, 0)
  assert.deepEqual(route(p).slice(0, 5), ['1', '1.1', '1.1.1', '1.1.1.1', '1.1.2']); assert.deepEqual(p.edges.map(e => e.seq), p.edges.map((_, i) => i + 1))   // 순차 연결 유지
  assert.ok(p.edges.filter(e => codexIds.includes(e.to) && !node(ns, e.to).rounds).every(e => e.state === 'planned' && !e.pass))   // 판정 대기 CDX 로 들어가는 선 = 예정
  assert.equal(p.edges.find(e => e.to === '1.1.2').state, 'running'); assert.equal(p.edges.at(-1).to, 'E'); assert.equal(p.edges.at(-1).state, 'planned'); assert.equal(new Set(route(p)).size, route(p).length)
  const L = loop('c2-L', [ev2(1, 'FAIL', '01')], { startedAt: '2026-11-08T01:00:30Z', running: true })
  ns = buildRequestGraph(turn({ ts_res: null, agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:00:10+09:00', { ts_end: '2026-11-08T10:00:50+09:00' })] }), [L], { now }); p = buildPath(ns)
  assert.deepEqual(p.edges.find(e => e.to === '1.1.2.1').state, 'running'); assert.equal(p.edges.at(-1).state, 'planned')   // 진행 중 판정 칸 진입 = 노랑, 종료 = 예정
  const cut = buildPath(buildRequestGraph(turn({ ts_res: null, interrupted: true, incomplete: true }), [], { now: P('2026-11-08T23:00:00+09:00') }))
  assert.equal(cut.edges.find(e => !e.pass).label, '중단'); assert.equal(cut.term.E.stopped, true); assert.equal(cut.edges.at(-1).to, 'E')
})

test('N 되돌림 화살표 유지 : FAIL 2회 → CDX→SA 되돌림 2회(경로는 이어 감), FAIL 후 PASS → 흐림 noold, BLOCKED → 없음', () => {
  const run = events => { const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00')] }), [loop('c2-a', events, { startedAt: '2026-11-08T01:02:00Z' })]); return { ns, p: buildPath(ns) } }
  let { ns, p } = run([ev2(1, 'FAIL', '10'), ev2(2, 'FAIL', '20')])
  assert.deepEqual(p.verdicts.map(e => [e.from, e.to, e.seq, e.state, e.label, e.loop]), [['1.1.2.1', '1.1.2', 'N', 'no', '되돌림 2회', true]])
  assert.equal(node(ns, '1.1.2.1').statusLabel, '검증 N · 2회차 진행 (2/5)'); assert.ok(route(p).includes('1.1.5') && route(p).at(-1) === 'E')
  ;({ p } = run([ev2(1, 'FAIL', '10'), ev2(2, 'PASS', '20')])); assert.deepEqual(p.verdicts.map(e => e.state), ['noold']); assert.equal(p.edges.find(e => e.from === '1.1.2.1').label, 'Y')
  ;({ p } = run([ev2(1, 'FAIL', '10'), { ...ev2(2, 'BLOCKED', '20'), reason: 'device' }])); assert.equal(p.verdicts.length, 0)
})

test('C-11 쌍 배치 : CDX = SA 자식(depth + 1, parent = SA) — 세로 흐름 = SA 바로 아래 + 들여쓰기 상수, 가로 흐름 = 바로 오른쪽 다음 열, 사이에 다른 노드 없음·겹침 없음', () => {
  const LZ2 = { boxW: 158, colGap: 26, pairGap: 28, pairIndent: 18, wrapW: 1800, rowGap: 34, gapY: 8 }
  const ns = buildRequestGraph(turn({ tools: { Read: 1 }, agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00'), ag('anakin_phase-build', '2026-11-08T10:05:00+09:00')] }), [], { runs: [{ ts: '2026-11-08T09:00:00+09:00', mode: 'live', trigger: 'stop' }, { ts: '2026-11-08T10:10:00+09:00', mode: 'live', trigger: 'stop' }] })
  const isP = n => codexIds.includes(n.id), sz = n => ({ w: isP(n) ? LZ2.boxW - LZ2.pairIndent : LZ2.boxW, h: 60 + (n.chips || []).length * 13 + (n.id === '1.1.3' ? 120 : 0) })
  const hit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
  assert.ok(ns.filter(isP).length >= 5)
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
  assert.deepEqual(ns.map(n => n.no), [1, 2, 3, '3-1', 4, '4-1', 5, '5-1', 6, 7])   // C-11 : CDX = 짝 SA 번호 + '-1', 연속 번호는 CDX 아닌 칸끼리
  assert.deepEqual(designGraph().map(n => n.no), [1, 2, 3, '3-1', 4, '4-1', 5, '5-1', 6, '6-1', 7, '7-1', 8, '8-1', 9])
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
  assert.equal(node(ns, '1.1.2.1').statusLabel, '검증 Y · 1회 만에 완료')
  const c4 = node(ns, '1.1.4.1'); assert.equal(c4.badge, '시간 기준 연결(추정)'); assert.equal(c4.statusLabel, '검증 Y · 2회 만에 완료')   // 접두 없는 과거 원장 = CDX-루프(추정)
  assert.ok(!fs.readFileSync(new URL('../scripts/request-graph.mjs', import.meta.url), 'utf8').match(/GATE_FREE|VERIFY_TYPE|STAND\b/))
  const Z2 = h => `2026-11-08T${h}:00Z`, A = { key: 'A', session_id: 's', ts_req: Z2('01:00'), ts_res: Z2('01:50'), agents_detail: [ag('anakin_phase-verify', Z2('01:10'), { agent_id: 'v1', ts_end: Z2('02:30'), rounds: [{ t0: P(Z2('01:10')), t1: P(Z2('01:20')), run: false, errors: 0 }, { t0: P(Z2('02:10')), t1: P(Z2('02:20')), run: false, errors: 0 }] })] }
  const B = { key: 'B', session_id: 's', ts_req: Z2('02:00'), ts_res: Z2('02:59'), agents_detail: [] }
  splitAgentRounds([A, B]); assert.equal(A.bundle.n, 0)
})

test('서브에이전트 실행별 Codex 판정(상세 글자) : 판정 창 [종료, 다음 시작) · 칸별 AND · 병렬 대상 접미 · admin -admin 접미 우선 — 경로는 막지 않음', () => {
  const collect = ag('anakin_phase-collect', '2026-11-08T10:05:00+09:00', { ts_end: '2026-11-08T10:06:00+09:00' }), gp = ag('general-purpose', '2026-11-08T10:10:00+09:00')
  const C = loops => AL(buildRequestGraph(turn({ agents_detail: [collect, gp] }), loops)).find(x => x.label === 'anakin_phase-collect').cdx
  assert.equal(C([KL('c2-a', '2026-11-08T01:03:00Z', 'PASS')]), '검증 누락')   // 실행 전
  assert.equal(C([KL('c5-a', '2026-11-08T01:07:00Z', 'PASS')]), '검증 누락')   // 무관 칸
  assert.equal(C([KL('c2-a', '2026-11-08T01:07:00Z', 'PASS')]), '검증 Y')
  assert.equal(C([KL('c2-a', '2026-11-08T01:11:00Z', 'PASS')]), '검증 누락')   // 다음 실행 뒤
  // build = c4 + (하네스면) c3 AND
  const b = h => ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:03:00+09:00', harness: h }), adm = ag('teamanakin-admin', '2026-11-08T10:20:00+09:00', { ts_end: '2026-11-08T10:21:00+09:00' })
  const Bd = (h, loops) => AL(buildRequestGraph(turn({ agents_detail: [b(h), adm] }), loops)).find(x => x.label === 'anakin_phase-build')
  assert.match(Bd(true, [KL('c4-x', '2026-11-08T01:05:00Z', 'PASS')]).lines.join(' '), /Codex 판정 : 검증 누락 \(c4 Y · c3 누락\)/)
  assert.equal(Bd(true, [KL('c4-x', '2026-11-08T01:05:00Z', 'PASS'), KL('c3-x', '2026-11-08T01:06:00Z', 'PASS')]).cdx, '검증 Y')
  assert.match(Bd(undefined, [KL('c4-x', '2026-11-08T01:05:00Z', 'FAIL'), KL('c3-x', '2026-11-08T01:06:00Z', 'PASS')]).lines.join(' '), /검증 N \(c4 N · c3 Y\)/)
  // 병렬 = 대상 접미만 인정
  const at = '2026-11-08T10:02:00+09:00', A = ag('general-purpose', at, { agent_id: 'a11111f00d' }), B2 = ag('general-purpose', at, { agent_id: 'a22222f00d' })
  const par = loops => AL(buildRequestGraph(turn({ agents_detail: [A, B2, ag('anakin_phase-build', '2026-11-08T10:10:00+09:00')] }), loops)).filter(x => x.label === 'general-purpose').map(x => x.cdx)
  assert.deepEqual(par([KL('c2-a', '2026-11-08T01:04:00Z', 'PASS')]), ['검증 보류(대상 불명)', '검증 보류(대상 불명)'])
  assert.deepEqual(par([KL('c2-x-a11111', '2026-11-08T01:04:00Z', 'PASS'), KL('c2-x-a22222', '2026-11-08T01:05:00Z', 'FAIL')]), ['검증 Y', '검증 N'])
  // admin = c6-…-admin 접미 우선
  const Ad = loops => AL(buildRequestGraph(turn({ agents_detail: [adm] }), loops)).find(x => x.label === 'teamanakin-admin').cdx
  assert.equal(Ad([KL('c6-x-admin', '2026-11-08T01:22:00Z', 'PASS'), KL('c6-x', '2026-11-08T01:23:00Z', 'FAIL')]), '검증 Y'); assert.equal(Ad([]), '검증 누락')
  // 대행 하네스 변경 : c2·c4 본 칸 + c3
  const gh = ag('general-purpose', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:03:00+09:00', harness: true })
  const G = loops => AL(buildRequestGraph(turn({ agents_detail: [gh, adm] }), loops)).find(n => n.label === 'general-purpose')
  assert.equal(G([KL('c3-x', '2026-11-08T01:05:00Z', 'PASS')]).cdx, '검증 누락'); assert.equal(G([KL('c2-x', '2026-11-08T01:04:00Z', 'PASS'), KL('c3-x', '2026-11-08T01:05:00Z', 'PASS')]).cdx, '검증 Y')
  // 불변식 : 모든 실행 = 판정 상태 하나
  const states = new Set(['검증 Y', '검증 N', '검증 보류', '검증 보류(대상 불명)', '검증 진행', '검증 대기', '검증 누락'])
  assert.ok(AL(buildRequestGraph(turn({ agents_detail: [A, B2, ag('anakin_phase-collect', null, { ts_end: null }), adm] }), [])).filter(x => !x.slot).every(x => states.has(x.cdx)))
})

test('경보 : 장시간·오류 다발·검증 누락은 에이전트 상세와 요청 경보에 남음(칸 안 표식)', () => {
  const long = ag('general-purpose', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T11:19:00+09:00', errors: 5 })
  const ns = buildRequestGraph(turn({ agents_detail: [long] }), []), a = AL(ns).find(n => !n.slot)
  assert.deepEqual(a.alerts, ['장시간', '오류 다발', '검증 누락']); assert.match(node(ns, '1').lines.at(-1), /general-purpose 장시간 · general-purpose 오류 다발 · general-purpose 검증 누락/)
  assert.ok(node(ns, '1.1').chips.some(c => c.txt === '✖ 도구 오류 5 · ⚠ 장시간' && c.tone === 'bad'))
  assert.deepEqual(nodeAlerts({ t0: P('2026-11-08T10:20:00+09:00'), t1: null, run: true }, 0, P('2026-11-08T11:00:00+09:00')), ['장시간'])
  assert.deepEqual(ALERT, { longMs: 30 * 60e3, errors: 5, nearCap: 4, cap: 5 })
  // 회차 단위 판정(복원 — c4-verify-codex-ac0222-p1 D-001) : 같은 78분을 25분 회차 3개로 나누면 장시간 아님(전체 소요 집계 회귀 검출), 진행 20분·오류 4회 = 경보 없음
  const split = { ...long, errors: 1, rounds: [0, 26, 52].map(m => ({ t0: P('2026-11-08T10:01:00+09:00') + m * 60e3, t1: P('2026-11-08T10:01:00+09:00') + (m + 25) * 60e3, run: false, errors: 0 })) }
  const s = AL(buildRequestGraph(turn({ agents_detail: [split] }), [])).find(n => !n.slot)
  assert.deepEqual(s.alerts, ['검증 누락']); assert.equal(s.rounds[0].rows.length, 3)
  assert.deepEqual(nodeAlerts({ t0: P('2026-11-08T10:40:00+09:00'), t1: null, run: true }, 4, P('2026-11-08T11:00:00+09:00')), [])
})

test('1.1.5.2 = 생성기 실행 기록(runs.jsonl) : 창 안 live → 완료 / 없음 → 미수행 / 로그 이전 → 기록 이전', () => {
  const run = (ts, extra = {}) => ({ ts, trigger: 'subagent', mode: 'live', md: false, ...extra }), first = run('2026-11-08T09:00:00+09:00', { trigger: 'manual' })
  const n = node(buildRequestGraph(turn(), [], { runs: [first, run('2026-11-08T10:05:00+09:00'), run('2026-11-08T10:30:03+09:00', { trigger: 'stop' })] }), '1.1.5.2')
  assert.equal(n.status, 'done'); assert.ok(n.lines.includes('생성기 실행 2회(subagent 1 · stop 1)'))
  assert.equal(node(buildRequestGraph(turn(), [], { runs: [first, run('2026-11-08T12:00:00+09:00')] }), '1.1.5.2').status, 'missing')
  assert.equal(node(buildRequestGraph(turn(), [], { runs: [] }), '1.1.5.2').statusLabel, '기록 이전')
  assert.deepEqual(SLOT_MAP['1.1.5.2'], { owner: '아소카(메인)', source: 'runs.jsonl' })
})

test('Codex 칸 매핑 : 원장 id 접두 c<N>- → Codex<N> 칸, 칸별 검수 대상·호출 규칙 정의', () => {
  assert.equal(codexNo('c4-codex-wiring'), 4); assert.equal(codexNo('first-call'), null); assert.equal(codexNo('c7-x'), null)
  const ns = buildRequestGraph(turn({ tools: { Read: 1 } }), [loop('c3-hooks', [ev2(1, 'FAIL', '10')])])
  const c3 = node(ns, '1.1.3.1'); assert.equal(c3.statusLabel, '검증 N · 1회차 진행 (1/5)'); assert.equal(c3.badge, '매핑 연결')
  for (const [n, id] of [[1, '1.1.1.1'], [2, '1.1.2.1'], [3, '1.1.3.1'], [4, '1.1.4.1'], [5, '1.1.5.1'], [6, '1.1.5.2.1']]) { const s = SLOTS.find(x => x.id === id); assert.match(s.role, new RegExp(`^Codex${n} 검수 대상 : `)); assert.match(s.criteria, new RegExp(`원장 id 접두 c${n}-`)) }
  assert.match(SLOTS.find(x => x.id === '1.1.4.1').criteria, /SubagentStop 훅 자동/); assert.ok(!SLOTS.some(s => /verify/.test(s.role + s.criteria)))
})

test('백그라운드 워크플로 재개 턴 : 요청 시각보다 앞서 시작한 귀속 에이전트 구간의 Codex 판정도 연결', () => {
  const t = turn({ ts_req: '2026-11-09T13:49:00+09:00', ts_res: '2026-11-09T13:55:00+09:00', agents_detail: [ag('anakin_phase-collect', '2026-11-09T08:17:00+09:00', { ts_end: '2026-11-09T08:20:00+09:00' })] })
  const c = node(buildRequestGraph(t, [loop('c2-wf', [{ iter: 1, at: '2026-11-09T08:31:00+09:00', verdict: 'PASS', open: 0 }], { startedAt: '2026-11-09T08:21:00+09:00' })]), '1.1.2.1')
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
    loadAgentHarness([T], dir, path.join(dir, 'cache.json')); assert.deepEqual(T.agents_detail.map(x => x.harness), [true, false, undefined, undefined])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('원장 묶음 AND(codex-gate 파일 묶음 -p<N>) : 전부 PASS 일 때만 Y, 하나라도 FAIL = N, 일부 판정 없음 = 보류, 나뉘기 전 기준 원장은 대체 — 칸 안 회차·상세에 묶음 표시', () => {
  assert.equal(partBase('c2-x-a1b2c3-p2'), 'c2-x-a1b2c3'); assert.equal(partBase('c2-x-a1b2c3'), 'c2-x-a1b2c3')
  const at = m => `2026-11-08T01:${m}:00Z`, L = (id, evs) => loop(id, evs.map(([iter, v, m]) => ({ iter, at: at(m), verdict: v, open: v === 'FAIL' ? 1 : 0 })), { startedAt: at('02') })
  const col = ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00')
  const run = loops => node(buildRequestGraph(turn({ agents_detail: [col] }), loops), '1.1.2.1')
  const broad = loop('c2-x-a1b2c3', [{ iter: 1, at: at('04'), verdict: 'BLOCKED', open: null, reason: 'scope-too-broad' }], { startedAt: at('02') })
  let c = run([broad, L('c2-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c2-x-a1b2c3-p2', [[1, 'FAIL', '11']])])
  assert.equal(c.statusLabel, '검증 N · 1회차 진행 (1/5)'); assert.deepEqual(c.rounds.map(g => g.name), ['Codex 판정 c2-x-a1b2c3'])   // 기준 원장 BLOCKED 는 대체 — 묶음 1개 단위
  assert.equal(c.chips[0].txt, '원장 c2-x-a1b2c3 (묶음 2개 AND)'); assert.match(c.lines[0], /묶음 c2-x-a1b2c3-p1 · c2-x-a1b2c3-p2 AND\(전부 PASS 일 때만 Y\)/)
  c = run([L('c2-x-a1b2c3-p1', [[1, 'PASS', '10'], [2, 'PASS', '20']]), L('c2-x-a1b2c3-p2', [[1, 'FAIL', '11'], [2, 'PASS', '21']])])
  assert.equal(c.statusLabel, '검증 Y · 2회 만에 완료'); assert.equal(c.verdict.fails, 1)
  c = run([L('c2-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c2-x-a1b2c3-p2', [])])
  assert.equal(c.status, 'blocked')   // 일부 묶음 판정 없음 = Y 아님
  // 실행별 판정(상세)도 묶음 AND : 대상 접미(-a1b2c3)가 기준 id 에 남는다
  const ns = buildRequestGraph(turn({ agents_detail: [{ ...col, agent_id: 'a1b2c3ffff', ts_end: '2026-11-08T10:02:00+09:00' }] }), [L('c2-x-a1b2c3-p1', [[1, 'PASS', '10']]), L('c2-x-a1b2c3-p2', [[1, 'FAIL', '11']])])
  assert.equal(agentsOf(ns)[0].cdx, '검증 N')
  assert.deepEqual(mergeParts([{ id: 'c4-a', rows: [] }]), [{ id: 'c4-a', rows: [] }])   // 묶음 없음 = 그대로
})

// ── 2026-11-10 마스터 "총괄검수가 끝나면 반드시 파다완 아소카의 종료 승인" · "턴 묶음 1회 판정"(Stop 훅 turn-gate.mjs) ──
test('턴 묶음 원장 c<N>-turn-<요청키> : 각 CDX 칸에 매칭, 실행별 판정에는 쓰지 않음, 묶음 원장(bundle-) 제외', async () => {
  const { turnKey, TURN_ID_RE, loadLoops } = await import('../scripts/request-graph.mjs')
  assert.equal(turnKey('f7dc16b9-2b2b', P('2026-11-08T01:10:00Z')), 'f7dc16-1108101000')
  const SID = 'f7dc16b9-2b2b', key = turnKey(SID, P(T0))   // 턴 원장은 이 요청 키(세션·요청 시각)와 같을 때만 연결
  assert.equal(key, 'f7dc16-1108100000'); assert.ok(TURN_ID_RE.test(`c1-turn-${key}`)); assert.ok(!TURN_ID_RE.test('c4-turn-gate-a1b2c3'))   // 에이전트 설명 슬러그 'turn-…' 과 구분
  const at = '2026-11-08T01:20:00Z', ls = [1, 2, 3, 4, 5, 6].map(no => KL(`c${no}-turn-${key}`, at, no === 3 ? 'FAIL' : 'PASS'))
  const b = { ...ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: '2026-11-08T10:05:00+09:00', agent_id: 'a0b1c2d3e4' }) }
  const ns = buildRequestGraph(turn({ session_id: SID, tools: { Read: 2 }, agents_detail: [b, ag('anakin_phase-build', '2026-11-08T10:06:00+09:00')] }), ls, { runs: [{ ts: '2026-11-08T01:15:00Z', trigger: 'stop', mode: 'live' }] })
  const cx = { '1.1.1.1': 1, '1.1.2.1': 2, '1.1.3.1': 3, '1.1.4.1': 4, '1.1.5.1': 5, '1.1.5.2.1': 6 }
  for (const [id, no] of Object.entries(cx)) { const n = node(ns, id); assert.ok(n, id); assert.equal(n.rounds?.[0]?.name, `Codex 판정 c${no}-turn-${key}`, id); assert.equal(n.verdict.yn, no === 3 ? 'N' : 'Y', id) }
  assert.equal(AL(ns).find(n => n.aid === 'a0b1c2d3e4').cdx, '검증 누락')   // 턴 원장(c4-turn)은 build 실행의 판정이 아니다
  // 묶음 원장 폴더는 loadLoops 가 뺀다
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-loops-'))
  try {
    for (const id of [`bundle-turn-${key}`, `c1-turn-${key}`]) { fs.mkdirSync(path.join(d, id)); fs.writeFileSync(path.join(d, id, 'ledger.json'), JSON.stringify({ id, startedAt: at, iters: [{ iter: 1, at, verdict: 'PASS', openDefects: [] }] })) }
    assert.deepEqual(loadLoops(d).map(l => l.id), [`c1-turn-${key}`])
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
})

test('원장↔요청 창 (c5-turn-f7dc16 D-001 · c4-codex-ac436f-p1 D-001·D-002) : 턴 원장 = 같은 요청 키만·응답 뒤 Stop 판정 포함, 요청 전 원장 = 귀속 에이전트 접미·접미 없음만(재개 A6 유지)', async () => {
  const { turnKey } = await import('../scripts/request-graph.mjs')
  const SID = 'f7dc16b9-2b2b', key = turnKey(SID, P(T0)), other = turnKey('ab12cd34', P(T0))
  const c1 = ns => node(ns, '1.1.1.1')
  // ① 응답(10:30) 뒤 Stop 판정(10:31) = 같은 키면 연결 · 다른 세션 같은 시각 키(반대 판정) = 연결 안 함
  let ns = buildRequestGraph(turn({ session_id: SID }), [KL(`c1-turn-${key}`, '2026-11-08T01:31:00Z', 'PASS'), KL(`c1-turn-${other}`, '2026-11-08T01:20:00Z', 'FAIL')])
  assert.deepEqual(c1(ns).rounds.map(g => g.name), [`Codex 판정 c1-turn-${key}`]); assert.equal(c1(ns).verdict.yn, 'Y')
  // ② 요청 시작(10:00) 전 다른 실행(접미 a9f8e7 — 이 요청 귀속 아님) 원장 = 귀속 에이전트가 창을 앞(09:00)으로 넓혀도 연결 안 함, 귀속 에이전트 접미 원장 = 연결(재개)
  const col = ag('anakin_phase-collect', '2026-11-08T09:00:00+09:00', { agent_id: 'a1b2c3d4e5', ts_end: '2026-11-08T10:20:00+09:00' })
  ns = buildRequestGraph(turn({ session_id: SID, agents_detail: [col] }), [KL('c1-codex-a9f8e7', '2026-11-08T00:43:00Z', 'FAIL'), KL('c3-codex-a9f8e7', '2026-11-08T00:43:00Z', 'FAIL'), KL('c2-collect-a1b2c3', '2026-11-08T00:30:00Z', 'PASS')])
  assert.equal(c1(ns).rounds, undefined); assert.notEqual(c1(ns).verdict?.yn, 'N')   // 요청 전 다른 대상 원장이 c1 을 N 으로 만들지 않는다
  assert.equal(node(ns, '1.1.2.1').rounds?.[0]?.name, 'Codex 판정 c2-collect-a1b2c3')
  // ③ 요청 창 안 다른 대상 원장 = 종전처럼 시간창 매칭(바뀌지 않음)
  ns = buildRequestGraph(turn({ session_id: SID }), [KL('c1-codex-a9f8e7', '2026-11-08T01:10:00Z', 'PASS')])
  assert.equal(c1(ns).rounds?.[0]?.name, 'Codex 판정 c1-codex-a9f8e7')
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
  { const pp = buildPath(ns), e = pp.edges.find(x => x.to === '1.2'); assert.deepEqual(route(pp).slice(-2), ['1.2', 'E']); assert.ok(SLOTS.find(x => x.id === route(pp).at(-3))?.kind === 'codex', route(pp).join(',')); assert.equal(e.label, '⚠ 승인 미실행') }   // D-002 : … → CDX-총괄 → 승인(미실행 경고) → 종료
  ns = buildRequestGraph(turn({ forced: [{ at: '2026-11-08T01:30:00Z', why: '연속 차단 3회' }] }), []); n = node(ns, '1.2')
  assert.equal(n.statusLabel, '승인 강제 실패'); assert.deepEqual(n.alerts, ['승인 강제 실패']); assert.match(node(ns, '1').lines.join(' '), /승인 강제 실패/)
})
