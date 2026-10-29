// 요청 재수행 공용 함수 시험 — node:test (pnpm test). 대시보드 # 번호 → 턴 해석, 상태 판정, 세션 생존 추정, 재수행 명령 조립
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTurns, resolveTarget, turnStatus, judgeLiveness, buildCommand } from '../scripts/work-history-rows.mjs'

const SID_A = 'aaaa1111-0000-0000-0000-000000000001', SID_B = 'bbbb2222-0000-0000-0000-000000000002'
const rec = (sid, turn, part, ts, extra = {}) => ({ id: `${sid}:${turn}.${part}`, session: sid.slice(0, 8), session_id: sid, turn, part, ts_req: ts, ts_res: null, req_head: `요청 ${turn}`, ...extra })
const rows = [
  rec(SID_A, 1, 1, '2026-10-29T10:00:00+09:00', { ts_res: '2026-10-29T10:05:00+09:00' }),
  rec(SID_A, 2, 1, '2026-10-29T11:00:00+09:00', { incomplete: true }),                      // part 1 끊김
  rec(SID_A, 2, 2, '2026-10-29T11:00:00+09:00', { ts_res: '2026-10-29T11:09:00+09:00' }),   // part 2 응답 → 완료
  rec(SID_B, 1, 1, '2026-10-29T12:00:00+09:00', { interrupted: true, incomplete: true }),
  rec(SID_B, 2, 1, '2026-10-29T12:10:00+09:00', { superseded: true }),
  rec(SID_B, 3, 1, '2026-10-29T12:20:00+09:00', { absorbed: true }),
  rec(SID_B, 4, 1, '2026-10-29T12:30:00+09:00'),
  rec(SID_B, 4, 1, '2026-10-29T12:30:00+09:00'),                                              // 같은 레코드 재기록(중복)
  rec(SID_B, 0, 1, '2026-10-01T00:00:00+09:00', { ts_res: '2026-10-01T00:01:00+09:00' }),   // 기준 시각 이전 → 제외
]
const turns = buildTurns(rows, Date.parse('2026-10-09T00:00:00+09:00'))

test('buildTurns : 기준 시각 필터 · part 합산 · 중복 제거 · 최신순', () => {
  assert.deepEqual(turns.map(t => `${t.session}:${t.turn}`), ['bbbb2222:4', 'bbbb2222:3', 'bbbb2222:2', 'bbbb2222:1', 'aaaa1111:2', 'aaaa1111:1'])
})

test('turnStatus : 완료 · 진행 중 · 중단 · 대체됨 · 응답 없음', () => {
  assert.deepEqual(turns.map(t => turnStatus(t).label), ['진행 중', '응답 없음', '대체됨', '중단', '완료', '완료'])
  assert.equal(turnStatus(turns[4]).resumable, false)
  assert.equal(turnStatus({ ts_res: '2026-10-29T12:00:00+09:00', absorbed: true, ts_res_src: 'mid_turn' }).key, 'done')   // loadRows mid-turn 보정 반영
  assert.equal(turnStatus({ incomplete: true }).key, 'noreply')
  // 중단 후 재개 : 마지막 part 가 응답으로 끝남 = 완료 / 앞 part 응답 뒤 마지막 part 가 응답 없이 끊김(ts_res 는 앞 part 값) = 중단
  assert.equal(turnStatus({ interrupted: true, ts_res: '2026-10-29T07:08:32+09:00' }).key, 'done')
  assert.equal(turnStatus({ interrupted: true, incomplete: true, ts_res: '2026-10-29T07:08:32+09:00' }).key, 'interrupted')
  assert.equal(turnStatus({ interrupted: true, incomplete: true }).key, 'interrupted')
})

test('resolveTarget : # 번호 · 레코드 id · 세션 앞부분', () => {
  assert.equal(resolveTarget(turns, '1').turn.turn, 4)
  assert.equal(resolveTarget(turns, '#5').turn.session, 'aaaa1111')
  assert.match(resolveTarget(turns, '99').error, /없음/)
  assert.equal(resolveTarget(turns, `${SID_A}:2.2`).no, 5)
  assert.equal(resolveTarget(turns, 'aaaa1111:1').no, 6)
  assert.equal(resolveTarget(turns, 'bbbb').turn.turn, 4)            // 턴 생략 = 그 세션 최신 턴
  assert.match(resolveTarget(turns, 'zzz!').error, /해석/)
  assert.match(resolveTarget([...turns, { session_id: 'bbbb9999-x', session: 'bbbb9999', turn: 1, ts_req: '' }], 'bbbb').error, /세션 2개/)
})

test('judgeLiveness : 수정 시각·뒤 요청으로 추정', () => {
  const now = Date.parse('2026-10-29T13:00:00Z')
  assert.equal(judgeLiveness({ mtimeMs: null, now }).live, false)
  assert.equal(judgeLiveness({ mtimeMs: now - 60e3, now }).live, true)
  assert.match(judgeLiveness({ mtimeMs: now - 3600e3, now }).text, /\[확인중\]/)
  assert.match(judgeLiveness({ mtimeMs: now - 3600e3, now, laterTurns: 2 }).text, /뒤 요청 2건/)
})

test('buildCommand : 같은 세션 이어가기 · 새 세션 재실행', () => {
  const r = buildCommand({ turn: turns[0], mode: 'resume', cwd: '/w', live: true })
  assert.deepEqual(r.args.slice(0, 3), ['--resume', SID_B, '--fork-session'])
  const n = buildCommand({ turn: turns[0], mode: 'new', cwd: '/w', print: true, request: '원 요청문' })
  assert.equal(n.args[0], '-p'); assert.match(n.args.at(-1), /원 요청문/); assert.ok(!n.args.includes('--resume'))
})
