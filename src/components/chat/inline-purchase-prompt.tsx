'use client'

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
  if (!isOpen) return null

  return (
    <div
      className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl'
        onClick={e => e.stopPropagation()}
      >
        <div className='mb-5 text-center'>
          <div className='mb-2 text-3xl'>🔒</div>
          <h3 className='text-base font-semibold'>{featureName}</h3>
          <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        </div>

        <div className='space-y-2.5'>
          <button
            onClick={onSinglePurchase}
            className='w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90'
          >
            <span className='font-serif italic'>π</span> {piAmount} 단건 구매
          </button>

          {onSubscribe && (
            <button
              onClick={onSubscribe}
              disabled={subscribing}
              className='w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
            >
              {subscribing ? (
                <span className='flex items-center justify-center gap-2'>
                  <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent' />
                  구독 결제 중…
                </span>
              ) : (
                '구독으로 이용하기'
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className='w-full pt-1 text-sm text-muted-foreground hover:text-foreground'
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
