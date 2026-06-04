'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePiAuth } from './pi-auth-provider'

type PayStatus =
  | 'idle'
  | 'approving'
  | 'waiting'
  | 'completing'
  | 'done'
  | 'cancelled'
  | 'error'

const STATUS_LABEL: Record<PayStatus, string> = {
  idle: '결제하기',
  approving: '승인 중…',
  waiting: 'Pi 지갑에서 확인 중…',
  completing: '완료 처리 중…',
  done: '다시 결제하기',
  cancelled: '다시 결제하기',
  error: '다시 시도',
}

interface PayResult {
  paymentId: string
  txid: string
}

export function PiPaymentDemo() {
  const { user, isInPiBrowser } = usePiAuth()
  const [amount, setAmount] = useState('1')
  const [status, setStatus] = useState<PayStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)
  const [result, setResult] = useState<PayResult | null>(null)

  const isProcessing =
    status === 'approving' || status === 'waiting' || status === 'completing'

  const handlePayment = () => {
    if (!window.Pi) {
      setErrorMsg('Pi SDK를 사용할 수 없습니다.')
      setStatus('error')
      return
    }

    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg('0보다 큰 금액을 입력하세요.')
      setStatus('error')
      return
    }

    setStatus('approving')
    setErrorMsg(null)
    setCancelMsg(null)
    setResult(null)

    window.Pi.createPayment(
      {
        amount: parsed,
        memo: `Pi 결제 데모 — ${parsed} Pi`,
        metadata: { demo: true, amount: parsed, ts: Date.now() },
      },
      {
        // Phase 1: 서버 승인 → 다이얼로그 활성화
        onReadyForServerApproval: async (paymentId) => {
          try {
            const res = await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
            if (!res.ok) {
              const data = (await res.json()) as { error?: string }
              throw new Error(data.error ?? '서버 승인 실패')
            }
            setStatus('waiting')
          } catch (err) {
            setStatus('error')
            setErrorMsg(err instanceof Error ? err.message : '승인 중 오류 발생')
          }
        },

        // Phase 3: 블록체인 완료 → 서버 최종 확인
        onReadyForServerCompletion: async (paymentId, txid) => {
          setStatus('completing')
          try {
            const res = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            if (!res.ok) {
              const data = (await res.json()) as { error?: string }
              throw new Error(data.error ?? '완료 처리 실패')
            }
            setResult({ paymentId, txid })
            setStatus('done')
          } catch (err) {
            setStatus('error')
            setErrorMsg(err instanceof Error ? err.message : '완료 처리 중 오류 발생')
          }
        },

        onCancel: (paymentId) => {
          setCancelMsg(`결제가 취소됐습니다. (ID: ${paymentId.slice(0, 12)}…)`)
          setStatus('cancelled')
        },

        onError: (error) => {
          setStatus('error')
          setErrorMsg(error.message)
        },
      }
    )
  }

  // Pi Browser가 아닌 환경 안내
  if (!isInPiBrowser) {
    return (
      <div className='bg-muted rounded-xl p-6'>
        <p className='text-muted-foreground text-sm'>
          Pi 결제는 <strong>Pi Browser</strong>에서만 사용할 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm'>Pi Coin 결제 데모</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>

        {/* 금액 입력 */}
        <div className='space-y-1.5'>
          <Label htmlFor='pi-amount'>결제 금액</Label>
          <div className='flex items-center gap-2'>
            <Input
              id='pi-amount'
              type='number'
              min='0.001'
              step='0.001'
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (status === 'error' || status === 'done' || status === 'cancelled') {
                  setStatus('idle')
                  setErrorMsg(null)
                  setCancelMsg(null)
                }
              }}
              disabled={isProcessing}
              className='w-36'
              placeholder='1'
            />
            <span className='text-muted-foreground font-serif text-base italic'>π Pi</span>
          </div>
        </div>

        {/* 결제 버튼 */}
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className='gap-2'
        >
          <span className='font-serif text-base italic leading-none' aria-hidden='true'>π</span>
          {STATUS_LABEL[status]}
        </Button>

        {/* 진행 중 안내 */}
        {status === 'waiting' && (
          <p className='text-muted-foreground text-xs'>
            Pi Browser 지갑 화면에서 결제를 확인해 주세요.
          </p>
        )}

        {/* 취소 메시지 */}
        {cancelMsg && (
          <p className='text-muted-foreground text-xs'>{cancelMsg}</p>
        )}

        {/* 오류 메시지 */}
        {errorMsg && (
          <p className='text-destructive text-xs'>{errorMsg}</p>
        )}

        {/* 결제 성공 결과 */}
        {status === 'done' && result && (
          <div className='rounded-lg bg-green-50 p-3 dark:bg-green-900/20 space-y-1.5'>
            <p className='text-sm font-semibold text-green-700 dark:text-green-400'>
              결제 완료! {parseFloat(amount)} π
            </p>
            <div className='space-y-0.5'>
              <p className='text-muted-foreground text-xs'>Payment ID</p>
              <p className='break-all font-mono text-xs text-green-700 dark:text-green-400'>
                {result.paymentId}
              </p>
            </div>
            <div className='space-y-0.5'>
              <p className='text-muted-foreground text-xs'>Transaction ID (TxID)</p>
              <p className='break-all font-mono text-xs text-green-700 dark:text-green-400'>
                {result.txid}
              </p>
            </div>
            {user && (
              <p className='text-muted-foreground text-xs'>
                결제자: @{user.username ?? user.displayName}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
