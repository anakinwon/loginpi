'use client'

import { Suspense, useState } from 'react'
import { signIn as googleSignIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePiAuth } from '@/components/pi-auth-provider'

// 분기 기준:
//   piUser 있음 → 코드 생성 UI  (Pi 세션 보유 = Pi Browser 또는 Pi 쿠키 있는 환경)
//   piUser 없음 → 코드 입력 UI  (일반 브라우저)
//   ?generate=1  → 항상 생성 UI  (UA 감지 실패 시 강제 진입용)
function LinkPageInner() {
  const { user: piUser, piAccessToken, isLoading: piLoading, signIn: piSignIn } = usePiAuth()
  const { data: googleSession, status: googleStatus } = useSession()
  const params = useSearchParams()
  const router = useRouter()

  const forceGenerate = params.get('generate') === '1'
  const showGenerate = forceGenerate || !!piUser

  // ── 생성 상태 ──
  const [genStatus, setGenStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [genCode, setGenCode] = useState('')
  const [genErr, setGenErr] = useState('')

  // ── 입력 상태 ──
  const [inputCode, setInputCode] = useState('')
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [linkErr, setLinkErr] = useState('')

  const digits = inputCode.replace(/\D/g, '').slice(0, 6)
  const displayValue = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits
  const isValidCode = digits.length === 6
  const displayGenCode = genCode ? `${genCode.slice(0, 3)}-${genCode.slice(3)}` : ''

  async function generateCode(isRetry = false) {
    setGenStatus('loading')
    setGenCode('')
    setGenErr('')
    try {
      const res = await fetch('/api/auth/link-start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(piAccessToken ? { 'X-Pi-Token': piAccessToken } : {}),
        },
      })
      const data = (await res.json()) as { code?: string; error?: string }
      if (res.status === 401 && !isRetry) {
        await piSignIn()
        return generateCode(true)
      }
      if (!res.ok || !data.code) throw new Error(data.error ?? '코드 생성 실패')
      setGenCode(data.code)
      setGenStatus('done')
    } catch (err) {
      setGenStatus('error')
      setGenErr(err instanceof Error ? err.message : '오류 발생')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidCode) return

    if (googleStatus !== 'authenticated') {
      googleSignIn('google', { callbackUrl: `/link/complete?code=${digits}` })
      return
    }

    setLinkStatus('loading')
    try {
      const res = await fetch('/api/auth/link-complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: digits }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? '연동 실패')
      setLinkStatus('done')
      setTimeout(() => router.push('/'), 1500)
    } catch (err) {
      setLinkStatus('error')
      setLinkErr(err instanceof Error ? err.message : '오류 발생')
    }
  }

  // ── 초기 로딩 (Pi SDK 인증 중) ──────────────────────────
  if (piLoading) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center px-4'>
        <Card className='w-full max-w-sm'>
          <CardContent className='py-10 text-center space-y-3'>
            <div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent' />
            <p className='text-sm text-muted-foreground'>Pi 로그인 확인 중…</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── 코드 생성 UI (piUser 있거나 ?generate=1) ───────────
  if (showGenerate) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center px-4'>
        <Card className='w-full max-w-sm'>
          <CardHeader>
            <CardTitle>연동 코드 생성</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {!piUser ? (
              /* ?generate=1 강제 진입했지만 Pi 로그인 안 된 상태 */
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  연동 코드를 생성하려면 Pi 로그인이 필요합니다.
                </p>
                <Button className='w-full' onClick={() => piSignIn()}>
                  Pi 로그인
                </Button>
              </div>

            ) : (
              /* 코드 생성 버튼 + 결과를 바로 아래에 표시 */
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  아래 버튼을 눌러 6자리 코드를 생성하세요.<br />
                  일반 브라우저에서{' '}
                  <span className='font-mono text-foreground'>/link</span>{' '}
                  페이지에 접속해 코드를 입력하면 계정이 연동됩니다.
                </p>
                <Button
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
                {genStatus === 'done' && displayGenCode && (
                  <div className='rounded-lg border-2 border-primary/40 bg-primary/5 p-5 text-center space-y-2'>
                    <p className='text-xs text-muted-foreground'>연동 코드 (일반 브라우저에서 입력)</p>
                    <p className='text-5xl font-bold tracking-widest font-mono text-primary'>
                      {displayGenCode}
                    </p>
                    <p className='text-xs text-muted-foreground'>10분 내 사용</p>
                  </div>
                )}

                {genStatus === 'error' && (
                  <p className='text-destructive text-xs text-center'>{genErr}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── 코드 입력 UI (일반 브라우저) ───────────────────────
  return (
    <div className='min-h-[60vh] flex items-center justify-center px-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>연동 코드 입력</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          {linkStatus === 'done' ? (
            <p className='text-green-600 dark:text-green-400 text-sm font-medium text-center py-4'>
              ✓ 계정 연동 완료! 홈으로 이동합니다…
            </p>
          ) : (
            <>
              <p className='text-sm text-muted-foreground'>
                <span className='text-amber-600 dark:text-amber-400 font-medium'>Pi Browser</span>의{' '}
                이 페이지에서 생성한 6자리 코드를 입력하세요.
              </p>
              <form onSubmit={handleSubmit} className='space-y-4'>
                <div className='space-y-1.5'>
                  <Label htmlFor='link-code'>연동 코드</Label>
                  <Input
                    id='link-code'
                    inputMode='numeric'
                    placeholder='000-000'
                    value={displayValue}
                    onChange={(e) =>
                      setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className='text-center text-2xl font-mono tracking-widest h-12'
                    maxLength={7}
                    autoComplete='one-time-code'
                  />
                </div>
                {!googleSession?.user && (
                  <p className='text-xs text-muted-foreground bg-muted rounded-md p-2'>
                    코드 입력 후 Google 로그인 화면으로 이동합니다.
                  </p>
                )}
                {linkStatus === 'error' && (
                  <p className='text-destructive text-xs'>{linkErr}</p>
                )}
                <Button
                  type='submit'
                  className='w-full'
                  disabled={!isValidCode || linkStatus === 'loading'}
                >
                  {linkStatus === 'loading'
                    ? '연동 중…'
                    : googleSession?.user
                      ? '연동하기'
                      : 'Google 로그인 후 연동'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function LinkPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-[60vh] flex items-center justify-center'>
          <div className='h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent' />
        </div>
      }
    >
      <LinkPageInner />
    </Suspense>
  )
}
