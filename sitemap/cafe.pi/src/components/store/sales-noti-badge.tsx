'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'

// 판매자 안읽은 주문 알림 수 뱃지 — 0이거나 미인증이면 렌더 안 함.
// StoreNav·프로필 판매관리 링크에 붙는 Pull 안전망의 시각 표시.
export function SalesNotiBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    piFetch('/api/store/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setCount(d.count ?? 0)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (count <= 0) return null
  return (
    <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}
