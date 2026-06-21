'use client'

import { Link } from '@/i18n/navigation'

interface InlinePurchasePromptProps {
  isOpen: boolean
  featureName: string
  description: string
  onClose: () => void
  // 선택: 구독 대신 즉시 해결하는 보조 액션(예: 건당 Bean 결제). 있으면 상단 강조 버튼으로 노출.
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

// 유료 기능 잠금 시 Bean 구독(/subscribe)으로 유도하는 안내 모달.
// 레거시 Pi 단건/구독 결제는 폐기됨 (PRD_15_FEE §1-6) — 결제는 /subscribe의 Bean SPEND로 일원화.
export function InlinePurchasePrompt({
  isOpen,
  featureName,
  description,
  onClose,
  secondaryActionLabel,
  onSecondaryAction,
}: InlinePurchasePromptProps) {
  if (!isOpen) return null

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
          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={() => {
                onSecondaryAction()
                onClose()
              }}
              className="bg-primary text-primary-foreground block w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90"
            >
              {secondaryActionLabel}
            </button>
          )}
          <Link
            href="/subscribe"
            onClick={onClose}
            className={`block w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90 ${
              secondaryActionLabel && onSecondaryAction
                ? 'bg-muted text-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            구독하러 가기 →
          </Link>
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
