'use client'

import { useEffect, useState } from 'react'
import { BeanIcon } from '@/components/ui/bean-icon'

interface TopUserRow {
  usr_id: string
  balance: number
  charge_bean: number
  charge_pi: number
  charge_cnt: number
  spend_bean: number
  spend_cnt: number
  reward_bean: number
  tip_in_bean: number
  tip_out_bean: number
  txn_cnt: number
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
    display_name: string | null
  } | null
}

// RPC p_metric과 일치하는 정렬 지표
const METRICS = [
  { value: 'balance', label: '현재 잔액', desc: '지금 보유한 Bean' },
  { value: 'charge', label: '누적 충전', desc: 'Pi를 투입한 페잉 사용자' },
  { value: 'spend', label: '누적 사용', desc: '활동량(소비)' },
  { value: 'reward', label: '누적 보상', desc: '캠페인·이벤트 수령' },
  { value: 'tip_in', label: '선물 수신', desc: 'P2P로 받은 Bean' },
  { value: 'txn_cnt', label: '거래 건수', desc: '전체 활동 빈도' },
] as const

type Metric = (typeof METRICS)[number]['value']

const PAGE_LIMIT = 50

function displayName(u: TopUserRow['sys_user'], usrId: string): string {
  return u?.nick_nm || u?.real_nm || u?.display_name || usrId.slice(0, 8)
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

export default function BeanTopUsersPage() {
  const [rows, setRows] = useState<TopUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('balance')

  const load = (m: Metric) => {
    setLoading(true)
    setError(null)
    fetch(`/api/admin/token/top-users?metric=${m}&limit=${PAGE_LIMIT}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ data: TopUserRow[] }>
      })
      .then((d) => setRows(d.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(metric)
  }, [metric])

  // 현재 정렬 지표의 값을 강조 표시용으로 추출
  const metricValue = (row: TopUserRow): number => {
    switch (metric) {
      case 'charge':
        return row.charge_bean
      case 'spend':
        return row.spend_bean
      case 'reward':
        return row.reward_bean
      case 'tip_in':
        return row.tip_in_bean
      case 'txn_cnt':
        return row.txn_cnt
      default:
        return row.balance
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-7 w-7" /> Bean 상위 사용자
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bean 경제를 이끄는 핵심 사용자 — 지표를 바꿔 상위 {PAGE_LIMIT}명을
          분석합니다 (잔액=지갑 캐시 · 누적=거래 원장)
        </p>
      </div>

      {/* 정렬 지표 선택 */}
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMetric(m.value)}
            title={m.desc}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              metric === m.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      )}
      {error && <p className="text-sm text-red-500">오류: {error}</p>}

      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-xs">
            {METRICS.find((m) => m.value === metric)?.label} 기준 정렬 ·{' '}
            {rows.length}명
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              집계할 Bean 활동이 없습니다.
            </p>
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-center font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">사용자</th>
                    <th className="px-3 py-2 text-right font-medium">현재 잔액</th>
                    <th className="px-3 py-2 text-right font-medium">
                      누적 충전
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      누적 사용
                    </th>
                    <th className="px-3 py-2 text-right font-medium">보상</th>
                    <th className="px-3 py-2 text-right font-medium">선물 수신</th>
                    <th className="px-3 py-2 text-right font-medium">거래</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, i) => {
                    const rank = i + 1
                    // 현재 정렬 지표 컬럼을 굵게 강조
                    const hl = (col: Metric) =>
                      metric === col
                        ? 'font-bold text-primary'
                        : 'text-muted-foreground'
                    return (
                      <tr
                        key={row.usr_id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-3 py-3 text-center tabular-nums">
                          <span className="font-semibold">{rank}</span>{' '}
                          {rankBadge(rank)}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">
                            {displayName(row.sys_user, row.usr_id)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {row.sys_user?.pi_username
                              ? `@${row.sys_user.pi_username}`
                              : row.usr_id.slice(0, 8)}
                          </p>
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${hl('balance')}`}
                        >
                          {row.balance.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${hl('charge')}`}
                        >
                          {row.charge_bean.toLocaleString()}
                          {row.charge_pi > 0 && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              (π{Number(row.charge_pi).toFixed(2)})
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${hl('spend')}`}
                        >
                          {row.spend_bean.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${hl('reward')}`}
                        >
                          {row.reward_bean.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${hl('tip_in')}`}
                        >
                          {row.tip_in_bean.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${hl('txn_cnt')}`}
                        >
                          {row.txn_cnt.toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            ※ 잔액은 지갑 캐시(bean_token_wallet), 누적 지표는 거래
            원장(bean_txn) 기준입니다. 현재 정렬 지표 컬럼이{' '}
            <span className="text-primary font-bold">강조</span> 표시됩니다.
            {metricValue(rows[0] ?? ({} as TopUserRow)) === 0 &&
              ' (해당 지표 활동이 아직 없습니다)'}
          </p>
        </>
      )}
    </div>
  )
}
