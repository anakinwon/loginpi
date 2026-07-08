'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
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

// RPC p_metric과 일치하는 정렬 지표 (라벨·설명은 i18n adminToken.topUsers.metric.*)
const METRICS = [
  { value: 'balance', key: 'balance' },
  { value: 'charge', key: 'charge' },
  { value: 'spend', key: 'spend' },
  { value: 'reward', key: 'reward' },
  { value: 'tip_in', key: 'tipIn' },
  { value: 'txn_cnt', key: 'txnCnt' },
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
  const t = useTranslations()
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
          <BeanIcon className="inline-block h-7 w-7" />{' '}
          {t('adminToken.topUsers.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('adminToken.topUsers.subtitle', { count: PAGE_LIMIT })}
        </p>
      </div>

      {/* 정렬 지표 선택 */}
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMetric(m.value)}
            title={t(`adminToken.topUsers.metric.${m.key}Desc`)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              metric === m.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t(`adminToken.topUsers.metric.${m.key}Label`)}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      )}
      {error && (
        <p className="text-sm text-red-500">
          {t('adminToken.errorMsg', { msg: error })}
        </p>
      )}

      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-xs">
            {t('adminToken.topUsers.sortedBy', {
              metric: t(
                `adminToken.topUsers.metric.${METRICS.find((m) => m.value === metric)?.key ?? 'balance'}Label`,
              ),
              count: rows.length,
            })}
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('adminToken.topUsers.noActivity')}
            </p>
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-center font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('adminToken.topUsers.colUser')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('adminToken.topUsers.colBalance')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('adminToken.topUsers.colCharge')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('adminToken.topUsers.colSpend')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('adminToken.topUsers.colReward')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('adminToken.topUsers.colTipIn')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('adminToken.topUsers.colTxn')}
                    </th>
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
            {t('adminToken.topUsers.footnote')}{' '}
            <span className="text-primary font-bold">
              {t('adminToken.topUsers.footnoteHighlight')}
            </span>{' '}
            {t('adminToken.topUsers.footnoteHighlightSuffix')}
            {metricValue(rows[0] ?? ({} as TopUserRow)) === 0 &&
              t('adminToken.topUsers.footnoteNoMetric')}
          </p>
        </>
      )}
    </div>
  )
}
