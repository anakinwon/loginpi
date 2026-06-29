'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import type { RevenueStatsResponse } from '@/types/stats'

const MEDALS = ['🥇', '🥈', '🥉']

// PI 결제 모드 전용 Top-3 구매왕 — fn_top_spenders(pi_pymnt 집계) 기반.
// Bean 모드의 BeanTopSpenders와 쌍을 이루며 feeMode에 따라 교체된다.
export function PiTopSpenders({ period }: { period: number }) {
  const t = useTranslations('adminStats')
  const [spenders, setSpenders] = useState<RevenueStatsResponse['topSpenders']>(
    [],
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    piFetch(`/api/admin/stats/revenue?period=${period}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<RevenueStatsResponse>) : Promise.reject(),
      )
      .then((d) => {
        if (alive) setSpenders(d.topSpenders ?? [])
      })
      .catch(() => {
        if (alive) setSpenders([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [period])

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{t('top3Buyers', { period })}</p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          π Pi 결제
        </span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="bg-muted h-5 w-5 animate-pulse rounded" />
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              <div className="bg-muted ml-auto h-4 w-14 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : spenders.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
      ) : (
        <ol className="space-y-2">
          {spenders.slice(0, 3).map((s, i) => (
            <li key={s.usr_id || i} className="flex items-center gap-2 text-sm">
              <span className="text-base">{MEDALS[i] ?? `${i + 1}.`}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {s.display_nm}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {s.total_pi.toFixed(2)}{' '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  π
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
