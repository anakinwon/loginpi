'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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

interface PayResult {
  paymentId: string
  txid: string
}

export function PiPaymentDemo() {
  const { user, isInPiBrowser } = usePiAuth()
  const t = useTranslations('pay')
  const tc = useTranslations('common')
  const STATUS_LABEL: Record<PayStatus, string> = {
    idle: t('payBtn'),
    approving: t('approving'),
    waiting: t('walletChecking'),
    completing: t('completing'),
    done: t('retryPay'),
    cancelled: t('retryPay'),
    error: tc('retry'),
  }
  const [amount, setAmount] = useState('1')
  const [status, setStatus] = useState<PayStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)
  const [result, setResult] = useState<PayResult | null>(null)

  const isProcessing =
    status === 'approving' || status === 'waiting' || status === 'completing'

  const handlePayment = () => {
    if (!window.Pi) {
      setErrorMsg(t('sdkUnavailable'))
      setStatus('error')
      return
    }

    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg(t('amountInvalid'))
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
            setErrorMsg(
              err instanceof Error ? err.message : t('approveErrorMsg'),
            )
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
            setErrorMsg(
              err instanceof Error ? err.message : t('completeErrorMsg'),
            )
          }
        },

        onCancel: (paymentId) => {
          setCancelMsg(t('cancelled', { id: paymentId.slice(0, 12) }))
          setStatus('cancelled')
        },

        onError: (error) => {
          setStatus('error')
          setErrorMsg(error.message)
        },
      },
    )
  }

  // Pi Browser가 아닌 환경 안내
  if (!isInPiBrowser) {
    return (
      <div className="bg-muted rounded-xl p-6">
        <p className="text-muted-foreground text-sm">
          {t.rich('demo.piBrowserOnly', {
            strong: (c) => <strong>{c}</strong>,
          })}
        </p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('demo.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 금액 입력 */}
        <div className="space-y-1.5">
          <Label htmlFor="pi-amount">{t('amountLabel')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="pi-amount"
              type="number"
              min="0.001"
              step="0.001"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (
                  status === 'error' ||
                  status === 'done' ||
                  status === 'cancelled'
                ) {
                  setStatus('idle')
                  setErrorMsg(null)
                  setCancelMsg(null)
                }
              }}
              disabled={isProcessing}
              className="w-36"
              placeholder="1"
            />
            <span className="text-muted-foreground font-serif text-base italic">
              π Pi
            </span>
          </div>
        </div>

        {/* 결제 버튼 */}
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className="gap-2"
        >
          <span
            className="font-serif text-base leading-none italic"
            aria-hidden="true"
          >
            π
          </span>
          {STATUS_LABEL[status]}
        </Button>

        {/* 진행 중 안내 */}
        {status === 'waiting' && (
          <p className="text-muted-foreground text-xs">
            {t('confirmInWallet')}
          </p>
        )}

        {/* 취소 메시지 */}
        {cancelMsg && (
          <p className="text-muted-foreground text-xs">{cancelMsg}</p>
        )}

        {/* 오류 메시지 */}
        {errorMsg && <p className="text-destructive text-xs">{errorMsg}</p>}

        {/* 결제 성공 결과 */}
        {status === 'done' && result && (
          <div className="space-y-1.5 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">
              {t('demo.doneAmount', { amount: parseFloat(amount) })}
            </p>
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">Payment ID</p>
              <p className="font-mono text-xs break-all text-green-700 dark:text-green-400">
                {result.paymentId}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">
                Transaction ID (TxID)
              </p>
              <p className="font-mono text-xs break-all text-green-700 dark:text-green-400">
                {result.txid}
              </p>
            </div>
            {user && (
              <p className="text-muted-foreground text-xs">
                {t('demo.payer', { name: user.username ?? user.displayName })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
