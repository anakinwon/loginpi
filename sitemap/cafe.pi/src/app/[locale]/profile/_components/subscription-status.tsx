'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
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
  TRANSLATE: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
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
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  // 플랜 표시명 — 번역키(subscribe.product.<prod_ctgr_cd>) 우선, 없으면 API plan_nm 폴백
  const tp = useTranslations('subscribe.product')
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
      setMessage(t('subscr.cancelOk'))
    } else {
      setMessage(t('subscr.cancelError'))
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {tc('loading')}
      </p>
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
        <span className="text-sm font-medium">{t('tabs.subscr')}</span>
        <span className="text-muted-foreground text-xs">
          {t('subscr.countActive', { count: subs.length })}
        </span>
      </div>

      {subs.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
          {t('subscr.empty')}
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
                  {tp.has(s.prod_ctgr_cd) ? tp(s.prod_ctgr_cd) : s.plan_nm}
                </span>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {t('subscr.expireDate', { date: fmtDate(s.expire_dtm) })}
                  {s.auto_renew_yn === 'Y' ? (
                    <span className="ml-1.5 text-green-600 dark:text-green-400">
                      · {t('subscr.autoRenewOnShort')}
                    </span>
                  ) : (
                    <span className="ml-1.5">
                      · {t('subscr.autoRenewOffShort')}
                    </span>
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
          {cancelling ? tc('processing') : t('subscr.cancelAutoRenew')}
        </button>
      )}

      {message && <p className="text-muted-foreground text-sm">{message}</p>}

      <Link
        href="/subscribe"
        className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        {t('subscr.viewPlans')}
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
  const t = useTranslations('profile')
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
          <h3 className="text-base font-semibold">
            {t('subscrExtra.noticeTitle')}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('subscrExtra.policyRef')}
          </p>
        </div>

        <div className="bg-muted/50 text-muted-foreground mb-5 space-y-2.5 rounded-xl p-4 text-xs">
          <PolicyItem>
            {t('subscrExtra.noRefundOnCancel')}{' '}
            {expireLabel
              ? t('subscrExtra.usableUntil', { date: expireLabel })
              : t('subscrExtra.remainHint')}
          </PolicyItem>
          <PolicyItem>{t('subscrExtra.cancelMethod')}</PolicyItem>
          <PolicyItem>{t('subscrExtra.noPartialRefund')}</PolicyItem>
          <PolicyItem>{t('subscrExtra.autoStopOnFail')}</PolicyItem>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            {t('subscrExtra.confirmCancel')}
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground w-full pt-1 text-sm"
          >
            {t('subscrExtra.goBack')}
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
