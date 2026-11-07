// ERD 관계선 직교 경로(순수 함수, 마스터 지시 2026-11-07 "관계선이 절대로 겹치면 안 됨") — 화면·인쇄·PNG·SVG 공용(화면 그림을 복사하므로 같은 경로)
//  격자(12px) A* 로 박스를 피해 꺾은선 경로를 찾는다. 격자 선분 하나는 한 선만 쓴다(같은 선분 공유 0), 남의 선과는 직각으로 곧게 지날 때만 교차(벌점) → 교차점은 건너뛰기(hop) 반원
//  끝점 = 박스 변 위 격자선(같은 변 끝점 간격 24px 이상, 까마귀발 겹침 방지), 짧은 관계부터 놓고 한 번 더 다시 놓아(rip-up) 교차를 줄임. 막히면 벌점 완화 경로(ok=false)
//  사용자가 옮긴 선(sql/034 mdl_dgm_rel)은 그 변·비율에 가장 가까운 끝점 + 꺾임점(mx·my) 경유. 관계명 라벨 = 다른 선·박스·라벨과 가장 덜 겹치는 자리
//  실행 : routeAll(박스, 관계) = routeEdges → crossPoints·hopPath(SVG path) → placeLabels(라벨 중심). 검사 함수 countOverlaps·countCrossings·countNodeHits·countLabelHits
//  배치(layout.ts)는 dagre 그대로 — 넓은 계층 접기(줄 바꿈)를 시험했으나 실데이터 교차가 오히려 늘어(상품 24 → 47) 채택 안 함(scripts/erd-route-bench.ts)
import type { Box, Pt, Side } from './edge-geo'

// step 격자 간격 · clear 박스와 선 최소 거리(끝점 짧은 줄기 길이, 16 → 10 : 좁은 통로 선 자리 확보 — 격자 배치 교차·우회 감소) · stub 끝점에서 바로 꺾으면 벌점(끝 표식이 꺾임에 걸리지 않게 한 칸 더 곧게) · corner 변 모서리 제외 · portEvery 끝점 격자 간격(칸) · bend 꺾임 벌점 · cross 교차 벌점 · port 남의 끝점 자리 지남 벌점 · relax 완화 경로 위반 벌점 · pad 바깥 여유(칸) · hop 건너뛰기 반지름
export const RT = { step: 12, clear: 10, corner: 14, portEvery: 2, bend: 24, cross: 160, port: 10, relax: 5000, pad: 8, hop: 5, stub: 60, passes: 1, hw: 1.02, win: 10 }

export interface RouteReq {
  id: string
  from: string // 부모
  to: string // 자식
  ps?: Side // 사용자가 옮긴 끝점(없으면 자동)
  pr?: number
  cs?: Side
  cr?: number
  mx?: number | null // 꺾임점(경유)
  my?: number | null
}
export interface Route {
  pts: Pt[] // 부모 변 → 자식 변 꺾은선(직교)
  ps: Side
  cs: Side
  ok: boolean // false = 막혀서 벌점 완화(겹침 가능) 또는 단순 경로
}

const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1] // 방향 0 오른쪽 · 1 아래 · 2 왼쪽 · 3 위
const OUT: Record<Side, number> = { R: 0, B: 1, L: 2, T: 3 } // 변에서 밖으로
const SIDES: Side[] = ['T', 'R', 'B', 'L']
const sidePt = (b: Box, s: Side, r: number): Pt => (s === 'T' ? { x: b.x + b.w * r, y: b.y } : s === 'B' ? { x: b.x + b.w * r, y: b.y + b.h } : s === 'L' ? { x: b.x, y: b.y + b.h * r } : { x: b.x + b.w, y: b.y + b.h * r })

