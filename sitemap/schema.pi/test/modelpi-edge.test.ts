// ERD 관계선 기하 단위 테스트 — 변 위 점·가까운 변·끝점 투영·같은 변 선 나눔
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoAnchors, nearSides, project, sidePoint } from '../src/lib/modelpi/edge-geo.ts'

const A = { x: 0, y: 0, w: 100, h: 50 }
const B = { x: 300, y: 0, w: 100, h: 50 }
const C = { x: 300, y: 200, w: 100, h: 50 }

test('변 위 점·가까운 변', () => {
  assert.deepEqual(sidePoint(A, 'R', 0.5), { x: 100, y: 25 })
  assert.deepEqual(sidePoint(A, 'T', 0.25), { x: 25, y: 0 })
  assert.deepEqual(nearSides(A, B), ['R', 'L'])
  assert.deepEqual(nearSides(B, A), ['L', 'R'])
  assert.deepEqual(nearSides({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 300, w: 100, h: 50 }), ['B', 'T'])
})

test('끝점 투영 — 가장 가까운 변과 비율(범위 밖은 0~1로)', () => {
  assert.deepEqual(project(A, { x: 101, y: 10 }), { side: 'R', r: 0.2 })
  assert.deepEqual(project(A, { x: 75, y: -3 }), { side: 'T', r: 0.75 })
  assert.deepEqual(project(A, { x: 50, y: 60 }), { side: 'B', r: 0.5 })
  assert.deepEqual(project(A, { x: -5, y: 80 }).r, 1)
})

test('같은 변에 모인 선은 고르게 나눔(상대 박스 위치 순)', () => {
  const boxes = new Map([['a', A], ['b', B], ['c', { x: 300, y: 30, w: 100, h: 50 }], ['d', C]])
  const m = autoAnchors(
    [
      { id: 'r2', from: 'a', to: 'c' },
      { id: 'r1', from: 'a', to: 'b' },
    ],
    boxes,
  )
  // a 의 오른쪽 변에 2개 — 위쪽 상대(b)가 먼저
  assert.equal(m.get('r1')!.ps, 'R')
  assert.equal(m.get('r1')!.pr, 0.333)
  assert.equal(m.get('r2')!.pr, 0.667)
  // 상대 쪽 변은 하나씩이라 가운데
  assert.equal(m.get('r1')!.cr, 0.5)
  // 자기 관계 = 오른쪽 → 위
  const s = autoAnchors([{ id: 's', from: 'd', to: 'd' }], boxes).get('s')!
  assert.deepEqual([s.ps, s.cs], ['R', 'T'])
})
