'use client'

import { cn } from '@/lib/utils'

const PERIODS = [
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
  { value: 365, label: '1년' },
] as const

interface Props {
  period: number
  onChange: (period: number) => void
  disabled?: boolean
}

export function StatsDateFilter({ period, onChange, disabled }: Props) {
  return (
    <div className="flex gap-1">
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          disabled={disabled}
          className={cn(
            'rounded-md px-3 py-1 text-sm transition-colors disabled:opacity-50',
            period === value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