// 우선순위 큐(최소 힙, 형식 배열 — 꺼낼 때 배열 생성 없음, top = 마지막으로 꺼낸 우선순위)
class Heap {
  f = new Float64Array(1024)
  s = new Int32Array(1024)
  size = 0
  top = 0
  push(f: number, s: number) {
    if (this.size === this.f.length) {
      const nf = new Float64Array(this.size * 2), ns = new Int32Array(this.size * 2)
      nf.set(this.f), ns.set(this.s), (this.f = nf), (this.s = ns)
    }
    const F = this.f, S = this.s
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (F[p] <= f) break
      ;(F[i] = F[p]), (S[i] = S[p]), (i = p)
    }
    ;(F[i] = f), (S[i] = s)
  }
  pop(): number {
    const F = this.f, S = this.s
    const s0 = S[0]
    this.top = F[0]
    const n = --this.size
    if (n) {
      const lf = F[n], ls = S[n]
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && F[c + 1] < F[c]) c++
        if (F[c] >= lf) break
        ;(F[i] = F[c]), (S[i] = S[c]), (i = c)
      }
      ;(F[i] = lf), (S[i] = ls)
    }
    return s0
  }
}

type Port = { n: number; side: Side; p: Pt; off: number } // off = 변 가운데에서 떨어진 거리
type Done = { nodes: number[]; a: Port; b: Port; relax: boolean }

