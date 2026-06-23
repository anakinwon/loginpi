'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'

interface Subscription {
  subscr_id: string
  prod_ctgr_cd: string
  plan_nm: string
  bean_amt: number
  start_dtm: string
  expire_dtm: string
  auto_renew_yn: 'Y' | 'N'
}

// 상품군별 배지 색상
const PROD_STYLE: Record<string, string> = {
  PICAFE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  TRANSLATE:
    'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  PISHOP:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  PISHOP_SUBSCR:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

// 만료일 — 현지 시간대 날짜 (메모리: 현지 형식 표시 규칙)
function fmtDate(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function SubscriptionStatus() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)

  useEffect(() => {
    piFetch('/api/subscriptions/list')
      .then((r) => r.json())
      .then((d: { subscriptions?: Subscription[] }) =>
        setSubs(d.subscriptions ?? []),
      )
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function doCancel() {
    setCancelModalOpen(false)
    setCancelling(true)
    const res = await piFetch('/api/subscriptions', { method: 'DELETE' })
    setCancelling(false)
    if (res.ok) {
      // 전체 자동갱신 해제 — 모든 활성 구독을 N으로 반영
      setSubs((prev) => prev.map((s) => ({ ...s, auto_renew_yn: 'N' })))
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

  // 자동갱신 중인 구독이 하나라도 있으면 취소(전체 자동갱신 해제) 버튼 노출
  const hasAutoRenew = subs.some((s) => s.auto_renew_yn === 'Y')
  // 취소 모달 안내용 — 가장 늦은 만료일
  const latestExpire = subs.reduce<string | null>(
    (max, s) => (!max || s.expire_dtm > max ? s.expire_dtm : max),
    null,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">구독 현황</span>
        <span className="text-muted-foreground text-xs">
          {subs.length}건 구독 중
        </span>
      </div>

      {subs.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
          현재 구독 중인 상품이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {subs.map((s) => (
            <li
              key={s.subscr_id}
              className="bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <span
                  className={[
                    'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    PROD_STYLE[s.prod_ctgr_cd] ??
                      'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {s.plan_nm}
                </span>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  만료일 {fmtDate(s.expire_dtm)}
                  {s.auto_renew_yn === 'Y' ? (
                    <span className="ml-1.5 text-green-600 dark:text-green-400">
                      · 자동 갱신
                    </span>
                  ) : (
                    <span className="ml-1.5">· 자동 갱신 해제됨</span>
                  )}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {s.bean_amt.toLocaleString()} Bean
              </span>
            </li>
          ))}
        </ul>
      )}

      {hasAutoRenew && (
        <button
          onClick={() => setCancelModalOpen(true)}
          disabled={cancelling}
          className="text-destructive text-sm underline underline-offset-2 disabled:opacity-50"
        >
          {cancelling ? '처리 중…' : '자동 갱신 취소'}
        </button>
      )}

      {message && <p className="text-muted-foreground text-sm">{message}</p>}

      <Link
        href="/subscribe"
        className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        구독 상품 보기 →
      </Link>

      {cancelModalOpen && (
        <CancelPolicyModal
          expireLabel={latestExpire ? fmtDate(latestExpire) : null}
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
