'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { BeanIcon } from '@/components/ui/bean-icon'
import {
  SUBSCR_PLANS,
  findPlan,
  annualSaving,
  recommendStoreGrade,
  type SubscrProduct,
  type SubscrGrade,
  type SubscrCycle,
} from '@/lib/bean-subscr-plan'

interface ActiveSubscr {
  prod_ctgr_cd: SubscrProduct
  grade_cd: SubscrGrade
  bill_cycle_cd: SubscrCycle
  expire_dtm: string
}

interface ProductsResp {
  plans: typeof SUBSCR_PLANS
  mySubs: ActiveSubscr[]
  balance: number
  itemCount: number
}

const PRODUCT_META: Record<
  SubscrProduct,
  { emoji: string; grades: SubscrGrade[] }
> = {
  PICAFE: { emoji: '☕', grades: ['GENERAL'] },
  PISHOP: { emoji: '🏪', grades: ['S', 'M', 'L'] },
  TRANSLATE: { emoji: '🌐', grades: ['GENERAL'] },
}
const ORDER: SubscrProduct[] = ['PICAFE', 'PISHOP', 'TRANSLATE']

export function ClientSubscribe({ serverAuthed }: { serverAuthed: boolean }) {
  const t = useTranslations('subscribe')
  const [resp, setResp] = useState<ProductsResp | null>(null)
  const [authed, setAuthed] = useState(serverAuthed)
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<SubscrCycle>('M')
  const [storeGrade, setStoreGrade] = useState<SubscrGrade>('M')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await piFetch('/api/subscriptions/products')
    if (res.ok) {
      setAuthed(true)
      const data = (await res.json()) as ProductsResp
      setResp(data)
      setStoreGrade(recommendStoreGrade(data.itemCount)) // 상품 수 기반 등급 추천
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
    setBusy(key)
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
      toast.success(t('subscribeSuccess', { product: t(`product.${product}`) }))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('subscribeFail'))
    } finally {
      setBusy(null)
    }
  }

  if (loading)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        {t('loginRequired')}
      </p>
    )

  const subMap = new Map(resp?.mySubs.map((s) => [s.prod_ctgr_cd, s]))

  return (
    <div className="space-y-5">
      {/* Bean 잔액 + 충전 */}
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

      {/* 사상 안내 */}
      <p className="text-muted-foreground text-xs">💡 {t('tagline')}</p>

      {/* 결제 주기 선택 — 연간 강조(2개월 무료). 전폭 세그먼트 + 앰버 배지 + (미선택 시에도) primary 링 */}
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
          const plan = findPlan(product, grade, cycle)
          if (!plan) return null
          const active = subMap.get(product)
          const isActive = !!active
          const feats = t.raw(`feat.${product}`) as string[]
          const busyKey = `${product}-${grade}`

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
                      {plan.bean_amt.toLocaleString()}{' '}
                      <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {' '}
                      / {cycle === 'Y' ? t('perYear') : t('perMonth')}
                    </span>
                    <span className="text-muted-foreground ml-1 text-xs">
                      (= {plan.bean_amt / 100} π)
                    </span>
                  </p>
                  {/* 연간 절약 안내 — 선택 시 절약액(초록), 월간일 때 연간 전환 넛지(앰버) */}
                  {(() => {
                    const sv = annualSaving(product, grade)
                    if (!sv) return null
                    return cycle === 'Y' ? (
                      <p className="mt-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                        {t('annualSave', {
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
                    )
                  })()}
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

              {/* PiShop™ 등급 선택 (상품 수 추천) */}
              {product === 'PISHOP' && (
                <div className="mt-3">
                  <p className="text-muted-foreground mb-1 text-xs">
                    {t('storeGradeHint', { count: resp?.itemCount ?? 0 })}
                  </p>
                  <div className="flex gap-2">
                    {(['S', 'M', 'L'] as SubscrGrade[]).map((g) => {
                      const gp = findPlan('PISHOP', g, cycle)
                      return (
                        <button
                          key={g}
                          onClick={() => setStoreGrade(g)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                            storeGrade === g
                              ? 'border-primary bg-primary/5 font-semibold'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {t(`storeGrade.${g}`)}
                          <span className="block tabular-nums">
                            {gp?.bean_amt.toLocaleString()}{' '}
                            <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
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

      <p className="text-muted-foreground text-xs">ℹ️ {t('notice')}</p>
    </div>
  )
}
