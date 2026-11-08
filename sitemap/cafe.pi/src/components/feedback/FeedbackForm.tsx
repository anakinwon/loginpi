'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StarRating } from './StarRating'
import { piFetch } from '@/lib/pi-fetch'
import { useApiErrorMessage, type ApiErrorPayload } from '@/hooks/use-api-error'

interface FeedbackFormProps {
  shopId?: string
  orderId?: string
  onSuccess?: (beanRwrd: number) => void
  onCancel?: () => void
}

// Bean 보상 안내 (점수별)
const REWARD_HINT: Record<number, number> = {
  1: 60,
  2: 70,
  3: 80,
  4: 90,
  5: 100,
}

export function FeedbackForm({
  shopId,
  orderId,
  onSuccess,
  onCancel,
}: FeedbackFormProps) {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const apiErr = useApiErrorMessage()
  const [score, setScore] = useState(0)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (score === 0) {
      setError(t('selectScore'))
      return
    }
    if (text.trim().length < 10) {
      setError(t('contentMin10Alt'))
      return
    }

    setSubmitting(true)
    try {
      const res = await piFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shopId,
          order_id: orderId,
          fbck_scr: score,
          fbck_cn: text.trim(),
        }),
      })

      const json = (await res.json()) as ApiErrorPayload & {
        bean_rwrd_qty?: number
      }
      if (!res.ok) {
        setError(apiErr(json, t('submitFailDot')))
        return
      }
      onSuccess?.(json.bean_rwrd_qty ?? 0)
    } catch {
      setError(t('networkErrorDot'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h3 className="text-base font-semibold">{t('formTitle')}</h3>

      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-sm">
          {t('scoreLabel')}
        </label>
        <StarRating value={score} onChange={setScore} size="lg" />
        {score > 0 && (
          <p className="text-xs text-amber-600">
            {t.rich('rewardHintFull', {
              bean: REWARD_HINT[score],
              b: (c) => <strong>{c}</strong>,
            })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fbck-text" className="text-muted-foreground text-sm">
          {t('contentLabel2')}{' '}
          <span className="text-xs">
            {t('charCountFull', { count: text.trim().length })}
          </span>
        </label>
        <textarea
          id="fbck-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={t('contentPlaceholderFree')}
          rows={4}
          className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="border-input hover:bg-accent rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          >
            {tc('cancel')}
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || score === 0}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? tc('saving') : t('submitShort')}
        </button>
      </div>
    </form>
  )
}
