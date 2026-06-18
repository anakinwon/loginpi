'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { BEAN_PER_PI } from '@/lib/bean-shared'

interface PlanRow {
  plan_cd: string
  plan_nm: string
  plan_desc: string | null
  plan_tp_cd: 'FREE' | 'PREMIUM' | 'BUSINESS'
  price_pi: number
  mth_cnt: number
}

interface PlansResp {
  plans: PlanRow[]
  current: { plan_cd: string; expire_dtm: string | null; auto_renew_yn: string | null }
}

type Period = 'monthly' | 'annual'

const TIER_ORDER: Record<string, number> = { FREE: 0, PREMIUM: 1, BUSINESS: 2 }
const TIER_STYLE: Record<string, string> = {
  FREE: 'border',
  PREMIUM: 'border-primary border-2',
  BUSINESS: 'border',
}

export function ClientSubscribe({ serverAuthed }: { serverAuthed: boolean }) {
  const t = useTranslations('subscribe')
  const [resp, setResp] = useState<PlansResp | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [authed, setAuthed] = useState(serverAuthed)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('monthly')
  const [busyPlan, setBusyPlan] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [planRes, walletRes] = await Promise.all([
      piFetch('/api/subscriptions/plans'),
      piFetch('/api/bean/wallet'),
    ])
    if (planRes.ok) setResp((await planRes.json()) as PlansResp)
    if (walletRes.ok) {
      setAuthed(true)
      setBalance(Number(((await walletRes.json()) as { balance: number }).balance))
    } else if (walletRes.status === 401) {
      setAuthed(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 기간별 표시 플랜: FREE + 해당 주기의 PREMIUM/BUSINESS
  const visiblePlans = useMemo(() => {
    if (!resp) return []
    const want = period === 'annual' ? 12 : 1
    return resp.plans
      .filter((p) => p.plan_tp_cd === 'FREE' || p.mth_cnt === want)
      .sort((a, b) => (TIER_ORDER[a.plan_tp_cd] ?? 9) - (TIER_ORDER[b.plan_tp_cd] ?? 9))
  }, [resp, period])

  const currentCd = resp?.current.plan_cd ?? 'FREE'

  async function subscribe(plan: PlanRow) {
    setBusyPlan(plan.plan_cd)
    try {
      const res = await piFetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_cd: plan.plan_cd }),
      })
      if (res.status === 402) {
        toast.error(t('insufficient'))
        return
      }
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('subscribeFail'))
      }
      const d = (await res.json()) as { balance: number }
      setBalance(Number(d.balance))
      toast.success(t('subscribeSuccess', { plan: plan.plan_nm }))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('subscribeFail'))
    } finally {
      setBusyPlan(null)
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        {t('loginRequired')}
      </p>
    )

  return (
    <div className="space-y-5">
      {/* Bean 잔액 + 충전 링크 */}
      <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-xl px-4 py-3">
        <span className="text-sm">
          {t('myBalance')}{' '}
          <span className="font-bold tabular-nums">
            {(balance ?? 0).toLocaleString()} ☕
          </span>
        </span>
        <Link href="/bean" className="text-primary text-sm font-medium hover:underline">
          + {t('charge')}
        </Link>
      </div>

      {/* 월간/연간 토글 */}
      <div className="bg-muted inline-flex rounded-lg p-1 text-sm">
        {(['monthly', 'annual'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              period === p ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t(p)}
            {p === 'annual' && (
              <span className="text-primary ml-1 text-xs">{t('annualSave')}</span>
            )}
          </button>
        ))}
      </div>

      {/* 플랜 카드 */}
      <div className="space-y-3">
        {visiblePlans.map((plan) => {
          const bean = Math.round(plan.price_pi * BEAN_PER_PI)
          const isFree = plan.plan_tp_cd === 'FREE'
          const isCurrent = plan.plan_cd === currentCd
          const feats = t.raw(`feat.${plan.plan_tp_cd}`) as string[]
          return (
            <div
              key={plan.plan_cd}
              className={`rounded-2xl p-4 ${TIER_STYLE[plan.plan_tp_cd] ?? 'border'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {plan.plan_tp_cd === 'PREMIUM' && '⭐ '}
                    {plan.plan_tp_cd === 'BUSINESS' && '🔥 '}
                    {plan.plan_nm}
                    {plan.plan_tp_cd === 'PREMIUM' && (
                      <span className="bg-primary text-primary-foreground ml-2 rounded-full px-2 py-0.5 text-xs">
                        {t('recommended')}
                      </span>
                    )}
                  </p>
                  <p className="mt-1">
                    {isFree ? (
                      <span className="text-lg font-bold">{t('freePrice')}</span>
                    ) : (
                      <>
                        <span className="text-lg font-bold tabular-nums">
                          {bean.toLocaleString()} ☕
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {' '}
                          / {period === 'annual' ? t('perYear') : t('perMonth')}
                        </span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          (= {plan.price_pi} π)
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                    {t('currentPlan')}
                  </span>
                ) : isFree ? null : (
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={busyPlan !== null}
                    onClick={() => subscribe(plan)}
                  >
                    {busyPlan === plan.plan_cd ? t('processing') : t('subscribeBtn')}
                  </Button>
                )}
              </div>

              <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
                {feats.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <p className="text-muted-foreground text-xs">ℹ️ {t('notice')}</p>
    </div>
  )
}
