// ERD 관계선 경로 실데이터 측정(2026-11-07) — Pi통신 과금 모델(sitemap/schema.pi/pitel/model/logical/<영역>.json) 7개 주제영역을 ERD 입력(박스 크기·관계)으로 바꿔
//  개선 전(기존 가까운 변 끝점 + React Flow smoothstep 경로·선 가운데 라벨) / 후(edge-route 격자 A* + hop + 선 옆 라벨)의 박스 겹침·평행 겹침·관통·교차·라벨 겹침·총 길이·최대 우회비·계산 ms 를 표로 출력
//  실행 : node scripts/erd-route-bench.ts [모델 폴더(기본 ../pitel/model/logical)]
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { autoLayout, boxSize } from '../src/lib/modelpi/layout.ts'
import { autoAnchors, sidePoint, type Box, type Pt } from '../src/lib/modelpi/edge-geo.ts'
import { countBoxOverlaps, countCrossings, countLabelBoxHits, countLabelHits, countNodeHits, countOverlaps, detourStats, labelSize, placeLabels, routeEdges } from '../src/lib/modelpi/edge-route.ts'

const DIR = process.argv[2] ?? join(import.meta.dirname, '../pitel/model/logical')
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
// 개선 전 경로 = 화면이 쓰던 @xyflow/system getSmoothStepPath(모서리 반경 0 → 꺾은점만)
const req = createRequire(join(realpathSync(join(import.meta.dirname, '../node_modules/@xyflow/react')), 'package.json'))
const sysMod = await import(pathToFileURL(req.resolve('@xyflow/system')).href)
const { getSmoothStepPath } = (sysMod.getSmoothStepPath ? sysMod : sysMod.default) as { getSmoothStepPath: (o: object) => [string, number, number] }
const POS = { T: 'top', R: 'right', B: 'bottom', L: 'left' } as const
const toPts = (d: string): Pt[] => {
  const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
  const o: Pt[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) if (!o.length || o[o.length - 1].x !== nums[i] || o[o.length - 1].y !== nums[i + 1]) o.push({ x: nums[i], y: nums[i + 1] })
  return o
}
type Ent = { entId: string; entNm: string; tblNm: string; attrs: { attrNm: string; phyNm: string; pk: boolean; nullYn: boolean }[]; rels?: { relNm: string; parent: string; child: string }[] }

