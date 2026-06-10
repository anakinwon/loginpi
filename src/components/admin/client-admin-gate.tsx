'use client'

import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

// 서버가 쿠키로 신원을 못 찾을 때(Pi Browser는 Set-Cookie 미저장) admin layout이 렌더하는 게이트.
// Pi ADMIN/MASTER 사용자는 클라이언트 토큰으로 인증해 admin UI를 직접 렌더한다.
function GateBox({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-1 items-center justify-center p-10'>
      <div className='space-y-2 text-center text-sm text-muted-foreground'>{children}</div>
    </div>
  )
}

export function ClientAdminGate({ children }: { children?: React.ReactNode }) {
  const { user, isLoading } = usePiAuth()

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

  return (
    <div className='flex flex-1'>
      <AdminSidebar />
      <main className='flex-1 overflow-auto p-6'>{children}</main>
    </div>
  )
}