export function routeEdges(boxes: Map<string, Box>, reqs: RouteReq[]): Map<string, Route> {
  const out = new Map<string, Route>()
  const bs = [...boxes.values()]
  const live = reqs.filter((r) => boxes.has(r.from) && boxes.has(r.to))
  if (!bs.length || !live.length) return out
  const S = RT.step, C = RT.clear
  const x0 = Math.floor((Math.min(...bs.map((b) => b.x)) - C) / S) * S - RT.pad * S
  const y0 = Math.floor((Math.min(...bs.map((b) => b.y)) - C) / S) * S - RT.pad * S
  const cols = Math.ceil((Math.max(...bs.map((b) => b.x + b.w)) + C - x0) / S) + RT.pad + 1
  const rows = Math.ceil((Math.max(...bs.map((b) => b.y + b.h)) + C - y0) / S) + RT.pad + 1
  const N = cols * rows
  const X = (n: number) => x0 + (n % cols) * S
  const Y = (n: number) => y0 + ((n / cols) | 0) * S
  // 박스(여유 clear 포함) 안쪽 격자점 = 막힘(경계 위는 통과 가능)
  const blocked = new Uint8Array(N)
  for (const b of bs) {
    const i0 = Math.max(0, Math.floor((b.x - C - x0) / S) + 1), i1 = Math.min(cols - 1, Math.ceil((b.x + b.w + C - x0) / S) - 1)
    const j0 = Math.max(0, Math.floor((b.y - C - y0) / S) + 1), j1 = Math.min(rows - 1, Math.ceil((b.y + b.h + C - y0) / S) - 1)
    for (let j = j0; j <= j1; j++) blocked.fill(1, j * cols + i0, j * cols + i1 + 1)
  }
  // 변별 끝점 후보 — 변과 수직인 격자선, 바깥 첫 격자점(막히면 제외), 같은 변 후보는 portEvery 칸 간격(작은 변은 모두)
  const portCache = new Map<string, Port[]>()
  const portsOf = (id: string, s: Side): Port[] => {
    const k = `${id}|${s}`
    const hit = portCache.get(k)
    if (hit) return hit
    const b = boxes.get(id)!
    const all: Port[] = []
    if (s === 'T' || s === 'B') {
      const j = s === 'T' ? Math.floor((b.y - C - y0) / S) : Math.ceil((b.y + b.h + C - y0) / S)
      for (let i = Math.ceil((b.x + RT.corner - x0) / S); x0 + i * S <= b.x + b.w - RT.corner; i++) if (j >= 0 && j < rows) all.push({ n: j * cols + i, side: s, p: { x: x0 + i * S, y: s === 'T' ? b.y : b.y + b.h }, off: Math.abs(x0 + i * S - (b.x + b.w / 2)) })
    } else {
      const i = s === 'L' ? Math.floor((b.x - C - x0) / S) : Math.ceil((b.x + b.w + C - x0) / S)
      for (let j = Math.ceil((b.y + RT.corner - y0) / S); y0 + j * S <= b.y + b.h - RT.corner; j++) if (i >= 0 && i < cols) all.push({ n: j * cols + i, side: s, p: { x: s === 'L' ? b.x : b.x + b.w, y: y0 + j * S }, off: Math.abs(y0 + j * S - (b.y + b.h / 2)) })
    }
    const even = all.filter((p) => ((s === 'T' || s === 'B' ? p.n % cols : Math.floor(p.n / cols)) % RT.portEvery) === 0)
    const ps = (even.length ? even : all).filter((p) => !blocked[p.n])
    portCache.set(k, ps)
    return ps
  }
  const isPort = new Uint8Array(N)
  for (const id of boxes.keys()) for (const s of SIDES) for (const p of portsOf(id, s)) isPort[p.n] = 1
  // 사용 기록 — 선분(가로 hE[n] = n→n+1, 세로 vE[n] = n→n+cols), 점(곧게 가로 지남 nH · 세로 nV · 꺾임·끝 nX)
  const hE = new Uint16Array(N), vE = new Uint16Array(N), nH = new Uint16Array(N), nV = new Uint16Array(N), nX = new Uint16Array(N)
  const win = [0, 0, cols - 1, rows - 1] // 탐색 창(격자 칸 범위) — 관계 두 박스 둘레 RT.win 칸, 못 찾으면 전체
  const CI = new Int32Array(N), RI = new Int32Array(N)
  for (let n = 0; n < N; n++) (CI[n] = n % cols), (RI[n] = (n / cols) | 0)
  const step = (n: number, d: number) => {
    const i = CI[n] + DX[d], j = RI[n] + DY[d]
    return i < win[0] || j < win[1] || i > win[2] || j > win[3] ? -1 : j * cols + i
  }
  const edgeUse = (a: number, d: number) => (d === 0 ? hE[a] : d === 2 ? hE[a - 1] : d === 1 ? vE[a] : vE[a - cols])
  const commit = (nodes: number[], v: 1 | -1) => {
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k]
      if (k + 1 < nodes.length) {
        const m = nodes[k + 1]
        if (m === n + 1) hE[n] += v
        else if (m === n - 1) hE[m] += v
        else if (m === n + cols) vE[n] += v
        else vE[m] += v
      }
      if (k === 0 || k === nodes.length - 1) nX[n] += v
      else {
        const a = nodes[k - 1], c = nodes[k + 1]
        const hin = Math.abs(n - a) === 1, hout = Math.abs(c - n) === 1
        if (hin !== hout) nX[n] += v
        else if (hin) nH[n] += v
        else nV[n] += v
      }
    }
  }
  const free = (n: number) => !blocked[n] && !nH[n] && !nV[n] && !nX[n]
  // A* (상태 = 격자점 × 들어온 방향) — 시작 여러 개, 목표 = 격자점별 추가 비용(GC)·들어갈 방향(GD, -1 = 아무 방향, 다르면 꺾임 벌점)
  const M = N * 4, GOAL = M
  const G = new Float64Array(M + 1), HV = new Float64Array(M + 1), PV = new Int32Array(M + 1), ST = new Uint32Array(M + 1)
  const GC = new Float64Array(N), GD = new Int8Array(N), GS = new Uint32Array(N)
  const q = new Heap()
  let stamp = 0
  const search = (starts: [number, number, number][], goals: [number, number, number][], h: (n: number, d: number) => number, relax: boolean): number[] | null => {
    const hw = RT.hw
    stamp++
    q.size = 0
    for (const [n, d, c] of goals) (GC[n] = c), (GD[n] = d), (GS[n] = stamp)
    const relaxTo = (s: number, c: number, from: number, hv: number) => {
      if (ST[s] !== stamp || c < G[s]) (G[s] = c), (HV[s] = hv), (ST[s] = stamp), (PV[s] = from), q.push(c + hw * hv, s)
    }
    for (const [n, d, c] of starts) relaxTo(n * 4 + d, c, -1, h(n, d))
    while (q.size) {
      const s = q.pop()
      if (s === GOAL) {
        const nodes: number[] = []
        for (let t = PV[GOAL]; t !== -1; t = PV[t]) nodes.push(t >> 2)
        return nodes.reverse()
      }
      const g = G[s]
      if (q.top > g + hw * HV[s] + 1e-6) continue // 낡은 항목
      const n = s >> 2, d = s & 3
      if (GS[n] === stamp) relaxTo(GOAL, g + GC[n] + (GD[n] < 0 || GD[n] === d ? 0 : RT.bend + RT.stub), s, 0)
      const occ = nH[n] > 0 || nV[n] > 0 // 남의 선이 곧게 지나는 점 = 곧게만 통과(교차), 꺾으면 맞닿아 보임
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue
        let c = g + S + (nd !== d ? RT.bend + (PV[s] === -1 ? RT.stub : 0) : 0)
        if (occ && nd !== d) {
          if (!relax) continue
          c += RT.relax
        }
        const m = step(n, nd)
        if (m < 0 || blocked[m]) continue
        if (edgeUse(n, nd)) {
          if (!relax) continue
          c += RT.relax
        }
        const hz = (nd & 1) === 0
        if (nX[m] || (hz ? nH[m] : nV[m])) {
          if (!relax) continue
          c += RT.relax
        }
        if (hz ? nV[m] : nH[m]) c += RT.cross
        if (isPort[m]) c += RT.port
        relaxTo(m * 4 + nd, c, s, h(m, nd))
      }
    }
    return null
  }
  const near = (p: Pt) => Math.max(0, Math.min(cols - 1, Math.round((p.x - x0) / S))) + Math.max(0, Math.min(rows - 1, Math.round((p.y - y0) / S))) * cols
  // 휴리스틱 = 목표 박스(여유 포함)까지 맨해튼 거리 + 지금 방향으로 곧게 가서 닿지 않으면 꺾임 1번(과소 추정 유지)
  const hRect = (b: Box) => {
    const l = b.x - C, r = b.x + b.w + C, t = b.y - C, btm = b.y + b.h + C
    return (n: number, d: number) => {
      const x = X(n), y = Y(n)
      const ahead = d === 0 ? x <= l && y >= t && y <= btm : d === 2 ? x >= r && y >= t && y <= btm : d === 1 ? y <= t && x >= l && x <= r : y >= btm && x >= l && x <= r
      return Math.max(l - x, 0, x - r) + Math.max(t - y, 0, y - btm) + (ahead ? 0 : RT.bend)
    }
  }
  const routeOne = (r: RouteReq, relax: boolean, wide: boolean): Done | null => {
    const a = boxes.get(r.from)!, b = boxes.get(r.to)!
    const ex = [Math.min(a.x, b.x, r.mx ?? Infinity), Math.min(a.y, b.y, r.my ?? Infinity), Math.max(a.x + a.w, b.x + b.w, r.mx ?? -Infinity), Math.max(a.y + a.h, b.y + b.h, r.my ?? -Infinity)]
    win[0] = wide ? 0 : Math.max(0, Math.floor((ex[0] - x0) / S) - RT.win)
    win[1] = wide ? 0 : Math.max(0, Math.floor((ex[1] - y0) / S) - RT.win)
    win[2] = wide ? cols - 1 : Math.min(cols - 1, Math.ceil((ex[2] - x0) / S) + RT.win)
    win[3] = wide ? rows - 1 : Math.min(rows - 1, Math.ceil((ex[3] - y0) / S) + RT.win)
    const self = r.from === r.to
    const pick = (id: string, bx: Box, s0: Side | undefined, rat: number | undefined, dflt: Side) => {
      const sides = s0 ? [s0] : self ? [dflt] : SIDES // 옮긴 끝점 = 그 변만, 원하는 자리에서 멀수록 큰 비용(사용자 뜻 우선)
      const want = s0 ? sidePt(bx, s0, rat ?? 0.5) : null
      const m = new Map<number, [Port, number]>()
      for (const s of sides) for (const p of portsOf(id, s)) if (relax || free(p.n)) m.set(p.n, [p, (want ? (Math.abs(p.p.x - want.x) + Math.abs(p.p.y - want.y)) * 4 : p.off * 0.5) + (free(p.n) ? 0 : RT.relax)])
      return m
    }
    const st = pick(r.from, a, r.ps, r.pr, 'R'), gl = pick(r.to, b, r.cs, r.cr, 'T')
    if (!st.size || !gl.size) return null
    const starts = [...st.values()].map(([p, c]) => [p.n, OUT[p.side], c] as [number, number, number])
    const goals = [...gl.values()].map(([p, c]) => [p.n, (OUT[p.side] + 2) & 3, c] as [number, number, number])
    let nodes: number[]
    if (r.mx != null && r.my != null) {
      // 꺾임점 경유 : 시작 → 경유점(막히지 않은 가까운 격자점), 첫 구간을 잠시 기록해 두 번째 구간이 겹치지 않게
      let w = near({ x: r.mx, y: r.my })
      for (let k = 1; blocked[w] && k < 40; k++) w = near({ x: r.mx + ((k % 4) - 1.5) * S * k, y: r.my + (((k >> 1) % 2) - 0.5) * S * k })
      const l1 = search(starts, [[w, -1, 0]], (n) => Math.abs(X(n) - X(w)) + Math.abs(Y(n) - Y(w)), relax)
      if (!l1) return null
      const dl = l1.length > 1 ? [1, cols, -1, -cols].indexOf(w - l1[l1.length - 2]) : OUT[st.get(l1[0])![0].side]
      commit(l1, 1)
      nX[w]-- // 경유점은 끝이 아님(두 번째 구간 시작)
      const l2 = search([[w, dl, 0]], goals, hRect(b), relax)
      nX[w]++
      commit(l1, -1)
      if (!l2) return null
      nodes = [...l1, ...l2.slice(1)]
    } else {
      const res = search(starts, goals, hRect(b), relax)
      if (!res) return null
      nodes = res
    }
    return { nodes, a: st.get(nodes[0])![0], b: gl.get(nodes[nodes.length - 1])![0], relax }
  }
  // 순서 = 사용자가 옮긴 선 먼저, 그다음 가까운 관계부터(짧은 선이 곧은 자리를 차지)
  const cen = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
  const len = (r: RouteReq) => {
    const p = cen(boxes.get(r.from)!), q = cen(boxes.get(r.to)!)
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
  }
  const order = [...live].sort((p, q) => Number(!!q.ps || q.mx != null) - Number(!!p.ps || p.mx != null) || len(p) - len(q) || (p.id < q.id ? -1 : 1))
  const done = new Map<string, Done>()
  // 교차 있는 경로 = 안쪽 점 중 다른 선이 직각으로 지나는 점이 있음(자기 선은 같은 축만 기록)
  const crosses = (ns: number[]) => ns.some((n, k) => k > 0 && k < ns.length - 1 && (Math.abs(ns[k + 1] - n) === 1 ? nV[n] : nH[n]) > 0)
  for (let pass = 0; pass < RT.passes; pass++)
    for (const r of order) {
      const old = done.get(r.id)
      if (old && !crosses(old.nodes)) continue // 다시 놓기(rip-up)는 교차가 남은 선만
      if (old) commit(old.nodes, -1)
      const res = routeOne(r, false, false) ?? routeOne(r, false, true) ?? routeOne(r, true, true) ?? old
      if (res) (commit(res.nodes, 1), done.set(r.id, res))
    }
  for (const r of live) {
    const d = done.get(r.id)
    const a = boxes.get(r.from)!, b = boxes.get(r.to)!
    if (!d) {
      // 끝점 자리조차 없음(박스가 겹쳐 놓임) — 가운데 잇는 단순 꺾은선
      const [ps, cs]: [Side, Side] = Math.abs(cen(b).x - cen(a).x) > Math.abs(cen(b).y - cen(a).y) ? (cen(b).x > cen(a).x ? ['R', 'L'] : ['L', 'R']) : cen(b).y > cen(a).y ? ['B', 'T'] : ['T', 'B']
      const p = sidePt(a, ps, 0.5), q = sidePt(b, cs, 0.5)
      out.set(r.id, { pts: simplify(ps === 'R' || ps === 'L' ? [p, { x: (p.x + q.x) / 2, y: p.y }, { x: (p.x + q.x) / 2, y: q.y }, q] : [p, { x: p.x, y: (p.y + q.y) / 2 }, { x: q.x, y: (p.y + q.y) / 2 }, q]), ps, cs, ok: false })
      continue
    }
    out.set(r.id, { pts: simplify([d.a.p, ...d.nodes.map((n) => ({ x: X(n), y: Y(n) })), d.b.p]), ps: d.a.side, cs: d.b.side, ok: !d.relax })
  }
  return out
}

