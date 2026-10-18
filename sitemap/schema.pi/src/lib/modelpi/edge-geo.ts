// ERD 관계선 기하(순수 함수, 화면 공용, 마스터 지시 2026-10-18 "관계선 위치를 조정") — 끝점 = 박스 변(T·R·B·L) + 변 위 위치비율(0~1), 꺾임점 = 좌표
//  자동 : 가까운 변 + 같은 박스·같은 변에 모인 선을 고르게 나눔(상대 박스 위치 순 — 선 교차 줄임). 사용자가 옮긴 선은 저장값(sql/034 mdl_dgm_rel) 그대로
export type Side = 'T' | 'R' | 'B' | 'L'
export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}
export interface Anchors {
  ps: Side // 부모 변
  pr: number // 부모 위치비율
  cs: Side // 자식 변
  cr: number // 자식 위치비율
}
export interface RelLyt extends Anchors {
  mx: number | null // 꺾임점(null = 가운데 자동)
  my: number | null
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

// 변 위 점 — 위·아래 변은 왼쪽부터, 좌우 변은 위부터 비율
export function sidePoint(b: Box, s: Side, r: number): Pt {
  if (s === 'T') return { x: b.x + b.w * r, y: b.y }
  if (s === 'B') return { x: b.x + b.w * r, y: b.y + b.h }
  if (s === 'L') return { x: b.x, y: b.y + b.h * r }
  return { x: b.x + b.w, y: b.y + b.h * r }
}

// 가까운 변 — 두 박스 중심의 상대 위치(가로 차가 크면 좌우, 아니면 위아래)
export function nearSides(a: Box, b: Box): [Side, Side] {
  const ca = center(a), cb = center(b)
  const dx = cb.x - ca.x, dy = cb.y - ca.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['R', 'L'] : ['L', 'R']
  return dy > 0 ? ['B', 'T'] : ['T', 'B']
}

// 끌어 놓은 점 → 가장 가까운 변과 그 위 비율(끝점 이동)
export function project(b: Box, p: Pt): { side: Side; r: number } {
  const d: [Side, number][] = [
    ['T', Math.abs(p.y - b.y)],
    ['B', Math.abs(p.y - (b.y + b.h))],
    ['L', Math.abs(p.x - b.x)],
    ['R', Math.abs(p.x - (b.x + b.w))],
  ]
  const side = d.sort((a, c) => a[1] - c[1])[0][0]
  const r = side === 'T' || side === 'B' ? (p.x - b.x) / (b.w || 1) : (p.y - b.y) / (b.h || 1)
  return { side, r: Math.round(clamp(r) * 1000) / 1000 }
}

// 자동 끝점 — 관계마다 가까운 변, 같은 (박스, 변)의 끝점들은 상대 박스 중심 순으로 1/(n+1) 간격. 자기 관계는 오른쪽 → 위
export function autoAnchors(rels: { id: string; from: string; to: string }[], boxes: Map<string, Box>): Map<string, Anchors> {
  const out = new Map<string, Anchors>()
  const ends = new Map<string, { id: string; end: 'p' | 'c'; key: number }[]>()
  for (const r of rels) {
    const a = boxes.get(r.from), b = boxes.get(r.to)
    if (!a || !b) continue
    const [ps, cs] = r.from === r.to ? (['R', 'T'] as [Side, Side]) : nearSides(a, b)
    out.set(r.id, { ps, pr: 0.5, cs, cr: 0.5 })
    // 정렬 키 = 상대 박스 중심의 변 방향 좌표(위·아래 변은 x, 좌우 변은 y)
    const add = (node: string, s: Side, other: Box, end: 'p' | 'c') => {
      const k = `${node}|${s}`
      const c = center(other)
      ends.set(k, [...(ends.get(k) ?? []), { id: r.id, end, key: s === 'T' || s === 'B' ? c.x : c.y }])
    }
    add(r.from, ps, b, 'p')
    add(r.to, cs, a, 'c')
  }
  for (const list of ends.values()) {
    list.sort((x, y) => x.key - y.key)
    list.forEach((e, i) => {
      const r = Math.round(((i + 1) / (list.length + 1)) * 1000) / 1000
      const a = out.get(e.id)!
      if (e.end === 'p') a.pr = r
      else a.cr = r
    })
  }
  return out
}

// 바커 표기 반쪽 선(2026-10-18) — 같은 경로를 두 번 그려 앞(부모 쪽)·뒤(자식 쪽) 절반만 보이게 하는 stroke-dasharray
//  dashed = 점선(dash 6 · gap 4, 선택 참여) / 실선(필수 참여). 배열 합이 전체 길이를 넘게 끝내 무늬가 되풀이되지 않게 함
export function halfDash(len: number, half: 'first' | 'second', dashed: boolean, dash = 6, gap = 4): string {
  const h = len / 2
  const seg: number[] = half === 'second' ? [0, h] : []
  if (!dashed) seg.push(h, len)
  else {
    for (let s = 0; s < h; s += dash + gap) seg.push(Math.min(dash, h - s), gap)
    seg.push(0, len)
  }
  return seg.map((v) => Math.round(v * 10) / 10).join(' ')
}
