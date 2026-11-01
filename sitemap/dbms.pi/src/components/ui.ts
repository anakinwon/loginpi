// dbms.pi 공용 버튼 클래스 — 로그인·연동 화면이 같은 모양을 쓰게 한 곳에 둔다
export const BTN_PRIMARY =
  'bg-accent inline-grid h-11 place-items-center rounded-full px-5 font-semibold text-white disabled:opacity-50'
export const BTN =
  'bg-surface-raised inline-grid h-10 place-items-center rounded-lg px-4 text-sm disabled:opacity-50'
// 상태 배지(색 + 아이콘 + 라벨 동시) — ops 화면 LEVEL_CLS 와 같은 색 + 확인 불가·해당 없음. 아이콘은 LEVEL_ICON
export const LEVEL = {
  RISK: 'bg-red-500/15 text-red-400',
  WARN: 'bg-amber-500/15 text-amber-400',
  OK: 'bg-emerald-500/15 text-emerald-400',
  UNKNOWN: 'text-muted-foreground border border-dashed border-white/25',
  NA: 'text-muted-foreground',
} as const
export const LEVEL_ICON = {
  RISK: '✕',
  WARN: '▲',
  OK: '✓',
  UNKNOWN: '?',
  NA: '–',
} as const
// 신호 카드 테두리
export const LEVEL_CARD = {
  RISK: 'border-2 border-red-500/60',
  WARN: 'border border-amber-500/50',
  OK: 'border border-transparent',
  UNKNOWN: 'border border-dashed border-white/25',
  NA: 'border border-transparent',
} as const
