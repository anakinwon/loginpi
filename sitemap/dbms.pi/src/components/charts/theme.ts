// 차트 공용 색·option 조각(순수 상수) — 다크 표면(#161a24) 기준. 상태색은 상태 뜻일 때만, 범주색은 고정 순서(파랑→주황→청록→노랑)
//  범주 4색은 dataviz 검증기 dark·surface #161a24 전 항목 통과(2026-11-01). 폭 480px 미만이면 narrow — 범례·축 라벨을 작게(범례는 숨기지 않음 — 계열을 색만으로 구분하지 않게)
export const C = {
  ok: '#0ca30c',
  warn: '#fab219',
  risk: '#d03b3b',
  unknown: '#898781',
  na: '#2a2f3d',
  blue: '#3987e5',
  blueDk: '#184f95',
  blueLt: '#86b6ef',
  gray: '#898781',
  grid: '#222838',
  text: '#a1a1a1',
  ink: '#e5e5e5',
  surface: '#161a24',
} as const
// 범주색(고정 순서) — 계열 수가 늘어도 앞 계열 색은 그대로
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const
export const NARROW_PX = 480

// 모든 차트 공통 — 투명 배경·글자색·aria(+decal 무늬로 색 외 구분)·툴팁 모양
export const base = (narrow: boolean) => ({
  backgroundColor: 'transparent',
  textStyle: { color: C.text, fontSize: narrow ? 10 : 12 },
  aria: { enabled: true, decal: { show: true } },
  tooltip: {
    backgroundColor: C.grid,
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: { color: C.ink, fontSize: 12 },
    confine: true,
  },
  legend: {
    show: true,
    type: 'scroll' as const,
    top: 0,
    textStyle: { color: C.text, fontSize: narrow ? 10 : 12 },
    icon: 'roundRect',
    itemWidth: narrow ? 10 : 12,
    itemHeight: 8,
    itemGap: narrow ? 6 : 10,
  },
})
export const axisLine = { lineStyle: { color: C.grid } }
export const splitLine = {
  lineStyle: { color: C.grid, type: 'dashed' as const },
}
export const timeAxis = (narrow: boolean, gridIndex = 0) => ({
  type: 'time' as const,
  gridIndex,
  axisLine,
  axisLabel: { color: C.text, hideOverlap: true, fontSize: narrow ? 10 : 11 },
  splitLine: { show: false },
})
export const valAxis = (
  narrow: boolean,
  fmt?: (v: number) => string,
  gridIndex = 0,
) => ({
  type: 'value' as const,
  gridIndex,
  axisLine: { show: false },
  splitLine,
  axisLabel: {
    color: C.text,
    fontSize: narrow ? 10 : 11,
    ...(fmt ? { formatter: fmt } : {}),
  },
})
// 긴 이름 축약(축 라벨) — narrow 면 더 짧게
export const short = (s: string, narrow: boolean) => {
  const n = narrow ? 12 : 28
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
