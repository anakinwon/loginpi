'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface UseSubscribePlanOptions {
  planCd?: string
  onSuccess?: () => void
}

export function useSubscribePlan({
  planCd = 'PREMIUM_MONTHLY',
  onSuccess,
}: UseSubscribePlanOptions = {}) {
  const [paying, setPaying] = useState(false)

  const subscribe = useCallback(async () => {
    if (!window.Pi) {
      toast.error('Pi Browser에서만 구독 결제가 가능합니다')
      return
    }
    setPaying(true)
    try {
      const prep = await piFetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_cd: planCd }),
      })
      if (!prep.ok) {
        const d = (await prep.json()) as { error?: string }
        throw new Error(d.error ?? '구독 준비 실패')
      }
      const params = (await prep.json()) as {
        amount: number
        memo: string
        metadata: Record<string, unknown>
      }

      window.Pi.createPayment(params, {
        onReadyForServerApproval: async (paymentId) => {
          await fetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const res = await fetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          })
          setPaying(false)
          if (res.ok) {
            toast.success('구독이 시작되었습니다!')
            onSuccess?.()
          } else {
            toast.error('구독 완료 처리에 실패했습니다')
          }
        },
        onCancel: () => setPaying(false),
        onError: (e) => {
          setPaying(false)
          toast.error(e.message)
        },
      })
    } catch (e) {
      setPaying(false)
      toast.error(e instanceof Error ? e.message : '구독 오류')
    }
  }, [planCd, onSuccess])

  return { subscribe, paying }
}
