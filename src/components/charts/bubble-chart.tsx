'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

// cryptobubbles.net 영감 버블 차트 (Phase 22 §12 ①).
//   원 면적(반지름 ∝ √value)으로 비중 표현 + 아르키메데스 나선 패킹(충돌 회피).
//   각 버블 내부: 이모지 · 라벨 · 비중%. 버블별 CSS float 애니메이션으로 부유감.
//   순수 SVG/CSS — Plotly 불필요(번들 무관), 반응형(viewBox 자동 맞춤).

export interface BubbleItem {
  label: string
  value: number
  color?: string
  emoji?: string
}

interface Placed {
  x: number
  y: number
  r: number
  item: BubbleItem
  pct: number
}

// 나선 패킹 — 값 내림차순으로 중앙부터 충돌 없는 위치에 배치
function packBubbles(items: BubbleItem[]): Placed[] {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total <= 0) return []
  const max = Math.max(...items.map((i) => i.value))
  const sorted = [...items]
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)

  const placed: Placed[] = []
  for (const item of sorted) {
    // 반지름: √(value/max)*100, 최소 16 (작은 항목도 가독)
    const r = Math.max(16, Math.sqrt(item.value / max) * 100)
    const pct = (item.value / total) * 100
    if (placed.length === 0) {
      placed.push({ x: 0, y: 0, r, item, pct })
      continue
    }
    let angle = 0
    let dist = 0
    const step = Math.max(2, r * 0.5)
    let put = false
    for (let i = 0; i < 4000; i++) {
      const x = Math.cos(angle) * dist
      const y = Math.sin(angle) * dist
      const ok = placed.every(
        (p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 3,
      )
      if (ok) {
        placed.push({ x, y, r, item, pct })
        put = true
        break
      }
      angle += 0.35
      dist += step * 0.04
    }
    if (!put) placed.push({ x: dist, y: 0, r, item, pct }) // 폴백
  }
  return placed
}

export default function BubbleChart({ items }: { items: BubbleItem[] }) {
  const t = useTranslations('adminAnalytics.charts')
  const { placed, viewBox } = useMemo(() => {
    const p = packBubbles(items)
    if (p.length === 0) return { placed: p, viewBox: '0 0 100 100' }
    const pad = 8
    const minX = Math.min(...p.map((b) => b.x - b.r)) - pad
    const maxX = Math.max(...p.map((b) => b.x + b.r)) + pad
    const minY = Math.min(...p.map((b) => b.y - b.r)) - pad
    const maxY = Math.max(...p.map((b) => b.y + b.r)) + pad
    return {
      placed: p,
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    }
  }, [items])

  if (placed.length === 0)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t('bubbleEmpty')}
      </p>
    )

  return (
    <div className="w-full">
      <style>{`@keyframes bubbleFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`}</style>
      <svg
        viewBox={viewBox}
        className="h-[340px] w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* 색 무관 3D 구체 셰이딩 — 상단 하이라이트 + 가장자리 음영(objectBoundingBox 자동 스케일) */}
          <radialGradient id="bubbleHi" cx="35%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.65" />
            <stop offset="35%" stopColor="#fff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bubbleRim" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
          </radialGradient>
          {/* 부유 그림자 — 입체 분리감 */}
          <filter id="bubbleShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="1.2"
              stdDeviation="1.6"
              floodColor="#000"
              floodOpacity="0.3"
            />
          </filter>
        </defs>
        {placed.map((b, i) => {
          const fill = b.item.color ?? '#94a3b8'
          const showLabel = b.r > 34
          const showPct = b.r > 24
          const showEmoji = b.r > 18 && !!b.item.emoji
          return (
            <g
              key={`${b.item.label}-${i}`}
              style={{
                transformOrigin: `${b.x}px ${b.y}px`,
                animation: `bubbleFloat ${3 + (i % 5) * 0.6}s ease-in-out ${(i % 7) * 0.3}s infinite`,
              }}
            >
              <title>{`${b.item.label} · ${b.pct.toFixed(1)}%`}</title>
              {/* 1) 반투명 80% 베이스 색 구 + 그림자 */}
              <circle
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill={fill}
                fillOpacity={0.8}
                filter="url(#bubbleShadow)"
              />
              {/* 2) 가장자리 음영(구 볼륨) */}
              <circle cx={b.x} cy={b.y} r={b.r} fill="url(#bubbleRim)" />
              {/* 3) 상단 광택 하이라이트 */}
              <circle cx={b.x} cy={b.y} r={b.r} fill="url(#bubbleHi)" />
              {/* 4) 정반사 스페큘러 점 */}
              <ellipse
                cx={b.x - b.r * 0.32}
                cy={b.y - b.r * 0.4}
                rx={b.r * 0.22}
                ry={b.r * 0.14}
                fill="#fff"
                fillOpacity={0.55}
              />
              {showEmoji && (
                <text
                  x={b.x}
                  y={b.y - (showLabel ? b.r * 0.28 : showPct ? b.r * 0.18 : 0)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.min(b.r * 0.5, 22)}
                >
                  {b.item.emoji}
                </text>
              )}
              {showLabel && (
                <text
                  x={b.x}
                  y={b.y + b.r * 0.08}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.max(7, Math.min(b.r * 0.2, 13))}
                  fill="#fff"
                  fontWeight={600}
                  style={{ pointerEvents: 'none' }}
                >
                  {b.item.label.length > 7
                    ? b.item.label.slice(0, 6) + '…'
                    : b.item.label}
                </text>
              )}
              {showPct && (
                <text
                  x={b.x}
                  y={b.y + (showLabel ? b.r * 0.34 : b.r * 0.12)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.max(7, Math.min(b.r * 0.22, 14))}
                  fill="#fff"
                  fontWeight={700}
                  style={{ pointerEvents: 'none' }}
                >
                  {b.pct.toFixed(b.pct >= 10 ? 0 : 1)}%
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
