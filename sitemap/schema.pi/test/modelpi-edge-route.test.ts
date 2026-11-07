// ERD 관계선 직교 경로(edge-route.ts) 검사 — 평행 겹침 0·박스 관통 0·교차 건너뛰기·끝점 간격·옮긴 선(변·경유점)·기하 검사 함수
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countBoxOverlaps, countCrossings, countLabelBoxHits, countLabelHits, detourStats, placeLabels, countNodeHits, countOverlaps, crossPoints, hopPath, routeAll, routeEdges, RT } from '../src/lib/modelpi/edge-route.ts'
import type { Box } from '../src/lib/modelpi/edge-geo.ts'

const B = (x: number, y: number, w = 180, h = 90): Box => ({ x, y, w, h })
const check = (boxes: Map<string, Box>, rels: { id: string; from: string; to: string }[]) => {
  const rt = routeEdges(boxes, rels)
  const paths = rels.map((r) => rt.get(r.id)!.pts)
  assert.equal(countOverlaps(paths), 0, '평행 겹침')
  assert.equal(countNodeHits(paths, [...boxes.values()]), 0, '박스 관통')
  for (const r of rels) {
    const p = rt.get(r.id)!
    assert.ok(p.ok, `${r.id} 완화 경로`)
    for (let i = 1; i < p.pts.length; i++) assert.ok(p.pts[i].x === p.pts[i - 1].x || p.pts[i].y === p.pts[i - 1].y, `${r.id} 직교`)
  }
  return { rt, paths }
}

test('검사 함수 : 평행 겹침·교차·관통·라벨', () => {
  const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
  assert.equal(countOverlaps([a, [{ x: 50, y: 4 }, { x: 150, y: 4 }]]), 1) // 4px 간격 나란히 = 겹침
  assert.equal(countOverlaps([a, [{ x: 50, y: 12 }, { x: 150, y: 12 }]]), 0) // 12px = 분리
  assert.equal(countOverlaps([a, [{ x: 100, y: 0 }, { x: 200, y: 0 }]]), 0) // 끝점만 맞닿음
  assert.equal(countCrossings([a, [{ x: 50, y: -20 }, { x: 50, y: 20 }]]), 1)
  assert.equal(countCrossings([a, [{ x: 100, y: -20 }, { x: 100, y: 20 }]]), 0) // 끝점 = 교차 아님
  assert.equal(countNodeHits([[{ x: -10, y: 45 }, { x: 300, y: 45 }]], [B(100, 0)]), 1)
  assert.equal(countNodeHits([[{ x: 100, y: -10 }, { x: 100, y: 0 }]], [B(100, 0)]), 0) // 변에 닿는 끝점
  assert.equal(countLabelHits([{ x: 40, y: -5, w: 20, h: 10 }, null], [a, [{ x: 50, y: -20 }, { x: 50, y: 20 }]], []), 2) // 자기 선 위 + 다른 선 = 2
  assert.equal(countLabelHits([{ x: 40, y: 6, w: 20, h: 10 }], [a], []), 0) // 선 옆(여백 2px 밖) = 0
})

test('한 부모 → 여러 자식 + 가운데 막는 박스 : 겹침·관통 0, 같은 변 끝점 간격 ≥ 24px', () => {
  const boxes = new Map([['p', B(400, 0)], ['x', B(400, 200)], ['c1', B(0, 400)], ['c2', B(250, 400)], ['c3', B(500, 400)], ['c4', B(750, 400)], ['c5', B(400, 650)]])
  const rels = ['c1', 'c2', 'c3', 'c4', 'c5'].map((c) => ({ id: `r-${c}`, from: 'p', to: c }))
  const { rt } = check(boxes, rels)
  const starts = rels.map((r) => rt.get(r.id)!).filter((p) => p.ps === 'B').map((p) => p.pts[0].x).sort((a, b) => a - b)
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= RT.step * RT.portEvery, `끝점 간격 ${starts}`)
})

