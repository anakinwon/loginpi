// ERD 인쇄 기하 단위 테스트 — 인쇄 영역·페이지 나눔(빈 칸 제외)·한 장 맞춤
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitView, pageGrid, printArea } from '../src/lib/modelpi/print.ts'

test('인쇄 영역 — A4 가로 여백 10mm = 277×190mm', () => {
  const a = printArea('A4', 'landscape', 10)
  assert.equal(Math.round(a.w), Math.round((277 * 96) / 25.4))
  assert.equal(Math.round(a.h), Math.round((190 * 96) / 25.4))
  const p = printArea('A4', 'portrait', 10)
  assert.equal(Math.round(p.w), Math.round(a.h))
})

test('페이지 나눔 — 엔터티가 걸친 칸만, 행 우선 번호', () => {
  const boxes = [
    { x: 0, y: 0, w: 100, h: 50 },
    { x: 900, y: 500, w: 100, h: 50 },
  ]
  const g = pageGrid(boxes, 500, 300, 20)
  assert.deepEqual([g.cols, g.rows], [3, 2])
  // 두 번째 박스(x 900~1000)는 칸 경계 x=980 에 걸쳐 2칸 — 빈 칸 (1,0)·(2,0)·(0,1)은 제외
  assert.deepEqual(g.tiles.map((t) => [t.c, t.r, t.no]), [[0, 0, 1], [1, 1, 2], [2, 1, 3]])
  assert.deepEqual(pageGrid([], 500, 300).tiles, [])
})

test('한 장 맞춤 — 넘치면 축소, 작으면 100% 가운데', () => {
  const f = fitView([{ x: 0, y: 0, w: 2000, h: 500 }], 1000, 800, 0)
  assert.equal(f.zoom, 0.5)
  assert.equal(f.y, (800 - 250) / 2)
  const s = fitView([{ x: 100, y: 100, w: 200, h: 100 }], 1000, 800, 0)
  assert.equal(s.zoom, 1)
  assert.deepEqual([s.x, s.y], [300, 250])
})
