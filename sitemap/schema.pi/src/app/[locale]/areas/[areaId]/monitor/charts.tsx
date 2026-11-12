'use client'
// 모니터링 차트(외부 라이브러리 없이 SVG, 2026-10-21) — 선(면적) 차트·작은 추이선·막대 비율·누적 막대(분 단위 정상·느림·오류)
// 크기는 viewBox 고정 + width 100%(반응형), 값 없는 구간(null)은 선을 끊음. 마지막 값 라벨 표시
// 색 = 전역 토큰(CSS 변수, SVG 는 style 로 지정) — 추적선 accent 1색, 나머지 ink-3·line, 의미가 있을 때만 warn·danger(2026-11-12 디자인 개편)
const C = { line: 'var(--accent)', grid: 'var(--line)', axis: 'var(--ink-3)', mark: 'var(--accent)', ok: 'var(--ink-off)', warn: 'var(--warn)', bad: 'var(--danger)' }
const AX = { fill: C.axis, fontFamily: 'var(--font-code)' }
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
    <figure className="panel p-3">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs font-medium text-ink-2">
        {title}
        <span className="text-sm font-semibold tabular-nums text-ink">
          {last ? `${fmtN(last.v)}${unit}` : '—'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label={`${title} 추이`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} style={{ stroke: C.grid }} />
            <text x={pad.l - 4} y={y(top * f) + 3} textAnchor="end" fontSize="9" style={AX}>
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
                <path d={area} style={{ fill: color }} opacity={0.12} />
                <path d={d} fill="none" style={{ stroke: color }} strokeWidth={1.5} />
                {s.length === 1 && <circle cx={x(s[0].i)} cy={y(s[0].v)} r={2.5} style={{ fill: color }} />}
              </g>
            )
          })}
        {n > 0 && (
          <>
            <text x={pad.l} y={h - 4} fontSize="9" style={AX}>
              {fmtT(pts[0].t)}
            </text>
            <text x={W - pad.r} y={h - 4} textAnchor="end" fontSize="9" style={AX}>
              {fmtT(pts[n - 1].t)}
            </text>
          </>
        )}
        {!vs.length && (
          <text x={W / 2} y={h / 2} textAnchor="middle" fontSize="11" style={AX}>
            수집된 값이 없습니다
          </text>
        )}
      </svg>
    </figure>
  )
}

// 작은 추이선(목록 행 안) — 오류 지점은 danger 점
export function Spark({ pts, bad = [], w = 220, h = 34 }: { pts: Pt[]; bad?: boolean[]; w?: number; h?: number }) {
  const vs = pts.map((p) => p.v ?? 0)
  const top = Math.max(1, ...vs) * 1.2
  const n = pts.length
  const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * (w - 4) + 2)
  const y = (v: number) => h - 2 - (v / top) * (h - 6)
  const d = vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full max-w-[16rem]" aria-hidden>
      {n > 1 && <path d={`${d} L${x(n - 1)},${h} L${x(0)},${h} Z`} style={{ fill: C.line }} opacity={0.12} />}
      {n > 0 && <path d={d} fill="none" style={{ stroke: C.line }} strokeWidth={1.4} />}
      {bad.map((b, i) => b && <circle key={i} cx={x(i)} cy={y(vs[i])} r={2.4} style={{ fill: C.bad }} />)}
    </svg>
  )
}

// 비율 막대(0~100) — 70 이상 warn, 90 이상 danger
export function Meter({ pct }: { pct: number | null }) {
  const v = pct ?? 0
  const col = v >= 90 ? C.bad : v >= 70 ? C.warn : C.line
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-chip bg-raised" aria-hidden>
      <span className="block h-full rounded-chip" style={{ width: `${Math.min(100, v)}%`, background: col }} />
    </span>
  )
}

