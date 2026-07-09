'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { usePiAuth } from '@/components/pi-auth-provider'
import { useApiMessage } from '@/hooks/use-api-error'
import { StarRating } from './StarRating'

interface CtgrItem {
  item_cd: string
  item_nm: string
  item_desc: string | null
}

interface OrderInfo {
  order_id: string
  order_st_cd: string
  mps_item: {
    item_nm: string
    ctgr_id: string | null
  } | null
}

const REWARD_HINT: Record<number, number> = {
  1: 60,
  2: 70,
  3: 80,
  4: 90,
  5: 100,
}

const COMPLETED_STATES = ['DONE', 'BUYER_DONE']

export function ClientFeedbackPage({
  orderId,
  serverAuthed,
}: {
  orderId: string
  serverAuthed: boolean
}) {
  const router = useRouter()
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const resolveMsg = useApiMessage()
  const { user, isLoading: authLoading } = usePiAuth()
  const authed = serverAuthed || !!user

  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [ctgrItems, setCtgrItems] = useState<CtgrItem[]>([])
  const [orderLoading, setOrderLoading] = useState(true)
  const [itemScores, setItemScores] = useState<Record<string, number>>({})
  const [overallScore, setOverallScore] = useState(0)
  const [fbckCn, setFbckCn] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 주문 조회 + 카테고리 항목 로드
  useEffect(() => {
    if (!authed) return
    async function load() {
      setOrderLoading(true)
      try {
        const res = await piFetch(`/api/store/orders/${orderId}`)
        if (!res.ok) {
          setError(t('orderNotFound'))
          return
        }
        const d = (await res.json()) as { order: OrderInfo }
        const ord = d.order

        if (!COMPLETED_STATES.includes(ord.order_st_cd)) {
          setError(t('onlyCompletedOrder'))
          return
        }

        setOrder(ord)

        const ctgrId = ord.mps_item?.ctgr_id
        if (ctgrId) {
          const itemRes = await piFetch(`/api/feedback/items?ctgr_id=${ctgrId}`)
          if (itemRes.ok) {
            const id = (await itemRes.json()) as { items: CtgrItem[] }
            setCtgrItems(id.items)
          }
        }
      } catch {
        setError(t('orderLoadFail'))
      } finally {
        setOrderLoading(false)
      }
    }
    void load()
  }, [orderId, authed, t])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overallScore === 0) {
      toast.error(t('selectOverallScore'))
      return
    }
    if (fbckCn.trim().length < 10) {
      toast.error(t('contentMin10'))
      return
    }

    const scoredItems = ctgrItems.filter(
      (it) => (itemScores[it.item_cd] ?? 0) > 0,
    )

    setSubmitting(true)
    try {
      const res = await piFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          fbck_scr: overallScore,
          fbck_cn: fbckCn.trim(),
          item_scores: scoredItems.map((it) => ({
            item_cd: it.item_cd,
            item_scr: itemScores[it.item_cd],
          })),
        }),
      })

      if (res.ok) {
        const d = (await res.json()) as {
          bean_rwrd_qty: number
          message?: string
          msgCode?: string
          params?: Record<string, string | number>
        }
        toast.success(resolveMsg(d, t('submittedThanks')))
        setSubmitted(true)
      } else {
        const d = (await res.json()) as { error?: string }
        toast.error(d.error ?? t('submitFail'))
      }
    } catch {
      toast.error(t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  // 미인증 로딩
  if (!authed && authLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('authChecking')}
      </p>
    )
  }
  // 비인증 → 로그인 안내 (redirect 금지 — Pi Browser 무한루프)
  if (!authed) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loginRequired')}
      </p>
    )
  }

  if (orderLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('orderLoading')}
      </p>
    )
  }
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          onClick={() => router.back()}
          className="text-primary mt-4 text-sm hover:underline"
        >
          {t('goBack')}
        </button>
      </div>
    )
  }

  // 제출 완료 화면
  if (submitted) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-2xl">✅</p>
        <p className="font-semibold">{t('submittedTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('submittedThanks')}</p>
        <button
          onClick={() => router.push('/store/my/orders')}
          className="text-primary text-sm hover:underline"
        >
          {t('backToOrders')}
        </button>
      </div>
    )
  }

  const itemNm = order?.mps_item?.item_nm ?? t('defaultItem')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 상품 헤더 */}
      <div className="bg-muted/50 rounded-xl px-4 py-3">
        <p className="text-muted-foreground mb-0.5 text-xs">
          {t('purchasedItem')}
        </p>
        <p className="font-semibold">☕ {itemNm}</p>
      </div>

      {/* 항목별 평가 */}
      {ctgrItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">
            {t('itemRating')}{' '}
            <span className="text-muted-foreground font-normal">
              {tc('optional')}
            </span>
          </h2>
          <div className="divide-border divide-y rounded-xl border">
            {ctgrItems.map((it, i) => (
              <div
                key={it.item_cd}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${i === 0 ? 'rounded-t-xl' : ''} ${i === ctgrItems.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                <div>
                  <span className="text-sm font-medium">{it.item_nm}</span>
                  {it.item_desc && (
                    <p className="text-muted-foreground text-xs">
                      {it.item_desc}
                    </p>
                  )}
                </div>
                <StarRating
                  value={itemScores[it.item_cd] ?? 0}
                  onChange={(v) =>
                    setItemScores((prev) => ({ ...prev, [it.item_cd]: v }))
                  }
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 별점 */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          {t('overallScore')}{' '}
          <span className="text-destructive text-xs">*</span>
        </h2>
        <StarRating value={overallScore} onChange={setOverallScore} size="lg" />
        {overallScore > 0 && (
          <p className="text-muted-foreground text-xs">
            {t.rich('rewardHint', {
              bean: REWARD_HINT[overallScore],
              b: (c) => <span className="font-medium text-amber-600">{c}</span>,
            })}
          </p>
        )}
      </div>

      {/* 후기 본문 */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          {t('contentLabel')}{' '}
          <span className="text-destructive text-xs">*</span>
          <span className="text-muted-foreground font-normal">
            {' '}
            {t('min10Chars')}
          </span>
        </h2>
        <textarea
          value={fbckCn}
          onChange={(e) => setFbckCn(e.target.value)}
          placeholder={t('contentPlaceholder')}
          rows={5}
          className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring w-full resize-none rounded-xl border px-4 py-3 text-sm focus:ring-2 focus:outline-none"
          required
        />
        <p
          className={`text-right text-xs ${fbckCn.trim().length < 10 ? 'text-muted-foreground' : 'text-green-600 dark:text-green-400'}`}
        >
          {t('charCount', { count: fbckCn.trim().length })}
        </p>
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={submitting || overallScore === 0 || fbckCn.trim().length < 10}
        className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50"
      >
        {submitting ? tc('saving') : t('submit')}
      </button>
    </form>
  )
}
