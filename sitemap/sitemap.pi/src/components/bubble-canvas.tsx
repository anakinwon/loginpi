'use client'

// 메인 버블 캔버스 — SVG 원형 버블 물리(충돌·밀어내기·벽 반사·부유) + 드래그·호버/포커스 툴팁·클릭/Enter 상세 이동.
// 크기 = 요금제(PLAN_AREA) 비율로 화면 면적을 나눔, 색 = 기간 조회 증감(초록 증가·빨강 감소·회색 변화 없음).
// 프레임마다 React 렌더 없이 transform 속성만 갱신(60fps 목표). prefers-reduced-motion 이면 정지 배치(드래그 없음)
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { PLAN_AREA, PLAN_BADGE, type BubbleItem } from '@/lib/site'

const C = {
  fill: 0.5, // 화면 면적 대비 버블 면적 합
  maxR: 0.24, // 반지름 상한(짧은 변 대비) — 필터로 몇 개만 남을 때 과대 방지
  gap: 2,
  drift: 0.06, // 부유 가속(무작위)
  damp: 0.985,
  maxV: 1.4,
  bounce: 0.8,
  clickMove: 6, // 이 거리(px) 미만 이동이면 클릭으로 판정
  iconMinR: 34, // 이 반지름 미만이면 이미지·이니셜 생략
  relax: 300, // 정지 배치 반복 횟수
} as const

export const TONE = { up: '#22c55e', down: '#ef4444', flat: '#9ca3af' } as const
export const toneOf = (chg: number) =>
  chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat'

interface Body {
  x: number
  y: number
  vx: number
  vy: number
}
interface Node {
  item: BubbleItem
  r: number
  b: Body
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

// 한 프레임 — 부유·감쇠·이동 → 쌍별 충돌(면적 질량비로 밀어내기·법선 속도 교환) → 벽 반사
// ponytail: 쌍별 O(n²) — 수십 개 기준 충분, 수백 개면 격자 공간분할
function step(nodes: Node[], w: number, h: number, drift: number, dragId: string | null) {
  for (const n of nodes) {
    if (n.item.id === dragId) continue
    const b = n.b
    b.vx = (b.vx + (Math.random() - 0.5) * drift) * C.damp
    b.vy = (b.vy + (Math.random() - 0.5) * drift) * C.damp
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > C.maxV) {
      b.vx *= C.maxV / sp
      b.vy *= C.maxV / sp
    }
    b.x += b.vx
    b.y += b.vy
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const c = nodes[j]
      let dx = c.b.x - a.b.x
      let dy = c.b.y - a.b.y
      let d = Math.hypot(dx, dy)
      const min = a.r + c.r + C.gap
      if (d >= min) continue
      if (d === 0) {
        dx = Math.random() - 0.5
        dy = Math.random() - 0.5
        d = Math.hypot(dx, dy)
      }
      const nx = dx / d
      const ny = dy / d
      // 드래그 중인 버블은 무한 질량(남을 밀기만 함)
      const ma = a.item.id === dragId ? Infinity : a.r * a.r
      const mc = c.item.id === dragId ? Infinity : c.r * c.r
      const sa = ma === Infinity ? 0 : mc === Infinity ? 1 : mc / (ma + mc)
      const sc = 1 - sa
      const overlap = min - d
      a.b.x -= nx * overlap * sa
      a.b.y -= ny * overlap * sa
      c.b.x += nx * overlap * sc
      c.b.y += ny * overlap * sc
      const rv = (c.b.vx - a.b.vx) * nx + (c.b.vy - a.b.vy) * ny
      if (rv < 0) {
        const imp = -rv * 0.9
        a.b.vx -= nx * imp * sa
        a.b.vy -= ny * imp * sa
        c.b.vx += nx * imp * sc
        c.b.vy += ny * imp * sc
      }
    }
  }
  for (const { b, r } of nodes) {
    if (b.x < r) (b.x = r), (b.vx = Math.abs(b.vx) * C.bounce)
    else if (b.x > w - r) (b.x = w - r), (b.vx = -Math.abs(b.vx) * C.bounce)
    if (b.y < r) (b.y = r), (b.vy = Math.abs(b.vy) * C.bounce)
    else if (b.y > h - r) (b.y = h - r), (b.vy = -Math.abs(b.vy) * C.bounce)
  }
}

// 반지름 — 면적 가중치 비율로 화면 면적(fill)을 분배, 최대 반지름 상한 초과 시 전체를 같은 비율로 축소(크기 순서 유지)
export function radii(items: BubbleItem[], w: number, h: number) {
  const total = items.reduce((s, it) => s + PLAN_AREA[it.plan], 0)
  if (!total || !w || !h) return items.map(() => 0)
  const unit = (C.fill * w * h) / (Math.PI * total)
  const rs = items.map((it) => Math.sqrt(unit * PLAN_AREA[it.plan]))
  const k = Math.min(1, (Math.min(w, h) * C.maxR) / Math.max(...rs))
  return rs.map((r) => r * k)
}

