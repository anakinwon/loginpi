'use client'

import { useState } from 'react'
import { signIn as googleSignIn, useSession } from 'next-auth/react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type GenStatus = 'idle' | 'loading' | 'done' | 'error'

export function AccountLinkCard() {
  const { user: piUser, isInPiBrowser, isLoading: piLoading, signIn: piSignIn } = usePiAuth()
  const { data: googleSession } = useSession()
  const [genStatus, setGenStatus] = useState<GenStatus>('idle')
  const [code, setCode] = useState('')
  const [errMsg, setErrMsg] = useState('')

  async function generateCode(isRetry = false) {
    setGenStatus('loading')
    setCode('')
    setErrMsg('')
    try {
      const res = await fetch('/api/auth/link-start', { method: 'POST' })
      const data = (await res.json()) as { code?: string; error?: string }

      // Pi 세션 만료 시 1회 재인증 후 재시도
      if (res.status === 401 && !isRetry) {
        await piSignIn()
        return generateCode(true)
      }

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
              {piLoading ? (
                /* Pi SDK 인증 대기 중 */
                <p className='text-xs text-muted-foreground'>Pi 로그인 확인 중…</p>

              ) : !piUser ? (
                /* Pi 로그인 필요 */
                <div className='space-y-2'>
                  <p className='text-xs text-muted-foreground'>
                    연동 코드를 생성하려면 먼저 Pi 로그인이 필요합니다.
                  </p>
                  <Button size='sm' className='w-full' onClick={() => piSignIn()}>
                    Pi 로그인
                  </Button>
                </div>

              ) : (
                /* Pi 로그인 완료 → 코드 생성 UI */
                <>
                  <div className='bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1'>
                    <p className='font-semibold text-foreground'>연동 순서</p>
                    <p>① 아래 버튼으로 6자리 코드 생성 — <strong className='text-foreground'>이 화면에 코드가 표시됩니다</strong></p>
                    <p>② 일반 브라우저(Chrome 등)에서</p>
                    <p className='font-mono bg-background rounded px-1.5 py-0.5 text-foreground'>
                      {typeof window !== 'undefined' ? window.location.origin : 'https://loginpi.vercel.app'}/link
                    </p>
                    <p>③ 접속 후 코드 입력 → Google 로그인 → 연동 완료</p>
                  </div>

                  <Button
                    size='sm'
                    className='w-full'
                    disabled={genStatus === 'loading'}
                    onClick={() => generateCode()}
                  >
                    {genStatus === 'loading' ? '코드 생성 중…' : '연동 코드 생성'}
                  </Button>

                  {genStatus === 'done' && displayCode && (
                    <div className='rounded-lg border-2 border-primary/30 bg-primary/5 p-4 text-center space-y-2'>
                      <p className='text-xs text-muted-foreground'>연동 코드 — 일반 브라우저에서 입력</p>
                      <p className='text-4xl font-bold tracking-widest font-mono text-primary'>
                        {displayCode}
                      </p>
                      <p className='text-xs text-muted-foreground'>10분 내 사용</p>
                    </div>
                  )}

                  {genStatus === 'error' && (
                    <div className='space-y-2'>
                      <p className='text-destructive text-xs'>{errMsg}</p>
                      <Button size='sm' variant='outline' className='w-full'
                        onClick={() => generateCode()}>
                        다시 시도
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>

          ) : (
            /* ── 일반 브라우저: 코드 입력 안내 ── */
            <>
              <div className='bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1'>
                <p className='font-semibold text-foreground'>연동 방법</p>
                <p>
                  <span className='text-amber-600 dark:text-amber-400 font-medium'>
                    Pi Browser
                  </span>
                  에서{' '}
                  <span className='font-mono text-foreground'>/link</span> 페이지에 접속하면<br />
                  <strong className='text-foreground'>[연동 코드 생성]</strong> 버튼이 표시됩니다.
                </p>
                <p className='pt-1'>생성된 6자리 코드를 아래 버튼을 눌러 입력하세요.</p>
              </div>

              {!googleSession?.user && (
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full gap-1.5'
                  onClick={() => googleSignIn('google')}
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
