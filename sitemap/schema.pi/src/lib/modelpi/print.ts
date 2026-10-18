// ERD 인쇄 기하(순수 함수, 마스터 지시 2026-10-18 "인쇄페이지를 설정하고 인쇄", "A3·A4 등을 설정하면 점선 가이드") — 용지 인쇄 영역 px, 페이지 나눔, 한 장 맞춤
//  px = mm × 96 / 25.4(CSS 기준). 페이지 나눔 = 100% 크기 바둑판을 캔버스 원점(0,0)에 고정(쪽 크기의 배수 — 엔터티를 옮겨도 쪽 경계는 그대로), 엔터티가 없는 칸은 인쇄하지 않음
import type { Box } from './edge-geo'

export const PAPER: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420], Letter: [279.4, 215.9] } // 가로 기준 mm
export type Orient = 'landscape' | 'portrait'
export const mmPx = (mm: number) => (mm * 96) / 25.4

// 여백을 뺀 인쇄 영역(px)
export function printArea(paper: string, orient: Orient, margin: number): { w: number; h: number } {
  const [a, b] = PAPER[paper] ?? PAPER.A3
  const [w, h] = orient === 'landscape' ? [a, b] : [b, a]
  return { w: mmPx(w - margin * 2), h: mmPx(h - margin * 2) }
}

export function bounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}

// 페이지 나눔 — 칸 크기 cw×ch(100%), 칸 경계 = 원점 기준 cw·ch 배수(마스터 지시 2026-10-18 : 좌상단 엔터티가 움직여도 페이지 고정)
//  범위 = 엔터티 묶음(± pad)이 걸친 칸들. tiles = 엔터티가 걸친 칸만(행 우선 순서, 번호는 1부터)
export function pageGrid(boxes: Box[], cw: number, ch: number, pad = 20) {
  const b = bounds(boxes)
  if (!b || cw <= 0 || ch <= 0) return { x0: 0, y0: 0, cols: 0, rows: 0, tiles: [] as { c: number; r: number; no: number }[] }
  const x0 = Math.floor((b.x - pad) / cw) * cw, y0 = Math.floor((b.y - pad) / ch) * ch
  const cols = Math.max(1, Math.ceil((b.x + b.w + pad - x0) / cw)), rows = Math.max(1, Math.ceil((b.y + b.h + pad - y0) / ch))
  const tiles: { c: number; r: number; no: number }[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const tx = x0 + c * cw, ty = y0 + r * ch
      if (boxes.some((k) => k.x < tx + cw && k.x + k.w > tx && k.y < ty + ch && k.y + k.h > ty)) tiles.push({ c, r, no: tiles.length + 1 })
    }
  return { x0, y0, cols, rows, tiles }
}

// 한 장 맞춤 — 묶음을 cw×ch 안 가운데에(최대 100%)
export function fitView(boxes: Box[], cw: number, ch: number, pad = 16): { x: number; y: number; zoom: number } {
  const b = bounds(boxes)
  if (!b) return { x: 0, y: 0, zoom: 1 }
  const zoom = Math.min(1, (cw - pad * 2) / b.w, (ch - pad * 2) / b.h)
  return { x: (cw - b.w * zoom) / 2 - b.x * zoom, y: (ch - b.h * zoom) / 2 - b.y * zoom, zoom }
}

// 용지 바꿈 맞춤(마스터 지시 2026-10-18 "A3 ↔ A4 변환 시 최고 좌상단 엔터티 기준으로 모두 같은 포지션으로") — 옮길 거리
//  좌상단(묶음 왼쪽 위)을 첫 쪽(원점) 모서리에서 at(기본 40px) 떨어진 같은 자리로, 나머지는 같은 거리만큼 — 어떤 용지든 좌상단 위치가 같음
export function realign(boxes: Box[], at = 40): { dx: number; dy: number } {
  const b = bounds(boxes)
  return b ? { dx: at - b.x, dy: at - b.y } : { dx: 0, dy: 0 }
}
