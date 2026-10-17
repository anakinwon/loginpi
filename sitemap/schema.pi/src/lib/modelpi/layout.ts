// ERD 자동 배치(순수, PRD_PiErd S3 E3) — Layered(dagre, Brandes–Köpf 좌표), 주제영역 묶음(compound), 고정 엔터티 존중, 새 엔터티만 증분 배치
// dagre 는 고정 노드를 지원하지 않으므로 : 전체 배치 → 고정 노드를 원래 좌표로 되돌림 → 고정 노드와 겹친 자유 노드를 밀어냄(후처리)
// 증분 = 기존 좌표가 있는 노드를 모두 고정으로 보고 같은 절차 → 새 노드만 자리를 잡는다. 좌표는 노드 왼쪽 위 기준
import dagre from '@dagrejs/dagre'

export interface LNode {
  id: string
  w: number
  h: number
  group?: string | null // 주제영역(묶음)
  x?: number // 기존 좌표(있으면 증분 시 유지)
  y?: number
  fixed?: boolean
}
export interface LEdge {
  from: string // 부모
  to: string // 자식
}
export interface LOpt {
  mode?: 'all' | 'new' // all = 고정만 유지하고 전부 다시 배치, new = 좌표 있는 노드는 그대로·새 노드만
  dir?: 'TB' | 'LR'
  gap?: number // 노드 간격
}
export type Pos = Record<string, { x: number; y: number }>

const GAP = 60

// 박스 겹침(간격 포함)
const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, g: number) =>
  a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g

export function autoLayout(nodes: LNode[], edges: LEdge[], opt: LOpt = {}): Pos {
  // 주제영역 묶음(compound)은 규모가 크고 순환·그룹 간 관계가 많으면 dagre 가 교차점 예외를 던짐 → 묶음 없이 다시 배치
  try {
    return layoutOnce(nodes, edges, opt, true)
  } catch {
    return layoutOnce(nodes, edges, opt, false)
  }
}

function layoutOnce(nodes: LNode[], edges: LEdge[], opt: LOpt, grouped: boolean): Pos {
  const gap = opt.gap ?? GAP
  const keep = (n: LNode) => n.x !== undefined && n.y !== undefined && (n.fixed || opt.mode === 'new')
  const g = new dagre.graphlib.Graph({ compound: grouped })
  g.setGraph({ rankdir: opt.dir ?? 'TB', nodesep: gap, ranksep: gap * 1.5, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) g.setNode(n.id, { width: n.w, height: n.h })
  const groups = new Set(grouped ? nodes.map((n) => n.group).filter((v): v is string => !!v) : [])
  if (groups.size > 1) for (const gr of groups) g.setNode(`grp:${gr}`, {})
  if (groups.size > 1) for (const n of nodes) if (n.group) g.setParent(n.id, `grp:${n.group}`)
  // 같은 쌍의 평행 관계(FK 여러 개)는 1개로 — 평행 엣지 3개 이상이면 dagre 가 교차점 계산 예외를 던짐(배치에는 영향 없음)
  const seen = new Set<string>()
  for (const e of edges) {
    const k = `${e.from}>${e.to}`
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || seen.has(k)) continue
    seen.add(k)
    g.setEdge(e.from, e.to)
  }
  dagre.layout(g)
  const pos: Pos = {}
  for (const n of nodes) {
    const v = g.node(n.id) as { x: number; y: number }
    pos[n.id] = keep(n) ? { x: n.x!, y: n.y! } : { x: Math.round(v.x - n.w / 2), y: Math.round(v.y - n.h / 2) }
  }
  // 후처리 : 유지 노드(고정·증분 기존)와 겹친 자유 노드를 아래로 밀어냄 — 자유 노드끼리 새로 겹치면 같은 방식으로 반복(상한)
  // ponytail: O(n²) 겹침 검사·아래 방향 밀기 — 엔터티 수천 개·더 나은 빈자리 탐색이 필요하면 격자 색인으로
  const box = (n: LNode) => ({ ...pos[n.id], w: n.w, h: n.h })
  const placed = nodes.filter(keep)
  const free = nodes.filter((n) => !keep(n)).sort((a, b) => pos[a.id].y - pos[b.id].y || pos[a.id].x - pos[b.id].x)
  if (placed.length) {
    const done: LNode[] = [...placed]
    for (const n of free) {
      for (let k = 0; k < 500; k++) {
        const o = done.find((m) => hit(box(n), box(m), gap / 2))
        if (!o) break
        pos[n.id] = { x: pos[n.id].x, y: pos[o.id].y + o.h + gap }
      }
      done.push(n)
    }
  }
  return pos
}

// 엔터티 박스 크기 — 내용에 맞춤(제목 + 표시 행 수, 가장 긴 줄 폭). 글자 폭은 한글 2·영문 1 단위 근사
export const BOX = { charW: 7.2, rowH: 18, headH: 30, padW: 24, minW: 160, maxW: 420 }
export function boxSize(title: string, lines: string[]): { w: number; h: number } {
  const units = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
  const longest = Math.max(units(title), ...lines.map(units))
  return { w: Math.min(BOX.maxW, Math.max(BOX.minW, Math.round(longest * BOX.charW + BOX.padW))), h: BOX.headH + Math.max(1, lines.length) * BOX.rowH + 8 }
}
