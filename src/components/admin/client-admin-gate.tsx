'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'

// 서버가 쿠키로 신원을 못 찾을 때(Pi Browser는 Set-Cookie 미저장) admin layout이 렌더하는 게이트.
// Pi ADMIN/MASTER 사용자는 piFetch로 60초짜리 ticket을 발급받아 _pit 파라미터로 재내비게이션한다.
// ticket은 실제 세션 토큰 대신 HMAC 서명된 단기 자격증명 — URL·서버로그에 세션 토큰이 직접 노출되지 않는다.
// 미들웨어가 _pit → x-pit-ticket 헤더로 변환 → auth-check가 ticket 검증 후 정상 admin UI 렌더.
function GateBox({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-1 items-center justify-center p-10'>
      <div className='space-y-2 text-center text-sm text-muted-foreground'>{children}</div>
    </div>
  )
}

export function ClientAdminGate() {
  const { user, isLoading } = usePiAuth()
  const router = useRouter()
  const navigating = useRef(false)

  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return
    if (navigating.current) return
    const url = new URL(window.location.href)
    if (url.searchParams.has('_pit')) return
    navigating.current = true
    piFetch('/api/admin/pit-ticket', { method: 'POST' })
      .then((res) => res.json())
      .then(({ ticket }: { ticket?: string }) => {
        if (!ticket) { navigating.current = false; return }
        url.searchParams.set('_pit', ticket)
        router.replace(url.pathname + url.search)
      })
      .catch(() => { navigating.current = false })
  }, [user, router])

  if (isLoading) return <GateBox>Pi 계정 인증 중…</GateBox>

  if (!user) {
    return (
      <GateBox>
        <p>관리자 로그인이 필요합니다</p>
        <Link href='/' className='inline-block text-primary underline'>홈으로 이동</Link>
      </GateBox>
    )
  }

  if (user.role !== 'ADMIN' && user.role !== 'MASTER') {
    return (
      <GateBox>
        <p>접근 권한이 없습니다</p>
        <Link href='/' className='inline-block text-primary underline'>홈으로 이동</Link>
      </GateBox>
    )
  }

  // Pi ADMIN 확인 완료 — _pit 파라미터로 재내비게이션 진행 중
  return <GateBox>관리자 권한 확인 중…</GateBox>
}
