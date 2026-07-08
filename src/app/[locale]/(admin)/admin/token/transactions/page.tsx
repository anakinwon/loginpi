'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { BeanIcon } from '@/components/ui/bean-icon'

// 거래 유형 코드값 — 표시 라벨은 i18n(adminToken.transactions.type.*)
// TRANSFER = 카페방 P2P Bean 선물(fn_bean_transfer) — 보낸이 −/받은이 + 2건
const TXN_TP_CODES = [
  'CHARGE',
  'SPEND',
  'REWARD',
  'REFUND',
  'SUBSCRIBE',
  'TRANSFER',
  'FEE',
]

const TXN_TP_COLOR: Record<string, string> = {
  CHARGE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SPEND: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  REWARD:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  REFUND:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  SUBSCRIBE:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  TRANSFER: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
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
  const t = useTranslations()
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // 전체 거래를 1회 조회 — 필터는 클라이언트에서 적용해 탭 카운트가 항상 전체 기준이 되게 함
  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/token/transactions?limit=500`)
      .then((r) => r.json())
      .then((d: { transactions: TxnRow[] }) => setTxns(d.transactions ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => setPage(1), [filter])

  const filtered =
    filter === 'all' ? txns : txns.filter((t) => t.txn_tp_cd === filter)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const displayed = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const types = ['all', ...TXN_TP_CODES]
  const txnLabel = (tp: string) =>
    TXN_TP_CODES.includes(tp) ? t(`adminToken.transactions.type.${tp}`) : tp
  // map 콜백 변수명이 t(행)라 내부에서 번역 t를 못 쓰므로 라벨을 미리 계산
  const balanceLabel = t('adminToken.transactions.balanceLabel')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" />{' '}
          {t('adminToken.transactions.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('adminToken.transactions.subtitle', {
            count: txns.length.toLocaleString(),
          })}
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
            {tp === 'all' ? t('common.all') : txnLabel(tp)}
            {tp !== 'all' && (
              <span className="ml-1">
                ({txns.filter((t) => t.txn_tp_cd === tp).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {txns.length === 0
            ? t('adminToken.transactions.noTxn')
            : t('adminToken.transactions.noTypeTxn')}
        </p>
      ) : (
        <>
          {/* 모바일: 카드형 목록 (md 미만) */}
          <div className="space-y-2 md:hidden">
            {displayed.map((t) => (
              <div key={t.txn_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {t.sys_user?.nick_nm ||
                        t.sys_user?.real_nm ||
                        t.sys_user?.display_name ||
                        '—'}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {t.sys_user?.pi_username
                        ? `@${t.sys_user.pi_username}`
                        : t.usr_id.slice(0, 8)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TXN_TP_COLOR[t.txn_tp_cd] ?? 'bg-muted'}`}
                  >
                    {txnLabel(t.txn_tp_cd)}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span
                    className={`font-semibold tabular-nums ${
                      t.bean_amt > 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {t.bean_amt > 0 ? '+' : ''}
                    {t.bean_amt.toLocaleString()}{' '}
                    <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {balanceLabel} {t.bal_amt.toLocaleString()}
                    {t.pi_amt != null ? ` · π ${t.pi_amt}` : ''}
                  </span>
                </div>
                {t.memo_txt && (
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {t.memo_txt}
                  </p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(t.reg_dtm).toLocaleString('ko-KR')}
                </p>
              </div>
            ))}
          </div>

          {/* 데스크탑: 테이블 (md 이상) */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('adminToken.transactions.colUser')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('adminToken.transactions.colType')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('adminToken.transactions.colDelta')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('adminToken.transactions.colBalance')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('adminToken.transactions.colPiAmount')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('adminToken.transactions.colMemo')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('adminToken.transactions.colDtm')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayed.map((t) => (
                  <tr
                    key={t.txn_id}
                    className="hover:bg-muted/30 transition-colors"
                  >
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
                        {txnLabel(t.txn_tp_cd)}
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
        </>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
