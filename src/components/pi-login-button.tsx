'use client'

import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'

// 개발 환경 + 일반 브라우저 → devLogin 사용 (Pi.authenticate는 Pi Browser 외 resolve 안 됨)
const isDev = process.env.NODE_ENV !== 'production'

export function PiLoginButton() {
  const { user, isLoading, isInPiBrowser, signIn, signOut, devLogin, error } = usePiAuth()
  const useDevLogin = isDev && !isInPiBrowser

  if (user) {
    const isDevSession = user.uid.startsWith('dev_')
    return (
      <div className='flex items-center gap-2'>
        <span className='text-sm font-medium'>
          {user.username ? `@${user.username}` : user.displayName}
          {isDevSession && (
            <span className='text-muted-foreground ml-1 text-xs'>(dev)</span>
          )}
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
      <Button
        onClick={useDevLogin ? devLogin : signIn}
        disabled={isLoading}
        size='sm'
        className='gap-1.5'
      >
        <span className='font-serif text-sm italic leading-none' aria-hidden='true'>
          π
        </span>
        {isLoading ? '인증 중…' : useDevLogin ? 'Pi 로그인 (dev)' : 'Pi 로그인'}
      </Button>
      {error && <span className='text-destructive text-xs'>{error}</span>}
    </div>
  )
}
