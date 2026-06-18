'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'

interface SubscrCheck {
  tier: string
  plan_cd: string | null
  plan_nm: string | null
  expire_dtm: string | null
  auto_renew_yn: 'Y' | 'N' | null
}

const TIER_STYLE: Record<string, string> = {
  FREE: 'bg-muted text-muted-foreground',
  PREMIUM: 'bg-blue-100 text-blue-700',
  BUSINESS: 'bg-purple-100 text-purple-700',
}

export function SubscriptionStatus() {
  const [subscr, setSubscr] = useState<SubscrCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)

  useEffect(() => {
    piFetch('/api/subscriptions/check')
      .then((r) => r.json())
      .then(setSubscr)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function doCancel() {
    setCancelModalOpen(false)
    setCancelling(true)
    const res = await piFetch('/api/subscriptions', { method: 'DELETE' })
    setCancelling(false)
    if (res.ok) {
      setSubscr((prev) => (prev ? { ...prev, auto_renew_yn: 'N' } : prev))
      setMessage('구독이 취소되었습니다. 만료일까지 이용할 수 있습니다.')
    } else {
      setMessage('취소에 실패했습니다. 다시 시도해 주세요.')
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">로딩 중…</p>
    )
  }

  const tier = subscr?.tier ?? 'FREE'
  const isActive = tier !== 'FREE' && subscr?.expire_dtm != null
  const expireLabel = subscr?.expire_dtm
    ? new Date(subscr.expire_dtm).toLocaleDateString('ko-KR')
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">현재 플랜</span>
        <span
          className={[
            'rounded-full px-3 py-0.5 text-xs font-semibold',
            TIER_STYLE[tier] ?? TIER_STYLE.FREE,
          ].join(' ')}
        >
          {subscr?.plan_nm ?? tier}
        </span>
      </div>

      {isActive && expireLabel && (
        <p className="text-muted-foreground text-sm">만료일: {expireLabel}</p>
      )}

      {isActive && subscr?.auto_renew_yn === 'Y' && (
        <p className="text-muted-foreground text-xs">자동 갱신 활성화됨</p>
      )}

      {isActive && subscr?.auto_renew_yn === 'Y' && (
        <button
          onClick={() => setCancelModalOpen(true)}
          disabled={cancelling}
          className="text-destructive text-sm underline underline-offset-2 disabled:opacity-50"
        >
          {cancelling ? '처리 중…' : '자동 갱신 취소'}
        </button>
      )}

      {isActive && subscr?.auto_renew_yn === 'N' && (
        <p className="text-muted-foreground text-xs">
          자동 갱신이 취소되어 있습니다.
        </p>
      )}

      {message && <p className="text-muted-foreground text-sm">{message}</p>}

      <Link
        href="/subscribe"
        className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        {tier === 'FREE' ? '구독 신청하기' : '구독 변경하기'} →
      </Link>

      {cancelModalOpen && (
        <CancelPolicyModal
          expireLabel={expireLabel}
          onConfirm={doCancel}
          onClose={() => setCancelModalOpen(false)}
        />
      )}
    </div>
  )
}

function CancelPolicyModal({
  expireLabel,
  onConfirm,
  onClose,
}: {
  expireLabel: string | null
  onConfirm: () => void
  onClose: () => void
}) {
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
          <div className="mb-2 text-2xl">⚠️</div>
          <h3 className="text-base font-semibold">구독 취소 전 안내</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Pi Network PiRC2 취소·환불 정책
          </p>
        </div>

        <div className="bg-muted/50 text-muted-foreground mb-5 space-y-2.5 rounded-xl p-4 text-xs">
          <PolicyItem>
            취소 즉시 환불되지 않습니다.{' '}
            {expireLabel ? (
              <>
                <strong className="text-foreground">{expireLabel}</strong>까지
                정상 이용할 수 있습니다.
              </>
            ) : (
              '남은 기간은 만료일까지 정상 이용할 수 있습니다.'
            )}
          </PolicyItem>
          <PolicyItem>
            취소는 <strong className="text-foreground">자동 갱신을 중단</strong>
            하는 방식입니다. 현재 구독 기간 종료 후 더 이상 결제되지 않습니다.
          </PolicyItem>
          <PolicyItem>
            부분 환불 및 잔여 기간 환급은 제공되지 않습니다.
          </PolicyItem>
          <PolicyItem>
            결제 실패 시에도 자동 갱신이 자동으로 중단됩니다.
          </PolicyItem>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            안내를 확인했습니다. 구독을 취소합니다
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground w-full pt-1 text-sm"
          >
            돌아가기
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
