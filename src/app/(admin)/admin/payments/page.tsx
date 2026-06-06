'use client'

import { useEffect, useState } from 'react'

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

const STATUS_LABEL: Record<PaymentStatus, string> = {
  completed: '완료',
  approved:  '승인',
  pending:   '대기',
  cancelled: '취소',
  error:     '오류',
}

export default function PaymentsPage() {
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

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>결제 내역</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          전체 {payments.length}건 · 완료 합계{' '}
          <span className='font-semibold text-foreground'>{totalPi.toFixed(4)} π</span>
        </p>
      </div>

      {/* 상태 필터 */}
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
            {s === 'all' ? '전체' : STATUS_LABEL[s]}
            {s !== 'all' && (
              <span className='ml-1'>({payments.filter((p) => p.status === s).length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : filtered.length === 0 ? (
        <p className='text-muted-foreground text-sm'>결제 내역이 없습니다.</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>사용자</th>
                <th className='text-left px-4 py-2 font-medium'>금액</th>
                <th className='text-left px-4 py-2 font-medium'>메모</th>
                <th className='text-left px-4 py-2 font-medium'>상태</th>
                <th className='text-left px-4 py-2 font-medium'>결제 ID</th>
                <th className='text-left px-4 py-2 font-medium'>일시</th>
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
