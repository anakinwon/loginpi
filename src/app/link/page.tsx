'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from '@/components/pi-auth-provider'

// p=pi  → Pi 브라우저가 생성한 토큰 → 여기서 Google 로그인 필요
// p=google → 일반 브라우저가 생성한 토큰 → Pi Browser에서 Pi 로그인 필요 (자동)
function LinkPageInner() {
  const params = useSearchParams()
  const token = params.get('t')
  const provider = params.get('p') as 'pi' | 'google' | null
  const { isInPiBrowser, user: piUser, isLoading } = usePiAuth()

  if (!token || !provider) {
    return (
      <Card className='max-w-md mx-auto mt-20'>
        <CardContent className='py-8 text-center'>
          <p className='text-destructive'>유효하지 않은 연동 링크입니다.</p>
        </CardContent>
      </Card>
    )
  }

  // Pi 브라우저가 생성한 토큰 → 일반 브라우저에서 Google 로그인
  if (provider === 'pi') {
    return (
      <Card className='max-w-md mx-auto mt-20'>
        <CardHeader>
          <CardTitle>Pi 계정 연동</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Pi Browser에서 생성된 연동 링크입니다.
            Google로 로그인하면 두 계정이 자동으로 연동됩니다.
          </p>
          <Button
            className='w-full gap-2'
            onClick={() =>
              signIn('google', {
                callbackUrl: `/link/complete?t=${encodeURIComponent(token)}&p=pi`,
              })
            }
          >
            <GoogleIcon />
            Google로 로그인하여 Pi 계정과 연동
          </Button>
          <p className='text-muted-foreground text-xs text-center'>
            이 링크는 10분간 유효합니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Google이 생성한 토큰 → Pi Browser에서 Pi 자동 로그인 후 연동
  return (
    <Card className='max-w-md mx-auto mt-20'>
      <CardHeader>
        <CardTitle>Google 계정 연동</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {!isInPiBrowser ? (
          <p className='text-destructive text-sm'>
            이 링크는 Pi Browser에서 열어야 합니다.
          </p>
        ) : isLoading ? (
          <p className='text-muted-foreground text-sm'>Pi 로그인 중…</p>
        ) : piUser ? (
          <LinkCompleteClient token={token} provider='google' piUserId={piUser.userId} />
        ) : (
          <p className='text-muted-foreground text-sm'>
            Pi Browser에서 Pi 계정으로 로그인 중입니다. 잠시 기다려 주세요.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Google 토큰 → Pi 연동 자동 완료 컴포넌트
function LinkCompleteClient({
  token,
  provider,
  piUserId,
}: {
  token: string
  provider: 'google'
  piUserId: string
}) {
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/auth/link-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((d: { success?: boolean; error?: string }) => {
        if (d.success) {
          setStatus('done')
          setMessage('Pi와 Google 계정이 성공적으로 연동됐습니다!')
        } else {
          setStatus('error')
          setMessage(d.error ?? '연동 실패')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('서버 오류가 발생했습니다')
      })
  }, [token])

  if (status === 'idle') return <p className='text-sm'>연동 처리 중…</p>

  return (
    <div className={`text-sm ${status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
      {message}
    </div>
  )
}

// useState, useEffect를 위한 import (파일 상단에서 처리)
import { useState, useEffect } from 'react'

export default function LinkPage() {
  return (
    <Suspense fallback={<div className='text-center mt-20'>로딩 중…</div>}>
      <LinkPageInner />
    </Suspense>
  )
}

function GoogleIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' aria-hidden='true'>
      <path d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' fill='#4285F4' />
      <path d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' fill='#34A853' />
      <path d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' fill='#FBBC05' />
      <path d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' fill='#EA4335' />
    </svg>
  )
}
