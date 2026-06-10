'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { getPiToken } from '@/lib/pi-fetch'

// 서버가 쿠키로 신원을 못 찾을 때(Pi Browser는 Set-Cookie 미저장) admin layout이 렌더하는 게이트.
// Pi ADMIN/MASTER 사용자는 _pit 파라미터로 재내비게이션 → 미들웨어가 X-Pi-Token 헤더로 변환
// → 서버가 Pi 세션을 인식해 admin layout이 이 컴포넌트 대신 정상 admin UI를 렌더한다.
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

  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return
    const token = getPiToken()
    if (!token) return
    const url = new URL(window.location.href)
    // 이미 _pit가 있으면 재시도 방지 (토큰 무효화 시 무한루프 차단)
    if (url.searchParams.has('_pit')) return
    // _pit 파라미터로 재내비게이션 → middleware.ts에서 X-Pi-Token 헤더로 변환
    url.searchParams.set('_pit', token)
    router.replace(url.pathname + url.search)
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
