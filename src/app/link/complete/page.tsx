'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Google OAuth 완료 후 여기로 리다이렉트 (provider=pi 방향)
// callbackUrl: /link/complete?t={token}&p=pi
function LinkCompleteInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('t')
  const { status } = useSession()
  const [result, setResult] = useState<'pending' | 'done' | 'error'>('pending')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (status !== 'authenticated' || !token || result !== 'pending') return

    fetch('/api/auth/link-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((d: { success?: boolean; error?: string }) => {
        if (d.success) {
          setResult('done')
          setMessage('계정 연동이 완료됐습니다!')
          setTimeout(() => router.push('/'), 2000)
        } else {
          setResult('error')
          setMessage(d.error ?? '연동 실패')
        }
      })
      .catch(() => {
        setResult('error')
        setMessage('서버 오류가 발생했습니다')
      })
  }, [status, token, result, router])

  return (
    <Card className='max-w-md mx-auto mt-20'>
      <CardHeader>
        <CardTitle>계정 연동 처리 중</CardTitle>
      </CardHeader>
      <CardContent>
        {result === 'pending' && (
          <p className='text-muted-foreground text-sm'>
            {status === 'loading' ? 'Google 세션 확인 중…' : '연동 처리 중…'}
          </p>
        )}
        {result === 'done' && (
          <p className='text-green-600 dark:text-green-400 text-sm font-medium'>
            ✓ {message} 홈으로 이동합니다…
          </p>
        )}
        {result === 'error' && (
          <p className='text-destructive text-sm'>{message}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function LinkCompletePage() {
  return (
    <Suspense fallback={<div className='text-center mt-20'>로딩 중…</div>}>
      <LinkCompleteInner />
    </Suspense>
  )
}
