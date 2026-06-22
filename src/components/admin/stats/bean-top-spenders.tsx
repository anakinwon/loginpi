'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { BeanIcon } from '@/components/ui/bean-icon'

// 홈/통계 대시보드 'Top-3 지출자' — Pi 결제 랭킹을 Bean 소비액 랭킹으로 교체.
// self-contained: 자체 piFetch(period) + 비관리자 이름 마스킹은 서버(API)에서 처리.
interface BeanSpender {
  usr_id: string
  display_nm: string
  total_bean: number
  txn_cnt: number
}

const MEDALS = ['🥇', '🥈', '🥉']

export function BeanTopSpenders({ period }: { period: number }) {
  const t = useTranslations('adminStats')
  const [spenders, setSpenders] = useState<BeanSpender[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    piFetch(`/api/admin/stats/bean-spenders?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ spenders: BeanSpender[] }>
      })
      .then((d) => {
        if (alive) setSpenders(d.spenders ?? [])
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
      <p className="mb-3 text-sm font-semibold">
        {t('top3Buyers', { period })}
      </p>

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
          {spenders.map((s, i) => (
            <li key={s.usr_id || i} className="flex items-center gap-2 text-sm">
              <span className="text-base">{MEDALS[i] ?? `${i + 1}.`}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {s.display_nm}
              </span>
              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 tabular-nums">
                {s.total_bean.toLocaleString()}
                <BeanIcon className="inline-block h-4 w-4" />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
