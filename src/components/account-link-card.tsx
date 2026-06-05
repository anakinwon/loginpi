'use client'

import { useState } from 'react'
import { signIn as googleSignIn, useSession } from 'next-auth/react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// 분기 기준:
//   piLoading        → 로딩 스피너
//   piUser && alreadyLinked → 연동 완료
//   piUser (Pi 세션 있음) → 코드 생성 UI  (UA 감지 불필요)
//   !piUser          → 코드 입력 안내 + Pi Browser 전용 링크 안내
export function AccountLinkCard() {
  const { user: piUser, isLoading: piLoading, signIn: piSignIn } = usePiAuth()
  const { data: googleSession } = useSession()
  const [genStatus, setGenStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [code, setCode] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const alreadyLinked =
    !!piUser && !!googleSession?.user && piUser.userId === googleSession.user.id

  const displayCode = code ? `${code.slice(0, 3)}-${code.slice(3)}` : ''

  // Pi Browser 연동용 링크 (/link?generate=1)
  const generateUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/link?generate=1`
      : 'https://loginpi.vercel.app/link?generate=1'

  async function generateCode(isRetry = false) {
    setGenStatus('loading')
    setCode('')
    setErrMsg('')
    try {
      const res = await fetch('/api/auth/link-start', { method: 'POST' })
      const data = (await res.json()) as { code?: string; error?: string }
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

  async function copyGenerateUrl() {
    try {
      await navigator.clipboard.writeText(generateUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 복사 실패 시 무시
    }
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm'>계정 연동</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>

        <StatusRow
          label='Pi Network'
          connected={!!piUser}
          value={piUser?.username ? `@${piUser.username}` : undefined}
        />
        <StatusRow
          label='Google'
          connected={!!googleSession?.user}
          value={googleSession?.user?.email ?? undefined}
        />

        <div className='border-t pt-3 space-y-3'>

          {/* Pi 세션 확인 중 */}
          {piLoading ? (
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
              <div className='h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent' />
              Pi 로그인 확인 중…
            </div>

          ) : alreadyLinked ? (
            /* 연동 완료 */
            <p className='text-green-600 dark:text-green-400 text-xs font-medium'>
              ✓ 두 계정이 연동되어 있습니다
            </p>

          ) : piUser ? (
            /* Pi 세션 있음 → 코드 생성 UI */
            <div className='space-y-2'>
              <p className='text-xs text-muted-foreground'>
                아래 버튼으로 코드를 생성하고, 일반 브라우저의{' '}
                <span className='font-mono text-foreground'>/link</span> 페이지에 입력하세요.
              </p>
              <Button
                size='sm'
                className='w-full'
                disabled={genStatus === 'loading'}
                onClick={() => generateCode()}
              >
                {genStatus === 'loading'
                  ? '코드 생성 중…'
                  : genStatus === 'done'
                    ? '새 코드 생성'
                    : '연동 코드 생성'}
              </Button>

              {/* 버튼 바로 아래에 코드 표시 */}
              {genStatus === 'done' && displayCode && (
                <div className='rounded-lg border-2 border-primary/40 bg-primary/5 p-4 text-center space-y-1'>
                  <p className='text-xs text-muted-foreground'>연동 코드 (일반 브라우저에서 입력)</p>
                  <p className='text-4xl font-bold tracking-widest font-mono text-primary'>
                    {displayCode}
                  </p>
                  <p className='text-xs text-muted-foreground'>10분 내 사용</p>
                </div>
              )}

              {genStatus === 'error' && (
                <p className='text-destructive text-xs'>{errMsg}</p>
              )}
            </div>

          ) : (
            /* Pi 세션 없음 → 두 경로 안내 */
            <>
              {/* Google 로그인이 없으면 먼저 안내 */}
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

              {/* Pi Browser 진입 안내 */}
              <div className='rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-2'>
                <p className='text-xs font-semibold text-amber-700 dark:text-amber-400'>
                  Pi Browser에서 할 일
                </p>
                <p className='text-xs text-muted-foreground'>
                  아래 링크를 복사해서 Pi Browser 주소창에 입력하세요.
                </p>
                <div className='flex gap-1.5'>
                  <code className='flex-1 rounded bg-background border px-2 py-1 text-xs font-mono truncate'>
                    {generateUrl}
                  </code>
                  <Button size='sm' variant='outline' className='shrink-0 text-xs'
                    onClick={copyGenerateUrl}>
                    {copied ? '복사됨!' : '복사'}
                  </Button>
                </div>
              </div>

              {/* 일반 브라우저 코드 입력 */}
              <Link
                href='/link'
                className={cn(buttonVariants({ size: 'sm' }), 'w-full text-center')}
              >
                연동 코드 입력하러 가기 →
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  connected,
  value,
}: {
  label: string
  connected: boolean
  value?: string
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span className='text-muted-foreground w-24 shrink-0'>{label}</span>
      <span className='flex-1 truncate text-xs'>{connected ? (value ?? '연결됨') : '—'}</span>
      <span
        className={`text-xs shrink-0 ${
          connected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
        }`}
      >
        {connected ? '✓ 연결됨' : '미연결'}
      </span>
    </div>
  )
}
