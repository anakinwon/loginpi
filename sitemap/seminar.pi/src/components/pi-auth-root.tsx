'use client'

// PiAuthProvider 래퍼 — authenticate 가 미완료 결제(Pi 측 pending)를 돌려주면 복구한다:
//  txid 있음(서명 완료) → complete 재호출 / txid 없음(서명 전 이탈) → cancel 로 정리. 둘 다 없으면 다음 createPayment 가 거부될 수 있다.
//  실패는 조용히(다음 로그인 때 재시도)
import { PiAuthProvider, piFetch } from '@pi/auth/client'

export function PiAuthRoot({ children }: { children: React.ReactNode }) {
  return (
    <PiAuthProvider
      onIncompletePayment={(payment) => {
        const txid = payment.transaction?.txid
        const path = txid ? '/api/payments/complete' : '/api/payments/cancel'
        const body = txid
          ? { paymentId: payment.identifier, txid }
          : { paymentId: payment.identifier }
        void piFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {})
      }}
    >
      {children}
    </PiAuthProvider>
  )
}
