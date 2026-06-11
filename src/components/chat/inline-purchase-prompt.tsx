'use client'

import { useEffect, useState } from 'react'

interface InlinePurchasePromptProps {
  isOpen: boolean
  featureName: string
  description: string
  piAmount: number
  onSinglePurchase: () => void
  onSubscribe?: () => void
  subscribing?: boolean
  onClose: () => void
}

export function InlinePurchasePrompt({
  isOpen,
  featureName,
  description,
  piAmount,
  onSinglePurchase,
  onSubscribe,
  subscribing = false,
  onClose,
}: InlinePurchasePromptProps) {
  const [step, setStep] = useState<'policy' | 'pay'>('policy')

  // 모달이 닫힐 때 단계를 초기화 (다시 열면 정책 안내부터 시작)
  useEffect(() => {
    if (!isOpen) setStep('policy')
  }, [isOpen])

  if (!isOpen) return null

  if (step === 'policy') {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-background w-full max-w-sm rounded-2xl p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 text-center">
            <div className="mb-2 text-2xl">📋</div>
            <h3 className="text-base font-semibold">구독 전 필수 안내</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Pi Network PiRC2 구독 서비스 정책
            </p>
          </div>

          <div className="bg-muted/50 text-muted-foreground mb-5 space-y-2.5 rounded-xl p-4 text-xs">
            <PolicyItem>
              구독 취소 시{' '}
              <strong className="text-foreground">즉시 환불이 없습니다.</strong>{' '}
              이미 결제된 기간은 만료일까지 정상 이용할 수 있습니다.
            </PolicyItem>
            <PolicyItem>
              취소는 자동 갱신을 중단하는 방식입니다. 현재 구독 기간 종료 후
              자동으로 갱신되지 않습니다.
            </PolicyItem>
            <PolicyItem>
              결제 실패 시 자동 갱신이 자동으로 중단됩니다.
            </PolicyItem>
            <PolicyItem>
              부분 환불 및 잔여 기간 환급은 제공되지 않습니다.
            </PolicyItem>
            <PolicyItem>
              구독 금액:{' '}
              <strong className="text-foreground">
                <span className="font-serif italic">π</span> {piAmount}
              </strong>{' '}
              / 월
            </PolicyItem>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => setStep('pay')}
              className="bg-primary text-primary-foreground w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              안내 사항을 확인했습니다
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground w-full pt-1 text-sm"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 text-center">
          <div className="mb-2 text-3xl">🔒</div>
          <h3 className="text-base font-semibold">{featureName}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onSinglePurchase}
            className="bg-primary text-primary-foreground w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <span className="font-serif italic">π</span> {piAmount} 단건 구매
          </button>

          {onSubscribe && (
            <button
              onClick={onSubscribe}
              disabled={subscribing}
              className="hover:bg-muted w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subscribing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  구독 결제 중…
                </span>
              ) : (
                '구독으로 이용하기'
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground w-full pt-1 text-sm"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

function PolicyItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground/70 mt-0.5 shrink-0">•</span>
      <span>{children}</span>
    </div>
  )
}
