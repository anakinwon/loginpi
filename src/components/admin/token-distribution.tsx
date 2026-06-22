'use client'

import { useEffect, useState } from 'react'
import { BeanIcon } from '@/components/ui/bean-icon'

interface TypeRow {
  txn_tp_cd: string
  txn_cnt: number
  gross_bean: number
  net_bean: number
  usr_cnt: number
}

interface DistributionData {
  by_type: TypeRow[]
  total_cnt: number
  total_gross_bean: number
}

// 거래 유형별 메타 (콩 이모지 금지 — Bean 표시는 BeanIcon만)
// flow: in(유입 — USER 지갑 증가) / out(소비 — 거버넌스 회수) / move(이동 — 순증감 0)
type Flow = 'in' | 'out' | 'move'
const TYPE_META: Record<
  string,
  { label: string; emoji: string; bar: string; flow: Flow }
> = {
  CHARGE: { label: '충전', emoji: '💳', bar: 'bg-blue-500', flow: 'in' },
  REWARD: { label: '보상 지급', emoji: '🎁', bar: 'bg-teal-500', flow: 'in' },
  REFUND: { label: '환불', emoji: '↩️', bar: 'bg-amber-500', flow: 'in' },
  SPEND: {
    label: '사용 (소비)',
    emoji: '🛒',
    bar: 'bg-purple-500',
    flow: 'out',
  },
  TRANSFER: {
    label: 'P2P 선물',
    emoji: '🤝',
    bar: 'bg-pink-500',
    flow: 'move',
  },
  ETC: { label: '기타', emoji: '❓', bar: 'bg-gray-400', flow: 'move' },
}

const FLOW_BADGE: Record<Flow, { label: string; cls: string }> = {
  in: {
    label: '유입',
    cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  },
  out: {
    label: '회수',
    cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  },
  move: {
    label: '이동',
    cls: 'bg-muted text-muted-foreground',
  },
}

export function TokenDistribution() {
  const [data, setData] = useState<DistributionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/token/distribution')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DistributionData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return <p className="text-muted-foreground text-sm">분포 집계 중...</p>
  if (error) return <p className="text-sm text-red-500">분포 오류: {error}</p>
  if (!data) return null

  // gross(움직인 총량) 내림차순 — 분포 비율의 기준
  const items = [...data.by_type].sort((a, b) => b.gross_bean - a.gross_bean)
  const maxGross = Math.max(...items.map((i) => Number(i.gross_bean)), 1)
  const totalGross = Number(data.total_gross_bean)

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          거래 유형별 분포
        </p>
        <p className="text-muted-foreground border-border rounded-lg border p-4 text-sm">
          아직 Bean 거래가 없습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        거래 유형별 분포
      </p>

      <div className="border-border rounded-lg border p-4">
        <p className="text-muted-foreground mb-3 text-xs">
          전체 {data.total_cnt.toLocaleString()}건 · 총거래량{' '}
          {totalGross.toLocaleString()}{' '}
          <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
          (절댓값 합 — 충전·사용·보상·환불·전송 포함)
        </p>

        <ul className="space-y-2.5">
          {items.map((it) => {
            const meta = TYPE_META[it.txn_tp_cd] ?? TYPE_META.ETC
            const gross = Number(it.gross_bean)
            const net = Number(it.net_bean)
            const pct = Math.max(2, (gross / maxGross) * 100)
            const share =
              totalGross > 0 ? ((gross / totalGross) * 100).toFixed(1) : '0.0'
            const badge = FLOW_BADGE[meta.flow]
            return (
              <li key={it.txn_tp_cd} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <span className="shrink-0">
                      {meta.emoji} {meta.label}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {it.txn_cnt.toLocaleString()}건 ·{' '}
                      {it.usr_cnt.toLocaleString()}명 · {share}%
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-semibold tabular-nums">
                      {gross.toLocaleString()}{' '}
                      <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
                    </span>
                    {/* 순증감(net): 유입 +초록 / 회수 -보라 / 이동 0 회색 */}
                    <span
                      className={`ml-2 text-xs tabular-nums ${
                        net > 0
                          ? 'text-green-600 dark:text-green-400'
                          : net < 0
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      순 {net > 0 ? '+' : ''}
                      {net.toLocaleString()}
                    </span>
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

        <p className="text-muted-foreground mt-3 border-t pt-2.5 text-[11px]">
          막대 길이·비율 = 유형별 총거래량(gross) 점유율 · 순증감(net) = 사용자
          지갑 기준 부호 합(유입 +, 회수 −, 이동 0)
        </p>
      </div>
    </div>
  )
}
