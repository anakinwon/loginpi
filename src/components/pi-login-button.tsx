'use client'

import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'

export function PiLoginButton() {
  const { user, isLoading, signIn, signOut, error } = usePiAuth()

  if (user) {
    return (
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <div className='flex flex-col leading-tight'>
            <span className='text-sm font-medium'>{user.displayName}</span>
            <span className='text-muted-foreground font-mono text-xs'>
              {user.uid.slice(0, 16)}…
            </span>
          </div>
          <Button variant='outline' size='sm' onClick={signOut}>
            로그아웃
          </Button>
        </div>
        {error && <p className='text-destructive text-xs'>{error}</p>}
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-1'>
      <Button onClick={signIn} disabled={isLoading} className='gap-2'>
        <PiIcon />
        {isLoading ? 'Pi 인증 중…' : 'Pi Network로 로그인'}
      </Button>
      {error && <p className='text-destructive text-xs'>{error}</p>}
    </div>
  )
}

function PiIcon() {
  return (
    <span className='font-serif text-base italic leading-none' aria-hidden='true'>
      π
    </span>
  )
}
