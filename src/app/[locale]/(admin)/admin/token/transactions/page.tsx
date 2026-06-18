'use client'

import { useEffect, useState } from 'react'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { BeanIcon } from '@/components/ui/bean-icon'

const TXN_TP_LABEL: Record<string, string> = {
  CHARGE: '충전',
  SPEND: '사용',
  REWARD: '보상',
  REFUND: '환불',
  SUBSCRIBE: '구독',
  TIP: '팁',
  FEE: '수수료',
}

const TXN_TP_COLOR: Record<string, string> = {
  CHARGE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SPEND: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  REWARD: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  REFUND: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  SUBSCRIBE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  TIP: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  FEE: 'bg-muted text-muted-foreground',
}

interface TxnRow {
  txn_id: string
  usr_id: string
  txn_tp_cd: string
  bean_amt: number
  bal_amt: number
  pi_amt: number | null
  pymnt_id: string | null
  ref_tp_cd: string | null
  ref_id: string | null
  memo_txt: string | null
  reg_dtm: string
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
    display_name: string
  } | null
}

const PAGE_SIZE = 50

export default function TokenTransactionsPage() {
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const params = new URLSearchParams({ limit: '500' })
    if (filter !== 'all') params.set('txn_tp', filter)
    setLoading(true)
    fetch(`/api/admin/token/transactions?${params}`)
      .then((r) => r.json())
      .then((d: { transactions: TxnRow[] }) => setTxns(d.transactions ?? []))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => setPage(1), [filter])

  const totalPages = Math.ceil(txns.length / PAGE_SIZE)
  const displayed = txns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const types = ['all', ...Object.keys(TXN_TP_LABEL)]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" /> Bean 거래 내역
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          총 {txns.length.toLocaleString()}건
        </p>
      </div>

      {/* 거래 유형 필터 */}
      <div className="flex flex-wrap gap-2">
        {types.map((tp) => (
          <button
            key={tp}
            onClick={() => setFilter(tp)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === tp
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {tp === 'all' ? '전체' : TXN_TP_LABEL[tp] ?? tp}
            {tp !== 'all' && (
              <span className="ml-1">
                ({txns.filter((t) => t.txn_tp_cd === tp).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      ) : txns.length === 0 ? (
        <p className="text-muted-foreground text-sm">거래 내역이 없습니다.</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">사용자</th>
                <th className="px-4 py-2 text-left font-medium">유형</th>
                <th className="px-4 py-2 text-right font-medium">증감</th>
                <th className="px-4 py-2 text-right font-medium">잔액</th>
                <th className="px-4 py-2 text-left font-medium">Pi 금액</th>
                <th className="px-4 py-2 text-left font-medium">메모</th>
                <th className="px-4 py-2 text-left font-medium">일시</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((t) => (
                <tr key={t.txn_id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {t.sys_user?.nick_nm ||
                        t.sys_user?.real_nm ||
                        t.sys_user?.display_name ||
                        '—'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t.sys_user?.pi_username
                        ? `@${t.sys_user.pi_username}`
                        : t.usr_id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TXN_TP_COLOR[t.txn_tp_cd] ?? 'bg-muted'}`}
                    >
                      {TXN_TP_LABEL[t.txn_tp_cd] ?? t.txn_tp_cd}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold tabular-nums ${
                      t.bean_amt > 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {t.bean_amt > 0 ? '+' : ''}
                    {t.bean_amt.toLocaleString()}{' '}
                    <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                    {t.bal_amt.toLocaleString()}{' '}
                    <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-sm">
                    {t.pi_amt != null ? `π ${t.pi_amt}` : '—'}
                  </td>
                  <td className="text-muted-foreground max-w-[160px] truncate px-4 py-3">
                    {t.memo_txt ?? '—'}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                    {new Date(t.reg_dtm).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
