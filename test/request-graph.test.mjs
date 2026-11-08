// request-graph 매핑 순수 함수 회귀 시험 : 턴 + agent 레코드 + Codex 루프 → 노드 상태·시간 쌍·회차, 상태 색 대비, 깜빡임 CSS
// 실행 : pnpm test (node:test)
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { buildRequestGraph, buildPath, loopRounds, roundSummary, fmtSpan, designGraph, safeName, renderHtml, SLOTS, SLOT_MAP, ENG_SLOTS, STATUS_STYLE, PAGE_BG } from '../scripts/request-graph.mjs'

const T0 = '2026-11-08T10:00:00+09:00', T1 = '2026-11-08T10:30:00+09:00', P = Date.parse
const turn = (extra = {}) => ({ ts_req: T0, ts_res: T1, req_head: '요청', ...extra })
const ag = (type, start, extra = {}) => ({ type, model: 'claude-opus-5-5', ts_start: start, ts_end: start, wall_ms: 1000, cost_usd: 0.1, errors: 0, ...extra })
const loop = (id, events, extra = {}) => ({ id, events, ...extra })
const node = (ns, id) => ns.find(n => n.id === id)
const NONE = {}   // 빈 매핑 : 설계 슬롯은 모두 미배정

test('빈 매핑·에이전트 없는 완료 턴 : 1·1.1 완료, 분석 슬롯 미배정, 1.2 미실행', () => {
  const ns = buildRequestGraph(turn(), [], { slotMap: NONE })
  assert.equal(ns.length, SLOTS.length)
  assert.equal(node(ns, '1').status, 'done')
  assert.equal(node(ns, '1.1.3').status, 'unassigned')
  assert.equal(node(ns, '1.2').status, 'notrun')
  assert.equal(node(ns, '1').eng, 0)
})

test('기본 SLOT_MAP : 대응 기록 없는 엔지니어링 슬롯 = 미수행, 훅 기록 = 완료(시각 —), 엔지니어링 N/5', () => {
  assert.deepEqual(Object.keys(SLOT_MAP).filter(k => ENG_SLOTS.includes(k)).sort(), ENG_SLOTS)
  const ns = buildRequestGraph(turn({ resources: { hooks: [{ name: 'UserPromptSubmit', event: 'UserPromptSubmit', n: 1 }] } }), [])
  assert.equal(node(ns, '1.1.1').status, 'done')
  assert.equal(node(ns, '1.1.1').t0, null)
  for (const id of ['1.1.2', '1.1.3', '1.1.4', '1.1.5']) assert.equal(node(ns, id).status, 'missing', id)
  assert.equal(node(ns, '1.1.5.2').status, 'unassigned')   // 5단계 밖 슬롯은 미수행이 아님
  assert.equal(node(ns, '1').eng, 1)
})

test('마스터 확정 매핑(2026-11-08) : 1.1.2 = collect, 1.1.5 = graph → 해당 슬롯 아래·완료, 엔지니어링 N/5 반영', () => {
  assert.deepEqual(SLOT_MAP['1.1.2'].agents, ['anakin_phase-collect']); assert.deepEqual(SLOT_MAP['1.1.5'].agents, ['anakin_phase-graph'])
  assert.deepEqual(SLOT_MAP['1.1.5.2'], { owner: '아소카(메인)', source: 'runs.jsonl' })   // 마스터 확정 2026-11-09 — 실행 기록 없으면(runs 미전달) '기록 이전'
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00'), ag('anakin_phase-graph', '2026-11-08T10:25:00+09:00')] }), [])
  assert.equal(ns.find(n => n.label === 'anakin_phase-collect').parent, '1.1.2'); assert.equal(ns.find(n => n.label === 'anakin_phase-graph').parent, '1.1.5')
  assert.equal(node(ns, '1.1.2').status, 'done'); assert.equal(node(ns, '1.1.5').status, 'done'); assert.equal(node(ns, '1.1.5.2').status, 'unassigned')
  assert.equal(node(ns, '1').eng, 2)
})

