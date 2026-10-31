'use client'

// PiAuthProvider 래퍼(sitemap.pi 패턴) — authenticate 가 미완료 결제(Pi 측 pending)를 돌려주면 복구 :
//  txid 있음(서명 완료) → complete 재호출 / txid 없음(서명 전 이탈) → cancel 로 정리. 남으면 다음 createPayment 가 거부될 수 있다. 실패는 조용히(다음 로그인 때 재시도)
import { PiAuthProvider, piFetch } from '@pi/auth/client'

export function PiAuthRoot({ children }: { children: React.ReactNode }) {
  return (
    <PiAuthProvider
      onIncompletePayment={(payment) => {
        const txid = payment.transaction?.txid
        void piFetch(txid ? '/api/payments/complete' : '/api/payments/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txid ? { paymentId: payment.identifier, txid } : { paymentId: payment.identifier }),
        }).catch(() => {})
      }}
    >
      {children}
    </PiAuthProvider>
  )
}