// 같은 직선 위 중간점·중복점 제거
export function simplify(pts: Pt[]): Pt[] {
  const o: Pt[] = []
  for (const p of pts) {
    if (o.length && o[o.length - 1].x === p.x && o[o.length - 1].y === p.y) continue
    if (o.length >= 2) {
      const a = o[o.length - 2], b = o[o.length - 1]
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) o.pop()
    }
    o.push(p)
  }
  return o
}

type Seg = { a: Pt; b: Pt; k: number } // k = 경로 번호
const segsOf = (paths: Pt[][]): Seg[] => paths.flatMap((ps, k) => ps.slice(1).map((b, i) => ({ a: ps[i], b, k })))
const EPS = 0.5

// 가로 선분 위 교차점(세로 선분이 선분 안쪽에서 직각으로 지나는 점) — 건너뛰기는 가로 선이 맡음
export function crossPoints(paths: Pt[][]): Pt[][] {
  const ss = segsOf(paths)
  const vs = ss.filter((s) => Math.abs(s.a.x - s.b.x) < EPS && Math.abs(s.a.y - s.b.y) >= EPS)
  const out: Pt[][] = paths.map(() => [])
  for (const h of ss) {
    if (Math.abs(h.a.y - h.b.y) >= EPS || Math.abs(h.a.x - h.b.x) < EPS) continue
    const [x1, x2] = [Math.min(h.a.x, h.b.x), Math.max(h.a.x, h.b.x)]
    for (const v of vs) {
      if (v.k === h.k) continue
      const [y1, y2] = [Math.min(v.a.y, v.b.y), Math.max(v.a.y, v.b.y)]
      if (v.a.x > x1 + EPS && v.a.x < x2 - EPS && h.a.y > y1 + EPS && h.a.y < y2 - EPS) out[h.k].push({ x: v.a.x, y: h.a.y })
    }
  }
  return out
}