const rows: string[] = []
for (const area of AREAS) {
  const j = JSON.parse(readFileSync(join(DIR, `${area}.json`), 'utf8')) as { entities: Ent[] }
  const byNm = new Map(j.entities.map((e) => [`${area}.${e.entNm}`, e.entId]))
  // 박스 크기 = 화면 논리(속성·키) 기본 보기 : 제목 '엔터티명 (테이블명)', 줄 = 기호·속성명·(컬럼명)
  const nodes = j.entities.map((e) => {
    const w = (t: string) => [...t].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
    const mx = (f: (a: Ent['attrs'][number]) => string) => e.attrs.reduce((m, a) => (w(f(a)) > w(m) ? f(a) : m), '')
    const comp = ['🔑', mx((a) => a.attrNm + (!a.nullYn && !a.pk ? ' *' : '')), mx((a) => `(${a.phyNm})`)].join('   ')
    return { id: e.entId, ...boxSize(`${e.entNm} (${e.tblNm})`, e.attrs.map(() => comp)) }
  })
  const rels = j.entities.flatMap((e) => (e.rels ?? []).filter((r) => byNm.has(r.parent) && byNm.has(r.child)).map((r, i) => ({ id: `${e.entId}-${i}`, from: byNm.get(r.parent)!, to: byNm.get(r.child)!, nm: r.relNm })))
  // 배치 2종 : dagre 자동 배치 / 격자(한 줄 6개, 가로 60·세로 90px — 사용자가 촘촘히 놓은 저장 좌표 모사, 화면 검토 캡처와 같은 모양)
  const grid: Record<string, { x: number; y: number }> = {}
  for (let i = 0, y = 0; i < nodes.length; i += 6) {
    const row = nodes.slice(i, i + 6)
    row.reduce((x, n) => ((grid[n.id] = { x, y }), x + n.w + 60), 0)
    y += Math.max(...row.map((n) => n.h)) + 90
  }
  for (const [lyNm, pos] of [['dagre', autoLayout(nodes, rels.map((r) => ({ from: r.from, to: r.to })), { mode: 'all' })], ['격자', grid]] as const) {
  const boxes = new Map<string, Box>(nodes.map((n) => [n.id, { ...pos[n.id], w: n.w, h: n.h }]))
  const bl = [...boxes.values()]
  const sizes = rels.map((r) => labelSize(r.nm))
  // 개선 전
  const anc = autoAnchors(rels, boxes)
  const before = rels.map((r) => {
    const a = anc.get(r.id)!
    const sp = sidePoint(boxes.get(r.from)!, a.ps, a.pr), tp = sidePoint(boxes.get(r.to)!, a.cs, a.cr)
    const [d, lx, ly] = getSmoothStepPath({ sourceX: sp.x, sourceY: sp.y, sourcePosition: POS[a.ps], targetX: tp.x, targetY: tp.y, targetPosition: POS[a.cs], borderRadius: 0 })
    return { pts: toPts(d), lab: { x: lx, y: ly } }
  })
  const bp = before.map((b) => b.pts)
  const bLab = before.map((b, k) => ({ x: b.lab.x - sizes[k].w / 2, y: b.lab.y - sizes[k].h / 2, ...sizes[k] }))
  // 개선 후(5회 평균 ms)
  let t0 = performance.now()
  let rt = routeEdges(boxes, rels)
  for (let k = 0; k < 4; k++) rt = routeEdges(boxes, rels)
  const ms = (performance.now() - t0) / 5
  const ap = rels.map((r) => rt.get(r.id)!.pts)
  t0 = performance.now()
  const labs = placeLabels(ap, bl, rels.map((r) => r.nm))
  const lms = performance.now() - t0
  const aLab = labs.map((c) => (c && c.w ? { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h } : null))
  const cutN = labs.filter((c) => c && c.text.endsWith('…')).length, hidN = labs.filter((c) => c && !c.text).length
  const lt = (t: number) => Math.round(t)
  const ko = rels.filter((r) => !rt.get(r.id)!.ok).length
  const nsf = (ps: Pt[][]) => ps.filter((_, k) => rels[k].from !== rels[k].to) // 우회비는 자기 관계 제외
  const [db, da] = [detourStats(nsf(bp)), detourStats(nsf(ap))]
  rows.push(`| ${area} ${lyNm} | ${nodes.length}/${rels.length} | ${countBoxOverlaps(bl)} | ${countOverlaps(bp)} → **${countOverlaps(ap)}** | ${countNodeHits(bp, bl)} → **${countNodeHits(ap, bl)}** | ${countCrossings(bp)} → **${countCrossings(ap)}** | ${countLabelBoxHits(bLab, bl)} → **${countLabelBoxHits(aLab, bl)}** | ${countLabelHits(bLab, bp, bl)} → **${countLabelHits(aLab, ap, bl)}** | ${cutN}/${hidN} | ${db.total} → **${da.total}** | ${db.maxRatio} → **${da.maxRatio}** | ${lt(ms)} + ${lt(lms)} | ${ko} |`)
  }
}
console.log('| 주제영역 | 엔터티/관계 | 박스 겹침 | 평행 겹침(전→후) | 박스 관통 | 교차(후 = hop 표시) | 라벨-박스 겹침 | 라벨 겹침(선·박스·라벨) | 라벨 줄임/숨김 | 총 길이 px | 최대 우회비 | 경로+라벨 ms | 완화 경로 |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
console.log(rows.join('\n'))
