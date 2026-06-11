'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'

interface PaymentItem {
  payment_id: string
  amount: number
  memo: string
  status: string
  reg_dtm: string
  metadata: Record<string, unknown>
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  completed: '완료',
}

export function PaymentHistory() {
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    piFetch('/api/profile/payments')
      .then((r) => r.json())
      .then((d: { payments: PaymentItem[] }) => setPayments(d.payments))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">로딩 중…</p>
    )
  }

  if (payments.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        결제 내역이 없습니다.
      </p>
    )
  }

  return (
    <div className="divide-y rounded-md border">
      {payments.map((p) => (
        <div
          key={p.payment_id}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium">{p.memo || '결제'}</p>
            <p className="text-muted-foreground text-xs">
              {new Date(p.reg_dtm).toLocaleDateString('ko-KR')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={[
                'rounded-full px-2 py-0.5 text-xs font-medium',
                p.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700',
              ].join(' ')}
            >
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
            <span className="text-sm font-semibold">{p.amount} π</span>
          </div>
        </div>
      ))}
    </div>
  )
}
