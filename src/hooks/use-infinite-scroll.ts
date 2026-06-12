'use client'
import { useCallback, useEffect, useRef } from 'react'

// 무한 스크롤 공용 훅 — 목록 끝 sentinel이 뷰포트에 들어오면 onLoadMore 호출.
// scroll 이벤트 대신 IntersectionObserver 사용 (메인 스레드 비차단 — 모바일 Pi Browser 우선)
//
// 사용:
//   const sentinelRef = useInfiniteScroll({ hasMore, loading, onLoadMore })
//   ...
//   {hasMore && <div ref={sentinelRef} className='h-px' />}
interface UseInfiniteScrollOptions {
  hasMore: boolean // 더 불러올 항목 존재 여부
  loading: boolean // 로딩 중 중복 호출 방지
  onLoadMore: () => void
  rootMargin?: string // sentinel 도달 전 미리 로드할 여백 (기본 200px)
}

export function useInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '200px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // observer 콜백이 항상 최신 상태를 보도록 ref로 미러링 (재구독 최소화)
  const stateRef = useRef({ hasMore, loading, onLoadMore })
  useEffect(() => {
    stateRef.current = { hasMore, loading, onLoadMore }
  })

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        const { hasMore, loading, onLoadMore } = stateRef.current
        if (entries[0]?.isIntersecting && hasMore && !loading) onLoadMore()
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // hasMore: sentinel 재마운트 시 재구독.
    // loading: 로드 완료 후에도 sentinel이 여전히 뷰포트 안이면(짧은 목록)
    //          intersection 변화 이벤트가 없어 멈춤 — observer 재생성으로 즉시 재판정.
  }, [rootMargin, hasMore, loading])

  const setSentinel = useCallback((node: HTMLDivElement | null) => {
    sentinelRef.current = node
  }, [])

  return setSentinel
}
