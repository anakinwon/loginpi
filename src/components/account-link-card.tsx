'use client'

import { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type GenStatus = 'idle' | 'loading' | 'done' | 'error'

export function AccountLinkCard() {
  const { user: piUser, isInPiBrowser } = usePiAuth()
  const { data: googleSession } = useSession()
  const [genStatus, setGenStatus] = useState<GenStatus>('idle')
  const [code, setCode] = useState('')
  const [errMsg, setErrMsg] = useState('')

  async function generateCode() {
    setGenStatus('loading')
    setCode('')
    setErrMsg('')
    try {
      const res = await fetch('/api/auth/link-start', { method: 'POST' })
      const data = (await res.json()) as { code?: string; error?: string }
      if (!res.ok || !data.code) throw new Error(data.error ?? '코드 생성 실패')
      setCode(data.code)
      setGenStatus('done')
    } catch (err) {
      setGenStatus('error')
      setErrMsg(err instanceof Error ? err.message : '오류 발생')
    }
  }

  const bothLoggedIn = !!piUser && !!googleSession?.user
  const alreadyLinked = bothLoggedIn && piUser.userId === googleSession.user.id

  // 코드를 "394-821" 형식으로 포맷
  const displayCode = code ? `${code.slice(0, 3)}-${code.slice(3)}` : ''

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm'>계정 연동</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>

        <StatusRow label='Pi Network' connected={!!piUser}
          value={piUser?.username ? `@${piUser.username}` : undefined} />
        <StatusRow label='Google' connected={!!googleSession?.user}
          value={googleSession?.user?.email ?? undefined} />

        <div className='border-t pt-3 space-y-3'>
          {alreadyLinked ? (
            <p className='text-green-600 dark:text-green-400 text-xs font-medium'>
              ✓ 두 계정이 연동되어 있습니다
            </p>

          ) : isInPiBrowser ? (
            /* ── Pi Browser: 연동 코드 생성 ── */
            <>
              <p className='text-xs text-muted-foreground'>
                아래 버튼을 눌러 연동 코드를 생성하고,<br />
                일반 브라우저에서{' '}
                <span className='font-mono text-foreground'>/link</span> 페이지를 열어 입력하세요.
              </p>

              <Button
                size='sm'
                className='w-full'
                disabled={genStatus === 'loading'}
                onClick={generateCode}
              >
                {genStatus === 'loading' ? '코드 생성 중…' : '연동 코드 생성'}
              </Button>

              {genStatus === 'done' && displayCode && (
                <div className='rounded-lg border-2 border-primary/30 bg-primary/5 p-4 text-center space-y-2'>
                  <p className='text-xs text-muted-foreground'>연동 코드</p>
                  <p className='text-4xl font-bold tracking-widest font-mono text-primary'>
                    {displayCode}
                  </p>
                  <p className='text-xs text-muted-foreground'>10분 내 사용</p>
                </div>
              )}

              {genStatus === 'error' && (
                <p className='text-destructive text-xs'>{errMsg}</p>
              )}
            </>

          ) : (
            /* ── 일반 브라우저: 코드 입력 안내 ── */
            <>
              <div className='bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1'>
                <p className='font-semibold text-foreground'>연동 순서</p>
                <p>① Pi Browser에서 이 페이지를 열고 연동 코드 생성</p>
                <p>② 이 브라우저에서 아래 버튼 클릭 후 코드 입력</p>
                <p>③ Google로 로그인하면 자동 연동</p>
              </div>

              {!googleSession?.user && (
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full gap-1.5'
                  onClick={() => signIn('google')}
                >
                  Google로 먼저 로그인
                </Button>
              )}

              <Link
                href='/link'
                className={cn(buttonVariants({ size: 'sm' }), 'w-full text-center')}
              >
                코드 입력하러 가기 →
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({ label, connected, value }: {
  label: string; connected: boolean; value?: string
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span className='text-muted-foreground w-24 shrink-0'>{label}</span>
      <span className='flex-1 truncate text-xs'>{connected ? (value ?? '연결됨') : '—'}</span>
      <span className={`text-xs shrink-0 ${connected
        ? 'text-green-600 dark:text-green-400'
        : 'text-muted-foreground'}`}>
        {connected ? '✓ 연결됨' : '미연결'}
      </span>
    </div>
  )
}
