'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { ConsentDialog } from './consent-dialog'

// 전역 가입/이용 동의 게이트 — 로그인 사용자가 필수 동의(약관·개인정보) 미완료면 차단 모달.
// 통합로그인 직후·매장등록 등 모든 진입을 자동 커버. 약관 문서(/docs/) 페이지에서는 미표시.
export function ConsentGate() {
  const pathname = usePathname()
  const { user: piUser } = usePiAuth()
  const { data: session, status } = useSession()
  const [need, setNeed] = useState(false)

  const authed = !!piUser || !!session?.user

  useEffect(() => {
    if (!authed) {
      setNeed(false)
      return
    }
    let alive = true
    piFetch('/api/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { authenticated?: boolean; requiredDone?: boolean } | null) => {
        if (alive && d?.authenticated && d.requiredDone === false) setNeed(true)
      })
      .catch(() => {}) // 조회 실패 시 게이트 미표시(서비스 차단 방지)
    return () => {
      alive = false
    }
  }, [authed, piUser?.userId, status])

  // 약관 전문 페이지에서는 게이트를 띄우지 않는다(동의 전 약관을 읽을 수 있어야 유효).
  if (!need || pathname?.includes('/docs/')) return null

  return <ConsentDialog onAgreed={() => setNeed(false)} />
}
