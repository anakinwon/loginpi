'use client'

import { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'

type LinkStatus = 'idle' | 'linking' | 'done' | 'error'

export function AccountLinkCard() {
  const { user: piUser } = usePiAuth()
  const { data: googleSession } = useSession()
  const [status, setStatus] = useState<LinkStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const bothLoggedIn = !!piUser && !!googleSession?.user
  const alreadyLinked = bothLoggedIn && piUser.userId === googleSession.user.id

  async function handleLink() {
    if (!bothLoggedIn) return
    setStatus('linking')
    setMessage(null)
    try {
      const res = await fetch('/api/auth/link', { method: 'POST' })
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '연동 실패')
      setStatus('done')
      setMessage(data.message ?? '연동 완료')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : '연동 중 오류 발생')
    }
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm'>계정 연동 상태</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {/* Pi 계정 */}
        <AccountRow
          provider='Pi Network'
          label={piUser ? `@${piUser.username ?? piUser.displayName}` : null}
          isConnected={!!piUser}
          onConnect={() => {/* Pi 연동은 Pi Browser에서만 가능 */}}
          connectDisabled
          connectLabel='Pi Browser 필요'
        />

        {/* Google 계정 */}
        <AccountRow
          provider='Google'
          label={googleSession?.user?.email ?? null}
          isConnected={!!googleSession?.user}
          onConnect={() => signIn('google')}
          connectLabel='Google로 로그인'
        />

        {/* 연동 버튼 */}
        <div className='border-t pt-3'>
          {alreadyLinked ? (
            <p className='text-sm text-green-600 dark:text-green-400 font-medium'>
              ✓ Pi와 Google 계정이 연동되어 있습니다
            </p>
          ) : bothLoggedIn ? (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs'>
                두 계정을 연동하면 어느 방법으로 로그인해도 동일한 프로필이 유지됩니다.
              </p>
              <Button
                onClick={handleLink}
                disabled={status === 'linking' || status === 'done'}
                size='sm'
                className='w-full'
              >
                {status === 'linking'
                  ? '연동 중…'
                  : status === 'done'
                    ? '✓ 연동 완료'
                    : 'Pi + Google 계정 연동하기'}
              </Button>
              {message && (
                <p className={`text-xs ${status === 'error' ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                  {message}
                </p>
              )}
            </div>
          ) : (
            <p className='text-muted-foreground text-xs'>
              Pi와 Google 두 계정 모두 로그인해야 연동할 수 있습니다.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AccountRow({
  provider,
  label,
  isConnected,
  onConnect,
  connectDisabled,
  connectLabel,
}: {
  provider: string
  label: string | null
  isConnected: boolean
  onConnect: () => void
  connectDisabled?: boolean
  connectLabel: string
}) {
  return (
    <div className='flex items-center justify-between gap-3 text-sm'>
      <span className='text-muted-foreground w-20 shrink-0'>{provider}</span>
      {isConnected ? (
        <span className='flex-1 truncate font-medium'>{label}</span>
      ) : (
        <Button
          variant='outline'
          size='sm'
          onClick={onConnect}
          disabled={connectDisabled}
          className='h-7 text-xs'
        >
          {connectLabel}
        </Button>
      )}
      <span className={`text-xs ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {isConnected ? '✓ 연결됨' : '미연결'}
      </span>
    </div>
  )
}
