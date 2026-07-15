'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// 뷰포트 진입 시에만 children을 렌더하는 지연 섹션.
// Plotly 차트처럼 무거운 컴포넌트를 화면 밖에서 미리 마운트하지 않도록 한다.
// 한 번 보이면 계속 마운트 유지 (스크롤 위로 되돌아가도 재로딩 없음)
interface LazySectionProps {
  children: ReactNode
  // 진입 전 표시할 placeholder (기본: 차트 높이 스켈레톤)
  fallback?: ReactNode
  // 진입 판정 여백 — 도달 직전 미리 마운트 (기본 200px)
  rootMargin?: string
  // 뷰포트 첫 진입 시 1회 호출 — 섹션 데이터 지연 fetch 트리거용
  onVisible?: () => void
  // 래퍼 div에 적용할 클래스 (예: [overflow-anchor:none] 스크롤 앵커 제외)
  className?: string
}

export function LazySection({
  children,
  fallback,
  rootMargin = '200px',
  onVisible,
  className,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const onVisibleRef = useRef(onVisible)
  useEffect(() => {
    onVisibleRef.current = onVisible
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          onVisibleRef.current?.()
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className}>
      {visible
        ? children
        : (fallback ?? (
            <div className="bg-muted h-64 animate-pulse rounded-lg" />
          ))}
    </div>
  )
}
