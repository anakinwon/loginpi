'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BeanIcon } from '@/components/ui/bean-icon'
import { piFetch } from '@/lib/pi-fetch'

interface RevenueData {
  pi_revenue: { total_pi: number; total_bean: number; charge_cnt: number }
  bean_by_item: { ref_tp_cd: string; txn_cnt: number; net_bean: number }[]
  bean_total: number
}

// 항목별 이모지·색 (콩 이모지 금지 — Bean 표시는 BeanIcon만). 라벨은 i18n(adminToken.revenue.item.*)
const ITEM_META: Record<string, { emoji: string; bar: string }> = {
  SUBSCR: { emoji: '🔄', bar: 'bg-purple-500' },
  TRANSLATE_ONCE: { emoji: '🌐', bar: 'bg-indigo-500' },
  AI_EXTRA: { emoji: '🤖', bar: 'bg-violet-500' },
  ROOM_CREATE: { emoji: '🏗️', bar: 'bg-blue-500' },
  ROOM_BOOST: { emoji: '🚀', bar: 'bg-orange-500' },
  ROOM_ENTER: { emoji: '🚪', bar: 'bg-cyan-500' },
  EVENT_ENTER: { emoji: '🎟️', bar: 'bg-amber-500' },
  STICKER_PACK: { emoji: '🎨', bar: 'bg-pink-500' },
  BADGE_UPGRADE: { emoji: '🏅', bar: 'bg-emerald-500' },
  ETC: { emoji: '❓', bar: 'bg-gray-400' },
}

// 항상 표시할 매출 라인업 (거래 없어도 0으로 노출). ETC는 거래 있을 때만 별도 추가.
const ALL_REVENUE_ITEMS = [
  'SUBSCR',
  'TRANSLATE_ONCE',
  'AI_EXTRA',
  'ROOM_CREATE',
  'ROOM_BOOST',
  'ROOM_ENTER',
  'EVENT_ENTER',
  'STICKER_PACK',
  'BADGE_UPGRADE',
] as const

export function TokenRevenue() {
  const t = useTranslations()
  const [data, setData] = useState<RevenueData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    piFetch('/api/admin/token/revenue')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<RevenueData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return (
      <p className="text-muted-foreground text-sm">
        {t('adminToken.revenue.aggregating')}
      </p>
    )
  if (error)
    return (
      <p className="text-sm text-red-500">
        {t('adminToken.revenue.errorMsg', { msg: error })}
      </p>
    )
  if (!data) return null

  // 정의된 전체 매출 라인업 — 거래 없는 항목도 0으로 표시(매출 0 자체가 정보)
  const dataMap = new Map(data.bean_by_item.map((it) => [it.ref_tp_cd, it]))
  const filled = ALL_REVENUE_ITEMS.map(
    (key) => dataMap.get(key) ?? { ref_tp_cd: key, txn_cnt: 0, net_bean: 0 },
  )
  // ALL_REVENUE_ITEMS에 없는 기타(ETC 등) 항목은 거래가 있을 때만 뒤에 추가
  const extras = data.bean_by_item.filter(
    (it) => !(ALL_REVENUE_ITEMS as readonly string[]).includes(it.ref_tp_cd),
  )
  const items = [...filled, ...extras].sort((a, b) => b.net_bean - a.net_bean)
  const maxBean = Math.max(...items.map((i) => i.net_bean), 1)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {t('adminToken.revenue.title')}
      </p>

      {/* 매출 2층위 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ① Pi 현금 매출 */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('adminToken.revenue.piCashLabel')}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            π {Number(data.pi_revenue.total_pi).toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('adminToken.revenue.piCashSub', {
              count: data.pi_revenue.charge_cnt,
            })}{' '}
            {Number(data.pi_revenue.total_bean).toLocaleString()}{' '}
            <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {t('adminToken.revenue.piCashNote')}
          </p>
        </div>

        {/* ② Bean 회수 매출 */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('adminToken.revenue.beanRecoveryLabel')}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums">
            <BeanIcon className="inline-block h-5 w-5" />{' '}
            {Number(data.bean_total).toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">
            ≈ π {(Number(data.bean_total) / 100).toFixed(2)} ·{' '}
            {t('adminToken.revenue.beanRecoverySub')}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {t('adminToken.revenue.beanRecoveryNote')}
          </p>
        </div>
      </div>

      {/* Bean 회수 항목별 막대 */}
      <div className="border-border rounded-lg border p-4">
        <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          {t('adminToken.revenue.byItem')}
        </p>
        <ul className="space-y-2.5">
          {items.map((it) => {
            const meta = ITEM_META[it.ref_tp_cd] ?? ITEM_META.ETC
            const labelKey = ITEM_META[it.ref_tp_cd] ? it.ref_tp_cd : 'ETC'
            const pct = Math.max(2, (it.net_bean / maxBean) * 100)
            const isZero = Number(it.net_bean) === 0
            const share =
              data.bean_total > 0
                ? ((it.net_bean / Number(data.bean_total)) * 100).toFixed(1)
                : '0.0'
            return (
              <li
                key={it.ref_tp_cd}
                className={`space-y-1 ${isZero ? 'opacity-45' : ''}`}
              >
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {meta.emoji} {t(`adminToken.revenue.item.${labelKey}`)}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {t('adminToken.revenue.itemCountShare', {
                        count: it.txn_cnt,
                        share,
                      })}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Number(it.net_bean).toLocaleString()}{' '}
                    <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
                  </span>
                </div>
                <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${meta.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>

        {/* Bean 회수 매출 합계 */}
        <div className="mt-3 flex items-baseline justify-between border-t pt-2.5 text-sm font-bold">
          <span>{t('adminToken.revenue.beanRecoveryTotal')}</span>
          <span className="tabular-nums">
            {Number(data.bean_total).toLocaleString()}{' '}
            <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              ≈ π{(Number(data.bean_total) / 100).toFixed(2)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
