'use client'

import { cn } from '@/lib/utils'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('ko-KR')
}

export type StatsCardVariant =
  | 'default'
  | 'kpi-1'
  | 'kpi-2'
  | 'kpi-3'
  | 'kpi-4'
  | 'kpi-5'

// 정적 리터럴 맵 — Tailwind JIT가 클래스를 인식하도록 동적 조합 대신 리터럴 사용
const KPI_BG: Record<Exclude<StatsCardVariant, 'default'>, string> = {
  'kpi-1': 'bg-[var(--kpi-1)]',
  'kpi-2': 'bg-[var(--kpi-2)]',
  'kpi-3': 'bg-[var(--kpi-3)]',
  'kpi-4': 'bg-[var(--kpi-4)]',
  'kpi-5': 'bg-[var(--kpi-5)]',
}

interface StatsCardProps {
  label: string
  value: number | string
  unit?: string
  unitNode?: React.ReactNode // 단위를 컴포넌트로 표시(예: <BeanIcon/>). unit보다 우선
  sub?: string
  className?: string
  loading?: boolean
  variant?: StatsCardVariant // KPI 파스텔 배경 (UI 테마 색 따름)
  icon?: React.ReactNode // 카드 우상단 아이콘 슬롯
}

export function StatsCard({
  label,
  value,
  unit,
  unitNode,
  sub,
  className,
  loading,
  variant = 'default',
  icon,
}: StatsCardProps) {
  const isKpi = variant !== 'default'
  // 파스텔 배경 위에서는 진한 슬레이트 텍스트로 가독성 확보(라이트/다크 공통)
  const base = isKpi
    ? cn(
        'rounded-xl p-5 shadow-sm',
        KPI_BG[variant],
        'text-slate-900 dark:text-slate-50',
      )
    : 'rounded-lg border p-4'

  if (loading) {
    return (
      <div className={cn('space-y-2', base, className)}>
        <div className="bg-muted/60 h-4 w-20 animate-pulse rounded" />
        <div className="bg-muted/60 h-8 w-14 animate-pulse rounded" />
        <div className="bg-muted/60 h-3 w-24 animate-pulse rounded" />
      </div>
    )
  }

  const display = typeof value === 'number' ? fmt(value) : value
  const subText = isKpi ? 'opacity-70' : 'text-muted-foreground'

  return (
    <div className={cn(base, className)}>
      {icon && <div className="mb-2 flex justify-end opacity-60">{icon}</div>}
      <p
        className={cn(
          'text-sm',
          isKpi ? 'opacity-75' : 'text-muted-foreground',
        )}
      >
        {label}
      </p>
      <p className={cn('mt-1 font-bold', isKpi ? 'text-3xl' : 'text-2xl')}>
        {display}
        {unitNode ? (
          <span className={cn('ml-1 text-sm font-normal', subText)}>
            {unitNode}
          </span>
        ) : (
          unit && (
            <span className={cn('ml-1 text-sm font-normal', subText)}>
              {unit}
            </span>
          )
        )}
      </p>
      {sub && <p className={cn('mt-1 text-xs', subText)}>{sub}</p>}
    </div>
  )
}
