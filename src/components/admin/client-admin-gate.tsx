'use client'

import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// 서버가 쿠키로 신원을 못 찾을 때(Pi Browser는 Set-Cookie 미저장) admin layout이 렌더하는 게이트.
// redirect 무한 루프를 차단하고 클라이언트 토큰 기반으로 상태를 안내한다.
// (admin 하위 페이지들은 모두 서버 쿠키 기반 데이터 로드라 Pi Browser 완전 지원은 후속 과제)
function GateBox({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-1 items-center justify-center p-10'>
      <div className='space-y-2 text-center text-sm text-muted-foreground'>{children}</div>
    </div>
  )
}

export function ClientAdminGate() {
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
    <GateBox>
      <p>관리자 기능은 PC 또는 일반 모바일 브라우저에서 이용해 주세요.</p>
      <p className='text-xs'>Pi Browser는 보안 정책상 관리자 데이터 접근이 제한됩니다.</p>
      <Link href='/' className='inline-block text-primary underline'>홈으로 이동</Link>
    </GateBox>
  )
}
