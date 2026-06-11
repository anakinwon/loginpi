'use client'

import { cn } from '@/lib/utils'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('ko-KR')
}

interface StatsCardProps {
  label: string
  value: number | string
  unit?: string
  sub?: string
  className?: string
  loading?: boolean
}

export function StatsCard({
  label,
  value,
  unit,
  sub,
  className,
  loading,
}: StatsCardProps) {
  if (loading) {
    return (
      <div className={cn('space-y-2 rounded-lg border p-4', className)}>
        <div className="bg-muted h-4 w-20 animate-pulse rounded" />
        <div className="bg-muted h-8 w-14 animate-pulse rounded" />
        <div className="bg-muted h-3 w-24 animate-pulse rounded" />
      </div>
    )
  }

  const display = typeof value === 'number' ? fmt(value) : value

  return (
    <div className={cn('rounded-lg border p-4', className)}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {display}
        {unit && (
          <span className="text-muted-foreground ml-1 text-sm font-normal">
            {unit}
          </span>
        )}
      </p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
    </div>
  )
}