// SVG 경로 — 가로 선분의 교차점은 위로 볼록한 반원(건너뛰기)
export function hopPath(pts: Pt[], hops: Pt[] = [], r = RT.hop): string {
  if (!pts.length) return ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (a.y === b.y && hops.length) {
      const sg = Math.sign(b.x - a.x)
      const xs = hops.filter((p) => p.y === a.y && (p.x - a.x) * sg > r + 1 && (b.x - p.x) * sg > r + 1).map((p) => p.x).sort((p, q) => (p - q) * sg)
      let last = a.x - sg * 1e9
      for (const x of xs) {
        if ((x - last) * sg < 2 * r) continue // 붙은 교차는 하나로
        d += `L${x - sg * r},${a.y}A${r},${r} 0 0 ${sg > 0 ? 1 : 0} ${x + sg * r},${a.y}`
        last = x
      }
    }
    d += `L${b.x},${b.y}`
  }
  return d
}

// 경로 중간 손잡이·기본 라벨 자리 = 가장 긴 안쪽 선분의 가운데
export function midOf(pts: Pt[]): Pt {
  let best = { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0 }, bl = -1
  const inner = pts.length > 3 ? [1, pts.length - 2] : [0, pts.length - 1]
  for (let i = inner[0]; i < inner[1]; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    if (l > bl) (bl = l), (best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  }
  return best
}

const segHitsBox = (s: { a: Pt; b: Pt }, b: Box, shrink = 1) => {
  const x1 = Math.min(s.a.x, s.b.x), x2 = Math.max(s.a.x, s.b.x), y1 = Math.min(s.a.y, s.b.y), y2 = Math.max(s.a.y, s.b.y)
  return x2 > b.x + shrink && x1 < b.x + b.w - shrink && y2 > b.y + shrink && y1 < b.y + b.h - shrink
}
const boxHit = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h

// 관계명 라벨 자리(2026-11-07 화면 검토 2차) — 선 위가 아니라 선분 옆 빈 곳 : 가로 선분은 위·아래, 세로 선분은 좌·우로 LABEL_GAP 떨어뜨린 후보(선분마다 최대 15곳)
//  박스(실측 + LABEL_BOX 여유)와 겹치는 후보는 쓰지 않음(하드 제약 — 엣지 층이 박스 아래라 가려짐). 나머지는 모든 선분(자기 선 포함 10)·먼저 놓인 라벨(10)·끝 표식 30px 안(5) 벌점이 가장 작은 곳
//  전체 글자로 자리가 없으면 70·50·35% 로 줄여 '…'(전체는 화면 툴팁), 그래도 없으면 숨김(text '') — 겹침 판정은 흰 바탕 여백(LABEL_HALO) 포함
export const LABEL_GAP = 4
export const LABEL_HALO = 2
export const LABEL_BOX = 4
export interface Lab {
  x: number // 중심
  y: number
  w: number
  h: number
  text: string // 보이는 글자(줄임 '…' 또는 숨김 '')
}
const grow = (r: Box, g: number): Box => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g })
const cut = (t: string, f: number) => {
  const cs = [...t]
  return f >= 1 ? t : `${cs.slice(0, Math.max(4, Math.floor(cs.length * f))).join('')}…`
}
export function placeLabels(paths: Pt[][], boxes: Box[], labels: (string | null | undefined)[]): (Lab | null)[] {
  const ss = segsOf(paths)
  const put: Box[] = []
  const nb = boxes.map((b) => grow(b, LABEL_BOX))
  return paths.map((ps, k) => {
    const t0 = labels[k]
    if (!t0 || ps.length < 2) return null
    const p0 = ps[0], p1 = ps[ps.length - 1]
    for (const f of [1, 0.7, 0.5, 0.35]) {
      const text = cut(t0, f)
      const sz = labelSize(text)
      let best: Pt | null = null, bs = Infinity
      for (let i = 0; i + 1 < ps.length; i++) {
        const a = ps[i], b = ps[i + 1], l = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
        if (l < 1) continue
        const hz = a.y === b.y
        const n = Math.min(15, Math.max(1, Math.floor(l / 24)))
        for (let q = 0; q < n; q++) {
          const t = (q + 0.5) / n
          for (const sd of [-1, 1]) {
            const c = hz ? { x: a.x + (b.x - a.x) * t, y: a.y + sd * (sz.h / 2 + LABEL_GAP) } : { x: a.x + sd * (sz.w / 2 + LABEL_GAP), y: a.y + (b.y - a.y) * t }
            const r = grow({ x: c.x - sz.w / 2, y: c.y - sz.h / 2, w: sz.w, h: sz.h }, LABEL_HALO)
            if (nb.some((bx) => boxHit(r, bx))) continue
            let sc = Math.abs(t - 0.5) / 10 - l / 10000
            for (const s of ss) if (segHitsBox(s, r, 0)) sc += 10
            for (const o of put) if (boxHit(r, o)) sc += 10
            for (const e of [p0, p1]) if (boxHit(grow(r, 30), { x: e.x, y: e.y, w: 0.01, h: 0.01 })) sc += 5
            if (sc < bs) (bs = sc), (best = c)
          }
        }
      }
      if (best) {
        put.push(grow({ x: best.x - sz.w / 2, y: best.y - sz.h / 2, w: sz.w, h: sz.h }, LABEL_HALO))
        return { ...best, ...sz, text }
      }
    }
    return { ...midOf(ps), w: 0, h: 0, text: '' }
  })
}
// 라벨 크기 근사(10px 글꼴 : 한글 10px·영문 5.5px + 여백)
export const labelSize = (t: string) => ({ w: Math.round([...t].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 10 : 5.5), 0) + 8), h: 14 })

