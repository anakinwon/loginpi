'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePiAuth } from './pi-auth-provider'

type Status =
  | 'idle'
  | 'approving'
  | 'waiting'
  | 'completing'
  | 'done'
  | 'cancelled'
  | 'error'

interface PayResult {
  paymentId: string
  txid: string
  amount: number
}

export function PiPayButton() {
  const { isInPiBrowser } = usePiAuth()
  const [amount, setAmount] = useState('1')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PayResult | null>(null)

  const busy =
    status === 'approving' || status === 'waiting' || status === 'completing'

  function reset() {
    setStatus('idle')
    setError(null)
    setResult(null)
  }

  function pay() {
    if (!window.Pi) {
      setError('Pi SDK 없음 — Pi Browser에서 접속하세요.')
      setStatus('error')
      return
    }

    const pi = parseFloat(amount)
    if (isNaN(pi) || pi <= 0) {
      setError('0보다 큰 수량을 입력하세요.')
      setStatus('error')
      return
    }

    reset()
    setStatus('approving')

    window.Pi.createPayment(
      {
        amount: pi,
        memo: `Pi ${pi} 결제 요청`,
        metadata: { amount: pi, requestedAt: new Date().toISOString() },
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          try {
            const res = await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
            if (!res.ok) {
              const d = (await res.json()) as { error?: string }
              throw new Error(d.error ?? '서버 승인 실패')
            }
            setStatus('waiting')
          } catch (e) {
            setStatus('error')
            setError(e instanceof Error ? e.message : '승인 오류')
          }
        },

        onReadyForServerCompletion: async (paymentId, txid) => {
          setStatus('completing')
          try {
            const res = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            if (!res.ok) {
              const d = (await res.json()) as { error?: string }
              throw new Error(d.error ?? '완료 처리 실패')
            }
            setResult({ paymentId, txid, amount: pi })
            setStatus('done')
          } catch (e) {
            setStatus('error')
            setError(e instanceof Error ? e.message : '완료 오류')
          }
        },

        onCancel: () => setStatus('cancelled'),
        onError: (e) => {
          setStatus('error')
          setError(e.message)
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      {/* 수량 입력 */}
      <div className="space-y-1.5">
        <Label htmlFor="pay-amount">Pi 코인 수량</Label>
        <div className="flex items-center gap-2">
          <Input
            id="pay-amount"
            type="number"
            min="0.001"
            step="0.001"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              reset()
            }}
            disabled={busy}
            className="w-36 font-mono text-lg"
            placeholder="1"
          />
          <span className="text-muted-foreground font-serif text-xl italic">
            π
          </span>
        </div>
      </div>

      {/* 결제 버튼 */}
      <Button
        size="lg"
        onClick={status === 'done' || status === 'cancelled' ? reset : pay}
        disabled={busy}
        className="w-full gap-2 text-base"
      >
        <span
          className="font-serif text-lg leading-none italic"
          aria-hidden="true"
        >
          π
        </span>
        {busy
          ? STATUS_MSG[status]
          : status === 'done'
            ? '다시 결제하기'
            : status === 'cancelled'
              ? '취소됨 — 다시 결제하기'
              : `${amount || '?'} Pi 결제 요청`}
      </Button>

      {/* 대기 안내 */}
      {status === 'waiting' && (
        <p className="text-muted-foreground text-center text-xs">
          Pi 지갑 화면에서 결제를 승인해 주세요.
        </p>
      )}

      {/* 오류 */}
      {error && <p className="text-destructive text-xs">{error}</p>}

      {/* 결제 성공 결과 */}
      {status === 'done' && result && (
        <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="font-semibold text-green-700 dark:text-green-400">
            ✓ {result.amount} π 결제 완료
          </p>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Payment ID</p>
            <p className="font-mono text-xs break-all text-green-700 dark:text-green-400">
              {result.paymentId}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Transaction ID</p>
            <p className="font-mono text-xs break-all text-green-700 dark:text-green-400">
              {result.txid}
            </p>
          </div>
        </div>
      )}

      {/* Pi Browser 아닐 때 안내 */}
      {!isInPiBrowser && (
        <p className="text-muted-foreground text-center text-xs">
          Pi Browser에서만 결제가 동작합니다.
        </p>
      )}
    </div>
  )
}

const STATUS_MSG: Partial<Record<Status, string>> = {
  approving: '승인 중…',
  waiting: '지갑 확인 중…',
  completing: '처리 중…',
}
