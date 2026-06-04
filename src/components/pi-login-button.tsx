'use client'

import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'

// 헤더 전용 간결 버튼 — 전체 사용자 정보는 PiUserCard 참조
export function PiLoginButton() {
  const { user, isLoading, signIn, signOut, error } = usePiAuth()

  if (user) {
    return (
      <div className='flex items-center gap-2'>
        <span className='text-sm font-medium'>
          {user.username ? `@${user.username}` : user.displayName}
        </span>
        <Button variant='outline' size='sm' onClick={signOut}>
          로그아웃
        </Button>
        {error && <span className='text-destructive text-xs'>{error}</span>}
      </div>
    )
  }

  return (
    <div className='flex items-center gap-1'>
      <Button onClick={signIn} disabled={isLoading} size='sm' className='gap-1.5'>
        <span className='font-serif text-sm italic leading-none' aria-hidden='true'>
          π
        </span>
        {isLoading ? '인증 중…' : 'Pi 로그인'}
      </Button>
      {error && <span className='text-destructive text-xs'>{error}</span>}
    </div>
  )
}
