'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import {
  SUBSCR_PLANS,
  findPlan,
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
  PISTORE: { emoji: '🏪', grades: ['S', 'M', 'L'] },
  TRANSLATE: { emoji: '🌐', grades: ['GENERAL'] },
}
const ORDER: SubscrProduct[] = ['PICAFE', 'PISTORE', 'TRANSLATE']

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
            {(resp?.balance ?? 0).toLocaleString()} ☕
          </span>
        </span>
        <Link href="/bean" className="text-primary text-sm font-medium hover:underline">
          + {t('charge')}
        </Link>
      </div>

      {/* 사상 안내 + 월/년 토글 */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">💡 {t('tagline')}</p>
        <div className="bg-muted inline-flex shrink-0 rounded-lg p-1 text-sm">
          {(['M', 'Y'] as SubscrCycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                cycle === c ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {t(c === 'Y' ? 'annual' : 'monthly')}
            </button>
          ))}
        </div>
      </div>

      {/* 상품 카드 */}
      <div className="space-y-3">
        {ORDER.map((product) => {
          const meta = PRODUCT_META[product]
          const grade = product === 'PISTORE' ? storeGrade : 'GENERAL'
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
                      {plan.bean_amt.toLocaleString()} ☕
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {' '}/ {cycle === 'Y' ? t('perYear') : t('perMonth')}
                    </span>
                    <span className="text-muted-foreground ml-1 text-xs">
                      (= {plan.bean_amt / 100} π)
                    </span>
                  </p>
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

              {/* PiStore 등급 선택 (상품 수 추천) */}
              {product === 'PISTORE' && (
                <div className="mt-3">
                  <p className="text-muted-foreground mb-1 text-xs">
                    {t('storeGradeHint', { count: resp?.itemCount ?? 0 })}
                  </p>
                  <div className="flex gap-2">
                    {(['S', 'M', 'L'] as SubscrGrade[]).map((g) => {
                      const gp = findPlan('PISTORE', g, cycle)
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
                            {gp?.bean_amt.toLocaleString()} ☕
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