test('1.1.5.2 = 생성기 실행 기록(runs.jsonl) : 창 안 live → 완료(진행 턴은 진행) / 없음 → 미수행 / 로그 이전 → 기록 이전, N/5 불변', () => {
  const run = (ts, extra = {}) => ({ ts, trigger: 'subagent', mode: 'live', md: false, ...extra })
  const first = run('2026-11-08T09:00:00+09:00', { trigger: 'manual' })
  const done = buildRequestGraph(turn(), [], { runs: [first, run('2026-11-08T10:05:00+09:00'), run('2026-11-08T10:30:03+09:00', { trigger: 'stop' })] })
  const n = node(done, '1.1.5.2')
  assert.equal(n.status, 'done'); assert.ok(n.lines.includes('생성기 실행 2회(subagent 1 · stop 1)')); assert.ok(n.lines.includes('마지막 실행 11-08 10:30:03 · 트리거 stop'))   // Stop 훅 실행 = 응답 직후(유예 안)
  assert.equal(done[0].eng, 0)   // 1.1.5 하위 — 엔지니어링 N/5 에 안 셈
  const live = buildRequestGraph(turn({ ts_res: null, agents_detail: [ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: null, live: true })] }), [], { now: P('2026-11-08T10:40:00+09:00'), runs: [first, run('2026-11-08T10:39:00+09:00')] })
  assert.equal(node(live, '1.1.5.2').status, 'running')
  const miss = buildRequestGraph(turn(), [], { runs: [first, run('2026-11-08T10:10:00+09:00', { mode: 'design' }), run('2026-11-08T12:00:00+09:00')] })
  assert.equal(node(miss, '1.1.5.2').status, 'missing')   // 설계도판 재생성·창 밖 실행은 안 셈
  for (const runs of [[], [run('2026-11-08T11:00:00+09:00')]]) { const x = node(buildRequestGraph(turn(), [], { runs }), '1.1.5.2'); assert.equal(x.status, 'unassigned'); assert.equal(x.statusLabel, '기록 이전') }
})

test('판 간 링크 : 설계도판 → 실시간 모니터링판(상대경로·로컬 생성 안내), 실데이터판 → 설계도판', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), html = (design, dir) => renderHtml({ design, outDir: path.join(root, dir), requests: [], meta: '' })
  assert.ok(html(true, '.claude/engineering/50. graph').includes('<a href="../../../work-statistics/mywork/myRequestGraph.html">실시간 모니터링판 열기</a> <span class="muted">(로컬 생성 후 열림)</span>'))
  assert.ok(html(false, 'work-statistics/mywork').includes('<a href="../../.claude/engineering/50.%20graph/myRequestGraph.html">설계도판 열기</a>'))
})

test('에이전트 배치 : 대응 슬롯 아래(시작순), 미대응은 1.1, admin 은 1.2, 같은 type 2회 이상 = 반복 실행 회차표', () => {
  const ns = buildRequestGraph(turn({ agents_detail: [
    ag('anakin_phase-build', '2026-11-08T10:10:00+09:00', { ts_end: '2026-11-08T10:12:00+09:00' }), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00'),
    ag('anakin_phase-build', '2026-11-08T10:14:00+09:00', { ts_end: '2026-11-08T10:15:00+09:00' }), ag('general-purpose', '2026-11-08T10:01:00+09:00', { errors: 2 }),
  ] }), [])
  assert.deepEqual(ns.filter(n => n.parent === '1.1.4' && !n.slot).map(n => n.label), ['anakin_phase-build', 'anakin_phase-build'])
  assert.equal(ns.find(n => n.parent === '1.1' && !n.slot).label, 'general-purpose')
  assert.match(ns.find(n => n.label === 'general-purpose').statusLabel, /도구 오류 2회/)
  const s = node(ns, '1.1.4')
  assert.equal(s.status, 'done')
  assert.equal(s.t0, P('2026-11-08T10:10:00+09:00')); assert.equal(s.t1, P('2026-11-08T10:15:00+09:00'))
  assert.equal(s.rounds[0].rows.length, 2)
  assert.equal(node(ns, '1.2').statusLabel, '실행됨')
  assert.equal(node(ns, '1.1').t1, P('2026-11-08T10:15:00+09:00'))   // 1.1 = 하위 마지막 종료(admin 은 1.2 아래라 제외)
})

