'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'

interface PaymentItem {
  payment_id: string
  amount: number
  memo: string
  status: string
  reg_dtm: string
  metadata: Record<string, unknown>
}

// 상태 라벨은 payment.status.<status> 번역키로 해석 (모듈 상수 X — useTranslations 불가)
const STATUS_KEYS = new Set(['pending', 'approved', 'completed'])

export function PaymentHistory() {
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const locale = useLocale()
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
      <p className="text-muted-foreground py-8 text-center text-sm">
        {tc('loading')}
      </p>
    )
  }

  if (payments.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {t('payment.empty')}
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
            <p className="text-sm font-medium">
              {p.memo || t('payment.defaultMemo')}
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(p.reg_dtm).toLocaleDateString(locale)}
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
              {STATUS_KEYS.has(p.status) ? t(`payment.status.${p.status}`) : p.status}
            </span>
            <span className="text-sm font-semibold">{p.amount} π</span>
          </div>
        </div>
      ))}
    </div>
  )
}
