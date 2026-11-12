'use client'
// 객체 편집기 '엔티티 관계도' 탭(DBeaver ER Diagram 참고, 2026-10-20) — 선택 테이블 + FK 1단계 이웃(GET sql/obj sec=erd)을 SVG 로 그림
//  배치 : 대상 테이블 가운데, 참조하는(부모) 테이블 왼쪽, 참조받는(자식) 테이블 오른쪽 / 선 = 자식 FK 칼럼 → 부모 칼럼(화살표가 부모 쪽)
//  이웃 박스 누르기 = 그 테이블 객체 탭 열기, 화면보다 크면 스크롤
export interface ErdCol {
  name: string
  type: string
  pk?: boolean
  fk?: boolean
  nn?: boolean
}
export interface ErdTable {
  schema: string
  name: string
  cols: ErdCol[]
}
export interface ErdRel {
  name: string
  from: { schema: string; table: string; columns: string[] }
  to: { schema: string; table: string; columns: string[] }
}
const L = { w: 210, head: 22, row: 16, gap: 28, colGap: 110, pad: 12, maxRows: 30 } as const
// 색 — 밝은 도면 종이(테마 무관, ERD 캔버스와 같음) : 머리 = 남색 강조 1색, 선 = 흑연, 대상 테이블 = 남색 옅은 바탕
const C = { head: '#2b4c86', line: '#626d80', border: '#cdd2da', self: '#e6edf9', ink: '#101828', ink3: '#626d80', key: '#b45309' } as const
const keyOf = (s: string, t: string) => `${s}.${t}`

export default function ObjErd({ tables, rels, schema, rel, onOpen }: { tables: ErdTable[]; rels: ErdRel[]; schema: string; rel: string; onOpen: (schema: string, rel: string) => void }) {
  const me = keyOf(schema, rel)
  const parents = new Set(rels.filter((r) => keyOf(r.from.schema, r.from.table) === me).map((r) => keyOf(r.to.schema, r.to.table)))
  // 칸 : 0 왼쪽(부모) · 1 가운데(대상) · 2 오른쪽(자식·그 밖) — 부모이면서 자식이면 왼쪽
  const lane = (t: ErdTable) => (keyOf(t.schema, t.name) === me ? 1 : parents.has(keyOf(t.schema, t.name)) ? 0 : 2)
  const boxes = new Map<string, { t: ErdTable; x: number; y: number; h: number; rows: ErdCol[] }>()
  const ys = [L.pad, L.pad, L.pad]
  for (const t of tables) {
    const k = lane(t)
    const rows = t.cols.slice(0, L.maxRows) // ponytail: 칼럼 30개까지만 그림(나머지는 '+N'), 많이 필요하면 접기·펼치기
    const h = L.head + Math.max(1, rows.length + (t.cols.length > rows.length ? 1 : 0)) * L.row + 4
    boxes.set(keyOf(t.schema, t.name), { t, x: L.pad + k * (L.w + L.colGap), y: ys[k], h, rows })
    ys[k] += h + L.gap
  }
  if (!boxes.size) return <p className="p-3 text-xs text-ink-3">관계도에 그릴 테이블 없음</p>
  const W = L.pad * 2 + 3 * L.w + 2 * L.colGap
  const H = Math.max(...ys) + L.pad
  // 칼럼 행 가운데 y(못 찾으면 머리)
  const rowY = (b: { y: number; rows: ErdCol[] }, col?: string) => {
    const i = col ? b.rows.findIndex((c) => c.name === col) : -1
    return i < 0 ? b.y + L.head / 2 : b.y + L.head + i * L.row + L.row / 2 + 2
  }
  return (
    <div className="erd-sheet h-full overflow-auto">
      <svg width={W} height={H} className="font-mono text-xs" style={{ fontSize: 10 }} role="img" aria-label={`${rel} 엔티티 관계도`}>
        <defs>
          <marker id="erd-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={C.line} />
          </marker>
        </defs>
        {rels.map((r, i) => {
          const f = boxes.get(keyOf(r.from.schema, r.from.table)), t = boxes.get(keyOf(r.to.schema, r.to.table))
          if (!f || !t) return null
          const y1 = rowY(f, r.from.columns[0]), y2 = rowY(t, r.to.columns[0])
          let d: string
          if (f === t || f.x === t.x) {
            // 같은 칸(자기 참조 등) — 오른쪽으로 돌아 나가는 고리
            const x = f.x + L.w, o = 24 + (i % 3) * 8
            d = `M${x},${y1} C${x + o},${y1} ${x + o},${y2} ${x},${y2}`
          } else {
            const x1 = f.x > t.x ? f.x : f.x + L.w, x2 = f.x > t.x ? t.x + L.w : t.x, m = (x1 + x2) / 2
            d = `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`
          }
          return (
            <path key={`${r.name}-${i}`} d={d} fill="none" stroke={C.line} strokeWidth={1.2} markerEnd="url(#erd-arrow)">
              <title>{`${r.name} : ${r.from.table}(${r.from.columns.join(', ')}) → ${r.to.table}(${r.to.columns.join(', ')})`}</title>
            </path>
          )
        })}
        {[...boxes.entries()].map(([k, b]) => {
          const mine = k === me
          return (
            <g key={k} transform={`translate(${b.x},${b.y})`} className={mine ? '' : 'cursor-pointer'} onClick={() => !mine && onOpen(b.t.schema, b.t.name)} role={mine ? undefined : 'button'} aria-label={mine ? undefined : `${b.t.name} 객체 탭 열기`}>
              <title>{mine ? `${b.t.schema}.${b.t.name}` : `${b.t.schema}.${b.t.name} — 누르면 객체 탭 열기`}</title>
              <rect width={L.w} height={b.h} rx={3} fill={mine ? C.self : '#fff'} stroke={mine ? C.head : C.border} strokeWidth={mine ? 1.6 : 1} />
              <rect width={L.w} height={L.head} rx={3} fill={C.head} />
              {/* 안쪽 svg = 박스 너비에서 긴 이름 잘라 냄 */}
              <svg width={L.w - 4} height={b.h}>
              <text x={6} y={15} fill="#fff" fontWeight={600} fontSize={11}>
                {(b.t.schema !== schema ? `${b.t.schema}.` : '') + b.t.name}
              </text>
              {b.rows.map((c, i) => (
                <text key={c.name} x={6} y={L.head + i * L.row + 13} fill={c.pk ? C.key : C.ink} fontWeight={c.pk ? 600 : undefined}>
                  {c.pk ? 'PK ' : c.fk ? '↗ ' : '· '}
                  {c.name}
                  <tspan fill={C.ink3}> {c.type}{c.nn ? ' NN' : ''}{c.fk ? ' FK' : ''}</tspan>
                </text>
              ))}
              {b.t.cols.length > b.rows.length && (
                <text x={6} y={L.head + b.rows.length * L.row + 13} fill={C.ink3}>
                  … +{b.t.cols.length - b.rows.length}
                </text>
              )}
              </svg>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
