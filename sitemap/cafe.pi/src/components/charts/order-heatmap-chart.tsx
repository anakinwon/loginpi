'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

// 요일×시간 주문 밀도 히트맵 (Phase 22 §12 ②).
//   plotly-basic 번들에 heatmap trace가 없어 CSS 그리드로 구현(treemap 선례).
//   heatmap[dow(0=일)][hour(0~23)] = 주문 건수. 색은 --primary 농도로 표현.

export default function OrderHeatmapChart({
  heatmap,
}: {
  heatmap: number[][]
}) {
  const t = useTranslations('adminAnalytics.charts')
  const DOW = t('dow').split(',')
  const max = useMemo(() => Math.max(1, ...heatmap.flat()), [heatmap])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* 시간 헤더 */}
        <div className="mb-1 flex">
          <div className="w-7 shrink-0" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="text-muted-foreground flex-1 text-center text-[9px]"
            >
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {heatmap.map((row, d) => (
          <div key={d} className="mb-px flex items-center">
            <div className="text-muted-foreground w-7 shrink-0 text-center text-[10px]">
              {DOW[d]}
            </div>
            {row.map((v, h) => {
              const intensity = v / max
              return (
                <div key={h} className="flex-1 px-px">
                  <div
                    title={`${DOW[d]} ${h}:00 · ${v}`}
                    className="h-4 rounded-sm"
                    style={{
                      background:
                        v === 0
                          ? 'var(--muted)'
                          : `color-mix(in srgb, var(--primary) ${Math.round(15 + intensity * 85)}%, transparent)`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-center text-[10px]">
        {t('heatNote', { max })}
      </p>
    </div>
  )
}
