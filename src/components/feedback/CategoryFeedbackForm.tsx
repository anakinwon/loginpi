'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { StarRating } from './StarRating'

interface CtgrItem {
  item_cd: string
  item_nm: string
  item_desc: string | null
}

interface Props {
  orderId: string
  ctgrId: string
  itemNm: string
  onSuccess: () => void
  onCancel: () => void
}

const REWARD_HINT: Record<number, number> = {
  1: 60,
  2: 70,
  3: 80,
  4: 90,
  5: 100,
}

export function CategoryFeedbackForm({
  orderId,
  ctgrId,
  itemNm,
  onSuccess,
  onCancel,
}: Props) {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const [ctgrItems, setCtgrItems] = useState<CtgrItem[]>([])
  const [itemScores, setItemScores] = useState<Record<string, number>>({})
  const [overallScore, setOverallScore] = useState(0)
  const [fbckCn, setFbckCn] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await piFetch(`/api/feedback/items?ctgr_id=${ctgrId}`)
        if (!res.ok) throw new Error()
        const d = (await res.json()) as { items: CtgrItem[] }
        setCtgrItems(d.items)
      } catch {
        toast.error(t('itemLoadFail'))
      } finally {
        setLoading(false)
      }
    }
    void fetchItems()
  }, [ctgrId, t])

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
          message: string
        }
        toast.success(d.message)
        onSuccess()
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 상품명 헤더 */}
      <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm font-medium">
        ☕ {itemNm}
      </div>

      {/* 항목별 점수 */}
      {loading ? (
        <p className="text-muted-foreground text-sm">{t('itemLoading')}</p>
      ) : ctgrItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('itemRating')}</p>
          {ctgrItems.map((it) => (
            <div
              key={it.item_cd}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <span className="text-sm">{it.item_nm}</span>
                {it.item_desc && (
                  <span className="text-muted-foreground ml-1 text-xs">
                    ({it.item_desc})
                  </span>
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
          <hr className="border-border" />
        </div>
      ) : null}

      {/* 전체 별점 */}
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('overallScore')} *</p>
        <StarRating value={overallScore} onChange={setOverallScore} size="lg" />
        {overallScore > 0 && (
          <p className="text-muted-foreground text-xs">
            {t('rewardHintPlain', { bean: REWARD_HINT[overallScore] })}
          </p>
        )}
      </div>

      {/* 후기 본문 */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {t('contentLabel')} *{' '}
          <span className="text-muted-foreground text-xs">
            {t('min10Chars')}
          </span>
        </label>
        <textarea
          value={fbckCn}
          onChange={(e) => setFbckCn(e.target.value)}
          placeholder={t('contentPlaceholder')}
          rows={4}
          className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          required
        />
        <p
          className={`text-right text-xs ${fbckCn.trim().length < 10 ? 'text-muted-foreground' : 'text-green-600'}`}
        >
          {t('charCount', { count: fbckCn.trim().length })}
        </p>
      </div>

      {/* 액션 버튼 */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="border-input hover:bg-accent rounded-md border px-4 py-2 text-sm disabled:opacity-50"
        >
          {tc('cancel')}
        </button>
        <button
          type="submit"
          disabled={
            submitting || overallScore === 0 || fbckCn.trim().length < 10
          }
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? tc('saving') : t('submitShort')}
        </button>
      </div>
    </form>
  )
}
