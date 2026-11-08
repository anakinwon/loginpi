'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

// 기간 필터 — 레이블은 adminStats.period* 번역키 사용
const PERIODS = [
  { value: 7, labelKey: 'period7' },
  { value: 30, labelKey: 'period30' },
  { value: 90, labelKey: 'period90' },
  { value: 365, labelKey: 'period365' },
] as const

interface Props {
  period: number
  onChange: (period: number) => void
  disabled?: boolean
}

export function StatsDateFilter({ period, onChange, disabled }: Props) {
  const t = useTranslations('adminStats')

  return (
    <div className="flex gap-1">
      {PERIODS.map(({ value, labelKey }) => (
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
          {t(labelKey)}
        </button>
      ))}
    </div>
  )
}
