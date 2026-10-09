'use client'

// 메인 버블 캔버스 — SVG 원형 버블 물리(충돌·밀어내기·벽 반사·부유) + 드래그·호버/포커스 툴팁·클릭/Enter 상세 이동.
// 크기 = 요금제(PLAN_AREA) 비율로 화면 면적을 나눔. 스타일은 크립토버블과 같은 "가운데 투명 → 외곽으로 갈수록 진해지는 링" 그라데이션, 외곽 색 = 요금제(PLAN_COLOR 추천 팔레트), 글자는 흰색·증감은 부호로 표시.
// 글자는 9px 미만으로 줄이지 않고 반지름에 따라 표시 단계를 낮춘다(3 배지·아이콘·도메인·% → 2 도메인·% → 1 첫 글자 → 0 없음, 정보는 툴팁·aria-label 로 유지).
// 프레임마다 React 렌더 없이 transform 속성만 갱신(60fps 목표). prefers-reduced-motion 이면 정지 배치(드래그 없음)
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  PLAN_AREA,
  PLAN_BADGE,
  PLAN_COLOR,
  PLAN_CD,
  type BubbleItem,
} from '@/lib/site'

const C = {
  fill: 0.56, // 화면 면적 대비 버블 면적 합 — 등비 가중치로 작은 버블이 줄어든 만큼 보정
  maxR: 0.24, // 반지름 상한(짧은 변 대비) — 필터로 몇 개만 남을 때 과대 방지
  gap: 2,
  drift: 0.012, // 정착 후 은은한 부유 가속(무작위, 60Hz 프레임당) — 화면 크기 k^0.85 비례, 잔여 변화율 원본 수준(PC ≈7.5%·모바일 ≈6%)
  damp: 0.992, // 60Hz 프레임당 속도 감쇠 — 확산이 원본처럼 5~7초에 걸쳐 완만히 잦아들게
  maxV: 3.5, // 속도 상한(px/60Hz프레임, 화면 크기 무관)
  bounce: 0.8,
  push: 0.001, // 초기 겹침 위치 분리 비율(60Hz 프레임당) — settleMs 에 걸쳐 pushMax 까지 증가(4제곱 램프)
  pushMax: 0.02, // 분리 비율 상한 — 원본처럼 강제 즉시분리 없이 부드럽게 풀리고 순간적인 약한 겹침 허용
  rampMs: 1700, // 반발 가속 램프 시간(× k², 제곱 곡선) — 변화율 피크 시점을 원본(같은 환경 교차 측정 PC ~1.5s·모바일 ~1s)에 맞춤
  settleMs: 9000, // 분리 비율이 pushMax 에 도달하는 시간 — 확산 종료(t50)를 원본(PC ~5.5~6s)에 맞춤
  spring: 0.002, // 겹침 반발 가속(겹침 px × 비율 → 속도) — 원본 같은 초기 폭발 확산
  imp: 0.1, // 충돌 법선 속도 교환 비율(약화)
  speedRef: 916, // 속도 기준 화면 크기 √(w·h) — PC 1280×656 캔버스
  maxDt: 3, // 탭 복귀 등 큰 경과시간 상한(프레임 배수)
  clickMove: 6, // 이 거리(px) 미만 이동이면 클릭으로 판정
  iconMinR: 34, // 이 반지름 이상만 단계 3(배지·아이콘·도메인·%)
  minFont: 9, // 글자 하한(px) — 이보다 작아지면 표시 단계를 낮춘다
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

// 한 스텝 — 부유·감쇠·이동 → 쌍별 충돌(면적 질량비로 겹침의 push 비율만 밀어내기·법선 속도 교환) → 벽 반사
// f = 60Hz 프레임 배수(경과시간 정규화), push = 1 이면 즉시 분리(정지 배치용). 속도 단위는 px/60Hz프레임 × 화면 크기 비례
// ponytail: 쌍별 O(n²) — 수십~백여 개 기준 충분, 수백 개면 격자 공간분할
function step(
  nodes: Node[],
  w: number,
  h: number,
  drift: number,
  dragId: string | null,
  f = 1,
  push = 1,
  sprK = 0, // 반발 가속 램프(0~1)
) {
  // 화면 크기 비례 — 작은 화면은 글자·링이 촘촘해 같은 px 이동도 변화가 커 보이므로 반발은 √k, 부유는 k^0.85 로 완화(모바일 실측 보정)
  const k = Math.sqrt(w * h) / C.speedRef
  const ks = Math.sqrt(k)
  const kd = k ** 0.85
  const damp = C.damp ** f
  const maxV = C.maxV
  for (const n of nodes) {
    if (n.item.id === dragId) continue
    const b = n.b
    b.vx = (b.vx + (Math.random() - 0.5) * drift * kd * f) * damp
    b.vy = (b.vy + (Math.random() - 0.5) * drift * kd * f) * damp
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > maxV) {
      b.vx *= maxV / sp
      b.vy *= maxV / sp
    }
    b.x += b.vx * f
    b.y += b.vy * f
  }
  const pf = Math.min(1, push * f)
  const spr = push < 1 ? C.spring * ks * f * sprK : 0
  const imp = Math.min(1, C.imp * f)
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
      // 드래그 버블과의 겹침은 즉시 분리(손으로 미는 감각 유지)
      const overlap = (min - d) * (ma === Infinity || mc === Infinity ? 1 : pf)
      const q = (min - d) * spr
      a.b.vx -= nx * q * sa
      a.b.vy -= ny * q * sa
      c.b.vx += nx * q * sc
      c.b.vy += ny * q * sc
      a.b.x -= nx * overlap * sa
      a.b.y -= ny * overlap * sa
      c.b.x += nx * overlap * sc
      c.b.y += ny * overlap * sc
      const rv = (c.b.vx - a.b.vx) * nx + (c.b.vy - a.b.vy) * ny
      if (rv < 0) {
        const j = -rv * imp
        a.b.vx -= nx * j * sa
        a.b.vy -= ny * j * sa
        c.b.vx += nx * j * sc
        c.b.vy += ny * j * sc
      }
    }
  }
  for (const { b, r } of nodes) {
    if (b.x < r) ((b.x = r), (b.vx = Math.abs(b.vx) * C.bounce))
    else if (b.x > w - r) ((b.x = w - r), (b.vx = -Math.abs(b.vx) * C.bounce))
    if (b.y < r) ((b.y = r), (b.vy = Math.abs(b.vy) * C.bounce))
    else if (b.y > h - r) ((b.y = h - r), (b.vy = -Math.abs(b.vy) * C.bounce))
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
  sampleLabel,
  planName,
  fmtPct,
  fmtViews,
  onOpen,
}: {
  items: BubbleItem[]
  label: string
  adLabel: string
  ownLabel: string // 자사 사이트 배지(광고 대신)
  sampleLabel: string // 가상 샘플 배지(광고 대신)
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
  const startRef = useRef(0) // 새 버블이 등장한 시각 — 분리 비율 램프 기준
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
  // 그리기·충돌 순서 — 로딩마다 무작위 셔플(요금제별로 겹쳐 그려지거나 몰리지 않게, Fisher–Yates)
  const order = useMemo(() => {
    const o = items.map((_, i) => i)
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[o[i], o[j]] = [o[j], o[i]]
    }
    return o
  }, [items])

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
        ?.setAttribute(
          'transform',
          `translate(${n.b.x.toFixed(1)} ${n.b.y.toFixed(1)})`,
        )
    const tip = tipRef.current
    const n = nodesRef.current.find((v) => v.item.id === activeRef.current)
    if (tip && n) {
      const { w } = sizeRef.current
      const x = clamp(n.b.x, 90, Math.max(90, w - 90))
      const above = n.b.y - n.r > 70
      tip.style.transform = `translate(${x}px, ${above ? n.b.y - n.r - 8 : n.b.y + n.r + 8}px) translate(-50%, ${above ? '-100%' : '0'})`
    }
  }

  // 노드 재구성 — 기존 위치 유지, 새 버블은 화면 전체 균등 무작위 위치·최종 크기로 등장(원본처럼 초기 겹침 허용, 중심 인력 없음)
  useEffect(() => {
    const { w, h } = size
    sizeRef.current = size
    if (!w || !h) return
    nodesRef.current = order.map((i) => {
      const it = items[i]
      const r = rs[i]
      let b = bodies.current.get(it.id)
      if (!b) {
        b = {
          x: r + Math.random() * Math.max(0, w - 2 * r),
          y: r + Math.random() * Math.max(0, h - 2 * r),
          vx: 0,
          vy: 0,
        }
        bodies.current.set(it.id, b)
        startRef.current = performance.now()
      }
      b.x = clamp(b.x, r, w - r)
      b.y = clamp(b.y, r, h - r)
      return { item: it, r, b }
    })
    if (reduced) {
      for (let i = 0; i < C.relax; i++) step(nodesRef.current, w, h, 0, null)
      for (const n of nodesRef.current) ((n.b.vx = 0), (n.b.vy = 0))
    }
    paint()
  }, [items, rs, size, reduced, order])

  // 애니메이션 루프 — 탭이 숨겨지면 rAF 자체가 멈춘다
  useEffect(() => {
    if (reduced) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const f = Math.min(C.maxDt, Math.max(0, (now - last) / (1000 / 60)))
      last = now
      const { w, h } = sizeRef.current
      const el = now - startRef.current
      if (w && h)
        step(
          nodesRef.current,
          w,
          h,
          C.drift,
          drag.current?.id ?? null,
          f,
          Math.min(C.pushMax, C.push + (el / C.settleMs) ** 4),
          Math.min(1, el / (C.rampMs * ((w * h) / C.speedRef ** 2))) ** 2,
        )
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
  // 필터·기간 변경으로 목록에서 빠진 버블의 툴팁이 남지 않게 해제
  useEffect(() => {
    if (activeRef.current && !items.some((v) => v.id === activeRef.current))
      activate(null)
  }, [items])

  const local = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const onDown = (e: React.PointerEvent, it: BubbleItem) => {
    if (e.button !== 0) return
    const p = local(e)
    drag.current = {
      id: it.id,
      domain: it.domain,
      x0: p.x,
      y0: p.y,
      px: p.x,
      py: p.y,
      moved: false,
    }
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

  const nodes = order.map((i) => ({ it: items[i], r: rs[i] }))
  const tag = (it: BubbleItem) =>
    it.sample ? sampleLabel : it.own ? ownLabel : adLabel

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
          {/* 외곽 링 그라데이션 — 색 띠 폭은 원본(외곽 ~14.5%)과 이전(~20%)의 중간 ~17%(2026-10-09 채도 40 기준 픽셀 측정) */}
          {PLAN_CD.map((p) => (
            <radialGradient
              key={p}
              id={`${uid}-${p}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={PLAN_COLOR[p]} stopOpacity={0} />
              <stop offset="68%" stopColor={PLAN_COLOR[p]} stopOpacity={0.06} />
              <stop offset="87%" stopColor={PLAN_COLOR[p]} stopOpacity={0.3} />
              <stop
                offset="100%"
                stopColor={PLAN_COLOR[p]}
                stopOpacity={0.85}
              />
            </radialGradient>
          ))}
        </defs>
        {nodes.map(({ it, r }) => {
          if (!r) return null
          const badge = PLAN_BADGE[it.plan]
          // 도메인 글자 — 폭(wk·r)·높이(hk·r) 상한에 맞추고, 9px 미만이면 .pi 생략 후 재시도
          const fit = (wk: number, hk: number) => {
            let text = it.domain
            let f = fitFont(text, r * wk, r * hk)
            if (f < C.minFont) {
              text = text.replace(/\.pi$/, '')
              f = fitFont(text, r * wk, r * hk)
            }
            return { text, f }
          }
          const big = fit(1.7, 0.3)
          const mid = fit(1.85, 0.42)
          const stage =
            r >= C.iconMinR && big.f >= C.minFont
              ? 3
              : mid.f >= C.minFont
                ? 2
                : r * 0.9 >= C.minFont
                  ? 1
                  : 0
          const nm = stage === 3 ? big : mid
          const ir = r * 0.2
          const iy = -r * 0.3
          const fBadge = clamp(r * 0.2, C.minFont, 13)
          const fPct = clamp(r * (stage === 3 ? 0.24 : 0.3), C.minFont, 26)
          return (
            <g
              key={it.id}
              ref={(el) => {
                if (el) gRefs.current.set(it.id, el)
                else gRefs.current.delete(it.id)
              }}
              className="bubble"
              data-stage={stage}
              style={{ color: PLAN_COLOR[it.plan] }}
              tabIndex={0}
              role="link"
              aria-label={`${it.domain}, ${badge ? `${tag(it)}, ` : ''}${planName(it)}, ${fmtViews(it)}, ${fmtPct(it.chgPct)}`}
              onPointerDown={(e) => onDown(e, it)}
              onPointerEnter={() => activate(it)}
              onPointerLeave={() =>
                activeRef.current === it.id && activate(null)
              }
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
                  fill={`url(#${uid}-${it.plan})`}
                  stroke={PLAN_COLOR[it.plan]}
                  strokeWidth={Math.max(1.5, r * 0.035)}
                />
                <g
                  pointerEvents="none"
                  fill="#fff"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {stage === 3 && badge && (
                    <text
                      y={-r * 0.62}
                      fontSize={fBadge}
                      fontWeight={700}
                      fill="rgba(255,255,255,0.7)"
                    >
                      {tag(it)} · {badge}
                    </text>
                  )}
                  {stage === 3 &&
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
                        <text
                          y={iy}
                          fontSize={Math.max(ir * 1.1, C.minFont)}
                          fontWeight={700}
                        >
                          {it.domain[0].toUpperCase()}
                        </text>
                      </>
                    ))}
                  {stage >= 2 && (
                    <>
                      <text
                        y={stage === 3 ? r * 0.08 : -r * 0.14}
                        fontSize={nm.f}
                        fontWeight={700}
                      >
                        {nm.text}
                      </text>
                      <text
                        y={stage === 3 ? r * 0.4 : r * 0.32}
                        fontSize={fPct}
                        fontWeight={600}
                        fill="#fff"
                        className="bubble-pct"
                      >
                        {fmtPct(it.chgPct)}
                      </text>
                    </>
                  )}
                  {stage === 1 && (
                    <text fontSize={Math.min(r * 0.9, 18)} fontWeight={700}>
                      {it.domain[0].toUpperCase()}
                    </text>
                  )}
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
                <span className="mr-1 rounded bg-amber-300/20 px-1 text-amber-200">
                  {tag(active)}
                </span>
              )}
              {planName(active)}
            </p>
            <p>
              {fmtViews(active)} ·{' '}
              <span style={{ color: TONE[toneOf(active.chgPct)] }}>
                {fmtPct(active.chgPct)}
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
