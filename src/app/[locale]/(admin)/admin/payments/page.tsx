'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'

// p-6(48) + 제목+설명(56) + gap(16) + 상태필터칩(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지네이션(36)
const CHROME_PX = 257

type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'completed'
  | 'cancelled'
  | 'error'

interface PaymentRow {
  id: string
  payment_id: string
  txid: string | null
  amount: number
  memo: string | null
  status: PaymentStatus
  pymnt_type: string | null
  theme_cd: string
  theme_nm: string | null
  theme_emoji: string | null
  reg_dtm: string
  mod_dtm: string
  sys_user: {
    display_name: string
    pi_username: string | null
    google_email: string | null
  } | null
}

const STATUS_STYLE: Record<PaymentStatus, string> = {
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
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  // limit 또는 필터 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [limit, filter])

  useEffect(() => {
    fetch('/api/admin/payments')
      .then((r) => r.json())
      .then((d: { payments: PaymentRow[] }) => setPayments(d.payments ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered =
    filter === 'all' ? payments : payments.filter((p) => p.status === filter)
  const totalPages = Math.ceil(filtered.length / limit)
  const displayedPayments = filtered.slice((page - 1) * limit, page * limit)

  const totalPi = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0)

  const STATUS_LABEL: Record<PaymentStatus, string> = {
    completed: t('status.completed'),
    approved: t('status.approved'),
    pending: t('status.pending'),
    cancelled: t('status.cancelled'),
    error: t('status.error'),
  }

  // 테마 표시 — 미등록 코드(SUBSCRIPTION·UNKNOWN)는 통계 화면과 동일하게 번역 매핑
  function themeLabel(p: PaymentRow): { emoji: string; name: string } {
    if (p.theme_cd === 'SUBSCRIPTION')
      return { emoji: '💳', name: t('theme.subscription') }
    if (p.theme_cd === 'UNKNOWN')
      return { emoji: '❓', name: t('theme.unknown') }
    return { emoji: p.theme_emoji ?? '', name: p.theme_nm ?? p.theme_cd }
  }

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
                  {t('col.theme')}
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
                    <p className="font-medium">
                      {p.sys_user?.display_name ?? '—'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {p.sys_user?.pi_username
                        ? `@${p.sys_user.pi_username}`
                        : (p.sys_user?.google_email ?? '')}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {p.amount.toFixed(4)} π
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {(() => {
                      const { emoji, name } = themeLabel(p)
                      return (
                        <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                          {emoji && <span>{emoji}</span>}
                          {name}
                        </span>
                      )
                    })()}
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
                    {p.payment_id}
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