// 분 단위 누적 막대 — 정상(ink-off)·느림(warn)·오류(danger), 히트맵 대용. 막대 툴팁(건수), 오류 있는 분은 danger 점(건수 작아도 보이게)
// onPick 이 있으면 막대마다 버튼(클릭·Enter·Space → 그 분 선택, sel = 선택된 분 테두리)
export function Stack({ title, bars, h = 120, onPick, sel }: { title: string; bars: { t: string; ok: number; slow: number; err: number }[]; h?: number; onPick?: (t: string) => void; sel?: string | null }) {
  const W = 320
  const pad = { l: 30, r: 6, t: 8, b: 18 }
  const top = Math.max(1, ...bars.map((b) => b.ok + b.slow + b.err)) * 1.1
  const bw = bars.length ? (W - pad.l - pad.r) / bars.length : 0
  const y = (v: number) => (v / top) * (h - pad.t - pad.b)
  const errSum = bars.reduce((n, b) => n + b.err, 0)
  return (
    <figure className="panel p-3">
      <figcaption className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-2">
        {title}
        <span className="ms-auto flex gap-3 font-normal text-ink-3">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-ink-off" />정상</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-warn" />느림</span>
          <span className={`inline-flex items-center gap-1 tabular-nums ${errSum ? 'font-medium text-danger' : ''}`}><i className="inline-block h-2 w-2 rounded-sm bg-danger" />오류 {errSum.toLocaleString()}건</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role={onPick ? 'group' : 'img'} aria-label={`${title} 분 단위 분포`}>
        <line x1={pad.l} x2={W - pad.r} y1={h - pad.b} y2={h - pad.b} style={{ stroke: C.grid }} />
        <text x={pad.l - 4} y={pad.t + 6} textAnchor="end" fontSize="9" style={AX}>
          {fmtN(top, 0)}
        </text>
        {bars.map((b, i) => {
          const x0 = pad.l + i * bw + 0.5
          let base = h - pad.b
          const w = Math.max(1, bw - 1)
          return (
            <g
              key={b.t}
              {...(onPick && {
                role: 'button',
                tabIndex: 0,
                'aria-label': `${fmtT(b.t)} 요청 ${b.ok + b.slow + b.err}건 — 누르면 이 분의 느림·오류 상세`,
                'aria-pressed': sel === b.t,
                className: 'cursor-pointer outline-none focus-visible:opacity-70',
                onClick: () => onPick(b.t),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onPick(b.t)
                  }
                },
              })}
            >
              <title>{`${fmtT(b.t)} 요청 ${b.ok + b.slow + b.err} · 정상 ${b.ok} · 느림 ${b.slow} · 오류 ${b.err}${onPick ? ' — 누르면 상세' : ''}`}</title>
              <rect x={x0} y={pad.t} width={w} height={h - pad.t - pad.b} style={{ fill: sel === b.t ? 'var(--accent-soft)' : 'transparent', stroke: sel === b.t ? C.mark : 'none' }} strokeWidth={0.8} />
              {(
                [
                  [b.ok, C.ok],
                  [b.slow, C.warn],
                  [b.err, C.bad],
                ] as const
              ).map(([v, col]) => {
                const hh = y(v)
                base -= hh
                return v > 0 ? <rect key={col} x={x0} y={base} width={w} height={hh} style={{ fill: col }} /> : null
              })}
              {b.err > 0 && <circle cx={x0 + w / 2} cy={Math.max(pad.t, base - 4)} r={2.5} style={{ fill: C.bad }} />}
            </g>
          )
        })}
        {bars.length > 0 && (
          <>
            <text x={pad.l} y={h - 4} fontSize="9" style={AX}>
              {fmtT(bars[0].t)}
            </text>
            <text x={W - pad.r} y={h - 4} textAnchor="end" fontSize="9" style={AX}>
              {fmtT(bars[bars.length - 1].t)}
            </text>
          </>
        )}
        {!bars.length && (
          <text x={W / 2} y={h / 2} textAnchor="middle" fontSize="11" style={AX}>
            수집된 값이 없습니다
          </text>
        )}
      </svg>
    </figure>
  )
}

// 수치 카드 — 라벨 12 ink-3 + 숫자 24/600, 같은 높이. onClick 이 있으면 버튼(title = 누르면 하는 일, on = 선택됨 = accent-soft)
export function Tile({ nm, val, sub, warn, onClick, title, on }: { nm: string; val: string; sub?: string; warn?: boolean; onClick?: () => void; title?: string; on?: boolean }) {
  const body = (
    <>
      <span className="block truncate text-xs text-ink-3">{nm}</span>
      <span className={`mt-1 block text-2xl font-semibold tabular-nums ${warn ? 'text-danger' : 'text-ink'}`}>{val}</span>
      {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
    </>
  )
  const cls = `panel min-h-22 px-4 py-3 ${on ? 'bg-accent-soft ring-1 ring-accent-ink' : ''}`
  return onClick ? (
    <button type="button" onClick={onClick} title={title} aria-label={`${nm} ${val} — ${title}`} aria-pressed={on} className={`${cls} text-start transition-colors ${on ? '' : 'hover:bg-raised'}`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
