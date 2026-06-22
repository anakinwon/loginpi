'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
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
  // 구독료 — 상품 구독 차감(SPEND군: USER 감소 → 거버넌스 회수)
  SUBSCRIBE: {
    label: '구독료',
    emoji: '📅',
    bar: 'bg-indigo-500',
    flow: 'out',
  },
  // 팁 — fn_bean_apply의 'TIP'(SPEND군 거버넌스 회수). P2P 선물(TRANSFER)과 별개
  TIP: { label: '팁', emoji: '💝', bar: 'bg-rose-500', flow: 'out' },
  // 수수료 — 플랫폼 수수료(SPEND군 회수)
  FEE: { label: '수수료', emoji: '🧾', bar: 'bg-orange-500', flow: 'out' },
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

// 분포 막대 리스트 — 데이터 확정 후에만 렌더(정렬·비율 계산 분리)
function BeanDistList({ data }: { data: DistributionData }) {
  // gross(움직인 총량) 내림차순 — 분포 비율의 기준
  const items = [...data.by_type].sort((a, b) => b.gross_bean - a.gross_bean)
  const maxGross = Math.max(...items.map((i) => Number(i.gross_bean)), 1)
  const totalGross = Number(data.total_gross_bean)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        전체 {data.total_cnt.toLocaleString()}건 · 총거래량{' '}
        {totalGross.toLocaleString()}{' '}
        <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
        (절댓값 합 — 충전·사용·구독료·팁·수수료·보상·환불·전송 등 전 유형)
      </p>

      <ul className="space-y-2.5">
        {items.map((it) => {
          const known = TYPE_META[it.txn_tp_cd]
          const meta = known ?? TYPE_META.ETC
          // 미매핑 코드는 '기타'로 뭉뚱그리지 않고 원본 코드를 노출해 추적 가능하게
          const label = known ? known.label : `${meta.label} (${it.txn_tp_cd})`
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
                    {meta.emoji} {label}
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

      <p className="text-muted-foreground border-t pt-2.5 text-[11px]">
        막대 길이·비율 = 유형별 총거래량(gross) 점유율 · 순증감(net) = 사용자
        지갑 기준 부호 합(유입 +, 회수 −, 이동 0)
      </p>
    </div>
  )
}

// Bean 거래 유형별 분포 — 메인 대시보드 '매출 분포'(테마 도넛/트리맵)를 대체.
// self-contained: period(최근 N일) prop으로 자체 piFetch 후 갱신. 단위는 Bean(BeanIcon).
// 분류축 = txn_tp_cd(충전·사용·보상·환불·전송). 매출 회수 부분집합이 아닌 활동 전반.
export function BeanRevenueDistribution({ period }: { period: number }) {
  const [data, setData] = useState<DistributionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    piFetch(`/api/admin/token/distribution?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DistributionData>
      })
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
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
      <p className="mb-2 text-sm font-medium">Bean 거래 분포</p>
      {loading ? (
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
      ) : error ? (
        <p className="text-sm text-red-500">분포 오류: {error}</p>
      ) : !data || data.by_type.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          해당 기간 Bean 거래가 없습니다.
        </p>
      ) : (
        <BeanDistList data={data} />
      )}
    </div>
  )
}
