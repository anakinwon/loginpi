'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { BeanIcon } from '@/components/ui/bean-icon'
import { useFeeMode } from '@/components/feature-flag-provider'
import {
  findPlan,
  annualSaving,
  type SubscrPlan,
  type SubscrProduct,
  type SubscrGrade,
  type SubscrCycle,
} from '@/lib/bean-subscr-plan'

interface ActiveSubscr {
  prod_ctgr_cd: SubscrProduct
  grade_cd: string
  bill_cycle_cd: SubscrCycle
  expire_dtm: string
}

interface ProductsResp {
  plans: SubscrPlan[]
  mySubs: ActiveSubscr[]
  balance: number
  itemCount: number
}

const PRODUCT_META: Record<SubscrProduct, { emoji: string }> = {
  PICAFE: { emoji: '☕' },
  PISHOP: { emoji: '🏪' },
  TRANSLATE: { emoji: '🌐' },
}
const ORDER: SubscrProduct[] = ['PICAFE', 'PISHOP', 'TRANSLATE']
const SHOP_GRADES: SubscrGrade[] = ['S', 'M', 'L']

export function ClientSubscribe({ serverAuthed }: { serverAuthed: boolean }) {
  const t = useTranslations('subscribe')
  const feeMode = useFeeMode() // PI 모드면 Pi Browser 직결제, BEAN 모드면 Bean 차감
  const isPi = feeMode === 'PI' // PI 모드면 요금 표시도 Pi(π, ÷100), BEAN 모드면 Bean
  const [resp, setResp] = useState<ProductsResp | null>(null)
  const [authed, setAuthed] = useState(serverAuthed)
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<SubscrCycle>('M')
  const [storeGrade, setStoreGrade] = useState<SubscrGrade>('S')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await piFetch('/api/subscriptions/products')
    if (res.ok) {
      setAuthed(true)
      const data = (await res.json()) as ProductsResp
      setResp(data)
    } else if (res.status === 401) {
      setAuthed(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function subscribe(
    product: SubscrProduct,
    grade: SubscrGrade,
    key: string,
  ) {
    // ⭐결제 단위는 서버가 결정한다(클라 feeMode는 stale 가능 → 신뢰 금지).
    //   서버가 BEAN이면 그 자리에서 Bean 차감, PI면 pay 파라미터를 받아 Pi 직결제로 핸드오프.
    setBusy(key)
    let piHandoff = false
    try {
      const res = await piFetch('/api/subscriptions/products/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, grade, cycle }),
      })
      if (res.status === 402) {
        toast.error(t('insufficient'))
        return
      }
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('subscribeFail'))
      }
      const data = (await res.json()) as {
        mode?: string
        pay?: {
          amount: number
          memo: string
          metadata: Record<string, unknown>
        }
      }
      // 서버가 PI 모드로 판정 → Pi 직결제(createPayment). 클라 feeMode와 무관(서버 권위).
      if (data.mode === 'PI' && data.pay) {
        piHandoff = true
        startPiPayment(data.pay, product)
        return
      }
      // BEAN 모드 — 서버에서 Bean 차감 완료
      toast.success(t('subscribeSuccess', { product: t(`product.${product}`) }))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('subscribeFail'))
    } finally {
      if (!piHandoff) setBusy(null) // PI 결제는 createPayment 콜백에서 busy 해제
    }
  }

  // PI 모드 Pi 직결제 — 서버가 내려준 결제 파라미터로 window.Pi.createPayment 진행.
  //   금액·구독부여·검증은 모두 서버(/api/payments/complete)가 결정.
  function startPiPayment(
    pay: { amount: number; memo: string; metadata: Record<string, unknown> },
    product: SubscrProduct,
  ) {
    if (typeof window === 'undefined' || !window.Pi) {
      toast.error('Pi Browser에서 결제할 수 있습니다')
      setBusy(null)
      return
    }
    window.Pi.createPayment(
      { amount: pay.amount, memo: pay.memo, metadata: pay.metadata },
      {
        onReadyForServerApproval: async (paymentId: string) => {
          try {
            const r = await piFetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
            if (!r.ok) throw new Error()
          } catch {
            toast.error(t('subscribeFail'))
            setBusy(null)
          }
        },
        onReadyForServerCompletion: async (paymentId: string, txid: string) => {
          try {
            const r = await piFetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            if (!r.ok) throw new Error()
            toast.success(
              t('subscribeSuccess', { product: t(`product.${product}`) }),
            )
            void load()
          } catch {
            toast.error(t('subscribeFail'))
          } finally {
            setBusy(null)
          }
        },
        onCancel: () => setBusy(null),
        onError: (e: Error) => {
          toast.error(e?.message ?? t('subscribeFail'))
          setBusy(null)
        },
      },
    )
  }

  if (loading)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        {t('loginRequired')}
      </p>
    )

  const plans = resp?.plans ?? []
  const subMap = new Map(resp?.mySubs.map((s) => [s.prod_ctgr_cd, s]))

  return (
    <div className="space-y-5">
      {/* Bean 잔액 + 충전 — PI 모드(Pi 직결제)에서는 Bean이 불필요하므로 숨김 */}
      {feeMode !== 'PI' && (
        <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-xl px-4 py-3">
          <span className="text-sm">
            {t('myBalance')}{' '}
            <span className="font-bold tabular-nums">
              {(resp?.balance ?? 0).toLocaleString()}{' '}
              <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
            </span>
          </span>
          <Link
            href="/bean"
            className="text-primary text-sm font-medium hover:underline"
          >
            + {t('charge')}
          </Link>
        </div>
      )}

      {/* 사상 안내 */}
      <p className="text-muted-foreground text-xs">💡 {t('tagline')}</p>

      {/* 결제 주기 선택 — 연간 강조(2개월 무료) */}
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium">
          {t('cycleHeading')}
        </p>
        <div className="bg-muted grid grid-cols-2 gap-1.5 rounded-xl p-1.5">
          <button
            onClick={() => setCycle('M')}
            className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
              cycle === 'M'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setCycle('Y')}
            className={`relative flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition-colors ${
              cycle === 'Y'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground ring-primary/40 ring-2'
            }`}
          >
            {t('annual')}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                cycle === 'Y'
                  ? 'bg-amber-300 text-amber-950'
                  : 'bg-amber-400 text-amber-950'
              }`}
            >
              {t('annualBadge')}
            </span>
          </button>
        </div>
      </div>

      {/* 상품 카드 */}
      <div className="space-y-3">
        {ORDER.map((product) => {
          const meta = PRODUCT_META[product]
          const grade = product === 'PISHOP' ? storeGrade : 'GENERAL'
          const plan = findPlan(plans, product, grade, cycle)
          if (!plan) return null
          const active = subMap.get(product)
          const isActive = !!active
          const featsRaw = t.raw(`feat.${product}`)
          const feats = Array.isArray(featsRaw) ? (featsRaw as string[]) : []
          const busyKey = `${product}-${grade}`
          const sv = annualSaving(plans, product, grade)

          return (
            <div
              key={product}
              className={`rounded-2xl border p-4 ${product === 'PICAFE' ? 'border-primary border-2' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {meta.emoji} {t(`product.${product}`)}
                    {isActive && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {t('active')}
                      </span>
                    )}
                  </p>
                  <p className="mt-1">
                    <span className="text-lg font-bold tabular-nums">
                      {isPi ? (
                        <>{plan.bean_amt / 100} π</>
                      ) : (
                        <>
                          {plan.bean_amt.toLocaleString()}{' '}
                          <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
                        </>
                      )}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {' '}
                      / {cycle === 'Y' ? t('perYear') : t('perMonth')}
                    </span>
                    {/* BEAN 모드에서만 Pi 환산 보조 표시. PI 모드는 주 표시가 이미 π. */}
                    {!isPi && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        (= {plan.bean_amt / 100} π)
                      </span>
                    )}
                  </p>
                  {/* 연간 절약 안내 */}
                  {sv &&
                    (cycle === 'Y' ? (
                      <p className="mt-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                        {/* PI 모드는 Pi(π) 환산 인라인(단위 일관). BEAN 모드는 기존 i18n(☕). */}
                        {isPi
                          ? `연간 결제로 ${sv.saveBean / 100}π 절약 — ${sv.monthsFree}개월 무료! 🎉`
                          : t('annualSave', {
                              bean: sv.saveBean.toLocaleString(),
                              months: sv.monthsFree,
                            })}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCycle('Y')}
                        className="mt-0.5 text-left text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                      >
                        💡{' '}
                        {t('annualNudge', {
                          months: sv.monthsFree,
                          pct: sv.pct,
                        })}
                      </button>
                    ))}
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={busy !== null}
                  onClick={() => subscribe(product, grade, busyKey)}
                >
                  {busy === busyKey
                    ? t('processing')
                    : isActive
                      ? t('renewBtn')
                      : t('subscribeBtn')}
                </Button>
              </div>

              {/* PyShop™ S/M/L 등급 선택 */}
              {product === 'PISHOP' && (
                <div className="mt-3">
                  <p className="text-muted-foreground mb-1.5 text-xs">
                    {t('storeGradeHint', { count: resp?.itemCount ?? 0 })}
                  </p>
                  <div className="flex gap-2">
                    {SHOP_GRADES.map((g) => {
                      const gp = findPlan(plans, 'PISHOP', g, cycle)
                      return (
                        <button
                          key={g}
                          onClick={() => setStoreGrade(g)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                            storeGrade === g
                              ? 'border-primary bg-primary/5 font-semibold'
                              : 'text-muted-foreground hover:border-muted-foreground/40'
                          }`}
                        >
                          {t(`storeGrade.${g}`)}
                          <span className="mt-0.5 block tabular-nums">
                            {isPi ? (
                              <>{(gp?.bean_amt ?? 0) / 100} π</>
                            ) : (
                              <>
                                {gp?.bean_amt.toLocaleString()}{' '}
                                <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                              </>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
                {feats.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>

              {isActive && active && (
                <p className="text-muted-foreground mt-2 text-xs">
                  {t('expireAt', {
                    date: new Date(active.expire_dtm).toLocaleDateString(),
                  })}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* PI 모드는 Pi 직결제 — Bean 차감/환금불가 안내는 부적합하므로 Pi 전용 문구로 대체 */}
      <p className="text-muted-foreground text-xs">
        ℹ️ {isPi ? '구독료는 Pi로 결제됩니다. 연간은 2개월 무료.' : t('notice')}
      </p>
    </div>
  )
}
