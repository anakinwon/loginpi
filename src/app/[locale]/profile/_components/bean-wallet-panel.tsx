'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { Link } from '@/i18n/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'
import type { BeanTxn, BeanTxnType } from '@/lib/bean-shared'

const PAGE = 30

// 거래 유형별 배지 색
const TXN_STYLE: Record<string, string> = {
  CHARGE:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  SPEND: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  REWARD:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  REFUND:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  TRANSFER:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

// reg_dtm(TIMESTAMPTZ)을 사용자 현지 시간대 기준 날짜 + 시·분·초로 표시
function formatLocal(dtm: string): string {
  return new Date(dtm).toLocaleString()
}

const FILTERS: { key: BeanTxnType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'CHARGE', label: '충전' },
  { key: 'SPEND', label: '사용' },
  { key: 'TRANSFER', label: '선물' },
  { key: 'REWARD', label: '보상' },
  { key: 'REFUND', label: '환불' },
]

export function BeanWalletPanel() {
  const t = useTranslations('bean')
  const [balance, setBalance] = useState<number | null>(null)
  const [txns, setTxns] = useState<BeanTxn[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<BeanTxnType | 'ALL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [authed, setAuthed] = useState(true)

  // 잔액 로드 (최초 1회)
  useEffect(() => {
    void (async () => {
      const res = await piFetch('/api/bean/wallet')
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      if (res.ok) {
        const d = (await res.json()) as { balance: number }
        setBalance(d.balance)
      }
    })()
  }, [])

  // 거래내역 로드 (필터/페이지)
  const loadTxns = useCallback(
    async (f: BeanTxnType | 'ALL', offset: number) => {
      const typeQ = f === 'ALL' ? '' : `&type=${f}`
      const res = await piFetch(
        `/api/bean/txns?limit=${PAGE}&offset=${offset}${typeQ}`,
      )
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      if (res.ok) {
        const d = (await res.json()) as { txns: BeanTxn[]; total: number }
        setTotal(d.total)
        setTxns((prev) => (offset === 0 ? d.txns : [...prev, ...d.txns]))
      }
    },
    [],
  )

  // 필터 변경 시 첫 페이지부터 다시 로드
  useEffect(() => {
    setLoading(true)
    void loadTxns(filter, 0).finally(() => setLoading(false))
  }, [filter, loadTxns])

  async function loadMore() {
    setLoadingMore(true)
    await loadTxns(filter, txns.length)
    setLoadingMore(false)
  }

  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        {t('loginRequired')}
      </p>
    )

  return (
    <div className="space-y-6">
      {/* 잔액 카드 */}
      <div className="from-primary/10 to-primary/5 flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b p-6">
        <p className="text-muted-foreground text-sm">{t('myBalance')}</p>
        <p className="text-4xl font-bold tabular-nums">
          {(balance ?? 0).toLocaleString()}{' '}
          <BeanIcon className="inline-block h-9 w-9 align-text-bottom" />
        </p>
        <p className="text-muted-foreground text-xs">
          ≈ π{((balance ?? 0) / 100).toFixed(2)}
        </p>
        <Link
          href="/store"
          className="text-primary mt-2 text-xs hover:underline"
        >
          + Bean 충전하러 가기
        </Link>
      </div>

      {/* 유형 필터 칩 */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 거래 내역 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{t('txnTitle')}</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            총 {total.toLocaleString()}건
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : txns.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
            {t('txnEmpty')}
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {txns.map((tx) => {
                const positive = tx.bean_amt >= 0
                return (
                  <li
                    key={tx.txn_id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${TXN_STYLE[tx.txn_tp_cd] ?? TXN_STYLE.SPEND}`}
                        >
                          {t(`type.${tx.txn_tp_cd}`)}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {formatLocal(tx.reg_dtm)}
                        </span>
                      </div>
                      {tx.memo_txt && (
                        <span className="text-muted-foreground truncate text-xs">
                          {tx.memo_txt}
                        </span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${positive ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}
                    >
                      {positive ? '+' : ''}
                      {tx.bean_amt.toLocaleString()}{' '}
                      <BeanIcon className="inline-block h-5 w-5 align-text-bottom" />
                    </span>
                  </li>
                )
              })}
            </ul>

            {txns.length < total && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="hover:bg-muted w-full rounded-lg border py-2 text-sm font-medium disabled:opacity-50"
              >
                {loadingMore
                  ? '불러오는 중…'
                  : `더보기 (${txns.length}/${total})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
