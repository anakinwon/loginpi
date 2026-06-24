'use client'

import { useState } from 'react'
import { StarRating } from './StarRating'
import { piFetch } from '@/lib/pi-fetch'

interface FeedbackFormProps {
  shopId?: string
  orderId?: string
  onSuccess?: (beanRwrd: number) => void
  onCancel?: () => void
}

// Bean 보상 안내 (점수별)
const REWARD_HINT: Record<number, number> = { 1: 60, 2: 70, 3: 80, 4: 90, 5: 100 }

export function FeedbackForm({ shopId, orderId, onSuccess, onCancel }: FeedbackFormProps) {
  const [score, setScore] = useState(0)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (score === 0) {
      setError('별점을 선택해 주세요.')
      return
    }
    if (text.trim().length < 10) {
      setError('후기 본문은 최소 10자 이상 입력해 주세요.')
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

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '후기 저장에 실패했습니다.')
        return
      }
      onSuccess?.(json.bean_rwrd_qty ?? 0)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h3 className="text-base font-semibold">이용 후기 작성</h3>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-muted-foreground">별점</label>
        <StarRating value={score} onChange={setScore} size="lg" />
        {score > 0 && (
          <p className="text-xs text-amber-600">
            후기 작성 시 <strong>{REWARD_HINT[score]} Bean</strong> 보상이 지급됩니다.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fbck-text" className="text-sm text-muted-foreground">
          후기 내용 <span className="text-xs">({text.trim().length}/500, 최소 10자)</span>
        </label>
        <textarea
          id="fbck-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder="이용 경험을 자유롭게 작성해 주세요."
          rows={4}
          className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || score === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? '저장 중…' : '후기 등록'}
        </button>
      </div>
    </form>
  )
}
