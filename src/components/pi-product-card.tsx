'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePiAuth } from './pi-auth-provider'

type PayStatus = 'idle' | 'approving' | 'waiting' | 'completing' | 'done' | 'cancelled' | 'error'

const STATUS_LABEL: Record<PayStatus, string> = {
  idle:       '결제하기',
  approving:  '승인 중…',
  waiting:    'Pi 지갑 확인 중…',
  completing: '완료 처리 중…',
  done:       '다시 결제하기',
  cancelled:  '다시 결제하기',
  error:      '다시 시도',
}

interface PayResult {
  paymentId: string
  txid: string
}

export function PiProductCard() {
  const { user, isInPiBrowser } = usePiAuth()

  // 입력 항목
  const [productName, setProductName] = useState('상품1')
  const [quantity, setQuantity] = useState(1)
  const unitPrice = 1   // Pi (고정)
  const totalAmount = unitPrice * Math.max(1, quantity)

  // 결제 상태
  const [status, setStatus] = useState<PayStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)
  const [result, setResult] = useState<PayResult | null>(null)

  const isProcessing = status === 'approving' || status === 'waiting' || status === 'completing'

  function reset() {
    setStatus('idle')
    setErrorMsg(null)
    setCancelMsg(null)
    setResult(null)
  }

  function handlePayment() {
    if (!window.Pi) {
      setErrorMsg('Pi SDK를 사용할 수 없습니다.')
      setStatus('error')
      return
    }
    if (!productName.trim()) {
      setErrorMsg('상품명을 입력하세요.')
      setStatus('error')
      return
    }

    reset()
    setStatus('approving')

    window.Pi.createPayment(
      {
        amount: totalAmount,
        memo: `${productName.trim()} × ${quantity}개 구매`,
        metadata: {
          productName: productName.trim(),
          quantity,
          unitPrice,
          totalAmount,
          orderedAt: new Date().toISOString(),
        },
      },
      {
        // Phase 1 — 서버 승인
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

        // Phase 3 — 블록체인 완료 후 서버 확인
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
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm'>테스트 상품 결제</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Pi 결제는 <strong>Pi Browser</strong>에서만 사용 가능합니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-sm'>테스트 상품 결제</CardTitle>
          {user && (
            <span className='text-muted-foreground text-xs'>
              @{user.username ?? user.displayName}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* 입력 항목 */}
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='product-name'>상품명</Label>
            <Input
              id='product-name'
              value={productName}
              onChange={(e) => { setProductName(e.target.value); reset() }}
              disabled={isProcessing}
              placeholder='상품1'
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='product-qty'>수량</Label>
            <div className='flex items-center gap-2'>
              <Input
                id='product-qty'
                type='number'
                min='1'
                step='1'
                value={quantity}
                onChange={(e) => { setQuantity(Math.max(1, parseInt(e.target.value) || 1)); reset() }}
                disabled={isProcessing}
                className='w-24'
              />
              <span className='text-muted-foreground text-sm'>개</span>
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>단가</Label>
            <p className='text-muted-foreground text-sm font-mono'>
              <span className='font-serif italic'>π</span> {unitPrice} Pi
            </p>
          </div>
        </div>

        {/* 결제 금액 합계 */}
        <div className='border-t pt-3'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>결제 금액</span>
            <span className='text-lg font-semibold'>
              <span className='font-serif italic mr-1'>π</span>
              {totalAmount} Pi
            </span>
          </div>
        </div>

        {/* 결제 버튼 */}
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className='w-full gap-2'
        >
          <span className='font-serif text-base italic leading-none' aria-hidden='true'>π</span>
          {STATUS_LABEL[status]}
        </Button>

        {/* 진행 중 안내 */}
        {status === 'waiting' && (
          <p className='text-muted-foreground text-center text-xs'>
            Pi Browser 지갑 화면에서 결제를 확인해 주세요.
          </p>
        )}

        {/* 취소 메시지 */}
        {cancelMsg && (
          <p className='text-muted-foreground text-xs'>{cancelMsg}</p>
        )}

        {/* 오류 */}
        {errorMsg && (
          <p className='text-destructive text-xs'>{errorMsg}</p>
        )}

        {/* 결제 성공 결과 */}
        {status === 'done' && result && (
          <div className='rounded-lg bg-green-50 p-3 dark:bg-green-900/20 space-y-2'>
            <p className='font-semibold text-sm text-green-700 dark:text-green-400'>
              ✓ 결제 완료 — {productName} × {quantity}개 ({totalAmount} π)
            </p>
            <div>
              <p className='text-xs text-muted-foreground'>Payment ID</p>
              <p className='font-mono text-xs break-all text-green-700 dark:text-green-400'>
                {result.paymentId}
              </p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Transaction ID (TxID)</p>
              <p className='font-mono text-xs break-all text-green-700 dark:text-green-400'>
                {result.txid}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
