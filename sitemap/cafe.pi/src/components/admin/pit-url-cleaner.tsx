'use client'

import { useEffect } from 'react'

// 서버 인증 성공 후 URL에서 _pit 파라미터 제거.
// admin layout의 인증된 경로에서만 렌더되므로 미인증 사용자는 이 컴포넌트를 볼 수 없다.
export function PitUrlCleaner() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('_pit')) return
    url.searchParams.delete('_pit')
    window.history.replaceState({}, '', url.pathname + (url.search || ''))
  }, [])

  return null
}
