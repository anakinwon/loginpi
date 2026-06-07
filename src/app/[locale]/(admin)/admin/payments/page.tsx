'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type PaymentStatus = 'pending' | 'approved' | 'completed' | 'cancelled' | 'error'

interface PaymentRow {
  id: string
  payment_id: string
  txid: string | null
  amount: number
  memo: string | null
  status: PaymentStatus
  reg_dtm: string
  mod_dtm: string
  sys_user: {
    display_name: string
    pi_username: string | null
    google_email: string | null
  } | null
}

const STATUS_STYLE: Record<PaymentStatus, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  approved:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-muted text-muted-foreground',
  error:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export default function PaymentsPage() {
  const t = useTranslations('admin.payments')
  const tc = useTranslations('common')
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('all')

  useEffect(() => {
    fetch('/api/admin/payments')
      .then((r) => r.json())
      .then((d: { payments: PaymentRow[] }) => setPayments(d.payments ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? payments : payments.filter((p) => p.status === filter)

  const totalPi = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0)

  const STATUS_LABEL: Record<PaymentStatus, string> = {
    completed: t('status.completed'),
    approved:  t('status.approved'),
    pending:   t('status.pending'),
    cancelled: t('status.cancelled'),
    error:     t('status.error'),
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          {t('totalCount', { count: payments.length, total: totalPi.toFixed(4) })}
        </p>
      </div>

      <div className='flex gap-2 flex-wrap'>
        {(['all', 'completed', 'approved', 'pending', 'cancelled', 'error'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? tc('all') : STATUS_LABEL[s]}
            {s !== 'all' && (
              <span className='ml-1'>({payments.filter((p) => p.status === s).length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('noPayments')}</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>{t('col.user')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.amount')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.memo')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.status')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.paymentId')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.date')}</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {filtered.map((p) => (
                <tr key={p.id} className='hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-3'>
                    <p className='font-medium'>{p.sys_user?.display_name ?? '—'}</p>
                    <p className='text-muted-foreground text-xs'>
                      {p.sys_user?.pi_username ? `@${p.sys_user.pi_username}` : p.sys_user?.google_email ?? ''}
                    </p>
                  </td>
                  <td className='px-4 py-3 font-semibold tabular-nums'>
                    {p.amount.toFixed(4)} π
                  </td>
                  <td className='px-4 py-3 text-muted-foreground max-w-[160px] truncate'>
                    {p.memo ?? '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground max-w-[120px] truncate'>
                    {p.payment_id}
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs whitespace-nowrap'>
                    {new Date(p.reg_dtm).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