// 화면용 한 번에 — 경로 + 교차 건너뛰기 SVG path + 라벨 자리(edge-route.worker.ts 가 화면 밖 스레드에서 실행, 없으면 화면이 직접)
export interface RoutedEdge extends Route {
  d: string // SVG path(hop 포함)
  lp: Pt // 라벨 중심(라벨 없으면 경로 가운데)
  lt: string // 보이는 라벨 글자(줄임 '…'·숨김 '' 가능, 전체는 관계명)
}
export function routeAll(boxes: Map<string, Box>, reqs: (RouteReq & { label?: string | null })[]): Map<string, RoutedEdge> {
  const rt = routeEdges(boxes, reqs)
  const ids = reqs.filter((r) => rt.has(r.id))
  const paths = ids.map((r) => rt.get(r.id)!.pts)
  const hops = crossPoints(paths)
  const labs = placeLabels(paths, [...boxes.values()], ids.map((r) => r.label))
  return new Map(ids.map((r, k) => [r.id, { ...rt.get(r.id)!, d: hopPath(paths[k], hops[k]), lp: labs[k] ?? midOf(paths[k]), lt: labs[k]?.text ?? '' }]))
}

// ── 기하 검사(단위 시험·실데이터 측정용) ──
// 평행 겹침 : 다른 경로의 같은 방향 선분이 tol 미만 간격으로 1px 넘게 나란한 쌍 수
export function countOverlaps(paths: Pt[][], tol = 8): number {
  const ss = segsOf(paths).filter((s) => Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y) >= EPS)
  let n = 0
  for (let i = 0; i < ss.length; i++)
    for (let j = i + 1; j < ss.length; j++) {
      const p = ss[i], q = ss[j]
      if (p.k === q.k) continue
      const ph = Math.abs(p.a.y - p.b.y) < EPS, qh = Math.abs(q.a.y - q.b.y) < EPS
      const pv = Math.abs(p.a.x - p.b.x) < EPS, qv = Math.abs(q.a.x - q.b.x) < EPS
      if (ph && qh && Math.abs(p.a.y - q.a.y) < tol && Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x)) - Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x)) > 1) n++
      else if (pv && qv && Math.abs(p.a.x - q.a.x) < tol && Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y)) - Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y)) > 1) n++
    }
  return n
}
// 교차 : 다른 경로의 가로·세로 선분이 둘 다 안쪽에서 만나는 점 수
export const countCrossings = (paths: Pt[][]) => crossPoints(paths).reduce((n, l) => n + l.length, 0)
// 라벨-박스 겹침 : 라벨(여백 halo 포함)이 박스와 겹치는 수(엣지 층이 박스 아래라 = 가려짐)
export function countLabelBoxHits(labels: (Box | null)[], boxes: Box[], halo = LABEL_HALO): number {
  let n = 0
  for (const l of labels) if (l && l.w > 0) for (const b of boxes) if (boxHit(grow(l, halo), b)) n++
  return n
}
// 박스끼리 겹침 쌍 수(배치 검사)
export function countBoxOverlaps(boxes: Box[]): number {
  let n = 0
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxHit(boxes[i], boxes[j])) n++
  return n
}
// 경로 길이 합·최대 우회비(경로 길이 ÷ 두 끝점 맨해튼 거리, 끝점 거리 < 1칸은 제외 — 자기 관계는 부르는 쪽에서 뺌)
export const pathLen = (ps: Pt[]) => ps.slice(1).reduce((n, p, i) => n + Math.abs(p.x - ps[i].x) + Math.abs(p.y - ps[i].y), 0)
export function detourStats(paths: Pt[][]): { total: number; maxRatio: number } {
  let total = 0, maxRatio = 1
  for (const ps of paths) {
    const l = pathLen(ps)
    total += l
    const d = Math.abs(ps[0].x - ps[ps.length - 1].x) + Math.abs(ps[0].y - ps[ps.length - 1].y)
    if (d >= RT.step) maxRatio = Math.max(maxRatio, l / d)
  }
  return { total: Math.round(total), maxRatio: Math.round(maxRatio * 100) / 100 }
}
// 박스 관통 : 선분이 박스 안쪽(경계 1px 안)을 지나는 (선분, 박스) 수 — 끝점은 변 위라 제외됨
export function countNodeHits(paths: Pt[][], boxes: Box[]): number {
  let n = 0
  for (const s of segsOf(paths)) for (const b of boxes) if (segHitsBox(s, b)) n++
  return n
}
// 라벨 겹침 : 라벨(흰 바탕 여백 halo 포함)이 박스·선분(자기 선 포함)·다른 라벨과 겹치는 수
export function countLabelHits(labels: (Box | null)[], paths: Pt[][], boxes: Box[], halo = LABEL_HALO): number {
  const ss = segsOf(paths)
  let n = 0
  labels.forEach((l0, k) => {
    if (!l0 || l0.w <= 0) return
    const l = grow(l0, halo)
    for (const b of boxes) if (boxHit(l, b)) n++
    for (const s of ss) if (segHitsBox(s, l, 0)) n++
    for (let j = k + 1; j < labels.length; j++) if (labels[j] && boxHit(l, labels[j]!)) n++
  })
  return n
}
