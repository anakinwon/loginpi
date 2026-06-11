'use client'
import { useState } from 'react'
import { toast } from 'sonner'

// TASK-062 Trigger 7: 활동 배지 강화 팝업
// 배지 자동 수여 시 축하 + "배지 강화 0.1 Pi" 단건 구매 유도
// 전환 포인트: 배지를 자랑하고 싶은 성취감

const BADGE_UPGRADE_PI = 0.1

export interface BadgeAwardInfo {
  badge_id: string
  theme_cd: string
  theme_nm: string
  theme_emoji: string
}

interface BadgeAwardPopupProps {
  badge: BadgeAwardInfo | null
  onUpgraded: () => void
  onClose: () => void
}

export function BadgeAwardPopup({
  badge,
  onUpgraded,
  onClose,
}: BadgeAwardPopupProps) {
  const [paying, setPaying] = useState(false)

  if (!badge) return null

  function upgrade() {
    if (!badge) return
    if (!window.Pi) {
      toast.error('Pi Browser에서만 배지를 강화할 수 있습니다')
      return
    }
    setPaying(true)
    window.Pi.createPayment(
      {
        amount: BADGE_UPGRADE_PI,
        memo: `배지 강화: ${badge.theme_nm}`.slice(0, 100),
        metadata: {
          type: 'FEATURE_ADDON',
          feature_cd: 'BADGE_UPGRADE',
          theme_cd: badge.theme_cd,
        },
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          await fetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const res = await fetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          })
          setPaying(false)
          if (res.ok) {
            toast.success(
              `${badge.theme_emoji} ${badge.theme_nm} 배지가 강화되었습니다!`,
            )
            onUpgraded()
          } else {
            toast.error('배지 강화 결제 완료 처리에 실패했습니다')
          }
        },
        onCancel: () => setPaying(false),
        onError: (e) => {
          setPaying(false)
          toast.error(e.message)
        },
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-2xl p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-5xl">{badge.theme_emoji}</div>
        <div className="mb-2 text-2xl">🏅</div>
        <h3 className="text-base font-semibold">{badge.theme_nm} 배지 획득!</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {badge.theme_nm} 테마 방에서 30일 활동을 달성했습니다
        </p>

        <div className="mt-4 rounded-xl bg-gradient-to-r from-amber-100 to-yellow-100 p-3 text-xs text-amber-800 dark:from-amber-900/40 dark:to-yellow-900/40 dark:text-amber-200">
          ✨ 배지를 강화하면 특별 디자인이 적용되고
          <br />
          카페 이름 옆에 상시 표시됩니다
        </div>

        <div className="mt-4 space-y-2.5">
          <button
            onClick={upgrade}
            disabled={paying}
            className="bg-primary text-primary-foreground w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {paying ? (
              '결제 진행 중…'
            ) : (
              <>
                <span className="font-serif italic">π</span> {BADGE_UPGRADE_PI}{' '}
                배지 강화
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground w-full pt-1 text-sm"
          >
            나중에 하기
          </button>
        </div>
      </div>
    </div>
  )
}