test('라벨은 선 옆 빈 곳 · 박스 겹침·우회비 지표', () => {
  const paths = [[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }]]
  const [c] = placeLabels(paths, [], ['관계명 라벨'])
  assert.equal(countLabelHits([{ x: c!.x - c!.w / 2, y: c!.y - c!.h / 2, w: c!.w, h: c!.h }], paths, []), 0)
  // 박스 사이 좁은 틈(박스와 겹칠 자리뿐) : 박스와는 절대 겹치지 않음 — 줄이거나 숨김
  const bx = [B(0, 0, 200, 100), B(240, 0, 200, 100)]
  const [n] = placeLabels([[{ x: 200, y: 50 }, { x: 240, y: 50 }]], bx, ['과금권역코드이(가) 시간대요율상세을(를) 가진다'])
  assert.equal(countLabelBoxHits([n!.w ? { x: n!.x - n!.w / 2, y: n!.y - n!.h / 2, w: n!.w, h: n!.h } : null], bx), 0)
  assert.ok(n!.text === '' || n!.text.endsWith('…'), n!.text)
  assert.equal(countBoxOverlaps([B(0, 0), B(100, 50), B(400, 0)]), 1)
  assert.deepEqual(detourStats([[{ x: 0, y: 0 }, { x: 0, y: -50 }, { x: 100, y: -50 }, { x: 100, y: 0 }]]), { total: 200, maxRatio: 2 })
})

test('같은 두 엔터티 사이 관계 3개 + 자기 참조 : 서로 다른 경로', () => {
  const boxes = new Map([['a', B(0, 0)], ['b', B(0, 300)]])
  const rels = [{ id: 'r1', from: 'a', to: 'b' }, { id: 'r2', from: 'a', to: 'b' }, { id: 'r3', from: 'a', to: 'b' }, { id: 'self', from: 'a', to: 'a' }]
  const { rt } = check(boxes, rels)
  assert.equal(new Set(rels.map((r) => JSON.stringify(rt.get(r.id)!.pts[0]))).size, 4)
  const s = rt.get('self')!
  assert.deepEqual([s.ps, s.cs], ['R', 'T'])
})

test('격자형 12박스·관계 24개(교차 불가피) : 겹침·관통 0, 교차는 hop 반원으로', () => {
  const boxes = new Map<string, Box>()
  for (let i = 0; i < 12; i++) boxes.set(`n${i}`, B((i % 4) * 320, Math.floor(i / 4) * 260))
  const rels: { id: string; from: string; to: string }[] = []
  for (let i = 0; i < 12; i++) for (const k of [1, 5]) if (i + k < 12) rels.push({ id: `${i}-${i + k}`, from: `n${i}`, to: `n${i + k}` })
  for (const [a, b] of [[0, 11], [3, 8], [1, 10], [2, 9]]) rels.push({ id: `x${a}-${b}`, from: `n${a}`, to: `n${b}` })
  const { paths } = check(boxes, rels)
  const hops = crossPoints(paths)
  const k = hops.findIndex((h) => h.length)
  if (k >= 0) assert.match(hopPath(paths[k], hops[k]), /A5,5 0 0 [01] /)
  const all = routeAll(boxes, rels.map((r) => ({ ...r, label: '관계명' })))
  assert.equal(all.size, rels.length)
})

test('옮긴 선 : 지정 변·비율 가까운 끝점, 꺾임점 경유', () => {
  const boxes = new Map([['a', B(0, 0)], ['b', B(500, 300)]])
  const rt = routeEdges(boxes, [{ id: 'r', from: 'a', to: 'b', ps: 'B', pr: 0.25, cs: 'L', cr: 0.5, mx: 300, my: 120 }])
  const p = rt.get('r')!
  assert.deepEqual([p.ps, p.cs], ['B', 'L'])
  assert.ok(Math.abs(p.pts[0].x - 45) <= RT.step * RT.portEvery, `부모 끝점 ${p.pts[0].x}`)
  // 경유점(300,120)과 경로 선분 사이 최소 거리 ≤ 격자 간격(막히지 않은 가까운 격자점으로 맞춤)
  const segDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(Math.max(Math.min(a.x, b.x) - 300, 0, 300 - Math.max(a.x, b.x)), Math.max(Math.min(a.y, b.y) - 120, 0, 120 - Math.max(a.y, b.y)))
  const near = p.pts.slice(1).some((q, i) => segDist(p.pts[i], q) <= RT.step)
  assert.ok(near, `경유점 지남 ${JSON.stringify(p.pts)}`)
})