test('진행 중 에이전트 → 대응 슬롯 진행·요청 진행(턴 응답 후에도), 화면은 st-running 클래스로 깜빡임', () => {
  const now = P('2026-11-08T10:40:00+09:00')
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-verify', '2026-11-08T10:25:00+09:00', { ts_end: null, live: true })] }), [], { now })
  const a = ns.find(n => !n.slot)
  assert.equal(a.status, 'running'); assert.equal(a.run, true); assert.equal(a.t1, null)
  assert.equal(node(ns, '1.1.4').status, 'running')
  assert.equal(node(ns, '1').status, 'running'); assert.equal(node(ns, '1').run, true)
  assert.equal(node(ns, '1').statusLabel, '진행(팀원 실행 중)')
  const html = renderHtml({ design: false, outDir: '.', requests: [{ key: 'k', when: 'w', head: 'h', nodes: ns }], meta: '' })
  assert.match(html, /\.st-running \.box,[^{]*\{animation:pulse/)
  assert.match(html, /prefers-reduced-motion: reduce/)
  assert.match(html, /'node st-' \+ n\.status/)
  assert.match(html, /\.st-running\{--sc:#c9b800;--st:#1a1a1a;--sf:#fff200/)
})

test('종료 기록 없는 에이전트 : 끝난 턴이면 오류(실행 중 아님)', () => {
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-verify', '2026-11-08T10:05:00+09:00', { ts_end: null })] }), [])
  assert.equal(ns.find(n => !n.slot).status, 'error')
  assert.equal(node(ns, '1').status, 'done')
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

test('Codex 슬롯 : 기본 매핑은 1.1.4.1 만(추정 배지), 창 밖 루프 제외, BLOCKED 는 회차 수에서 제외', () => {
  const loops = [
    loop('in', [{ iter: 1, at: '2026-11-08T01:05:00Z', verdict: 'BLOCKED', open: null }, { iter: 1, at: '2026-11-08T01:20:00Z', verdict: 'PASS', open: 0 }]),
    loop('out', [{ iter: 1, at: '2026-11-08T03:00:00Z', verdict: 'FAIL', open: 1 }]),
  ]
  const ns = buildRequestGraph(turn(), loops)
  const c = node(ns, '1.1.4.1')
  assert.equal(c.status, 'done'); assert.equal(c.badge, '시간 기준 연결(추정)')
  assert.equal(c.rounds.length, 1); assert.equal(roundSummary(c.rounds[0].rows, 0).n, 1)
  assert.equal(node(ns, '1.1.1.1').status, 'unassigned')
  assert.equal(node(ns, '1.1.4').status, 'done')   // 루프 슬롯은 루프 기록만으로도 수행
  const m = buildRequestGraph(turn(), loops, { slotMap: { '1.1.1.1': { loops: ['out'] } } })
  assert.equal(node(m, '1.1.1.1').statusLabel, '루프 기록 없음')
})

test('끝난(중단) 턴은 이후 루프를 끌어오지 않음', () => {
  const loops = [loop('late', [{ iter: 1, at: '2026-11-08T05:00:00Z', verdict: 'PASS', open: 0 }])]
  const ns = buildRequestGraph(turn({ ts_res: null, interrupted: true, incomplete: true }), loops, { now: P('2026-11-08T23:00:00+09:00') })
  assert.equal(node(ns, '1').status, 'error')
  assert.equal(node(ns, '1.1.4.1').statusLabel, '루프 기록 없음')
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

const route = p => p.edges.map(e => e.to)
test('실행 경로 : 시작 → 1 → 1.1 → 이벤트 시작 시각순(슬롯은 첫 진입 1회 경유) → 종료, 같은 type 반복은 k회차', () => {
  const ns = buildRequestGraph(turn({ agents_detail: [
    ag('anakin_phase-verify', '2026-11-08T10:12:00+09:00'), ag('anakin_phase-collect', '2026-11-08T10:01:00+09:00'),
    ag('anakin_phase-build', '2026-11-08T10:05:00+09:00'), ag('anakin_phase-build', '2026-11-08T10:15:00+09:00'), ag('teamanakin-admin', '2026-11-08T10:20:00+09:00'),
  ] }), [])
  const p = buildPath(ns), lab = id => ns.find(n => n.id === id)?.label || id
  assert.deepEqual(route(p).map(lab), ['마스터 아나킨 요청', '파다완 아소카 접수', '서브에이전트2 : 컨텍스트 분석', 'anakin_phase-collect', '서브에이전트4 : 루프 분석', 'anakin_phase-build', 'anakin_phase-verify', 'anakin_phase-build', '파다완 아소카 승인', 'teamanakin-admin', 'E'])
  assert.equal(p.edges[0].from, 'S')
  assert.deepEqual(p.edges.map(e => e.seq), p.edges.map((_, i) => i + 1))
  assert.equal(p.edges.find(e => e.label)?.label, 'build 2회차 (2/5)')
  assert.ok(p.edges.every(e => e.state === 'done' && !e.loop))
  assert.equal(p.term.S.t0, P(T0)); assert.equal(p.term.E.t0, P(T1)); assert.equal(p.term.E.pending, false)
})

test('실행 경로 : Codex 회차는 같은 노드로 되돌이(루프별 회차 라벨, BLOCKED 는 회차 수 제외), 진행 중이면 노랑·종료 대기', () => {
  const L = loop('L', [{ iter: 1, at: '2026-11-08T01:05:00Z', verdict: 'BLOCKED', open: null }, { iter: 2, at: '2026-11-08T01:10:00Z', verdict: 'FAIL', open: 2 }, { iter: 3, at: '2026-11-08T01:20:00Z', verdict: 'FAIL', open: 1 }], { startedAt: '2026-11-08T01:00:00Z', running: true })
  const now = P('2026-11-08T10:40:00+09:00')
  const p = buildPath(buildRequestGraph(turn({ ts_res: null }), [L], { now }))
  const cx = p.edges.filter(e => e.to === '1.1.4.1')
  assert.deepEqual(cx.map(e => e.label), ['L 1회차 BLOCKED', 'L 2회차 (1/5)', 'L 3회차 (2/5)', 'L 4회차 (3/5)'])
  assert.deepEqual(cx.map(e => e.loop), [false, true, true, true])
  assert.equal(cx.at(-1).state, 'running')
  assert.equal(p.edges.at(-1).to, 'E'); assert.equal(p.edges.at(-1).state, 'planned'); assert.equal(p.edges.at(-1).pass, false); assert.equal(p.term.E.pending, true)
  assert.equal(route(p)[2], '1.1.4')   // 루프 슬롯을 첫 진입 때 1회 경유
})

test('실행 경로 : 팀원 재작업 회차 = 같은 에이전트 노드로 되돌이', () => {
  const a = ag('anakin_phase-build', '2026-11-08T10:01:00+09:00', { ts_end: null, live: true, rounds: [{ t0: P('2026-11-08T10:01:00+09:00'), t1: P('2026-11-08T10:05:00+09:00'), run: false }, { t0: P('2026-11-08T10:09:00+09:00'), t1: null, run: true }] })
  const ns = buildRequestGraph(turn({ agents_detail: [a] }), [], { now: P('2026-11-08T10:40:00+09:00') }), q = buildPath(ns)
  const id = ns.find(n => !n.slot).id, into = q.edges.filter(e => e.to === id)
  assert.equal(into.length, 2); assert.equal(into[1].from, id); assert.equal(into[1].loop, true)
  assert.equal(into[1].label, '재작업 2회차 (2/5)'); assert.equal(into[1].state, 'running')
})

test('선 모양 : 진행 중 요청 → 진입 화살표 실선(노랑)·남은 표준 경로 점선(방문 슬롯 중복 없음)·종료 점선', () => {
  const now = P('2026-11-08T10:40:00+09:00')
  const ns = buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-collect', '2026-11-08T10:02:00+09:00'), ag('anakin_phase-build', '2026-11-08T10:20:00+09:00', { ts_end: null, live: true })] }), [], { now })
  const p = buildPath(ns), into = p.edges.find(e => ns.find(n => n.id === e.to)?.label === 'anakin_phase-build')
  assert.equal(into.state, 'running'); assert.equal(into.pass, true)
  const plan = p.edges.filter(e => !e.pass)
  assert.ok(plan.length > 0 && plan.every(e => e.state === 'planned'))
  assert.equal(p.edges.indexOf(plan[0]), p.edges.findIndex(e => !e.pass))   // 예정은 실제 경로 뒤에만
  assert.ok(p.edges.slice(p.edges.indexOf(plan[0])).every(e => !e.pass))
  const planTo = plan.map(e => e.to)
  assert.deepEqual(planTo, [...SLOTS.filter(s => ['sub', 'codex', 'approve'].includes(s.kind) && !['1.1.2', '1.1.4'].includes(s.id)).map(s => s.id), 'E'])
  assert.equal(new Set(planTo).size, planTo.length)
  assert.equal(plan.at(-1).to, 'E')
})

test('선 모양 : 완료 요청 → 전부 실선(예정 없음), 중단 요청 → 끊긴 지점부터 점선 + 중단', () => {
  const done = buildPath(buildRequestGraph(turn({ agents_detail: [ag('anakin_phase-build', '2026-11-08T10:05:00+09:00')] }), []))
  assert.ok(done.edges.every(e => e.pass && e.state === 'done'))
  assert.equal(done.edges.at(-1).to, 'E')
  const cut = buildPath(buildRequestGraph(turn({ ts_res: null, interrupted: true, incomplete: true }), [], { now: P('2026-11-08T23:00:00+09:00') }))
  const first = cut.edges.find(e => !e.pass)
  assert.equal(first.label, '중단'); assert.equal(cut.term.E.stopped, true)
  assert.equal(cut.edges.at(-1).to, 'E'); assert.equal(cut.edges.at(-1).pass, false)
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
  assert.equal(safeName('1.1.1 서브에이전트1 : 프롬프트 분석'), '1.1.1 서브에이전트1 프롬프트 분석')
  assert.equal(safeName('a[b]#c|d?'), 'a b c d')
})
