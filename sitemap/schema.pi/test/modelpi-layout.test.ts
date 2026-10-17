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
