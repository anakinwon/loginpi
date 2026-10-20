'use client'
// 모니터링 차트(외부 라이브러리 없이 SVG, 2026-10-21) — 선(면적) 차트·작은 추이선·막대 비율·누적 막대(분 단위 정상·느림·오류)
// 크기는 viewBox 고정 + width 100%(반응형), 값 없는 구간(null)은 선을 끊음. 마지막 값 라벨 표시
const C = { line: '#3b82f6', fill: 'rgba(59,130,246,0.18)', grid: '#e5e7eb', axis: '#6b7280', mark: '#1f3a68' }
const fmtT = (t: string) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
export const fmtN = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(d)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(d)}K` : `${Math.round(v * 10 ** d) / 10 ** d}`)
export const fmtB = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v >= 2 ** 40 ? `${(v / 2 ** 40).toFixed(1)}TiB` : v >= 2 ** 30 ? `${(v / 2 ** 30).toFixed(1)}GiB` : v >= 2 ** 20 ? `${(v / 2 ** 20).toFixed(1)}MiB` : `${Math.round(v / 1024)}KiB`)

export type Pt = { t: string; v: number | null }

// 선 차트 — 제목·단위·최댓값(없으면 자동), 위 오른쪽에 마지막 값
export function Line({ title, pts, unit = '', max, color = C.line, h = 120 }: { title: string; pts: Pt[]; unit?: string; max?: number; color?: string; h?: number }) {
  const W = 320
  const pad = { l: 34, r: 8, t: 8, b: 18 }
  const vs = pts.map((p) => p.v).filter((v): v is number => v !== null)
  const top = max ?? Math.max(1, ...vs) * 1.15
  const n = pts.length
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - Math.min(v, top) / top) * (h - pad.t - pad.b)
  // null 에서 끊긴 조각마다 선·면적
  const segs: { i: number; v: number }[][] = []
  pts.forEach((p, i) => {
    if (p.v === null) return void segs.push([])
    if (!segs.length) segs.push([])
    segs[segs.length - 1].push({ i, v: p.v })
  })
  const last = [...pts].reverse().find((p) => p.v !== null)
  return (
    <figure className="rounded-lg border border-[#d6deeb] bg-white p-2">
      <figcaption className="flex items-baseline justify-between px-1 text-xs font-semibold text-[#2c3850]">
        {title}
        <span className="text-sm tabular-nums" style={{ color }}>
          {last ? `${fmtN(last.v)}${unit}` : '—'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label={`${title} 추이`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} stroke={C.grid} />
            <text x={pad.l - 4} y={y(top * f) + 3} textAnchor="end" fontSize="9" fill={C.axis}>
              {fmtN(top * f, 0)}
            </text>
          </g>
        ))}
        {segs
          .filter((s) => s.length)
          .map((s, k) => {
            const d = s.map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
            const area = `${d} L${x(s[s.length - 1].i).toFixed(1)},${y(0)} L${x(s[0].i).toFixed(1)},${y(0)} Z`
            return (
              <g key={k}>
                <path d={area} fill={color} opacity={0.15} />
                <path d={d} fill="none" stroke={color} strokeWidth={1.6} />
                {s.length === 1 && <circle cx={x(s[0].i)} cy={y(s[0].v)} r={2.5} fill={color} />}
              </g>
            )
          })}
        {n > 0 && (
          <>
            <text x={pad.l} y={h - 4} fontSize="9" fill={C.axis}>
              {fmtT(pts[0].t)}
            </text>
            <text x={W - pad.r} y={h - 4} textAnchor="end" fontSize="9" fill={C.axis}>
              {fmtT(pts[n - 1].t)}
            </text>
          </>
        )}
        {!vs.length && (
          <text x={W / 2} y={h / 2} textAnchor="middle" fontSize="11" fill={C.axis}>
            수집된 값이 없습니다
          </text>
        )}
      </svg>
    </figure>
  )
}

// 작은 추이선(목록 행 안) — 오류 지점은 빨간 점
export function Spark({ pts, bad = [], w = 220, h = 34 }: { pts: Pt[]; bad?: boolean[]; w?: number; h?: number }) {
  const vs = pts.map((p) => p.v ?? 0)
  const top = Math.max(1, ...vs) * 1.2
  const n = pts.length
  const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * (w - 4) + 2)
  const y = (v: number) => h - 2 - (v / top) * (h - 6)
  const d = vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full max-w-[16rem]" aria-hidden>
      {n > 1 && <path d={`${d} L${x(n - 1)},${h} L${x(0)},${h} Z`} fill={C.fill} />}
      {n > 0 && <path d={d} fill="none" stroke={C.line} strokeWidth={1.4} />}
      {bad.map((b, i) => b && <circle key={i} cx={x(i)} cy={y(vs[i])} r={2.4} fill="#dc2626" />)}
    </svg>
  )
}

// 비율 막대(0~100) — 70 이상 주황, 90 이상 빨강
export function Meter({ pct }: { pct: number | null }) {
  const v = pct ?? 0
  const col = v >= 90 ? '#dc2626' : v >= 70 ? '#f59e0b' : '#3b82f6'
  return (
    <span className="block h-2 w-full overflow-hidden rounded bg-[#e5e7eb]" aria-hidden>
      <span className="block h-full rounded" style={{ width: `${Math.min(100, v)}%`, background: col }} />
    </span>
  )
}

// 분 단위 누적 막대 — 정상(파랑)·느림(주황)·오류(빨강), 히트맵 대용
export function Stack({ title, bars, h = 120 }: { title: string; bars: { t: string; ok: number; slow: number; err: number }[]; h?: number }) {
  const W = 320
  const pad = { l: 30, r: 6, t: 8, b: 18 }
  const top = Math.max(1, ...bars.map((b) => b.ok + b.slow + b.err)) * 1.1
  const bw = bars.length ? (W - pad.l - pad.r) / bars.length : 0
  const y = (v: number) => (v / top) * (h - pad.t - pad.b)
  return (
    <figure className="rounded-lg border border-[#d6deeb] bg-white p-2">
      <figcaption className="flex items-center gap-2 px-1 text-xs font-semibold text-[#2c3850]">
        {title}
        <span className="ml-auto flex gap-2 font-normal text-[#5b6578]">
          <span><i className="mr-0.5 inline-block h-2 w-2 bg-[#3b82f6]" />정상</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 bg-[#f59e0b]" />느림</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 bg-[#dc2626]" />오류</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label={`${title} 분 단위 분포`}>
        <line x1={pad.l} x2={W - pad.r} y1={h - pad.b} y2={h - pad.b} stroke={C.grid} />
        <text x={pad.l - 4} y={pad.t + 6} textAnchor="end" fontSize="9" fill={C.axis}>
          {fmtN(top, 0)}
        </text>
        {bars.map((b, i) => {
          const x0 = pad.l + i * bw + 0.5
          let base = h - pad.b
          return (
            <g key={b.t}>
              {(
                [
                  [b.ok, '#3b82f6'],
                  [b.slow, '#f59e0b'],
                  [b.err, '#dc2626'],
                ] as const
              ).map(([v, col]) => {
                const hh = y(v)
                base -= hh
                return v > 0 ? <rect key={col} x={x0} y={base} width={Math.max(1, bw - 1)} height={hh} fill={col} /> : null
              })}
            </g>
          )
        })}
        {bars.length > 0 && (
          <>
            <text x={pad.l} y={h - 4} fontSize="9" fill={C.axis}>
              {fmtT(bars[0].t)}
            </text>
            <text x={W - pad.r} y={h - 4} textAnchor="end" fontSize="9" fill={C.axis}>
              {fmtT(bars[bars.length - 1].t)}
            </text>
          </>
        )}
        {!bars.length && (
          <text x={W / 2} y={h / 2} textAnchor="middle" fontSize="11" fill={C.axis}>
            수집된 값이 없습니다
          </text>
        )}
      </svg>
    </figure>
  )
}

// 숫자 타일
export function Tile({ nm, val, sub, warn }: { nm: string; val: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-[#d6deeb] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] px-3 py-2">
      <div className="text-xs text-[#4a5a78]">{nm}</div>
      <div className={`text-2xl font-bold tabular-nums ${warn ? 'text-red-700' : 'text-[#1f3a68]'}`}>{val}</div>
      {sub && <div className="text-[11px] text-[#5b6578]">{sub}</div>}
    </div>
  )
}
