'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { usePiAuth } from '@/components/pi-auth-provider'
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

const REWARD_HINT: Record<number, number> = { 1: 60, 2: 70, 3: 80, 4: 90, 5: 100 }

const COMPLETED_STATES = ['DONE', 'BUYER_DONE']

export function ClientFeedbackPage({
  orderId,
  serverAuthed,
}: {
  orderId: string
  serverAuthed: boolean
}) {
  const router = useRouter()
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
          setError('주문을 찾을 수 없습니다')
          return
        }
        const d = (await res.json()) as { order: OrderInfo }
        const ord = d.order

        if (!COMPLETED_STATES.includes(ord.order_st_cd)) {
          setError('구매 완료된 주문에만 후기를 작성할 수 있습니다')
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
        setError('주문 정보를 불러오지 못했습니다')
      } finally {
        setOrderLoading(false)
      }
    }
    void load()
  }, [orderId, authed])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overallScore === 0) { toast.error('전체 별점을 선택해주세요'); return }
    if (fbckCn.trim().length < 10) { toast.error('후기 본문을 10자 이상 입력해주세요'); return }

    const scoredItems = ctgrItems.filter((it) => (itemScores[it.item_cd] ?? 0) > 0)

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
        const d = (await res.json()) as { bean_rwrd_qty: number; message: string }
        toast.success(d.message)
        setSubmitted(true)
      } else {
        const d = (await res.json()) as { error?: string }
        toast.error(d.error ?? '후기 저장에 실패했습니다')
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  // 미인증 로딩
  if (!authed && authLoading) {
    return <p className="text-muted-foreground py-16 text-center text-sm">로그인 확인 중…</p>
  }
  // 비인증 → 로그인 안내 (redirect 금지 — Pi Browser 무한루프)
  if (!authed) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        로그인 후 이용할 수 있습니다
      </p>
    )
  }

  if (orderLoading) {
    return <p className="text-muted-foreground py-16 text-center text-sm">주문 정보 불러오는 중…</p>
  }
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          onClick={() => router.back()}
          className="text-primary mt-4 text-sm hover:underline"
        >
          ← 돌아가기
        </button>
      </div>
    )
  }

  // 제출 완료 화면
  if (submitted) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-2xl">✅</p>
        <p className="font-semibold">후기가 등록되었습니다!</p>
        <p className="text-muted-foreground text-sm">소중한 후기 감사합니다 ☕</p>
        <button
          onClick={() => router.push('/store/my/orders')}
          className="text-primary text-sm hover:underline"
        >
          ← 구매 내역으로 돌아가기
        </button>
      </div>
    )
  }

  const itemNm = order?.mps_item?.item_nm ?? '상품'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 상품 헤더 */}
      <div className="rounded-xl bg-muted/50 px-4 py-3">
        <p className="text-xs text-muted-foreground mb-0.5">구매 상품</p>
        <p className="font-semibold">☕ {itemNm}</p>
      </div>

      {/* 항목별 평가 */}
      {ctgrItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">항목별 평가 <span className="text-muted-foreground font-normal">(선택)</span></h2>
          <div className="divide-y divide-border rounded-xl border">
            {ctgrItems.map((it, i) => (
              <div
                key={it.item_cd}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${i === 0 ? 'rounded-t-xl' : ''} ${i === ctgrItems.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                <div>
                  <span className="text-sm font-medium">{it.item_nm}</span>
                  {it.item_desc && (
                    <p className="text-muted-foreground text-xs">{it.item_desc}</p>
                  )}
                </div>
                <StarRating
                  value={itemScores[it.item_cd] ?? 0}
                  onChange={(v) => setItemScores((prev) => ({ ...prev, [it.item_cd]: v }))}
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
          전체 별점 <span className="text-destructive text-xs">*</span>
        </h2>
        <StarRating value={overallScore} onChange={setOverallScore} size="lg" />
        {overallScore > 0 && (
          <p className="text-muted-foreground text-xs">
            후기 등록 시 ☕ <span className="font-medium text-amber-600">{REWARD_HINT[overallScore]} Bean</span> 보상 지급
          </p>
        )}
      </div>

      {/* 후기 본문 */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          후기 본문 <span className="text-destructive text-xs">*</span>
          <span className="text-muted-foreground font-normal"> (최소 10자)</span>
        </h2>
        <textarea
          value={fbckCn}
          onChange={(e) => setFbckCn(e.target.value)}
          placeholder="음료 맛과 서비스는 어떠셨나요?"
          rows={5}
          className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
        <p className={`text-right text-xs ${fbckCn.trim().length < 10 ? 'text-muted-foreground' : 'text-green-600 dark:text-green-400'}`}>
          {fbckCn.trim().length}자
        </p>
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={submitting || overallScore === 0 || fbckCn.trim().length < 10}
        className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? '저장 중…' : '후기 등록하기'}
      </button>
    </form>
  )
}
