'use client'

import { useCallback, useEffect, useState } from 'react'
import { FeedbackCard, type FeedbackCardData } from './FeedbackCard'
import { FeedbackForm } from './FeedbackForm'
import { StarRating } from './StarRating'
import { piFetch } from '@/lib/pi-fetch'

interface Stats {
  avg_score: number
  total_count: number
  score_dist: Record<number, number>
}

interface Pagination {
  page: number
  limit: number
  total: number
}

interface FeedbackListProps {
  shopId?: string
  orderId?: string
  itemId?: string
  currentUsrId?: string | null
}

export function FeedbackList({
  shopId,
  orderId,
  itemId,
  currentUsrId,
}: FeedbackListProps) {
  const [items, setItems] = useState<FeedbackCardData[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
  })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const fetchList = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (shopId) params.set('shop_id', shopId)
        if (orderId) params.set('order_id', orderId)
        if (itemId) params.set('item_id', itemId)

        const res = await piFetch(`/api/feedback?${params}`)
        if (!res.ok) return
        const json = await res.json()
        setItems(json.data ?? [])
        setStats(json.stats ?? null)
        setPagination(json.pagination ?? { page: 1, limit: 20, total: 0 })
      } finally {
        setLoading(false)
      }
    },
    [shopId, orderId, itemId],
  )

  useEffect(() => {
    fetchList(1)
  }, [fetchList])

  async function handleDelete(fbckId: string) {
    if (!confirm('후기를 삭제하시겠습니까?')) return
    const res = await piFetch(`/api/feedback/${fbckId}`, { method: 'DELETE' })
    if (res.ok) fetchList(1)
  }

  function handleWriteSuccess(beanRwrd: number) {
    setShowForm(false)
    setSuccessMsg(
      beanRwrd > 0
        ? `후기가 등록되었습니다! ${beanRwrd} Bean을 받으셨습니다. ☕`
        : '후기가 등록되었습니다!',
    )
    fetchList(1)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit)

  return (
    <div className="flex flex-col gap-4">
      {/* 별점 통계 헤더 */}
      {stats && (
        <div className="bg-muted/50 flex flex-col gap-2 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold">
              {stats.avg_score.toFixed(1)}
            </span>
            <div className="flex flex-col gap-0.5">
              <StarRating
                value={Math.round(stats.avg_score)}
                readonly
                size="sm"
              />
              <span className="text-muted-foreground text-xs">
                총 {stats.total_count}개 후기
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {[5, 4, 3, 2, 1].map((s) => {
              const cnt = stats.score_dist[s] ?? 0
              const pct =
                stats.total_count > 0 ? (cnt / stats.total_count) * 100 : 0
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right">{s}★</span>
                  <div className="bg-border h-1.5 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-8">{cnt}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 후기 작성 버튼 / 폼 */}
      {currentUsrId && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded-md border border-dashed py-3 text-sm transition-colors"
        >
          + 후기 작성하기
        </button>
      )}

      {showForm && (
        <div className="border-border bg-card rounded-lg border">
          <FeedbackForm
            shopId={shopId}
            orderId={orderId}
            onSuccess={handleWriteSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {successMsg && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {successMsg}
        </p>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="text-muted-foreground py-8 text-center text-sm">
          로딩 중…
        </div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-sm">
          아직 후기가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <FeedbackCard
              key={item.fbck_id}
              feedback={item}
              isOwner={currentUsrId === undefined ? false : true}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => fetchList(p)}
              className={[
                'rounded px-3 py-1 text-sm',
                p === pagination.page
                  ? 'bg-primary text-primary-foreground'
                  : 'border-border hover:bg-accent border',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
