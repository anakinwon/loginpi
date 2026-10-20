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
  if (opt.mode === 'new' && placed.length) return nearRelated(pos, placed, free, [...seen].map((k) => k.split('>') as [string, string]), gap)
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

// 증분 배치(마스터 지시 2026-10-20) — dagre 전체 좌표는 사용자가 옮긴 기존 좌표와 무관해 새 엔터티가 멀리 생기던 문제
//  이미 놓인 관계 상대 기준 : 자식이면 부모 바로 아래, 부모면 자식 바로 위(가운데 맞춤), 겹치면 같은 줄 가장 가까운 빈 자리
//  새 엔터티끼리 이어진 관계는 먼저 놓인 쪽을 기준으로 차례로, 관계 상대가 없으면 놓인 영역 오른쪽 위
function nearRelated(pos: Pos, placed: LNode[], free: LNode[], rels: [string, string][], gap: number): Pos {
  const at = new Map(placed.map((n) => [n.id, n]))
  // 겹치면 같은 줄에서 기준 자리와 가장 가까운 빈 x(좌우 번갈아 40px 단위) — 줄이 길게 막혀도 한쪽 끝까지 밀려나지 않게
  // ponytail: 후보 × 노드 O(k·n) 탐색 — 엔터티 수천 개면 줄 단위 구간 색인으로
  const clear = (n: LNode) => {
    const { x: x0, y } = pos[n.id]
    const free = (x: number) => ![...at.values()].some((m) => m.id !== n.id && hit({ x, y, w: n.w, h: n.h }, { ...pos[m.id], w: m.w, h: m.h }, gap / 2))
    for (let k = 0; k <= 2000; k++) {
      const x = x0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 40
      if (free(x)) {
        pos[n.id] = { x, y }
        break
      }
    }
    at.set(n.id, n)
  }
  let rest = free
  while (rest.length) {
    const left: LNode[] = []
    for (const n of rest) {
      const par = rels.find(([f, t]) => t === n.id && at.has(f))?.[0]
      const a = at.get(par ?? rels.find(([f, t]) => f === n.id && at.has(t))?.[1] ?? '')
      if (!a) {
        left.push(n)
        continue
      }
      pos[n.id] = { x: Math.round(pos[a.id].x + a.w / 2 - n.w / 2), y: par ? pos[a.id].y + a.h + gap * 1.5 : pos[a.id].y - n.h - gap * 1.5 }
      clear(n)
    }
    if (left.length === rest.length) {
      // 놓인 상대가 없는 묶음 — 첫 엔터티만 놓인 영역 오른쪽 위에 두고, 나머지는 다시 관계 기준으로
      const n = left.shift()!
      const ms = [...at.values()]
      pos[n.id] = { x: Math.max(...ms.map((m) => pos[m.id].x + m.w)) + gap, y: Math.min(...ms.map((m) => pos[m.id].y)) }
      clear(n)
    }
    rest = left
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
