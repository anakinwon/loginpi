// ERD 자동 배치(PRD_PiErd S3 E3) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoLayout, boxSize, type LNode } from '../src/lib/modelpi/layout.ts'

const N = (id: string, o: Partial<LNode> = {}): LNode => ({ id, w: 160, h: 80, ...o })
const overlap = (p: Record<string, { x: number; y: number }>, ns: LNode[]) => {
  for (const a of ns) for (const b of ns) if (a.id < b.id && p[a.id].x < p[b.id].x + b.w && p[b.id].x < p[a.id].x + a.w && p[a.id].y < p[b.id].y + b.h && p[b.id].y < p[a.id].y + a.h) return `${a.id}-${b.id}`
  return null
}

test('계층 배치 : 부모가 자식보다 위, 겹침 없음', () => {
  const ns = [N('c'), N('o'), N('d'), N('p')]
  const p = autoLayout(ns, [{ from: 'c', to: 'o' }, { from: 'o', to: 'd' }, { from: 'p', to: 'd' }])
  assert.ok(p.c.y < p.o.y && p.o.y < p.d.y)
  assert.equal(overlap(p, ns), null)
})

test('고정 엔터티 좌표 불변 + 겹친 자유 엔터티 밀어냄', () => {
  const free = autoLayout([N('a'), N('b')], [{ from: 'a', to: 'b' }])
  const ns = [N('a', { x: free.b.x, y: free.b.y, fixed: true }), N('b')] // a 를 b 자리에 고정 → b 와 겹침
  const p = autoLayout(ns, [{ from: 'a', to: 'b' }])
  assert.deepEqual(p.a, { x: free.b.x, y: free.b.y })
  assert.equal(overlap(p, ns), null)
})

test('증분(new) : 좌표 있는 엔터티는 그대로, 새 엔터티만 배치·겹침 없음', () => {
  const ns = [N('a', { x: 0, y: 0 }), N('b', { x: 400, y: 0 }), N('c')]
  const p = autoLayout(ns, [{ from: 'a', to: 'c' }], { mode: 'new' })
  assert.deepEqual([p.a, p.b], [{ x: 0, y: 0 }, { x: 400, y: 0 }])
  assert.equal(overlap(p, ns), null)
  const all = autoLayout(ns, [{ from: 'a', to: 'c' }], { mode: 'all' }) // 고정 아님 → 다시 배치
  assert.ok(all.a.x !== 0 || all.a.y !== 0 || all.b.x !== 400)
})

test('증분(new) : 새 자식 = 부모 바로 아래, 새 부모 = 자식 바로 위(가운데 맞춤), 멀리 떨어진 기존 좌표 기준', () => {
  const ns = [N('p', { x: 5000, y: 3000 }), N('k', { x: 9000, y: 100 }), N('c'), N('q'), N('cc')]
  const p = autoLayout(ns, [{ from: 'p', to: 'c' }, { from: 'q', to: 'k' }, { from: 'c', to: 'cc' }], { mode: 'new' })
  assert.equal(p.c.x, 5000) // 부모 가운데 맞춤(같은 폭)
  assert.ok(p.c.y > 3000 + 80 && p.c.y < 3000 + 80 + 200, `c.y ${p.c.y}`) // 부모 바로 아래
  assert.equal(p.q.x, 9000)
  assert.ok(p.q.y < 100 - 80 && p.q.y > 100 - 80 - 200, `q.y ${p.q.y}`) // 자식 바로 위
  assert.ok(p.cc.y > p.c.y && Math.abs(p.cc.x - p.c.x) < 1) // 새 엔터티끼리 사슬 : 먼저 놓인 새 부모 아래
  assert.equal(overlap(p, ns), null)
})

test('증분(new) : 같은 부모의 새 자식 둘은 겹치지 않게 옆으로, 관계 없는 새 엔터티는 놓인 영역 오른쪽 위', () => {
  const ns = [N('p', { x: 0, y: 0 }), N('a'), N('b'), N('z')]
  const p = autoLayout(ns, [{ from: 'p', to: 'a' }, { from: 'p', to: 'b' }], { mode: 'new' })
  assert.equal(p.a.y, p.b.y)
  assert.equal(overlap(p, ns), null)
  assert.ok(p.z.x >= Math.max(p.a.x, p.b.x) + 160 && p.z.y === 0, JSON.stringify(p.z))
})

test('증분(new) 검증 회귀 : 부모 아래 줄이 오른쪽으로 길게 막혀도 새 자식은 가까운 왼쪽 빈자리', () => {
  const row = Array.from({ length: 10 }, (_, i) => N(`r${i}`, { x: i * 220, y: 200 }))
  const ns = [N('p', { x: 0, y: 0 }), ...row, N('c')]
  const p = autoLayout(ns, [{ from: 'p', to: 'c' }], { mode: 'new' })
  assert.ok(Math.abs(p.c.x) < 400, `c.x ${p.c.x}`) // 이전 = 2200(줄 끝)
  assert.equal(overlap(p, ns), null)
})

test('증분(new) 검증 회귀 : 놓인 엔터티와 관계없는 새 엔터티끼리 묶음 = 첫 엔터티 오른쪽 위, 자식은 그 아래', () => {
  const ns = [N('a', { x: 0, y: 0 }), N('e'), N('f')]
  const p = autoLayout(ns, [{ from: 'e', to: 'f' }], { mode: 'new' })
  assert.ok(p.e.x >= 160 && p.e.y === 0, JSON.stringify(p.e))
  assert.ok(p.f.y > p.e.y + 80 && Math.abs(p.f.x - p.e.x) < 1, JSON.stringify(p.f))
  assert.equal(overlap(p, ns), null)
})

test('주제영역 묶음·자기참조·없는 노드 관계 무시, 박스 크기 = 내용 맞춤', () => {
  const ns = [N('a', { group: 'G1' }), N('b', { group: 'G1' }), N('c', { group: 'G2' })]
  const p = autoLayout(ns, [{ from: 'a', to: 'a' }, { from: 'a', to: 'zz' }, { from: 'a', to: 'b' }])
  assert.equal(overlap(p, ns), null)
  const s1 = boxSize('고객', ['고객번호'])
  const s2 = boxSize('고객', ['고객번호', '아주아주아주아주긴속성이름입니다'])
  assert.ok(s2.w > s1.w && s2.h > s1.h && s1.w >= 160)
})

test('검증 결함 회귀 : 같은 쌍 평행 관계 3개 이상(역할명 FK)에도 예외 없음', () => {
  const ns = [N('n0'), N('n1', { group: 'A' }), N('n2', { group: 'B' }), N('n3', { group: 'B' })]
  const es = [{ from: 'n2', to: 'n3' }, { from: 'n2', to: 'n3' }, { from: 'n2', to: 'n3' }, { from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }]
  for (let i = 0; i < 50; i++) assert.doesNotThrow(() => autoLayout(ns, es))
  assert.equal(overlap(autoLayout(ns, es), ns), null)
})

test('규모 회귀 : 엔터티 300·주제영역 10·순환 포함에도 예외 없음(묶음 실패 시 묶음 없이 배치)', () => {
  const n = 300
  const ns = Array.from({ length: n }, (_, i) => N(`e${i}`, { group: `g${i % 10}` }))
  const es = Array.from({ length: 390 }, (_, i) => ({ from: `e${(i * 7) % n}`, to: `e${(i * 13 + 1) % n}` }))
  const p = autoLayout(ns, es)
  assert.equal(Object.keys(p).length, n)
  assert.equal(overlap(p, ns), null)
})
