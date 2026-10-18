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
  // 원점 고정 : 시작 칸 = floor(-20/500)*500 = -500 → x 칸 경계 -500·0·500·1000, y 경계 -300·0·300·600
  assert.deepEqual([g.x0, g.y0, g.cols, g.rows], [-500, -300, 4, 3])
  // 엔터티가 걸친 칸만 : 첫 박스(0~100) = (1,1) / 두 번째 박스(900~1000, 500~550) = (2,2)
  assert.deepEqual(g.tiles.map((t) => [t.c, t.r, t.no]), [[1, 1, 1], [2, 2, 2]])
  // 페이지 고정 : 좌상단 엔터티를 옮겨도 경계는 쪽 크기 배수 그대로(시작 칸만 바뀜)
  const moved = pageGrid([{ x: 40, y: 30, w: 100, h: 50 }, boxes[1]], 500, 300, 20)
  assert.deepEqual([moved.x0, moved.y0], [0, 0])
  assert.equal((moved.x0 - g.x0) % 500, 0)
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
