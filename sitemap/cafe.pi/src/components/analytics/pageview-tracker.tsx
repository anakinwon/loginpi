'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { piFetch } from '@/lib/pi-fetch'

// 페이지뷰 추적 (Phase 22 §12 ④) — 라우트 전환 시 비차단 수집.
//   piFetch 사용(쿠키 + X-Pi-Token) → 로그인 사용자 usr_id 포함. 게스트도 수집.
//   라우트 전환(페이지 살아있음)이라 keepalive fetch로 충분. 실패는 무시.

// locale 접두(/ko, /en-US 등) 제거 → 경로 집계 통일
function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/[a-z]{2,3}(-[A-Z]{2,3})?(\/|$)/)
  if (!m) return pathname || '/'
  const stripped = pathname.slice(m[0].length - (m[2] === '/' ? 1 : 0))
  return stripped || '/'
}

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem('cafe_sid')
    if (!sid) {
      sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem('cafe_sid', sid)
    }
    return sid
  } catch {
    return 'nostorage'
  }
}

export function PageviewTracker() {
  const pathname = usePathname()
  const lastRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || lastRef.current === pathname) return
    const isFirst = lastRef.current === null
    lastRef.current = pathname

    const body = JSON.stringify({
      sess_id: getSessionId(),
      path: stripLocale(pathname),
      // referrer는 세션 첫 PV에서만(유입 채널 판정용)
      refr: isFirst ? document.referrer : '',
    })

    // 비차단 — 실패해도 무시(핵심 흐름 보호)
    piFetch('/api/track/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  }, [pathname])

  return null
}
