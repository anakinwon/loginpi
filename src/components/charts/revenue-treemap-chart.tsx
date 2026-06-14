'use client'

import { useMemo } from 'react'
import { themeLabel, themeColorMap } from '@/lib/stats-labels'
import type { RevenueDataPoint } from '@/types/stats'

// coin360 스타일 트리맵 — 면적 = 테마별 매출 비중. 색은 도넛 차트와 동일 팔레트로
// 테마 코드에 고정(themeColorMap)해 두 차트의 테마 색을 일치시킨다.
// plotly.js-basic 번들에 treemap이 없어 순수 CSS로 squarified treemap을 직접 구현.

interface Props {
  data: RevenueDataPoint[]
}

interface Item {
  cd: string
  label: string
  value: number
  color: string
}
interface Tile extends Item {
  pct: number
  x: number
  y: number
  w: number
  h: number
}

// Squarified treemap (Bruls et al.) — 좌표·크기는 % 단위(W=H=100)로 반환해 반응형 유지.
function squarify(items: Item[], W = 100, H = 100): Tile[] {
  const total = items.reduce((s, d) => s + d.value, 0)
  if (total <= 0) return []

  const scaled = [...items]
    .sort((a, b) => b.value - a.value)
    .map((d) => ({
      ...d,
      pct: d.value / total,
      area: (d.value / total) * W * H,
    }))

  // 행의 최악 종횡비(작을수록 정사각형에 가까움)
  const worst = (row: { area: number }[], side: number) => {
    const sum = row.reduce((s, t) => s + t.area, 0)
    const mx = Math.max(...row.map((t) => t.area))
    const mn = Math.min(...row.map((t) => t.area))
    return Math.max(
      (side * side * mx) / (sum * sum),
      (sum * sum) / (side * side * mn),
    )
  }

  const out: Tile[] = []
  let x = 0
  let y = 0
  let w = W
  let h = H
  let i = 0

  while (i < scaled.length) {
    const side = Math.min(w, h)
    const row = [scaled[i]]
    let j = i + 1
    // 종횡비가 더 나빠지기 직전까지 같은 행에 채운다
    while (
      j < scaled.length &&
      worst([...row, scaled[j]], side) <= worst(row, side)
    ) {
      row.push(scaled[j])
      j++
    }

    const rowArea = row.reduce((s, t) => s + t.area, 0)
    if (w >= h) {
      // 세로 컬럼을 왼쪽에 배치 (폭 = rowArea / h)
      const colW = rowArea / h
      let cy = y
      for (const t of row) {
        const th = (t.area / rowArea) * h
        out.push({
          cd: t.cd,
          label: t.label,
          value: t.value,
          color: t.color,
          pct: t.pct,
          x,
          y: cy,
          w: colW,
          h: th,
        })
        cy += th
      }
      x += colW
      w -= colW
    } else {
      // 가로 행을 위쪽에 배치 (높이 = rowArea / w)
      const rowH = rowArea / w
      let cx = x
      for (const t of row) {
        const tw = (t.area / rowArea) * w
        out.push({
          cd: t.cd,
          label: t.label,
          value: t.value,
          color: t.color,
          pct: t.pct,
          x: cx,
          y,
          w: tw,
          h: rowH,
        })
        cx += tw
      }
      y += rowH
      h -= rowH
    }
    i = j
  }
  return out
}

export default function RevenueTreemapChart({ data }: Props) {
  const tiles = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of data) map[r.theme_cd] = (map[r.theme_cd] ?? 0) + r.rev_pi
    // 도넛과 동일한 키 순서(데이터 등장 순)로 색 매핑 → 테마별 색 일치
    const allCds = Object.keys(map)
    const colorOf = themeColorMap(allCds)
    const items: Item[] = allCds
      .filter((cd) => map[cd] > 0)
      .map((cd) => ({
        cd,
        label: themeLabel(cd),
        value: map[cd],
        color: colorOf[cd],
      }))
    return squarify(items)
  }, [data])

  if (tiles.length === 0)
    return <div className="bg-muted h-80 animate-pulse rounded-lg" />

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg"
      style={{ height: 320 }}
    >
      {tiles.map((t) => (
        <div
          key={t.cd}
          className="absolute flex flex-col items-center justify-center overflow-hidden border border-black/30 p-1 text-center transition-opacity hover:opacity-90"
          style={{
            left: `${t.x}%`,
            top: `${t.y}%`,
            width: `${t.w}%`,
            height: `${t.h}%`,
            background: t.color,
          }}
          title={`${t.label} · ${t.value.toFixed(4)} π · ${(t.pct * 100).toFixed(1)}%`}
        >
          {t.w > 11 && t.h > 11 && (
            <>
              <span className="max-w-full truncate text-xs font-bold text-white drop-shadow-sm">
                {t.label}
              </span>
              <span className="text-[10px] font-semibold text-white/90">
                {(t.pct * 100).toFixed(1)}%
              </span>
              {t.h > 22 && (
                <span className="text-[10px] text-white/80">
                  {t.value.toFixed(2)} π
                </span>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
