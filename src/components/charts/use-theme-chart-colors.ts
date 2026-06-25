'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

// 활성 UI 테마의 차트 색(--chart-1~5)을 읽어 반환.
// Plotly는 CSS 변수를 직접 못 쓰므로 getComputedStyle로 실제 값을 읽는다.
// [data-admin-theme] 스코프에서 읽어 관리자 테마 색을 반영하고,
// 다크모드 전환 시(resolvedTheme 변경) 재계산한다.
const FALLBACK = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6']

export function useThemeChartColors(): string[] {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<string[]>(FALLBACK)

  useEffect(() => {
    const el = document.querySelector('[data-admin-theme]')
    if (!el) return
    const styles = getComputedStyle(el)
    const next = [1, 2, 3, 4, 5].map((n, i) => {
      const v = styles.getPropertyValue(`--chart-${n}`).trim()
      return v || FALLBACK[i]
    })
    setColors(next)
  }, [resolvedTheme])

  return colors
}