// 글자 폭 근사(0.58em) — 버블 안 가로폭에 맞춰 글자 크기 결정
const fitFont = (text: string, width: number, max: number) =>
  Math.min(max, width / (text.length * 0.58))

export function BubbleCanvas({
  items,
  label,
  adLabel,
  ownLabel,
  planName,
  fmtPct,
  fmtViews,
  onOpen,
}: {
  items: BubbleItem[]
  label: string
  adLabel: string
  ownLabel: string // 자사 사이트 배지(광고 대신)
  planName: (it: BubbleItem) => string
  fmtPct: (chg: number) => string
  fmtViews: (it: BubbleItem) => string
  onOpen: (domain: string) => void
}) {
  const uid = useId().replace(/:/g, '')
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const gRefs = useRef(new Map<string, SVGGElement>())
  const bodies = useRef(new Map<string, Body>())
  const nodesRef = useRef<Node[]>([])
  const sizeRef = useRef({ w: 0, h: 0 })
  const activeRef = useRef<string | null>(null)
  const drag = useRef<{
    id: string
    domain: string
    x0: number
    y0: number
    px: number
    py: number
    moved: boolean
  } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [reduced, setReduced] = useState(false)
  const [active, setActive] = useState<BubbleItem | null>(null)

  const rs = useMemo(() => radii(items, size.w, size.h), [items, size])

  // 크기 관측
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const paint = () => {
    for (const n of nodesRef.current)
      gRefs.current
        .get(n.item.id)
        ?.setAttribute('transform', `translate(${n.b.x.toFixed(1)} ${n.b.y.toFixed(1)})`)
    const tip = tipRef.current
    const n = nodesRef.current.find((v) => v.item.id === activeRef.current)
    if (tip && n) {
      const { w } = sizeRef.current
      const x = clamp(n.b.x, 90, Math.max(90, w - 90))
      const above = n.b.y - n.r > 70
      tip.style.transform = `translate(${x}px, ${above ? n.b.y - n.r - 8 : n.b.y + n.r + 8}px) translate(-50%, ${above ? '-100%' : '0'})`
    }
  }

  // 노드 재구성 — 기존 위치 유지, 새 버블은 큰 것부터 중앙 나선 배치(황금각)
  useEffect(() => {
    const { w, h } = size
    sizeRef.current = size
    if (!w || !h) return
    const order = items
      .map((it, i) => ({ it, r: rs[i] }))
      .sort((a, b) => b.r - a.r)
    let k = 0
    nodesRef.current = order.map(({ it, r }) => {
      let b = bodies.current.get(it.id)
      if (!b) {
        const ang = k * 2.399963
        const dist = Math.sqrt(k) * Math.min(w, h) * 0.12
        b = {
          x: w / 2 + Math.cos(ang) * dist,
          y: h / 2 + Math.sin(ang) * dist,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
        }
        bodies.current.set(it.id, b)
      }
      k++
      b.x = clamp(b.x, r, w - r)
      b.y = clamp(b.y, r, h - r)
      return { item: it, r, b }
    })
    if (reduced) {
      for (let i = 0; i < C.relax; i++) step(nodesRef.current, w, h, 0, null)
      for (const n of nodesRef.current) (n.b.vx = 0), (n.b.vy = 0)
    }
    paint()
  }, [items, rs, size, reduced])

  // 애니메이션 루프 — 탭이 숨겨지면 rAF 자체가 멈춘다
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const loop = () => {
      const { w, h } = sizeRef.current
      if (w && h) step(nodesRef.current, w, h, C.drift, drag.current?.id ?? null)
      paint()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  const activate = (it: BubbleItem | null) => {
    activeRef.current = it?.id ?? null
    setActive(it)
  }
  useEffect(() => {
    if (active) paint()
  }, [active])

  const local = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const onDown = (e: React.PointerEvent, it: BubbleItem) => {
    if (e.button !== 0) return
    const p = local(e)
    drag.current = { id: it.id, domain: it.domain, x0: p.x, y0: p.y, px: p.x, py: p.y, moved: false }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = local(e)
    if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) < C.clickMove) return
    d.moved = true
    if (reduced) return
    const b = bodies.current.get(d.id)
    if (b) {
      b.vx = (p.x - d.px) * 0.5
      b.vy = (p.y - d.py) * 0.5
      b.x = p.x
      b.y = p.y
    }
    d.px = p.x
    d.py = p.y
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) onOpen(d.domain)
  }

  const nodes = items.map((it, i) => ({ it, r: rs[i] }))

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        role="group"
        aria-label={label}
        className="block touch-none select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          {(Object.keys(TONE) as (keyof typeof TONE)[]).map((t) => (
            <radialGradient key={t} id={`${uid}-${t}`}>
              <stop offset="0%" stopColor={TONE[t]} stopOpacity={0.04} />
              <stop offset="68%" stopColor={TONE[t]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={TONE[t]} stopOpacity={0.62} />
            </radialGradient>
          ))}
        </defs>
        {nodes.map(({ it, r }) => {
          if (!r) return null
          const tone = toneOf(it.chgPct)
          const icon = r >= C.iconMinR
          const ir = r * 0.2
          const iy = -r * 0.3
          const badge = PLAN_BADGE[it.plan]
          const fBadge = clamp(r * 0.15, 7, 13)
          const fPct = clamp(r * 0.24, 8, 26)
          let name = it.domain
          let fName = fitFont(name, r * 1.7, r * 0.3)
          if (fName < 8) {
            name = name.replace(/\.pi$/, '')
            fName = fitFont(name, r * 1.7, r * 0.3)
          }
          fName = Math.max(fName, 6)
          const yBadge = icon ? -r * 0.62 : -r * 0.42
          const yName = icon ? r * 0.08 : r * 0.02
          const yPct = icon ? r * 0.4 : r * 0.36
          return (
            <g
              key={it.id}
              ref={(el) => {
                if (el) gRefs.current.set(it.id, el)
                else gRefs.current.delete(it.id)
              }}
              className="bubble"
              style={{ color: TONE[tone] }}
              tabIndex={0}
              role="link"
              aria-label={`${it.domain}, ${badge ? `${it.own ? ownLabel : adLabel}, ` : ''}${planName(it)}, ${fmtViews(it)}, ${fmtPct(it.chgPct)}`}
              onPointerDown={(e) => onDown(e, it)}
              onPointerEnter={() => activate(it)}
              onPointerLeave={() => activeRef.current === it.id && activate(null)}
              onFocus={() => activate(it)}
              onBlur={() => activate(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(it.domain)
                }
              }}
            >
              <g className="bubble-inner">
                <circle
                  className="bubble-ring"
                  r={r}
                  fill={`url(#${uid}-${tone})`}
                  stroke={TONE[tone]}
                  strokeWidth={Math.max(1.5, r * 0.04)}
                />
                <g pointerEvents="none" fill="#fff" textAnchor="middle" dominantBaseline="central">
                  {badge && (
                    <text y={yBadge} fontSize={fBadge} fontWeight={700} fill="#fde68a">
                      {it.own ? ownLabel : adLabel} · {badge}
                    </text>
                  )}
                  {icon &&
                    (it.img ? (
                      <>
                        <clipPath id={`${uid}-c-${it.id}`}>
                          <circle r={ir} cy={iy} />
                        </clipPath>
                        <image
                          href={it.img}
                          x={-ir}
                          y={iy - ir}
                          width={ir * 2}
                          height={ir * 2}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#${uid}-c-${it.id})`}
                        />
                      </>
                    ) : (
                      <>
                        <circle r={ir} cy={iy} fill="rgba(255,255,255,0.14)" />
                        <text y={iy} fontSize={ir * 1.1} fontWeight={700}>
                          {it.domain[0].toUpperCase()}
                        </text>
                      </>
                    ))}
                  <text y={yName} fontSize={fName} fontWeight={700}>
                    {name}
                  </text>
                  <text y={yPct} fontSize={fPct} fontWeight={600} fill={TONE[tone]} className="bubble-pct">
                    {fmtPct(it.chgPct)}
                  </text>
                </g>
              </g>
            </g>
          )
        })}
      </svg>
      <div
        ref={tipRef}
        role="tooltip"
        className={`pointer-events-none absolute top-0 left-0 z-10 w-max max-w-[220px] rounded-md border border-white/15 bg-neutral-900/95 px-3 py-2 text-xs text-white shadow-lg ${active ? '' : 'hidden'}`}
      >
        {active && (
          <>
            <p className="font-semibold">{active.domain}</p>
            <p className="text-white/70">{active.name}</p>
            <p className="mt-1">
              {PLAN_BADGE[active.plan] && (
                <span className="mr-1 rounded bg-amber-300/20 px-1 text-amber-200">{active.own ? ownLabel : adLabel}</span>
              )}
              {planName(active)}
            </p>
            <p>
              {fmtViews(active)} ·{' '}
              <span style={{ color: TONE[toneOf(active.chgPct)] }}>{fmtPct(active.chgPct)}</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
