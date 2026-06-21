'use client'

import { useEffect, useState } from 'react'
import { BeanIcon } from '@/components/ui/bean-icon'

interface RevenueData {
  pi_revenue: { total_pi: number; total_bean: number; charge_cnt: number }
  bean_by_item: { ref_tp_cd: string; txn_cnt: number; net_bean: number }[]
  bean_total: number
}

// 항목별 라벨·색 (콩 이모지 금지 — Bean 표시는 BeanIcon만)
const ITEM_META: Record<string, { label: string; emoji: string; bar: string }> =
  {
    SUBSCR: { label: '구독', emoji: '🔄', bar: 'bg-purple-500' },
    TRANSLATE_ONCE: { label: '번역(건당)', emoji: '🌐', bar: 'bg-indigo-500' },
    AI_EXTRA: { label: 'AI 추가호출', emoji: '🤖', bar: 'bg-violet-500' },
    ROOM_CREATE: { label: '카페 생성', emoji: '🏗️', bar: 'bg-blue-500' },
    ROOM_BOOST: { label: '카페 부스트', emoji: '🚀', bar: 'bg-orange-500' },
    ROOM_ENTER: { label: '카페 입장', emoji: '🚪', bar: 'bg-cyan-500' },
    EVENT_ENTER: { label: '이벤트 입장', emoji: '🎟️', bar: 'bg-amber-500' },
    STICKER_PACK: { label: '스티커팩', emoji: '🎨', bar: 'bg-pink-500' },
    BADGE_UPGRADE: { label: '뱃지 강화', emoji: '🏅', bar: 'bg-emerald-500' },
    ETC: { label: '기타', emoji: '❓', bar: 'bg-gray-400' },
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
  const [data, setData] = useState<RevenueData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/token/revenue')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<RevenueData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return <p className="text-muted-foreground text-sm">매출 집계 중...</p>
  if (error) return <p className="text-sm text-red-500">매출 오류: {error}</p>
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
        매출 분석
      </p>

      {/* 매출 2층위 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ① Pi 현금 매출 */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Pi 현금 매출 (충전)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            π {Number(data.pi_revenue.total_pi).toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">
            충전 {data.pi_revenue.charge_cnt}건 · 발행{' '}
            {Number(data.pi_revenue.total_bean).toLocaleString()}{' '}
            <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            외부에서 유입된 유일한 현금
          </p>
        </div>

        {/* ② Bean 회수 매출 */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Bean 회수 매출 (소비)
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums">
            <BeanIcon className="inline-block h-5 w-5" />{' '}
            {Number(data.bean_total).toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">
            ≈ π {(Number(data.bean_total) / 100).toFixed(2)} · 거버넌스 회수
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            충전분의 수익 실현 (이연수익)
          </p>
        </div>
      </div>

      {/* Bean 회수 항목별 막대 */}
      <div className="border-border rounded-lg border p-4">
        <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Bean 회수 매출 — 항목별
        </p>
        <ul className="space-y-2.5">
          {items.map((it) => {
            const meta = ITEM_META[it.ref_tp_cd] ?? ITEM_META.ETC
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
                    {meta.emoji} {meta.label}
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {it.txn_cnt}건 · {share}%
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
          <span>Bean 회수 매출 합계</span>
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
