'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'
import {
  type TxnDivCd,
  TXN_DIV_CODES,
  TXN_DIV_EMOJI,
  isPaymentDiv,
} from '@/lib/txn-div'

// p-6(48) + 제목+설명(56) + gap(16) + 검색(36) + gap(16) + 상태필터칩(36) + gap(16)
// + 거래구분필터칩(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지네이션(36)
const CHROME_PX = 361

type TxnStatus = 'pending' | 'approved' | 'completed' | 'cancelled' | 'error'

interface TxnRow {
  id: string
  source: 'pymnt' | 'mps'
  txn_div_cd: TxnDivCd
  amount: number
  memo: string | null
  status: TxnStatus
  payment_id: string | null
  reg_dtm: string
  sys_user: {
    display_name: string
    nick_nm: string | null
    real_nm: string | null
    pi_username: string | null
    google_email: string | null
  } | null
}

// 사용자 표시명 우선순위 — 별명 → 실명 → display_name
function userLabel(u: TxnRow['sys_user']): string {
  return u?.nick_nm || u?.real_nm || u?.display_name || '—'
}

const STATUS_STYLE: Record<TxnStatus, string> = {
  completed:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-muted text-muted-foreground',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export default function PaymentsPage() {
  const t = useTranslations('admin.payments')
  const tc = useTranslations('common')
  const [payments, setPayments] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TxnStatus | 'all'>('all')
  const [divFilter, setDivFilter] = useState<TxnDivCd | 'all'>('all')
  const [search, setSearch] = useState('') // pi_username prefix 검색
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  // limit 또는 필터/검색 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [limit, filter, divFilter, search])

  useEffect(() => {
    fetch('/api/admin/payments')
      .then((r) => r.json())
      .then((d: { payments: TxnRow[] }) => setPayments(d.payments ?? []))
      .finally(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = payments.filter(
    (p) =>
      (filter === 'all' || p.status === filter) &&
      (divFilter === 'all' || p.txn_div_cd === divFilter) &&
      // pi_username LIKE 'q%' (대소문자 무시 prefix 검색)
      (q === '' || (p.sys_user?.pi_username ?? '').toLowerCase().startsWith(q)),
  )
  const totalPages = Math.ceil(filtered.length / limit)
  const displayedPayments = filtered.slice((page - 1) * limit, page * limit)

  // 총매출 — 결제 계열(환불·수수료 제외) 완료 거래만 합산
  const totalPi = payments
    .filter((p) => p.status === 'completed' && isPaymentDiv(p.txn_div_cd))
    .reduce((sum, p) => sum + p.amount, 0)

  const STATUS_LABEL: Record<TxnStatus, string> = {
    completed: t('status.completed'),
    approved: t('status.approved'),
    pending: t('status.pending'),
    cancelled: t('status.cancelled'),
    error: t('status.error'),
  }

  // 화면에 실제로 존재하는 거래구분만 필터칩으로 노출 (빈 구분 숨김)
  const presentDivs = TXN_DIV_CODES.filter((cd) =>
    payments.some((p) => p.txn_div_cd === cd),
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('totalCount', {
            count: payments.length,
            total: totalPi.toFixed(4),
          })}
        </p>
      </div>

      {/* Pi 사용자명 검색 (앞부분 일치) */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('searchPiUsername')}
        className="border-input bg-background h-9 w-full max-w-xs rounded-md border px-3 text-sm"
      />

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            'all',
            'completed',
            'approved',
            'pending',
            'cancelled',
            'error',
          ] as const
        ).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === s
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? tc('all') : STATUS_LABEL[s]}
            {s !== 'all' && (
              <span className="ml-1">
                ({payments.filter((p) => p.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 거래 구분 필터 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setDivFilter('all')}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            divFilter === 'all'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          {tc('all')}
        </button>
        {presentDivs.map((cd) => (
          <button
            key={cd}
            onClick={() => setDivFilter(cd)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              divFilter === cd
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {TXN_DIV_EMOJI[cd]} {t(`txnDiv.${cd}`)}
            <span className="ml-1">
              ({payments.filter((p) => p.txn_div_cd === cd).length})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noPayments')}</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.user')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.amount')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.txnDiv')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.memo')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.status')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.paymentId')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.date')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedPayments.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{userLabel(p.sys_user)}</p>
                    <p className="text-muted-foreground text-xs">
                      {p.sys_user?.pi_username
                        ? `@${p.sys_user.pi_username}`
                        : (p.sys_user?.google_email ?? '')}
                    </p>
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold tabular-nums ${
                      p.amount < 0 ? 'text-red-600 dark:text-red-400' : ''
                    }`}
                  >
                    {p.amount.toFixed(4)} π
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                      <span>{TXN_DIV_EMOJI[p.txn_div_cd]}</span>
                      {t(`txnDiv.${p.txn_div_cd}`)}
                    </span>
                  </td>
                  <td className="text-muted-foreground max-w-[160px] truncate px-4 py-3">
                    {p.memo ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="text-muted-foreground max-w-[120px] truncate px-4 py-3 font-mono text-xs">
                    {p.payment_id ?? '—'}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                    {new Date(p.reg_dtm).toLocaleString('ko-KR')}
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
