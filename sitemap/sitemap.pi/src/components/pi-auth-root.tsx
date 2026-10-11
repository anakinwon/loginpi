'use client'

// PiAuthProvider 래퍼 — authenticate 가 미완료 결제(Pi 측 pending)를 돌려주면 complete 를 재호출해 복구한다.
// 복구 없이는 다음 createPayment 가 거부될 수 있음(Pi 플랫폼 규칙). 실패는 조용히(다음 로그인 때 재시도)
import { PiAuthProvider, piFetch } from '@pi/auth/client'

export function PiAuthRoot({ children }: { children: React.ReactNode }) {
  return (
    <PiAuthProvider
      onIncompletePayment={(payment) => {
        const txid = payment.transaction?.txid
        if (!txid) return
        void piFetch('/api/payments/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: payment.identifier, txid }),
        }).catch(() => {})
      }}
    >
      {children}
    </PiAuthProvider>
  )
}
